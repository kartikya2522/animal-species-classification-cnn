"""Grounding for the Field Guide chat (RAG-lite).

Subjects of the latest user message are resolved first and take priority over the page
context: (1) KB animals named in it — unless the name is part of a longer noun phrase
("snow leopard", "killer whale"), in which case the full phrase is looked up live and wins
if Wikipedia confirms it; (2) a live lookup for other animals: Wikipedia search -> Wikidata
(taxon name P225, IUCN status P141) -> iNaturalist (is it an animal? observation count,
common name). "X vs Y" / "X and Y" questions are split so each side is resolved (at most
``MAX_SUBJECTS``). (3) The prediction/species context sent by the client is added when the
question names fewer than two animals. (4) A follow-up that names nothing ("are they
endangered?") reuses the subjects of the most recent earlier user message that had any,
including live ones (re-resolved; live results are cached).

All outbound requests use the shared ``httpx.AsyncClient`` (generic User-Agent) and a
short timeout; failures degrade to "no live sources" instead of failing the chat.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.services.knowledge import SpeciesKB, normalize

log = logging.getLogger("wildlens.chat")

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
INAT_API = "https://api.inaturalist.org/v1"

IUCN_LABELS = {
    "LC": "Least Concern", "NT": "Near Threatened", "VU": "Vulnerable", "EN": "Endangered",
    "CR": "Critically Endangered", "EW": "Extinct in the Wild", "EX": "Extinct",
    "DD": "Data Deficient", "NE": "Not Evaluated",
}
WIKIDATA_IUCN = {
    "Q211005": "LC", "Q719675": "NT", "Q278113": "VU", "Q11394": "EN", "Q219127": "CR",
    "Q239509": "EW", "Q237350": "EX", "Q3245245": "DD", "Q3350324": "NE",
    "Q96377276": "EN",  # newer "endangered" item used by some P141 statements
}
INAT_IUCN = {0: "NE", 5: "DD", 10: "LC", 20: "NT", 30: "VU", 40: "EN", 50: "CR", 60: "EW", 70: "EX"}
ANIMAL_ICONIC = {"Animalia", "Mammalia", "Aves", "Reptilia", "Amphibia", "Actinopterygii",
                 "Mollusca", "Arachnida", "Insecta"}
ICONIC_GROUP = {"Mammalia": "Mammal", "Aves": "Bird", "Reptilia": "Reptile", "Amphibia": "Amphibian",
                "Actinopterygii": "Fish", "Mollusca": "Mollusc", "Arachnida": "Arachnid", "Insecta": "Insect"}

STOPWORDS = set("""
a an the and or but if then so of to in on at by for with from about into over under as is are was were be
been being am do does did doing have has had having can could should would will shall may might must i me my
we our you your he she it its they them their this that these those there here what which who whom whose why
how when where tell explain describe give show know please thanks thank hi hello hey also more most some any
all much many very really just like than vs versus compare between eat eats eating live lives living life
lifespan habitat diet found find big large small size long fast speed weight heavy tall old age species animal
animals facts fact info information interesting fun kind kinds type types status endangered conservation it's
what's whats where's dangerous friendly pet pets baby babies called name names do don't doesn't anything something
get gets got getting wild wilderness nature natural world earth usually typically often normally generally need
needs make makes go goes use uses true actually mean means difference differences different similar same alike
better best worse worst bigger biggest smaller smallest larger largest faster fastest slower slowest stronger
strongest heavier heaviest taller tallest longer longest older oldest cute scary smart intelligent clever hunt hunts
hunting hunted prey catch catches attack attacks chase chases fight fights kill kills sleep sleeps sleeping food foods
eaten feed feeds feeding drink drinks threatened extinct extinction population populations left remain remaining still
today now ever survive survives breed breeds breeding mate mates mating young offspring lay lays eggs egg born birth
weigh weighs grow grows run runs swim swims fly flies climb climbs see sees hear smell come comes get each other one
ones both either neither such well good bad way ways time times day days year years number numbers people humans human
someone anyone why's how's who's they're there's isn't aren't wasn't weren't can't won't compared comparison similarities
male males female females adult adults juvenile juveniles wild-caught captive zoo zoos
""".split())

# Pronouns / ellipsis that mark a follow-up about the previous subject ("are they endangered?").
ANAPHORA = set("they them their theirs it its it's this that these those he she his her both ones".split())
MAX_SUBJECTS = 3
# Separators between animals in one question ("lion vs tiger", "sea lion and harbor seal").
SEPARATOR_RE = re.compile(r"\b(?:vs|versus|and|or|than|compared to|compared with|between|with|plus)\b")
_PUNCT_SPLIT_RE = re.compile(r"[,;/&?!:()\[\]]+|\.(?:\s|$)")

PROJECT_RE = re.compile(
    r"\b(wildlens|this (project|app|site|model)|your (model|training|dataset)|the model|resnet|efficientnet|accuracy|"
    r"dataset|classes|classifier|heatmap|grad-?cam|cam|onnx|trained|training)\b",
    re.I,
)


@dataclass
class Source:
    id: int
    title: str
    url: Optional[str]
    text: str
    kind: str  # wikipedia | inaturalist | wikidata | kb | project

    def public(self) -> Dict[str, Any]:
        return {"id": self.id, "title": self.title, "url": self.url, "kind": self.kind}


@dataclass
class Subject:
    name: str
    scientific_name: Optional[str] = None
    slug: Optional[str] = None  # set when the animal is one of the 80 KB classes
    summary: Optional[str] = None
    status_code: Optional[str] = None
    status_label: Optional[str] = None
    status_source: Optional[str] = None
    is_group: bool = False
    group_note: Optional[str] = None
    animal_group: Optional[str] = None
    taxonomy: Dict[str, Optional[str]] = field(default_factory=dict)
    observations: Optional[int] = None
    model_accuracy: Optional[float] = None
    source_ids: List[int] = field(default_factory=list)
    cite: Dict[str, List[int]] = field(default_factory=dict)  # fact -> source ids (summary/status/observations)

    def public(self) -> Dict[str, Any]:
        return {"name": self.name, "scientific_name": self.scientific_name, "slug": self.slug}


@dataclass
class Grounding:
    subjects: List[Subject] = field(default_factory=list)
    sources: List[Source] = field(default_factory=list)
    project: bool = False
    retrieval: str = "none"  # kb | live | none | unavailable
    query: Optional[str] = None

    def add_source(self, title: str, url: Optional[str], text: str, kind: str) -> int:
        sid = len(self.sources) + 1
        self.sources.append(Source(sid, title, url, text, kind))
        return sid


def extract_query(text: str, max_words: int = 6) -> str:
    """Keyword query for Wikipedia search: drop question words/stopwords.

    Returns "" unless at least one remaining word has 3+ letters, so leftovers such as "get"
    or "wild" never trigger a live search on their own (they are stopwords), and neither do
    stray 2-letter tokens.
    """
    words = re.findall(r"[A-Za-z][A-Za-z\-']*", text)
    kept = [w for w in words if w.lower() not in STOPWORDS and len(w) > 1]
    if not any(len(w) >= 3 for w in kept):
        return ""
    return " ".join(kept[:max_words])


def _singular_forms(phrase: str) -> List[str]:
    """``phrase`` plus naive singulars of its last word ("arctic foxes" -> "arctic fox")."""
    out = [phrase]
    if phrase.endswith("ies"):
        out.append(phrase[:-3] + "y")
    if phrase.endswith("es"):
        out.append(phrase[:-2])
    if phrase.endswith("s"):
        out.append(phrase[:-1])
    return out


def _phrase_confirmed(phrase: str, live: Dict[str, Any]) -> bool:
    """True if the live page is really about ``phrase``: the Wikipedia title, the first sentence
    of the extract (e.g. "The orca ..., or killer whale, ...") or the iNaturalist common name
    contains it."""
    hay = [normalize(live.get("title") or ""), normalize(_first_sentences(live.get("extract") or "", 1)),
           normalize(((live.get("inat") or {}).get("common_name")) or "")]
    return any(f" {form} " in f" {h} " for form in _singular_forms(phrase) for h in hay if h)


def _first_sentences(text: str, n: int) -> str:
    parts = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return " ".join(parts[:n])


class _TTLCache:
    def __init__(self, ttl_s: float = 6 * 3600, max_items: int = 256):
        self.ttl, self.max = ttl_s, max_items
        self._d: Dict[str, Tuple[float, Any]] = {}

    def get(self, k: str) -> Any:
        v = self._d.get(k)
        if v and time.monotonic() - v[0] < self.ttl:
            return v[1]
        return None

    def set(self, k: str, v: Any) -> None:
        if len(self._d) >= self.max:
            self._d.pop(next(iter(self._d)))
        self._d[k] = (time.monotonic(), v)


class Retriever:
    def __init__(self, kb: SpeciesKB, http: httpx.AsyncClient, timeout_s: float = 10.0,
                 live_lookup: bool = True, model_accuracy: Optional[float] = None):
        self.kb = kb
        self.http = http
        self.timeout_s = timeout_s
        self.live_lookup = live_lookup
        self.model_accuracy = model_accuracy
        self._cache = _TTLCache()

    # ------------------------------------------------------------ public
    async def retrieve(self, messages: List[Dict[str, str]], context: Optional[Dict[str, Any]] = None) -> Grounding:
        g = Grounding()
        user_msgs = [m["content"] for m in messages if m["role"] == "user"]
        latest = user_msgs[-1] if user_msgs else ""

        ctx = (context or {}).get("species_slug") or (context or {}).get("label")
        ctx_entry = self.kb.resolve(ctx) if ctx else None

        g.query = extract_query(latest) or None
        named, failed = await self._resolve(latest)
        cands: List[Tuple[str, Dict[str, Any]]] = list(named)
        if ctx_entry and len(named) < 2 and ("kb", ctx_entry) not in cands:
            cands.append(("kb", ctx_entry))  # page context, after the animals the question names
        if not cands and (not g.query or _is_followup(latest)):
            # Follow-up naming no animal: reuse the subjects of the latest earlier turn that had any.
            for prev in reversed(user_msgs[:-1]):
                found, prev_failed = await self._resolve(prev)
                failed = failed or prev_failed
                if found:
                    cands = found
                    break

        for kind, d in cands[:MAX_SUBJECTS]:
            if kind == "kb":
                self._add_kb(g, d)
            else:
                self._add_live(g, d)
        kinds = {k for k, _ in cands[:MAX_SUBJECTS]}
        if kinds == {"kb"}:
            g.retrieval = "kb"
        elif kinds == {"live"}:
            g.retrieval = "live"
        elif kinds:
            g.retrieval = "kb+live"
        elif failed:
            g.retrieval = "unavailable"
        if PROJECT_RE.search(latest):
            g.project = True
            g.add_source("WildLens project facts", None, self._project_text(), "project")
        return g

    async def _resolve(self, text: str) -> Tuple[List[Tuple[str, Dict[str, Any]]], bool]:
        """Animals named in ``text`` in order of appearance, as ("kb", entry) / ("live", page) pairs
        (deduplicated, at most ``MAX_SUBJECTS``), and whether a live lookup failed."""
        if not text.strip():
            return [], False
        norm = normalize(_PUNCT_SPLIT_RE.sub(" and ", text))
        spans = self.kb.match_spans(norm)
        # Segment boundaries: separator words that are not inside a KB name ("moths and butterflies").
        seps = [m for m in SEPARATOR_RE.finditer(norm)
                if not any(s < m.end() and m.start() < e for _, s, e in spans)]
        bounds = [0] + [x for m in seps for x in (m.start(), m.end())] + [len(norm)]
        segments = [(bounds[i], bounds[i + 1]) for i in range(0, len(bounds), 2)]

        # slot -> ("kb", entry) | ("phrase", (phrase, entry)) | ("query", q), in text order
        slots: List[Tuple[str, Any]] = []
        for a, b in segments:
            seg_spans = [(e, s, t) for e, s, t in spans if a <= s < b]
            if not seg_spans:
                q = extract_query(norm[a:b])
                if q and self.live_lookup:
                    slots.append(("query", q))
                continue
            prev_end = a
            for e, s, t in seg_spans:
                mods = _modifiers(norm[prev_end:s])
                if mods and self.live_lookup:
                    slots.append(("phrase", (" ".join(mods + [norm[s:t]]), e)))
                else:
                    slots.append(("kb", e))
                prev_end = t

        live_qs = [v if k == "query" else v[0] for k, v in slots if k in ("query", "phrase")]
        results: Dict[str, Optional[Dict[str, Any]]] = {}
        failed = False
        if live_qs:
            uniq = list(dict.fromkeys(live_qs))[:MAX_SUBJECTS + 1]
            outs = await asyncio.gather(*(self._live_safe(q) for q in uniq))
            for q, (res, err) in zip(uniq, outs):
                results[q] = res
                failed = failed or err

        out: List[Tuple[str, Dict[str, Any]]] = []
        seen: set = set()
        for kind, v in slots:
            if kind == "kb":
                item: Optional[Tuple[str, Dict[str, Any]]] = ("kb", v)
            elif kind == "phrase":
                phrase, entry = v
                live = results.get(phrase)
                item = ("live", live) if live and _phrase_confirmed(phrase, live) else ("kb", entry)
            else:
                live = results.get(v)
                item = ("live", live) if live else None
            if item is None:
                continue
            if item[0] == "live":  # a live page that *is* a KB animal -> use the richer KB entry
                kb_e = self.kb.exact_alias(item[1].get("title"))
                if kb_e:
                    item = ("kb", kb_e)
            key = item[1].get("slug") if item[0] == "kb" else "live:" + str(item[1].get("qid") or item[1].get("title"))
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
        return out[:MAX_SUBJECTS], failed

    async def _live_safe(self, q: str) -> Tuple[Optional[Dict[str, Any]], bool]:
        try:
            return await asyncio.wait_for(self._live(q), timeout=self.timeout_s), False
        except (asyncio.TimeoutError, httpx.HTTPError, ValueError, KeyError) as exc:
            log.info("live lookup failed for %r: %s", q, type(exc).__name__)
            return None, True

    # ------------------------------------------------------------ KB
    def _add_kb(self, g: Grounding, e: Dict[str, Any]) -> None:
        st = e.get("iucn_status") or {}
        tax = e.get("taxonomy") or {}
        ms = e.get("model_stats") or {}
        s = Subject(
            name=e.get("common_name") or e["label"], scientific_name=e.get("scientific_name"), slug=e["slug"],
            summary=e.get("summary"), status_code=st.get("code"), status_label=st.get("label"),
            status_source=st.get("source"), is_group=bool(e.get("is_group")), group_note=e.get("rank_note"),
            animal_group=e.get("animal_group"), taxonomy=tax, observations=e.get("inaturalist_observations"),
            model_accuracy=ms.get("test_accuracy"),
        )
        if e.get("summary"):
            sid = g.add_source(f"Wikipedia: {e.get('wikipedia_title') or s.name}",
                               e.get("wikipedia_url"), e["summary"], "wikipedia")
            s.source_ids.append(sid)
            s.cite["summary"] = [sid]
        facts = [f"Label in the WildLens model: {e['label']}",
                 f"Scientific name / taxon: {e.get('scientific_name')} (rank: {e.get('rank')})",
                 f"Note: {e.get('rank_note')}",
                 "Taxonomy: " + ", ".join(f"{k} {v}" for k, v in tax.items() if v),
                 f"Animal group: {e.get('animal_group')}",
                 f"IUCN Red List status: {st.get('label')}" + (f" ({st.get('code')}; source: {st.get('source')})" if st.get("code") else "")]
        if e.get("inaturalist_observations") is not None:
            facts.append(f"iNaturalist observations (taxon {(e.get('inaturalist_taxon') or {}).get('name')}): "
                         f"{e['inaturalist_observations']:,}")
        if ms.get("test_accuracy") is not None:
            facts.append(f"WildLens model test accuracy on this class: {ms['test_accuracy'] * 100:.1f}% "
                         f"({ms.get('test_images')} test images)")
        inat_id = e.get("inaturalist_taxon_id")
        url = f"https://www.inaturalist.org/taxa/{inat_id}" if inat_id else (st.get("source_url") or None)
        sid = g.add_source(f"WildLens species data: {s.name} (Wikidata, iNaturalist, GBIF)", url,
                           "\n".join(facts), "kb")
        s.source_ids.append(sid)
        s.cite["status"] = s.cite["observations"] = s.cite["model"] = [sid]
        g.subjects.append(s)

    # ------------------------------------------------------------ live lookup
    async def _live(self, q: str) -> Optional[Dict[str, Any]]:
        cached = self._cache.get(q.lower())
        if cached is not None:
            return cached or None
        r = await self.http.get(WIKI_API, params={
            "action": "query", "generator": "search", "gsrsearch": q, "gsrlimit": 3, "gsrnamespace": 0,
            "prop": "pageprops|extracts|info", "ppprop": "wikibase_item", "exintro": 1, "explaintext": 1,
            "inprop": "url", "redirects": 1, "format": "json", "formatversion": 2,
        })
        r.raise_for_status()
        pages = sorted(((r.json().get("query") or {}).get("pages") or []), key=lambda p: p.get("index", 99))
        pages = [p for p in pages if (p.get("pageprops") or {}).get("wikibase_item")]
        if not pages:
            self._cache.set(q.lower(), {})
            return None
        ids = [p["pageprops"]["wikibase_item"] for p in pages]
        r = await self.http.get(WIKIDATA_API, params={"action": "wbgetentities", "ids": "|".join(ids),
                                                      "props": "claims", "format": "json"})
        r.raise_for_status()
        ents = r.json().get("entities") or {}
        for p in pages:
            qid = p["pageprops"]["wikibase_item"]
            claims = (ents.get(qid) or {}).get("claims") or {}
            taxon = _claim_values(claims, "P225")
            if not taxon:
                continue  # not a taxon article
            sci = taxon[0]
            inat = await self._inat(sci)
            if inat is not None and inat.get("iconic_taxon_name") not in ANIMAL_ICONIC:
                continue  # a plant, fungus, ... — out of scope
            p141 = [v.get("id") for v in _claim_values(claims, "P141", ranked=True) if isinstance(v, dict)]
            code = WIKIDATA_IUCN.get(p141[0]) if p141 else None
            status_source = "IUCN Red List via Wikidata (P141)" if code else None
            if not code and inat and inat.get("iucn"):
                code, status_source = inat["iucn"], "IUCN Red List via iNaturalist"
            result = {
                "title": p.get("title"), "url": p.get("fullurl"), "extract": p.get("extract") or "",
                "qid": qid, "scientific_name": sci, "status_code": code, "status_source": status_source,
                "inat": inat,
            }
            self._cache.set(q.lower(), result)
            return result
        self._cache.set(q.lower(), {})
        return None

    async def _inat(self, name: str) -> Optional[Dict[str, Any]]:
        try:
            r = await self.http.get(f"{INAT_API}/taxa", params={"q": name, "per_page": 5, "is_active": "true"})
            r.raise_for_status()
        except httpx.HTTPError:
            return None
        res = r.json().get("results") or []
        exact = [t for t in res if (t.get("name") or "").lower() == name.lower()] or res[:1]
        if not exact:
            return None
        t = exact[0]
        cs = t.get("conservation_status") or {}
        iucn = INAT_IUCN.get(cs.get("iucn")) if cs.get("place") is None and "iucn" in (cs.get("authority") or "").lower() else None
        return {"id": t.get("id"), "name": t.get("name"), "rank": t.get("rank"),
                "common_name": t.get("preferred_common_name"), "observations": t.get("observations_count"),
                "iconic_taxon_name": t.get("iconic_taxon_name"), "iucn": iucn}

    def _add_live(self, g: Grounding, d: Dict[str, Any]) -> None:
        inat = d.get("inat") or {}
        code = d.get("status_code")
        s = Subject(
            name=d["title"], scientific_name=d.get("scientific_name"), summary=d.get("extract"),
            status_code=code, status_label=IUCN_LABELS.get(code) if code else None,
            status_source=d.get("status_source"), animal_group=ICONIC_GROUP.get(inat.get("iconic_taxon_name") or ""),
            observations=inat.get("observations"),
        )
        if d.get("extract"):
            sid = g.add_source(f"Wikipedia: {d['title']}", d.get("url"), d["extract"], "wikipedia")
            s.source_ids.append(sid)
            s.cite["summary"] = [sid]
        facts = [f"Scientific name: {d.get('scientific_name')}"]
        if code:
            facts.append(f"IUCN Red List status: {IUCN_LABELS.get(code)} ({code}; source: {d.get('status_source')})")
        else:
            facts.append("IUCN Red List status: not found in Wikidata or iNaturalist")
        if d.get("qid"):
            sid = g.add_source(f"Wikidata: {d.get('scientific_name')}",
                               f"https://www.wikidata.org/wiki/{d['qid']}", "\n".join(facts), "wikidata")
            s.source_ids.append(sid)
            s.cite["status"] = [sid]
        if inat.get("id"):
            itxt = [f"iNaturalist taxon: {inat.get('name')} (rank {inat.get('rank')})"]
            if inat.get("common_name"):
                itxt.append(f"Common name: {inat['common_name']}")
            if inat.get("observations") is not None:
                itxt.append(f"Observations on iNaturalist: {inat['observations']:,}")
            if inat.get("iconic_taxon_name"):
                itxt.append(f"Group: {inat['iconic_taxon_name']}")
            if inat.get("iucn"):
                itxt.append(f"IUCN Red List status (global): {IUCN_LABELS.get(inat['iucn'])} ({inat['iucn']})")
            sid = g.add_source(f"iNaturalist: {inat.get('common_name') or inat.get('name')}",
                               f"https://www.inaturalist.org/taxa/{inat['id']}", "\n".join(itxt), "inaturalist")
            s.source_ids.append(sid)
            s.cite["observations"] = [sid]
            if code and "iNaturalist" in (d.get("status_source") or ""):
                s.cite["status"] = [sid]
        g.subjects.append(s)

    def _project_text(self) -> str:
        acc = self.model_accuracy
        acc_s = f"{acc * 100:.1f}%" if acc else "about 83%"
        return (
            "WildLens identifies animals in photos among 80 classes (e.g. Bear, Zebra, Moths and butterflies; "
            "several classes are groups rather than single species). The production model is an EfficientNetV2-S "
            f"fine-tuned on the project dataset, exported to ONNX; test top-1 accuracy {acc_s}, top-5 about 98%. "
            "Four models were compared (ResNet50, ConvNeXt-Tiny, EfficientNetV2-S, Swin-Tiny); EfficientNetV2-S scored best and is the one served. "
            "Predictions come with a class activation map (CAM, equal to Grad-CAM for this architecture) showing "
            "which image regions drove the decision. The model was trained on tight crops, so full scenes or "
            "animals outside the 80 classes can be misclassified; low-confidence predictions (top-1 < 50%) are "
            "flagged. Species facts come from Wikipedia, Wikidata, iNaturalist and GBIF."
        )


def _modifiers(before: str, max_words: int = 2) -> List[str]:
    """Words directly before a KB name that make it a longer noun phrase ("snow" in "snow leopard",
    "great white" in "great white shark"): trailing non-stopword alphabetic words of 3+ letters."""
    mods: List[str] = []
    for w in reversed(before.split()):
        if w in STOPWORDS or len(w) < 3 or not w.isalpha() or SEPARATOR_RE.fullmatch(w):
            break
        mods.insert(0, w)
        if len(mods) >= max_words:
            break
    return mods


def _is_followup(text: str) -> bool:
    words = {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z']*", text)}
    return bool(words & ANAPHORA)


def _claim_values(claims: Dict[str, Any], pid: str, ranked: bool = False) -> List[Any]:
    items = claims.get(pid) or []
    if ranked:
        pref = [c for c in items if c.get("rank") == "preferred"]
        items = pref or [c for c in items if c.get("rank") != "deprecated"]
    out = []
    for c in items:
        v = ((c.get("mainsnak") or {}).get("datavalue") or {}).get("value")
        if v is not None:
            out.append(v)
    return out


def first_sentences(text: str, n: int) -> str:
    return _first_sentences(text, n)
