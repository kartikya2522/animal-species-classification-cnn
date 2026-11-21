"""Species knowledge base: ``data/species_kb.json`` built by ``scripts/build_species_kb.py``.

Loaded once at startup. Also provides name matching used by the chat retriever.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

log = logging.getLogger("wildlens.knowledge")


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s.lower())).strip()


def normalize(s: str) -> str:
    """Lower-case, punctuation to spaces, collapsed whitespace (the form KB names are matched in)."""
    return _norm(s)


def _plurals(name: str) -> List[str]:
    """Simple English plural forms of the last word ("brown bear" -> "brown bears")."""
    head, _, last = name.rpartition(" ")
    pre = head + " " if head else ""
    forms = {name}
    if last.endswith(("s", "x", "ch", "sh")):
        forms.add(pre + last + "es")
    elif last.endswith("y") and len(last) > 1 and last[-2] not in "aeiou":
        forms.add(pre + last[:-1] + "ies")
    elif last.endswith("f"):
        forms.add(pre + last[:-1] + "ves")
    elif last == "mouse":
        forms.add(pre + "mice")
    elif last == "goose":
        forms.add(pre + "geese")
    elif last == "fish" or last == "sheep" or last == "deer":
        pass
    else:
        forms.add(pre + last + "s")
    return sorted(forms)


class SpeciesKB:
    def __init__(self, entries: List[Dict[str, Any]], meta: Optional[Dict[str, Any]] = None):
        self.entries = entries
        self.meta = meta or {}
        self.by_slug = {e["slug"]: e for e in entries}
        self.by_label = {e["label"]: e for e in entries}
        # alias (normalised) -> slug. Longest aliases are tried first when matching text.
        aliases: Dict[str, str] = {}
        for e in entries:
            names = {e["label"], e.get("common_name") or "", e.get("wikipedia_title") or ""}
            if not e.get("is_group"):
                names.add(e.get("scientific_name") or "")
            inat = (e.get("inaturalist_taxon") or {}).get("common_name")
            if inat and not e.get("is_group"):
                names.add(inat)
            for n in names:
                n = _norm(n)
                if not n:
                    continue
                for form in _plurals(n):
                    aliases.setdefault(form, e["slug"])
        # Manual extras for common wordings.
        for alias, label in (("ladybird", "Ladybug"), ("lady beetle", "Ladybug"), ("moth", "Moths and butterflies"),
                             ("giant panda", "Panda"), ("hippo", "Hippopotamus"), ("rhino", "Rhinoceros"),
                             ("earthworm", "Worm"), ("sea star", "Starfish"), ("seal", "Harbor seal"),
                             ("harbour seal", "Harbor seal"), ("cow", "Cattle"), ("ox", "Cattle"),
                             ("donkey", None), ("bunny", "Rabbit"), ("croc", "Crocodile")):
            if label and label in self.by_label:
                for form in _plurals(alias):
                    aliases.setdefault(form, self.by_label[label]["slug"])
        self._aliases: List[Tuple[str, str]] = sorted(aliases.items(), key=lambda kv: -len(kv[0]))
        self._pattern = (
            re.compile(r"\b(" + "|".join(re.escape(a) for a, _ in self._aliases) + r")\b")
            if self._aliases
            else None
        )
        self._alias_map = dict(self._aliases)

    @classmethod
    def load(cls, path: Path) -> "SpeciesKB":
        if not path.is_file():
            log.warning("species KB %s not found; /api/species will be empty (run scripts/build_species_kb.py)", path)
            return cls([])
        data = json.loads(path.read_text(encoding="utf-8"))
        entries = data["species"] if isinstance(data, dict) else data
        return cls(entries, {k: v for k, v in data.items() if k != "species"} if isinstance(data, dict) else {})

    def __len__(self) -> int:
        return len(self.entries)

    def get(self, slug: str) -> Optional[Dict[str, Any]]:
        return self.by_slug.get(slug)

    def slug_for_label(self, label: str) -> Optional[str]:
        e = self.by_label.get(label)
        return e["slug"] if e else None

    def resolve(self, slug_or_label: Optional[str]) -> Optional[Dict[str, Any]]:
        if not slug_or_label:
            return None
        return self.by_slug.get(slug_or_label) or self.by_label.get(slug_or_label) or self.by_slug.get(
            _norm(slug_or_label).replace(" ", "-")
        )

    def match_spans(self, norm_text: str) -> List[Tuple[Dict[str, Any], int, int]]:
        """(entry, start, end) for every KB name in already-normalised text (see ``normalize``),
        longest names first, in order of appearance, not deduplicated."""
        if not self._pattern or not norm_text:
            return []
        return [(self.by_slug[self._alias_map[m.group(1)]], m.start(1), m.end(1))
                for m in self._pattern.finditer(norm_text)]

    def match_text(self, text: str) -> List[Dict[str, Any]]:
        """KB entries named in free text, longest names first, in order of appearance, deduplicated."""
        out: List[Dict[str, Any]] = []
        for e, _, _ in self.match_spans(_norm(text or "")):
            if e not in out:
                out.append(e)
        return out

    def exact_alias(self, name: Optional[str]) -> Optional[Dict[str, Any]]:
        """KB entry whose alias is exactly ``name`` (e.g. a Wikipedia title), else None."""
        slug = self._alias_map.get(_norm(name or ""))
        return self.by_slug[slug] if slug else None

    def search(self, q: Optional[str] = None, group: Optional[str] = None,
               status: Optional[str] = None) -> Iterable[Dict[str, Any]]:
        nq = _norm(q) if q else ""
        for e in self.entries:
            if group and (e.get("animal_group") or "").lower() != group.lower():
                continue
            if status:
                code = (e.get("iucn_status") or {}).get("code")
                st = status.upper()
                if st in ("NA", "N/A", "NONE"):
                    if code is not None:
                        continue
                elif (code or "") != st:
                    continue
            if nq:
                hay = _norm(" ".join(filter(None, [
                    e["label"], e.get("common_name"), e.get("scientific_name"),
                    (e.get("inaturalist_taxon") or {}).get("common_name"),
                    *(e.get("taxonomy") or {}).values(),
                ])))
                if nq not in hay:
                    continue
            yield e
