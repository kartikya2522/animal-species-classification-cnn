/**
 * Component preview (dev-only route `/__ui`). Not included in production builds.
 * Shows every Phase 3 component in realistic states using fixtures copied from
 * data/species_kb.json and one captured /api/explain response.
 */
import { Binoculars, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { Attribution } from '@/components/Attribution'
import { AccuracyBarChart } from '@/components/charts/AccuracyBarChart'
import { ChatComposer } from '@/components/chat/ChatComposer'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { CitationList } from '@/components/chat/CitationList'
import { HeatmapViewer } from '@/components/HeatmapViewer'
import { IucnBadge } from '@/components/IucnBadge'
import { IucnScale } from '@/components/IucnScale'
import { Container } from '@/components/layout/Container'
import { PredictionList } from '@/components/PredictionList'
import { ScientificName } from '@/components/ScientificName'
import { SectionHeader } from '@/components/Section'
import { SpeciesCard, type SpeciesCardData } from '@/components/SpeciesCard'
import { StatRow, StatTile } from '@/components/StatTile'
import { EmptyState, ErrorState } from '@/components/States'
import { UploadDropzone } from '@/components/UploadDropzone'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import explainFixture from '@/fixtures/explain-red-panda.json'
import metricsFixture from '@/fixtures/metrics-summary.json'
import redPandaPhoto from '@/fixtures/red-panda.jpg'
import speciesFixture from '@/fixtures/species.json'
import type { ChatSource, ExplainResponse, Prediction } from '@/lib/api'
import { IUCN_CODES, type IucnCode } from '@/lib/iucn'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type FixtureSpecies = SpeciesCardData & {
  summary: string
  iucn_status: { code: IucnCode | null; label: string; source: string | null }
}

const SPECIES = speciesFixture.species as unknown as FixtureSpecies[]
const bySlug = (slug: string) => SPECIES.find((s) => s.slug === slug) as FixtureSpecies
const EXPLAIN = explainFixture as unknown as ExplainResponse

const SECTIONS = [
  ['tokens', 'Colour'],
  ['type', 'Typography'],
  ['controls', 'Controls'],
  ['layout', 'Sections & stats'],
  ['species', 'Species cards'],
  ['iucn', 'Conservation status'],
  ['predictions', 'Predictions'],
  ['heatmap', 'Heatmap'],
  ['upload', 'Upload'],
  ['chat', 'Field Guide chat'],
  ['states', 'States'],
  ['charts', 'Charts'],
] as const

/* ------------------------------------------------------------------ helpers */

function Block({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-border py-16">
      <div className="mb-10 flex items-baseline justify-between gap-10">
        <h2 id={`${id}-title`} className="type-h2">
          {title}
        </h2>
        {note && <p className="type-caption max-w-md text-right">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="type-mono mb-3">{label}</p>
      {children}
    </div>
  )
}

function Swatch({
  token,
  name,
  hex,
  darkHex,
  fg,
}: {
  token: string
  name: string
  hex: string
  darkHex: string
  fg?: string
}) {
  const { resolved } = useTheme()
  return (
    <div className="overflow-hidden rounded border border-border">
      <div
        className="flex h-16 items-end px-3 pb-2 text-caption font-medium"
        style={{ background: `rgb(var(--${token}))`, color: fg ? `rgb(var(--${fg}))` : undefined }}
      >
        {fg ? 'Aa' : ''}
      </div>
      <div className="bg-surface px-3 py-2">
        <p className="text-caption font-medium text-fg">{name}</p>
        <p className="font-mono text-[0.6875rem] text-fg-muted">
          --{token} · {resolved === 'dark' ? darkHex : hex}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ chat samples */

const SOURCES: ChatSource[] = [
  { id: 1, title: 'Wikipedia: Red panda', url: 'https://en.wikipedia.org/wiki/Red_panda', kind: 'wikipedia' },
  {
    id: 2,
    title: 'iNaturalist: Ailurus fulgens',
    url: 'https://www.inaturalist.org/taxa/41740',
    kind: 'inaturalist',
  },
  {
    id: 3,
    title: 'Wikidata: Q22256 (IUCN status)',
    url: 'https://www.wikidata.org/wiki/Q22256',
    kind: 'wikidata',
  },
]

const ANSWER = `Red pandas live in the temperate forests of the **eastern Himalayas and southwestern China** [1], usually at altitudes where bamboo grows densely in the understorey.

- **Diet:** mostly bamboo leaves and shoots, supplemented with fruit, acorns and insects [1]
- **Status:** listed as *Endangered* on the IUCN Red List [3]
- **Observations:** recorded by naturalists across Nepal, Bhutan, India and China [2]

Their flexible joints and curved, semi-retractile claws make them agile climbers [1].`

const STREAM_TEXT =
  'Axolotls are found naturally only in the lake complex of Xochimilco, near Mexico City [1]. Unlike most amphibians, they remain aquatic throughout their lives and keep their feathery external gills into adulthood [1].'

function useSimulatedStream(text: string) {
  const words = text.split(' ')
  const [count, setCount] = useState(Math.floor(words.length * 0.55))
  useEffect(() => {
    const t = window.setInterval(
      () => setCount((c) => (c >= words.length ? Math.floor(words.length * 0.3) : c + 1)),
      220,
    )
    return () => window.clearInterval(t)
  }, [words.length])
  return words.slice(0, count).join(' ')
}

/* ------------------------------------------------------------------ page */

export default function UiPreview() {
  const [heatmapKey, setHeatmapKey] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const streamed = useSimulatedStream(STREAM_TEXT)

  const lowConfidence: Prediction[] = [
    { label: 'Fox', index: 18, probability: 0.31 },
    { label: 'Red panda', index: 54, probability: 0.22 },
    { label: 'Raccoon', index: 55, probability: 0.14 },
    { label: 'Squirrel', index: 68, probability: 0.08 },
    { label: 'Dog', index: 14, probability: 0.05 },
  ]

  const chartData = metricsFixture.models
    .map((m) => ({ id: m.id, name: m.name, accuracy: m.accuracy }))
    .sort((a, b) => b.accuracy - a.accuracy)

  return (
    <Container width="content" className="pb-24">
      <header className="grid grid-cols-12 gap-10 pb-14 pt-20">
        <div className="col-span-8">
          <p className="type-overline mb-4">Phase 3 · Design system</p>
          <h1 className="type-display">Component preview</h1>
          <p className="type-lead mt-5 max-w-prose">
            Tokens, type and components for WildLens, shown in realistic states with data from the species
            knowledge base. Use the theme toggle in the header to review both themes. This page exists only in
            development.
          </p>
        </div>
        <nav aria-label="Preview sections" className="col-span-4 col-start-9 self-end pl-10">
          <ol className="columns-2 gap-6 text-small">
            {SECTIONS.map(([id, label], i) => (
              <li key={id} className="mb-1.5 break-inside-avoid">
                <a href={`#${id}`} className="text-fg-secondary transition-colors hover:text-fg">
                  <span className="tabular mr-2 font-mono text-caption text-fg-muted">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      {/* ---------------------------------------------------------------- tokens */}
      <Block
        id="tokens"
        title="Colour"
        note="Hex values follow the active theme. Contrast ratios are listed in the frontend README."
      >
        <div className="space-y-10">
          <Demo label="Surfaces & lines">
            <div className="grid grid-cols-6 gap-4">
              <Swatch token="bg" name="Background" hex="#F4F1EA" darkHex="#0D1A13" />
              <Swatch token="surface" name="Surface" hex="#FAF8F3" darkHex="#132219" />
              <Swatch token="surface-raised" name="Surface raised" hex="#FFFFFF" darkHex="#1A2C22" />
              <Swatch token="surface-sunken" name="Surface sunken" hex="#EBE7DD" darkHex="#0A140F" />
              <Swatch token="border" name="Border" hex="#D9D3C6" darkHex="#2A3D32" />
              <Swatch token="border-strong" name="Border strong" hex="#B9B2A3" darkHex="#3F564A" />
            </div>
          </Demo>
          <Demo label="Ink, brand & accent">
            <div className="grid grid-cols-6 gap-4">
              <Swatch token="fg" name="Text primary" hex="#0F1F17" darkHex="#F1EDE4" fg="bg" />
              <Swatch token="fg-secondary" name="Text secondary" hex="#3B4A41" darkHex="#C8C5BB" fg="bg" />
              <Swatch token="fg-muted" name="Text muted" hex="#5C635C" darkHex="#9BA197" fg="bg" />
              <Swatch token="primary" name="Primary (moss)" hex="#2F4A3A" darkHex="#ECE7DB" fg="primary-fg" />
              <Swatch token="accent" name="Accent (ochre)" hex="#C8913A" darkHex="#D6A04A" fg="accent-fg" />
              <Swatch token="accent-text" name="Accent text" hex="#8A5A12" darkHex="#E2B467" fg="bg" />
            </div>
          </Demo>
          <Demo label="Feedback (muted)">
            <div className="grid grid-cols-6 gap-4">
              <Swatch token="success" name="Success" hex="#3D6B48" darkHex="#7FB08A" fg="bg" />
              <Swatch token="warning" name="Warning" hex="#8C5E0E" darkHex="#E0B064" fg="bg" />
              <Swatch token="danger" name="Danger" hex="#A3402E" darkHex="#E08A76" fg="bg" />
              <Swatch token="ring" name="Focus ring" hex="#A06A1C" darkHex="#D6A04A" />
              <Swatch token="stone" name="Stone (decorative)" hex="#8A8F87" darkHex="#8A8F87" />
            </div>
          </Demo>
          <Demo label="IUCN Red List palette">
            <div className="grid grid-cols-10 gap-3">
              {[...IUCN_CODES, null].map((c) => (
                <div key={c ?? 'na'} className="flex flex-col items-start gap-2">
                  <IucnBadge code={c} label="Not applicable" showLabel={false} />
                  <span className="text-caption text-fg-muted">{c ?? 'N/A'}</span>
                </div>
              ))}
            </div>
          </Demo>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- type */}
      <Block
        id="type"
        title="Typography"
        note="Fraunces (variable, optical size) for display and headings; Inter for interface and body; JetBrains Mono for technical labels."
      >
        <div className="divide-y divide-border">
          {[
            [
              'display · Fraunces 72/1.02',
              <p key="d" className="type-display">
                The quiet work of watching
              </p>,
            ],
            [
              'h1 · Fraunces 52',
              <p key="1" className="type-h1">
                Eighty animals, one atlas
              </p>,
            ],
            [
              'h2 · Fraunces 38',
              <p key="2" className="type-h2">
                How the models compare
              </p>,
            ],
            [
              'h3 · Fraunces 28',
              <p key="3" className="type-h3">
                Where red pandas live
              </p>,
            ],
            [
              'h4 · Inter 21 semibold',
              <p key="4" className="type-h4">
                Top-5 predictions
              </p>,
            ],
            [
              'lead · Inter 20',
              <p key="l" className="type-lead max-w-prose">
                Camera traps record millions of images a year; identifying the animals in them is the slow
                part.
              </p>,
            ],
            [
              'body · Inter 16/1.65',
              <p key="b" className="type-body max-w-prose">
                The red panda, <ScientificName name="Ailurus fulgens" />, is a small mammal native to the
                eastern Himalayas and southwestern China. The family name{' '}
                <ScientificName name="Ailuridae" rank="family" /> is set upright, following zoological
                convention for ranks above genus.
              </p>,
            ],
            [
              'small · Inter 14',
              <p key="s" className="type-small">
                Inference ran on the server in 27 ms.
              </p>,
            ],
            [
              'caption · Inter 13',
              <p key="c" className="type-caption">
                Photograph: Mathias Appel · CC0 · Wikimedia Commons
              </p>,
            ],
            [
              'overline · Inter 12 caps',
              <p key="o" className="type-overline">
                Field notes · Mammal
              </p>,
            ],
            [
              'mono · JetBrains Mono 13',
              <p key="m" className="type-mono">
                CAM (== Grad-CAM for this GAP→Linear head), last conv block · 7×7
              </p>,
            ],
            [
              'tabular numerals',
              <p key="t" className="tabular font-serif text-h3">
                79.92% · 97.31% · 7,576
              </p>,
            ],
          ].map(([label, node]) => (
            <div key={label as string} className="grid grid-cols-12 items-baseline gap-10 py-5">
              <p className="type-mono col-span-3">{label}</p>
              <div className="col-span-9">{node}</div>
            </div>
          ))}
        </div>
      </Block>

      {/* ---------------------------------------------------------------- controls */}
      <Block
        id="controls"
        title="Controls"
        note="shadcn/ui on Radix primitives, themed to the tokens. All keyboard-operable with a visible ochre focus ring."
      >
        <div className="grid grid-cols-2 gap-16">
          <div className="space-y-8">
            <Demo label="Button variants">
              <div className="flex flex-wrap items-center gap-3">
                <Button>Identify a photo</Button>
                <Button variant="secondary">Browse the atlas</Button>
                <Button variant="accent">Ask the Field Guide</Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="link">Read the method</Button>
              </div>
            </Demo>
            <Demo label="Sizes & states">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button disabled>Disabled</Button>
                <Button variant="secondary" disabled>
                  <Spinner size="sm" label="Working" /> Working…
                </Button>
                <Button variant="secondary" size="icon" aria-label="Search">
                  <Search />
                </Button>
              </div>
            </Demo>
            <Demo label="Tooltip, dialog, toast">
              <div className="flex flex-wrap items-center gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary">Hover or focus me</Button>
                  </TooltipTrigger>
                  <TooltipContent>Top-1 probability below 50% is flagged as low confidence.</TooltipContent>
                </Tooltip>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary">Open dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>About the heatmap</DialogTitle>
                      <DialogDescription>
                        The overlay is a class activation map from the final convolutional layer. Brighter
                        regions contributed more to the predicted class.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="ghost">Close</Button>
                      </DialogClose>
                      <Button onClick={() => setDialogOpen(false)}>Got it</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="secondary"
                  onClick={() =>
                    toast({ title: 'Prediction saved', description: 'Red panda · 97.5%', tone: 'success' })
                  }
                >
                  Success toast
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    toast({
                      title: 'Upload rejected',
                      description: 'GIF images are not supported.',
                      tone: 'danger',
                    })
                  }
                >
                  Error toast
                </Button>
              </div>
            </Demo>
          </div>
          <div className="space-y-8">
            <Demo label="Input & select">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ui-search">Search species</Label>
                  <Input id="ui-search" placeholder="Common or scientific name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ui-status">Conservation status</Label>
                  <Select defaultValue="EN">
                    <SelectTrigger id="ui-status">
                      <SelectValue placeholder="Any status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any status</SelectItem>
                      <SelectItem value="LC">Least Concern</SelectItem>
                      <SelectItem value="NT">Near Threatened</SelectItem>
                      <SelectItem value="VU">Vulnerable</SelectItem>
                      <SelectItem value="EN">Endangered</SelectItem>
                      <SelectItem value="NA">Not applicable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ui-invalid">Invalid</Label>
                  <Input id="ui-invalid" aria-invalid="true" defaultValue="Ailurus fulgenss" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ui-disabled">Disabled</Label>
                  <Input id="ui-disabled" disabled placeholder="Unavailable offline" />
                </div>
              </div>
            </Demo>
            <Demo label="Tabs">
              <Tabs defaultValue="summary">
                <TabsList>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
                  <TabsTrigger value="model">Model performance</TabsTrigger>
                  <TabsTrigger value="map" disabled>
                    Map
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="type-small max-w-prose">
                  {bySlug('red-panda').summary.split('. ').slice(0, 2).join('. ')}.
                </TabsContent>
                <TabsContent value="taxonomy" className="type-small">
                  Mammalia · Carnivora · Ailuridae · <ScientificName name="Ailurus" />
                </TabsContent>
                <TabsContent value="model" className="type-small">
                  97.7% of 44 test images classified correctly.
                </TabsContent>
              </Tabs>
            </Demo>
          </div>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- layout */}
      <Block id="layout" title="Sections & stats">
        <div className="rounded border border-border bg-surface p-12">
          <SectionHeader
            eyebrow="The result"
            title="A model that knows eighty animals"
            lead="Trained on 50,000 labelled photographs and tested on 7,576 it had never seen, ResNet50 names the right animal four times out of five — and has it in its top five 97% of the time."
            actions={<Button variant="secondary">Read the research</Button>}
          />
          <StatRow>
            <StatTile
              value="79.9"
              unit="%"
              label="Top-1 accuracy"
              delta={{ value: '+4.1 pts', direction: 'up', label: 'vs. baseline' }}
            />
            <StatTile value="97.3" unit="%" label="Top-5 accuracy" footnote="7,576 test images" />
            <StatTile
              value="0.721"
              label="Macro F1"
              delta={{ value: '−0.05', direction: 'down', label: 'vs. EfficientNetV2-S' }}
            />
            <StatTile value="23.7" unit="M" label="Parameters" footnote="94.6 MB as ONNX FP32" />
          </StatRow>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-10">
          <Demo label="StatRow · 3 columns, medium">
            <StatRow columns={3}>
              <StatTile size="md" value="27" unit="ms" label="Median latency" />
              <StatTile size="md" value="44" label="Test images" />
              <StatTile size="md" value="97.7" unit="%" label="Class accuracy" />
            </StatRow>
          </Demo>
          <Demo label="Attribution (caption)">
            <figure>
              <img
                src={redPandaPhoto}
                alt="Red panda on a branch"
                className="aspect-[3/2] w-full rounded object-cover"
              />
              <figcaption className="mt-2">
                <Attribution image={bySlug('red-panda').image!} />
              </figcaption>
            </figure>
          </Demo>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- species */}
      <Block
        id="species"
        title="Species cards"
        note="Field-notes style. Hover or focus a card to reveal the photo credit. Images load from Wikimedia Commons thumbnails."
      >
        <div className="grid grid-cols-4 gap-6">
          {['red-panda', 'tiger', 'polar-bear', 'bear'].map((slug) => (
            <SpeciesCard
              key={slug}
              species={bySlug(slug)}
              renderLink={(children) => (
                <a href={`#species-${slug}`} onClick={(e) => e.preventDefault()}>
                  {children}
                </a>
              )}
            />
          ))}
          {['jaguar', 'giraffe', 'harbor-seal'].map((slug) => (
            <SpeciesCard key={slug} species={bySlug(slug)} />
          ))}
          <SpeciesCard
            species={{
              ...bySlug('raccoon'),
              image: { ...bySlug('raccoon').image!, url: 'https://invalid.example/missing.jpg' },
            }}
          />
        </div>
      </Block>

      {/* ---------------------------------------------------------------- iucn */}
      <Block
        id="iucn"
        title="Conservation status"
        note="Status is never conveyed by colour alone: every badge carries its code and category name."
      >
        <Demo label="IucnBadge" className="mb-12">
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            {IUCN_CODES.map((c) => (
              <IucnBadge key={c} code={c} />
            ))}
            <IucnBadge code={null} label="Not applicable (group)" />
          </div>
        </Demo>
        <div className="grid grid-cols-2 gap-x-16 gap-y-12">
          <Demo label="IucnScale · Endangered (red panda)">
            <IucnScale code="EN" source={bySlug('red-panda').iucn_status.source} />
          </Demo>
          <Demo label="IucnScale · Near Threatened (jaguar)">
            <IucnScale code="NT" source={bySlug('jaguar').iucn_status.source} />
          </Demo>
          <Demo label="IucnScale · group (bears)">
            <IucnScale code={null} label="Not applicable (group)" />
          </Demo>
          <Demo label="IucnScale · Data Deficient">
            <IucnScale code="DD" />
          </Demo>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- predictions */}
      <Block
        id="predictions"
        title="Predictions"
        note="Bars fill once on mount; disabled when the visitor prefers reduced motion."
      >
        <div className="grid grid-cols-2 gap-16">
          <Demo label="PredictionList · confident (from /api/explain fixture)">
            <PredictionList
              predictions={EXPLAIN.predictions}
              slugs={EXPLAIN.slugs}
              scientificNames={{ 'Red panda': 'Ailurus fulgens' }}
              renderLink={(slug, children) => (
                <a
                  href={`#species-${slug}`}
                  onClick={(e) => e.preventDefault()}
                  className="hover:underline hover:decoration-accent hover:underline-offset-4"
                >
                  {children}
                </a>
              )}
            />
            <p className="type-caption mt-6">
              ResNet50 · {EXPLAIN.inference_ms.toFixed(0)} ms inference · {EXPLAIN.image.width}×
              {EXPLAIN.image.height} {EXPLAIN.image.format}
            </p>
          </Demo>
          <Demo label="PredictionList · low confidence (illustrative values)">
            <PredictionList predictions={lowConfidence} lowConfidence threshold={0.5} />
          </Demo>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- heatmap */}
      <Block
        id="heatmap"
        title="Heatmap"
        note="heatmap_png from /api/explain, colourised client-side in the site palette, revealed with a scanning line."
      >
        <div className="grid grid-cols-12 gap-12">
          <div className="col-span-8">
            <HeatmapViewer
              key={heatmapKey}
              imageSrc={redPandaPhoto}
              heatmapPng={EXPLAIN.heatmap_png}
              width={EXPLAIN.width}
              height={EXPLAIN.height}
              alt="Red panda on a branch, with the model's attention heatmap"
              caption={`Explaining “${EXPLAIN.label}” · ${(EXPLAIN.probability * 100).toFixed(1)}%`}
              method={EXPLAIN.method}
            />
          </div>
          <div className="col-span-4 space-y-5">
            <p className="type-small">
              Brighter regions contributed more to the predicted class. For this architecture the class
              activation map is mathematically identical to Grad-CAM, so it is computed without gradients.
            </p>
            <Button variant="secondary" onClick={() => setHeatmapKey((k) => k + 1)}>
              <RefreshCw /> Replay reveal
            </Button>
            <Attribution image={bySlug('red-panda').image!} />
          </div>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- upload */}
      <Block
        id="upload"
        title="Upload"
        note="Drag and drop, click, keyboard (Enter/Space) or paste. Validates type and size before upload."
      >
        <div className="grid grid-cols-2 gap-10">
          <Demo label="Idle (paste enabled)">
            <UploadDropzone
              listenToPaste
              onFile={(f) =>
                toast({ title: 'File accepted', description: `${f.name} would be sent to /api/predict.` })
              }
            />
          </Demo>
          <Demo label="Loading">
            <UploadDropzone onFile={() => undefined} loading />
          </Demo>
          <Demo label="Error (from API)">
            <UploadDropzone
              onFile={() => undefined}
              error="“IMG_2041.HEIC” could not be decoded as an image. Use a JPEG, PNG or WebP photograph."
            />
          </Demo>
          <Demo label="Disabled">
            <UploadDropzone onFile={() => undefined} disabled />
          </Demo>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- chat */}
      <Block
        id="chat"
        title="Field Guide chat"
        note="Markdown answers with inline citation chips, streaming caret, a searching state for live lookups (~4.5 s) and a provider badge."
      >
        <div className="grid grid-cols-12 gap-12">
          <div className="col-span-8 space-y-10 rounded border border-border bg-surface p-10">
            <ChatMessage id="u1" role="user" content="Where do red pandas live, and are they endangered?" />
            <ChatMessage
              id="a1"
              role="assistant"
              content={ANSWER}
              sources={SOURCES}
              provider="groq"
              model="openai/gpt-oss-20b"
            />
            <ChatMessage id="u2" role="user" content="What about axolotls?" />
            <ChatMessage id="a2" role="assistant" content="" status="searching" />
            <ChatMessage
              id="a3"
              role="assistant"
              content={streamed}
              status="streaming"
              provider="groq"
              sources={SOURCES.slice(0, 1)}
            />
            <ChatComposer
              onSend={(t) => toast({ title: 'Question sent', description: t })}
              suggestions={[
                'How long do red pandas live?',
                'What do snow leopards eat?',
                'Which of the 80 species are endangered?',
              ]}
            />
          </div>
          <div className="col-span-4 space-y-10">
            <Demo label="Retrieval-only answer (no LLM)">
              <ChatMessage
                id="a4"
                role="assistant"
                provider="fallback"
                sources={SOURCES.slice(0, 2)}
                content={
                  '**Red panda** (*Ailurus fulgens*) — Endangered [1].\n\nA small mammal native to the eastern Himalayas and southwestern China [1]. Observed over 9,000 times on iNaturalist [2].'
                }
              />
            </Demo>
            <Demo label="Interrupted">
              <ChatMessage
                id="a5"
                role="assistant"
                provider="groq"
                status="error"
                content="Snow leopards range across the mountains of Central and South Asia"
                errorMessage="The answer was interrupted (time budget exceeded). Please try again."
              />
            </Demo>
            <Demo label="Composer · busy">
              <ChatComposer onSend={() => undefined} busy onStop={() => undefined} />
            </Demo>
            <Demo label="CitationList (standalone)">
              <CitationList sources={SOURCES} scope="standalone" className="border-t-0 pt-0" />
            </Demo>
          </div>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- states */}
      <Block id="states" title="States">
        <div className="grid grid-cols-3 gap-8">
          <Demo label="EmptyState">
            <EmptyState
              icon={Binoculars}
              title="No species match"
              description="Nothing in the atlas matches “snow leopard” with the Endangered filter. Try clearing a filter."
              action={
                <Button variant="secondary" size="sm">
                  Clear filters
                </Button>
              }
            />
          </Demo>
          <Demo label="ErrorState">
            <ErrorState
              title="The model is not loaded"
              message="The server is running but the ONNX model file is missing. See the backend README for how to export it."
              detail="503 · /api/predict"
              action={
                <Button variant="secondary" size="sm">
                  <RefreshCw /> Try again
                </Button>
              }
            />
          </Demo>
          <Demo label="Spinner">
            <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 rounded border border-border">
              <Spinner />
              <p className="text-caption text-fg-muted">Loading species…</p>
            </div>
          </Demo>
          <Demo label="Skeleton · species card" className="col-span-1">
            <div className="overflow-hidden rounded border border-border bg-surface">
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="space-y-3 p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-28" />
                <div className="flex justify-between border-t border-border pt-4">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </div>
            </div>
          </Demo>
          <Demo label="Skeleton · predictions" className="col-span-2">
            <div className="space-y-5 rounded border border-border p-6">
              <Skeleton className="h-3 w-20" />
              <div className="flex justify-between">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-8 w-20" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
              {[0.7, 0.5, 0.4, 0.3].map((w, i) => (
                <div key={i} className="space-y-2 pt-1">
                  <Skeleton className="h-3" style={{ width: `${w * 60}%` }} />
                  <Skeleton className="h-1 w-full rounded-full" />
                </div>
              ))}
            </div>
          </Demo>
        </div>
      </Block>

      {/* ---------------------------------------------------------------- charts */}
      <Block
        id="charts"
        title="Charts"
        note="Recharts, one series, thin bars with rounded data ends, recessive grid, hover tooltip and direct value labels."
      >
        <div className="grid grid-cols-12 gap-12">
          <div className="col-span-7">
            <p className="type-h4 mb-1">Test accuracy by model</p>
            <p className="type-caption mb-6">
              Top-1 test accuracy as reported by each training run. ResNet50 is the model served today.
            </p>
            <AccuracyBarChart data={chartData} highlight="resnet50" title="Top-1 test accuracy by model" />
          </div>
          <div className="col-span-5">
            <table className="w-full text-small">
              <caption className="type-overline mb-4 text-left !text-fg-muted">Table view</caption>
              <thead>
                <tr className="border-b border-border-strong text-left text-caption text-fg-muted">
                  <th className="py-2 font-medium">Model</th>
                  <th className="py-2 text-right font-medium">Top-1</th>
                  <th className="py-2 text-right font-medium">Macro F1</th>
                  <th className="py-2 text-right font-medium">Params</th>
                </tr>
              </thead>
              <tbody>
                {metricsFixture.models.map((m) => (
                  <tr
                    key={m.id}
                    className={cn('border-b border-border', m.id === 'resnet50' && 'font-medium text-fg')}
                  >
                    <td className="py-2.5">{m.name}</td>
                    <td className="tabular py-2.5 text-right">{(m.accuracy * 100).toFixed(1)}%</td>
                    <td className="tabular py-2.5 text-right">
                      {m.macro_f1 != null ? m.macro_f1.toFixed(3) : '—'}
                    </td>
                    <td className="tabular py-2.5 text-right">{(m.params / 1e6).toFixed(1)} M</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Block>

      <p className="type-caption border-t border-border pt-10">
        Photographs from Wikimedia Commons via the WildLens knowledge base; each is credited with its author
        and licence.
      </p>
    </Container>
  )
}
