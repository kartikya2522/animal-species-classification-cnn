/**
 * WildLens architecture as inline SVG. Colours are the site tokens (CSS variables), so the
 * diagram follows the light/dark theme; text is real text, readable by screen readers through
 * the <title>/<desc> and the list that follows the figure on the About page.
 */

const C = {
  panel: 'rgb(var(--surface))',
  box: 'rgb(var(--surface-raised))',
  sunken: 'rgb(var(--surface-sunken))',
  line: 'rgb(var(--border-strong))',
  hair: 'rgb(var(--border))',
  ink: 'rgb(var(--fg))',
  ink2: 'rgb(var(--fg-secondary))',
  muted: 'rgb(var(--fg-muted))',
  accent: 'rgb(var(--accent))',
  accentText: 'rgb(var(--accent-text))',
}

const FONT = 'Inter Variable, Inter, system-ui, sans-serif'
const MONO = 'JetBrains Mono Variable, ui-monospace, monospace'

interface BoxProps {
  x: number
  y: number
  w: number
  h: number
  title: string
  lines?: string[]
  mono?: string
  dashed?: boolean
  accent?: boolean
}

function Box({ x, y, w, h, title, lines = [], mono, dashed, accent }: BoxProps) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        fill={C.box}
        stroke={accent ? C.accent : C.line}
        strokeWidth={accent ? 1.5 : 1}
        strokeDasharray={dashed ? '5 4' : undefined}
      />
      {mono && (
        <text x={x + 14} y={y + 20} fontFamily={MONO} fontSize={11} fill={C.accentText}>
          {mono}
        </text>
      )}
      <text x={x + 14} y={y + (mono ? 39 : 24)} fontFamily={FONT} fontSize={14} fontWeight={600} fill={C.ink}>
        {title}
      </text>
      {lines.map((l, i) => (
        <text
          key={l}
          x={x + 14}
          y={y + (mono ? 58 : 43) + i * 17}
          fontFamily={FONT}
          fontSize={12}
          fill={C.ink2}
        >
          {l}
        </text>
      ))}
    </g>
  )
}

function Column({ x, w, title, note }: { x: number; w: number; title: string; note: string }) {
  return (
    <g>
      <rect x={x} y={20} width={w} height={520} rx={6} fill={C.panel} stroke={C.hair} />
      <text
        x={x + 18}
        y={50}
        fontFamily={FONT}
        fontSize={11}
        fontWeight={600}
        letterSpacing="0.12em"
        fill={C.accentText}
      >
        {title.toUpperCase()}
      </text>
      <text x={x + 18} y={68} fontFamily={FONT} fontSize={12} fill={C.muted}>
        {note}
      </text>
    </g>
  )
}

function Label({
  x,
  y,
  children,
  anchor = 'middle',
}: {
  x: number
  y: number
  children: string
  anchor?: 'start' | 'middle' | 'end'
}) {
  return (
    <text x={x} y={y} fontFamily={FONT} fontSize={11} fill={C.muted} textAnchor={anchor}>
      {children}
    </text>
  )
}

export function ArchitectureDiagram() {
  return (
    <svg
      viewBox="0 0 1200 600"
      role="img"
      aria-labelledby="arch-title arch-desc"
      className="h-auto w-full"
      data-testid="architecture-diagram"
    >
      <title id="arch-title">WildLens architecture</title>
      <desc id="arch-desc">
        The browser runs a React app built with Vite. In server mode it sends photos and questions to a
        FastAPI backend, which runs the EfficientNetV2-S ONNX model with ONNX Runtime, serves the species knowledge
        base and the study results, and answers Field Guide questions by retrieving Wikipedia, Wikidata and
        iNaturalist text and, if configured, asking Groq. In browser mode the same model runs in the page with
        onnxruntime-web. The browser loads GBIF map tiles and Wikimedia Commons photos directly.
      </desc>
      <defs>
        <marker
          id="arch-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={C.line} />
        </marker>
      </defs>

      <Column x={20} w={320} title="Browser" note="React + Vite single-page app" />
      <Column x={420} w={400} title="Project server" note="FastAPI (Python), one process" />
      <Column x={900} w={280} title="External, free" note="Public APIs, no account needed" />

      {/* Browser */}
      <Box
        x={40}
        y={90}
        w={280}
        h={88}
        title="Pages"
        lines={['Home · Identify · Species Atlas', 'Field Guide · Research · About']}
      />
      <Box
        x={40}
        y={196}
        w={280}
        h={88}
        mono="server mode (default)"
        title="Inference adapter"
        lines={['sends the photo to /api/explain']}
      />
      <Box
        x={40}
        y={302}
        w={280}
        h={104}
        dashed
        accent
        mono="browser mode"
        title="onnxruntime-web"
        lines={['same model, FP16, WebGPU or WASM', 'the photo never leaves the tab']}
      />
      <Box
        x={40}
        y={424}
        w={280}
        h={70}
        title="Occurrence map (Leaflet)"
        lines={['GBIF tiles, loaded directly']}
      />

      {/* Server */}
      <Box
        x={440}
        y={90}
        w={360}
        h={96}
        mono="/api/predict · /api/explain"
        title="ONNX Runtime (CPU)"
        lines={['EfficientNetV2-S, FP32 · top-5 + CAM heatmap']}
      />
      <Box
        x={440}
        y={204}
        w={360}
        h={78}
        mono="/api/species"
        title="Species knowledge base"
        lines={['80 classes, pre-built; offline photo cache']}
      />
      <Box
        x={440}
        y={300}
        w={360}
        h={112}
        mono="/api/chat · streamed"
        title="Field Guide chat"
        lines={['retrieve sources, then answer with:', 'Groq → Ollama (local) → retrieval-only']}
      />
      <Box
        x={440}
        y={430}
        w={360}
        h={78}
        mono="/api/metrics · /api/figures"
        title="Study results and figures"
        lines={['outputs/results, outputs/figures']}
      />

      {/* External */}
      <Box x={918} y={90} w={244} h={46} title="Wikipedia" />
      <Box x={918} y={146} w={244} h={46} title="Wikidata" />
      <Box x={918} y={202} w={244} h={46} title="iNaturalist" />
      <Box x={918} y={258} w={244} h={62} title="Groq (optional)" lines={['key kept on the server']} />
      <Box x={918} y={376} w={244} h={46} title="GBIF maps" />
      <Box x={918} y={432} w={244} h={46} title="Wikimedia Commons" />

      {/* Browser -> server: one /api bus with a branch into each service */}
      <path d="M320 134 H390 M320 240 H390 M390 134 V469" fill="none" stroke={C.line} strokeWidth={1.25} />
      {[138, 243, 356, 469].map((y) => (
        <line
          key={y}
          x1={390}
          y1={y}
          x2={438}
          y2={y}
          stroke={C.line}
          strokeWidth={1.25}
          markerEnd="url(#arch-arrow)"
        />
      ))}
      <rect x={346} y={290} width={60} height={18} rx={3} fill={C.sunken} />
      <text x={376} y={303} fontFamily={MONO} fontSize={11} fill={C.ink2} textAnchor="middle">
        /api/*
      </text>

      {/* Chat -> sources */}
      {[113, 169, 225, 289].map((y) => (
        <line
          key={y}
          x1={800}
          y1={356}
          x2={916}
          y2={y}
          stroke={C.line}
          strokeWidth={1.25}
          markerEnd="url(#arch-arrow)"
        />
      ))}
      <Label x={808} y={386} anchor="start">
        live lookups
      </Label>

      {/* Browser -> GBIF / Commons, along the bottom lane */}
      <path
        d="M180 494 V560 H860 V455 H916"
        fill="none"
        stroke={C.line}
        strokeWidth={1.25}
        markerEnd="url(#arch-arrow)"
      />
      <path
        d="M860 455 V399 H916"
        fill="none"
        stroke={C.line}
        strokeWidth={1.25}
        markerEnd="url(#arch-arrow)"
      />
      <rect x={430} y={551} width={380} height={18} fill="rgb(var(--bg))" />
      <Label x={620} y={564}>
        map tiles and photos, fetched by the browser directly
      </Label>
    </svg>
  )
}
