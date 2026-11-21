# WildLens frontend

React 18 + Vite + TypeScript (strict) + Tailwind CSS v3 + shadcn/ui (Radix), with Framer Motion,
React Router, TanStack Query, lucide-react and Recharts. Phase 3:
design tokens, typography, the layout shell, reusable components and a component preview page.
Phase 4 adds the core pages: Identify, Species Atlas, species profiles and the Field Guide chat.
Phase 5 adds the story pages: the Home narrative, Research (from `/api/metrics` and `/api/figures`)
and About. Phase 6 adds the production Docker image (nginx), error boundaries and site icons.

Laptop and desktop only (designed for 1280 px and wider). Below 1024 px a notice replaces the app.

## Run

Requires Node 22+ and npm (`nvm use` picks it up from `.nvmrc`). Node 20 fails to start the Vitest workers.
From the repo root, `make setup && make dev` installs everything and starts backend and frontend
together; the manual steps are:

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173  (/__ui = component preview)
```
On Windows, `make dev` and the `.venv/bin/uvicorn` commands below don't work natively (they assume a
Unix shell and venv layout). Run the whole stack with `docker compose up --build` from the repo root
and open <http://localhost:8080>, or use WSL.

The dev and preview servers proxy `/api` to `http://localhost:8000`, so start the backend in a
second terminal (see `backend/README.md`):

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload
```

Use `WILDLENS_API_URL=http://host:port npm run dev` to proxy elsewhere, or set `VITE_API_BASE`
at build time to call an API on another origin (that origin must be in `WILDLENS_CORS_ORIGINS`).
The typed client is in `src/lib/api.ts`.

## Inference modes

`src/lib/inference/` is one interface (`InferenceEngine.identify(file)` → top-5, low-confidence flag,
CAM heatmap, timing) with two implementations, chosen at build time:

| `VITE_INFERENCE_MODE` | Implementation     | What runs where                                                                                                                                       |
| --------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server` (default)    | `ServerInference`  | One `/api/explain` call (amber colormap; returns the top-5, low-confidence flag and CAM from one forward pass); the backend runs ONNX Runtime on CPU. |
| `browser`             | `BrowserInference` | onnxruntime-web in the page (WebGPU if an adapter is available, else WebAssembly). The photo never leaves the browser.                                |

Browser mode reproduces the backend exactly in TypeScript (`src/lib/inference/math.ts`): a port of
Pillow's BILINEAR resize (antialiased triangle filter, 22-bit fixed point, horizontal then vertical
pass; bit-identical to the backend on the unit-test fixtures), /255, dataset mean/std from
`models/registry.json`, float64 softmax, stable top-k, and CAM from the `features` output and
`models/efficientnetv2_s_fc.json` (ReLU(Σ W·A) → normalise → Pillow float bilinear upsample to the photo size,
capped at 1024 px → normalise → uint8). Low-confidence threshold 0.5, as on the server.
onnxruntime-web (and the ~27 MB `.wasm`) is only imported in browser mode; the model is downloaded
once with a progress bar and kept in Cache Storage (`wildlens-models-v2`), keyed by URL + the
variant's `sha256` from `models/registry.json`, so a re-exported model is fetched again. Downloads
that are a web page (e.g. an SPA fallback for a missing file), implausibly small or fail the hash
check are rejected with a clear message; if ONNX Runtime cannot load a cached copy, it is evicted
and downloaded once more. Photos above 50 MP are rejected (same limit as the backend); photos above
24 MP are scaled down by the browser before their pixels are read (exact server parity holds up to
24 MP), then go through the same Pillow-equivalent resize to 224×224.

The "Model time" on the Identify page is measured where the model ran (server or browser tab):
preprocessing + forward pass, plus the heatmap; upload/network time and the one-time model download
are not included.

```bash
VITE_INFERENCE_MODE=browser npm run dev     # model served from ../models by the dev server
```

| Variable              | Default                                                                                                  | Meaning                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `VITE_INFERENCE_MODE` | `server`                                                                                                 | `server` or `browser`.                                                                                  |
| `VITE_MODEL_URL`      | `/models/efficientnetv2_s.fp16.onnx` if the registry marks the FP16 variant usable, else `/models/efficientnetv2_s.onnx` | ONNX file for browser mode; set to an external URL (Hugging Face / GitHub Release) for deployed builds. |
| `VITE_ORT_EP`         | `auto`                                                                                                   | `auto` (WebGPU, falling back to WASM), `wasm` or `webgpu`.                                              |

**How dev serves the model:** a small Vite plugin in `vite.config.ts` maps `GET /models/<name>.onnx`
to `../models/<name>.onnx` (read-only, `*.onnx` names in that directory only) for `npm run dev` and
`npm run preview`. Nothing is copied into `public/` or `dist/`, so the gitignored model is never
committed or bundled. The small committed metadata (`registry.json`, `classes.json`,
`efficientnetv2_s_fc.json`) is imported through the `@models` alias; the 1.3 MB fc-weights JSON is emitted as
a hashed asset and fetched only in browser mode. WASM runs single-threaded unless the page is
cross-origin isolated.

The FP16 variant (`scripts/export_onnx.py --fp16-only`, float16 weights, float32 inputs/outputs)
is 41 MB instead of 81 MB and agrees with FP32 on 99.89% of test-set top-1 predictions, so it is the
browser default (see `models/efficientnetv2_s_onnx_eval.json`). The backend keeps serving FP32.

## Species photos offline

Species cards and profile heroes use local copies when the backend has them, falling back to
Wikimedia Commons thumbnails. Build the cache once (≈ 1 request/s, honours `Retry-After`):

```bash
python3 scripts/cache_species_images.py      # from the repo root → data/species_images/ (gitignored)
```

The backend serves it at `/api/species-images` (manifest) and `/api/species-images/<file>`.
Attribution always comes from the knowledge base. The Identify sample gallery
(`public/samples/`, 12 photos, built by `scripts/make_samples.py` from the KB's Commons images
with credits in `src/lib/samples.json`) is bundled and works offline.

| Script                               | What it does                                                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                        | Vite dev server with HMR                                                                                                                                                                                                        |
| `npm run build`                      | Type-check, then production build to `dist/`                                                                                                                                                                                    |
| `npm run preview`                    | Serve `dist/` (also proxies `/api`)                                                                                                                                                                                             |
| `npm run lint` / `npm run typecheck` | ESLint (flat config) / `tsc -b`                                                                                                                                                                                                 |
| `npm test`                           | Vitest + Testing Library (jsdom)                                                                                                                                                                                                |
| `npm run format`                     | Prettier                                                                                                                                                                                                                        |
| `npm run e2e`                        | Playwright E2E (`e2e/`): core flows, story pages and the browser/server parity test. Starts the backend (:8000) and Vite (:5173) itself unless they are already running; needs `models/efficientnetv2_s.onnx`                           |
| `npm run screenshots -- <outDir>`    | Playwright screenshots of every page and key states (identify result, low confidence, chat) at 1280×800 and 1920×1080, light and dark (needs `npm run dev` and the backend running, and `npx playwright install chromium` once) |

The `/__ui` preview is included only in development (`import.meta.env.DEV`); set
`VITE_UI_PREVIEW=true` to include it in a production build for review.

Fonts are self-hosted from `@fontsource-variable/*` packages and bundled by Vite, so local mode
works offline. Species photographs on the `/__ui` preview page are hotlinked Wikimedia Commons
thumbnails; the heatmap demo photo (`src/fixtures/red-panda.jpg`, CC0) is bundled. The
low-confidence screenshot input (`scripts/fixtures/low-confidence.jpg`) is a crop of the CC0
ladybird photo used by the knowledge base (Commons: `Coccinella-septempunctata-15-fws.jpg`).

## Content (Phase 5)

Every number on Home, Research and About comes from a project file; nothing is typed in by hand
without a source.

| Where                                                                                                         | Source                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Research: comparison table, dot plot, training curves, per-class table                                        | live `GET /api/metrics` (`outputs/results/*`), shaped by `src/lib/research.ts`. ConvNeXt-Tiny's macro precision/recall/F1 are the mean of its per-class report, and ResNet50/ConvNeXt-Tiny inference time is test-evaluation time ÷ test crops, both as in `docs/model_comparison.md`; those cells are marked † on the page. Blank cells (ConvNeXt-Tiny AUC) are explained under the table. |
| Research: figures gallery                                                                                     | live `GET /api/figures`; captions by file-name pattern in `describeFigure()`                                                                                                                                                                                                                                                                                                                |
| Home and Research narrative numbers (dataset, pipeline, deployment, low-confidence threshold, paper) | `src/content/study.ts`, each block commented with its source (`docs/dataset_notes.md`, `docs/paper_info_table.md`, `docs/model_comparison.md`, `models/efficientnetv2_s_onnx_eval.json`, `backend/README.md`)                                                                                                                                                      |
| Home class-distribution chart                                                                                 | `src/content/class-distribution.json`, generated from `data/manifest.csv` by `node scripts/make_class_distribution.mjs` (rerun if the manifest changes)                                                                                                                                                                                                                                     |
| Home "how to read a result" example                                                                           | `src/fixtures/explain-red-panda.json`, a captured `/api/explain` response (lazy-loaded)                                                                                                                                                                                                                                                                                                     |
| About: data sources and licences                                                                              | summary of `data/LICENSE-DATA.md`                                                                                                                                                                                                                                                                                                                                                           |

Model colours (`--model-1…4`: ResNet50, EfficientNetV2-S, ConvNeXt-Tiny, Swin-Tiny) are fixed by
`MODEL_ORDER` in `src/content/study.ts` and were checked for colour-vision-deficiency separation and
3:1 contrast against the surface in both themes.

### Team section

The About page's "Project team" list comes from `src/content/team.ts` (names only, as provided by the
team; the section hides itself if the list is empty). `role` and `link` are optional fields; links
must be `http(s)`. Only add details people agreed to publish.

### Page titles

Each route sets `document.title` ("Research · WildLens") and the meta description with
`usePageMeta()` from `src/lib/page-meta.ts`.

## Production build, Docker and site assets (Phase 6)

- `frontend/Dockerfile` builds with Node 22 and serves `dist/` with nginx (`nginx/default.conf`):
  SPA fallback, gzip, one-year immutable caching for hashed `/assets/*`, `no-cache` for
  `index.html`, `/api` (unbuffered, for the chat stream) and `/docs` proxied to the backend service,
  and `/models/*.onnx` served read-only from the mounted `models/` directory so a
  `VITE_INFERENCE_MODE=browser` image works too. The build context is the repository root (the
  build imports `models/*.json`); the root `.dockerignore` is an allow-list that never sends ONNX
  weights. Run it with `docker compose up --build` from the root (see the root README).
- Every route has a React Router error boundary (`src/pages/RouteErrorPage.tsx`): a crash in one
  page replaces only the page content, with Reload and Go home; a missing lazy chunk after a rebuild
  gets its own explanation. Unknown paths render `NotFoundPage`.
- Icons and social card: `public/favicon.svg` (the mark), `favicon-32.png`, `apple-touch-icon.png`,
  `icon-192.png`, `icon-512.png`, `site.webmanifest`, `og-image.jpg` (1200×630, typographic with the
  CC0 red panda credited in the image) and `robots.txt`. Regenerate the PNG/JPG files with
  `node scripts/make_icons.mjs`. The `og:image` URL is relative until the site has a public origin
  (Phase 7).
- Lazy route fallbacks are full viewport height so the footer never jumps into view while a page
  chunk loads (layout shift).

## Tests

- `npm test` (Vitest): inference maths against a fixture generated by the backend's own Python
  (`scripts/make_inference_fixture.py`: Pillow resize, preprocessing, softmax/top-k, CAM), atlas
  filtering/sorting, chat context handoff and session, plus the Phase 3 component tests. Phase 5:
  `research.test.ts` (metrics → table rows, best value per column, derived and blank cells, curves,
  per-class sorting, figure captions; fixture `src/fixtures/metrics.json` is a trimmed
  `/api/metrics` response), `TeamSection.test.tsx` (four names, hidden when empty), `page-meta.test.tsx`; Phase 6:
  `RouteErrorPage.test.tsx` (error boundary with Reload / Go home).
- `npm run e2e` (Playwright, real servers): identify a sample → top-1 and heatmap → profile with map
  → Field Guide retrieval-only answer with citations; atlas search/filter; group profile; and the
  parity test — 20 images (12 samples + 8 crops from `data/processed/test`, local only) through
  server and browser (WASM) mode for FP32 and FP16, asserting identical top-5 labels. The parity
  report is written to `test-results/parity.json`. `e2e/story.spec.ts` (Phase 5): Home renders every
  section and its CTAs navigate; Research shows the four models (EfficientNetV2-S deployed, ResNet50 0.7992 baseline) and opens a figure in the lightbox; About has the architecture SVG, the four-name project team and a working skip link; no console errors on any of the three.

## Code splitting

Each route except Home is a `React.lazy` chunk; Home uses no animation library (IntersectionObserver

- CSS transitions) and lazy-loads its example result. Recharts loads only with the Research page. Leaflet (+ CSS) is imported only by `OccurrenceMap`, itself
  lazy-loaded on profile pages; onnxruntime-web is imported only by `lib/inference/browser.ts`,
  loaded only in browser mode.

## Layout

```
src/
  main.tsx, App.tsx            providers (theme, query, motion, tooltip, toaster) and routes
  styles/globals.css           design tokens (CSS variables), fonts, type scale, utilities
  lib/                         api.ts (typed client + SSE parser), theme.tsx, iucn.ts, format.ts,
                               images.ts (Commons thumbnails), heatmap.ts (CAM colouriser), upload.ts,
                               inference/ (adapter: server.ts, browser.ts, math.ts, model-cache.ts),
                               species.ts (queries + local photos), atlas.ts, identify.ts,
                               chat-session.ts, handoff.ts, store.ts, samples.json,
                               research.ts (metrics shaping), page-meta.ts, motion.ts, site.ts (repo URL)
  components/ui/               shadcn/ui primitives themed to the tokens
  components/layout/           AppShell, SiteHeader, SiteFooter, Container, Wordmark, ThemeToggle,
                               ScreenSizeNotice
  components/                  Section, StatTile, SpeciesCard, IucnBadge, IucnScale, ConfidenceBar,
                               PredictionList, HeatmapViewer, UploadDropzone, Attribution,
                               ScientificName, States (EmptyState/ErrorState), charts/, chat/
  components/home|research|about/  Phase 5 page sections (Reveal, ClassDistribution, PipelineSteps,
                               ResultExample, ComparisonTable, PerClassView, FigureGallery,
                               ArchitectureDiagram, TeamSection); charts/ MetricDotPlot, TrainingCurves
  content/                     study.ts (sourced copy numbers), team.ts, class-distribution.json
  pages/                       HomePage, IdentifyPage, AtlasPage, SpeciesProfilePage, AskPage,
                               ResearchPage, AboutPage, NotFoundPage, dev/UiPreview.tsx
e2e/                           Playwright specs (core flows, parity)
  fixtures/                    small copies of data/species_kb.json, one /api/explain response
                               (amber colormap, overlay omitted), a metrics summary
```

## Design tokens

Tokens are RGB channels on `:root` (light) and `:root[data-theme='dark']`; with no stored choice,
`prefers-color-scheme: dark` applies the dark set. The theme toggle stores `wildlens-theme` in
`localStorage` and an inline script in `index.html` applies it before first paint. Tailwind maps the
tokens to classes (`bg-surface`, `text-fg-muted`, `bg-iucn-en`, …), so components never use raw hex.

Base palette: forest `#0F1F17`, moss `#2F4A3A`, paper `#F4F1EA`, stone `#8A8F87`, ochre `#C8913A`.

### Contrast (WCAG 2.1)

Text on backgrounds (AA: 4.5 normal text, 3.0 large text and UI boundaries):

| Pair                                                | Light              | Dark               |
| --------------------------------------------------- | ------------------ | ------------------ |
| text primary on background / surface / raised       | 15.2 / 16.1 / 17.1 | 15.3 / 14.2 / 12.6 |
| text secondary on background / raised               | 8.3 / 9.4          | 10.4 / 8.5         |
| text muted on background / sunken / raised          | 5.5 / 5.0 / 6.2    | 6.8 / 7.1 / 5.6    |
| accent text (ochre for text) on background / sunken | 5.2 / 4.8          | 9.3 / 9.8          |
| success / warning / danger on background            | 5.5 / 5.0 / 5.6    | 7.2 / 9.0 / 6.9    |
| primary-button label on primary                     | 8.6                | 13.9               |
| accent-button label on ochre                        | 6.2                | 7.3                |
| focus ring vs background / surface (non-text)       | 4.1 / 4.3          | 7.7 / 7.1          |
| input border vs background / raised (non-text)      | 3.2 / 3.6          | 3.8 / 3.1          |

Stone `#8A8F87` is 2.9:1 on paper, so it is used only for decorative rules and icons, never text.
Ochre `#C8913A` itself is used for fills, rules and highlights; ochre text uses `--accent-text`.

IUCN code chips (code text on fill; the category name always appears next to the chip in body ink,
so status never relies on colour):

| Code  | LC  | NT  | VU  | EN  | CR  | EW  | EX   | DD  | NE  |
| ----- | --- | --- | --- | --- | --- | --- | ---- | --- | --- |
| Light | 5.0 | 5.1 | 7.0 | 5.2 | 7.1 | 9.8 | 15.1 | 7.1 | 7.2 |
| Dark  | 5.9 | 7.8 | 9.0 | 6.3 | 4.7 | 5.2 | 14.2 | 5.6 | 7.4 |

In dark mode EX is inverted (bone chip) so it stays visible on the forest background.

## Typography

- **Fraunces** (variable, with an optical-size axis; OFL) for display and headings. Chosen over
  Playfair Display because the `opsz` axis keeps it sturdy at h3/h4 sizes and refined at display
  sizes, and its softer, old-style construction reads as natural-history editorial rather than
  fashion-magazine high contrast.
- **Inter** (variable; OFL) for interface and body text; **JetBrains Mono** (OFL) for technical
  labels (model method, catalogue numbers, API status codes).
- Scale: display 72, h1 52, h2 38, h3 28, h4 21 (Inter semibold), lead 20, body 16/1.65, small 14,
  caption 13, overline 12 caps, mono 13. Classes `type-display` … `type-mono`; `tabular` for
  metric numerals.
- `ScientificName` renders `lang="la"` italics; ranks above genus (family, order, …) render upright,
  following zoological convention.

## Notes for later phases

- `api.explain()` defaults to the `amber` colormap; `HeatmapViewer` colourises `heatmap_png`
  client-side, so `overlay_png` is optional.
- Predict/explain responses carry `slugs` (`{label: slug}`); `PredictionList` takes them with a
  `renderLink` prop to link to `/species/:slug`.
- `ChatMessage` has a `searching` status for live lookups (~4.5 s for non-KB animals) and a
  provider badge (`fallback` = "Retrieval-only answer").
- KB image URLs are full-resolution originals; `commonsThumb()` requests a standard Commons
  thumbnail width instead.
