import { ArrowRight, BookOpen, Download, MessageSquareText, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Attribution } from '@/components/Attribution'
import { HeatmapViewer } from '@/components/HeatmapViewer'
import { InferenceBadge } from '@/components/InferenceBadge'
import { PredictionList } from '@/components/PredictionList'
import { Section, SectionHeader } from '@/components/Section'
import { ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { UploadDropzone } from '@/components/UploadDropzone'
import { formatBytes, formatMs, formatPercent } from '@/lib/format'
import { askLink } from '@/lib/handoff'
import { identify, identifySample, identifyStore, resetIdentify, type IdentifyState } from '@/lib/identify'
import { browserModelInfo, INFERENCE_MODE, prepareInference, type LoadProgress } from '@/lib/inference'
import samplesData from '@/lib/samples.json'
import { useSpeciesList } from '@/lib/species'
import { cn } from '@/lib/utils'
import { usePageMeta } from '@/lib/page-meta'

interface Sample {
  slug: string
  label: string
  common_name: string
  file: string
  width: number
  height: number
  credit: {
    artist: string | null
    license: string | null
    license_url: string | null
    source_url: string | null
    provider: string | null
  }
}

const SAMPLES = samplesData.samples as Sample[]

export default function IdentifyPage() {
  usePageMeta(
    'Identify',
    'Upload a photograph to identify the animal: top-five predictions, confidence and a heatmap of where the model looked.',
  )
  const state = identifyStore.use()
  const busy = state.status === 'loading'

  return (
    <>
      <Section spacing="compact" className="pb-12">
        <SectionHeader
          as="h1"
          eyebrow="Identify"
          title="Identify an animal from a photograph"
          lead="Drop, paste or choose a photo. The model returns its five most likely classes and a heatmap of the regions that informed its decision."
          actions={<InferenceBadge mode={INFERENCE_MODE} />}
          className="mb-10"
        />

        <div className="grid grid-cols-12 gap-12">
          <div className="col-span-7">
            {state.status === 'idle' || (state.status === 'error' && !state.imageUrl) ? (
              <UploadDropzone
                onFile={(f) => void identify(f, { fileName: f.name })}
                listenToPaste
                className="[&>[role=button]]:min-h-[26rem]"
              />
            ) : (
              <PhotoPanel state={state} />
            )}
          </div>

          <aside className="col-span-5" aria-live="polite">
            {state.status === 'idle' && <IdleNotes />}
            {busy && <LoadingPanel progress={state.progress} />}
            {state.status === 'error' && state.error && (
              <div className="space-y-6">
                <ErrorState
                  title={state.error.title}
                  message={state.error.message}
                  detail={state.error.detail}
                  action={
                    <Button variant="secondary" onClick={resetIdentify}>
                      <RotateCcw /> Try another photo
                    </Button>
                  }
                />
              </div>
            )}
            {state.status === 'done' && state.result && <ResultPanel state={state} />}
          </aside>
        </div>
      </Section>

      <SampleGallery active={state.sampleSlug} disabled={busy} />
    </>
  )
}

/* ------------------------------------------------------------------ left column */

function PhotoPanel({ state }: { state: IdentifyState }) {
  const r = state.result
  const top = r?.predictions[0]
  if (r && state.imageUrl && top) {
    return (
      <div>
        <HeatmapViewer
          imageSrc={state.imageUrl}
          heatmapPng={r.heatmapPng}
          width={r.heatmapWidth}
          height={r.heatmapHeight}
          alt={`Your photo${state.fileName ? ` (${state.fileName})` : ''}, identified as ${top.label}`}
          caption={`Heatmap for ${top.label} · ${formatPercent(top.probability)}`}
          method="CAM · last conv block"
          maxImageHeight="34rem"
        />
        <div className="mt-6 flex items-center justify-between gap-6 border-t border-border pt-5">
          <p className="min-w-0 truncate text-small text-fg-muted" title={state.fileName ?? undefined}>
            {state.fileName} · {r.image.width} × {r.image.height} px
          </p>
          <Button variant="secondary" onClick={resetIdentify}>
            <RotateCcw /> Try another photo
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="relative overflow-hidden rounded border border-border bg-surface-sunken">
      {state.imageUrl && (
        <img
          src={state.imageUrl}
          alt="The photo being identified"
          className={cn('max-h-[34rem] w-full object-contain', state.status === 'loading' && 'opacity-60')}
        />
      )}
      {state.status === 'loading' && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-bg/85 px-5 py-3 text-small text-fg-secondary">
          <Spinner size="sm" label="Identifying" />
          Identifying…
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ right column */

function IdleNotes() {
  return (
    <div className="space-y-8">
      {INFERENCE_MODE === 'browser' && <BrowserModelNote />}
      <div>
        <p className="type-overline mb-4 !text-fg-muted">What you will see</p>
        <ol className="divide-y divide-border border-y border-border">
          {[
            ['Top five classes', 'with the model’s confidence for each.'],
            ['A heatmap', 'of the image regions that raised the top class’s score (class activation map).'],
            ['Inference time', 'and where the model ran.'],
            ['Links onward', 'to the species profile and the Field Guide.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-5 py-3.5 text-small">
              <span className="tabular w-5 shrink-0 pt-px font-mono text-caption text-fg-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-fg-secondary">
                <span className="font-medium text-fg">{t}</span> {d}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <PhotoTips />
    </div>
  )
}

function PhotoTips({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="type-overline mb-3 !text-fg-muted">Works best on</p>
      <p className="text-small text-fg-secondary">
        A clear, close photo of one animal, filling much of the frame. The model was trained on tightly
        cropped photos of 80 kinds of animal; wide scenes, several animals or species outside the 80 lower its
        confidence.
      </p>
    </div>
  )
}

function BrowserModelNote() {
  const [info, setInfo] = useState<{ url: string; cached: boolean } | null>(null)
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void browserModelInfo().then((i) => {
      if (!live || !i) return
      setInfo(i)
      // Cached models load in a moment: warm the session straight away.
      if (i.cached) void prepareInference().catch(() => undefined)
    })
    return () => {
      live = false
    }
  }, [])
  if (!info) return null
  if (progress && progress.phase !== 'ready') return <LoadingPanel progress={progress} compact />
  return (
    <div className="rounded border border-border bg-surface px-5 py-4 text-small text-fg-secondary">
      {info.cached || progress?.phase === 'ready' ? (
        <p>The model is stored in this browser. Identification runs entirely on your device.</p>
      ) : (
        <>
          <p>
            Identification runs entirely in this browser. The first photo downloads the model once (about
            {info.url.includes('fp16') ? ' 47' : ' 95'} MB); it is cached for later visits.
          </p>
          <Button
            variant="link"
            className="mt-2 text-small"
            onClick={() => {
              setError(null)
              prepareInference(setProgress).catch((e: unknown) =>
                setError(e instanceof Error ? e.message : String(e)),
              )
            }}
          >
            <Download /> Download the model now
          </Button>
          {error && <p className="mt-2 text-danger">{error}</p>}
        </>
      )}
    </div>
  )
}

const PHASE_LABEL: Record<LoadProgress['phase'], string> = {
  runtime: 'Loading the inference runtime…',
  model: 'Downloading the model…',
  session: 'Preparing the model…',
  ready: 'Identifying…',
}

function LoadingPanel({ progress, compact = false }: { progress: LoadProgress | null; compact?: boolean }) {
  const pct = progress?.total && progress.loaded != null ? progress.loaded / progress.total : null
  return (
    <div className={cn('rounded border border-border bg-surface', compact ? 'px-5 py-4' : 'px-6 py-6')}>
      <div className="flex items-center gap-3 text-small text-fg">
        <Spinner size="sm" label={progress ? PHASE_LABEL[progress.phase] : 'Identifying'} />
        {progress ? PHASE_LABEL[progress.phase] : 'Identifying…'}
      </div>
      {progress?.phase === 'model' && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${Math.round((pct ?? 0) * 100)}%` }}
            />
          </div>
          <p className="tabular mt-2 text-caption text-fg-muted">
            {progress.fromCache
              ? 'Loaded from this browser’s cache'
              : `${formatBytes(progress.loaded ?? 0)}${progress.total ? ` of ${formatBytes(progress.total)}` : ''} · downloaded once, then cached`}
          </p>
        </div>
      )}
      {!compact && !progress && (
        <div className="mt-5 space-y-3" aria-hidden="true">
          <div className="h-8 w-2/3 rounded-sm bg-surface-sunken" />
          <div className="h-2 rounded-full bg-surface-sunken" />
          <div className="h-2 w-5/6 rounded-full bg-surface-sunken" />
        </div>
      )}
    </div>
  )
}

function ResultPanel({ state }: { state: IdentifyState }) {
  const r = state.result!
  const top = r.predictions[0]!
  const topSlug = r.slugs[top.label]
  const { data: species } = useSpeciesList()
  const sci = Object.fromEntries(
    (species?.species ?? []).map((s) => [s.label, s.scientific_name ?? undefined]),
  )
  const topRow = species?.species.find((s) => s.label === top.label)

  return (
    <div className="space-y-8" data-testid="identify-result">
      <PredictionList
        predictions={r.predictions}
        lowConfidence={r.lowConfidence}
        threshold={r.threshold}
        scientificNames={sci}
        slugs={r.slugs}
        renderLink={(slug, children) => (
          <Link to={`/species/${slug}`} className="hover:text-accent-text">
            {children}
          </Link>
        )}
      />

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-y border-border py-4 text-small">
        <div>
          <dt className="type-overline !text-fg-muted">Model time</dt>
          <dd
            className="tabular mt-1 text-fg"
            data-testid="inference-ms"
            title={
              r.mode === 'server'
                ? 'Measured on the server: preprocessing and forward pass, then the heatmap. Upload and network time are not included.'
                : 'Measured in this browser tab: preprocessing and forward pass, then the heatmap. The one-time model download is not included.'
            }
          >
            {formatMs(r.inferenceMs)}
            <span className="text-fg-muted"> forward pass</span>
            {r.explainMs != null && <span className="text-fg-muted"> + {formatMs(r.explainMs)} heatmap</span>}
          </dd>
        </div>
        <div>
          <dt className="type-overline !text-fg-muted">Model</dt>
          <dd className="mt-1">
            <InferenceBadge mode={r.mode} backend={r.backend} variant={r.variant} />
          </dd>
        </div>
      </dl>

      {r.lowConfidence ? (
        <div className="space-y-4">
          <PhotoTips />
          <p className="text-small text-fg-secondary">
            The heatmap still shows what the model looked at; if it falls on the background, try a closer
            crop.
          </p>
        </div>
      ) : (
        topRow &&
        topRow.model_accuracy != null && (
          <p className="text-small text-fg-muted">
            On the test set, the model recognised {topRow.common_name.toLowerCase()} photos correctly{' '}
            {formatPercent(topRow.model_accuracy, 0)} of the time
            {topRow.test_images ? ` (${topRow.test_images} images)` : ''}.
          </p>
        )
      )}

      {topSlug && (
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to={`/species/${topSlug}`}>
              <BookOpen /> View species profile
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link
              to={askLink({
                slug: topSlug,
                name: top.label,
                from: 'identify',
                probability: top.probability,
                lowConfidence: r.lowConfidence,
              })}
            >
              <MessageSquareText /> Ask the Field Guide about {top.label.toLowerCase()}
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ samples */

function SampleGallery({ active, disabled }: { active: string | null; disabled: boolean }) {
  return (
    <Section spacing="compact" divided className="pt-0">
      <div className="mb-8 flex items-end justify-between gap-10">
        <div>
          <p className="type-overline mb-3 flex items-center gap-3">
            <span aria-hidden="true" className="h-px w-8 bg-accent" />
            Sample photographs
          </p>
          <h2 className="type-h3">No photo to hand? Try one of these.</h2>
        </div>
        <p className="max-w-sm text-small text-fg-muted">
          Openly licensed photographs from Wikimedia Commons, not taken from the model’s training or test
          data.
        </p>
      </div>
      <ul className="grid grid-cols-6 gap-4" aria-label="Sample photographs">
        {SAMPLES.map((s) => (
          <li key={s.slug}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                // The result appears at the top of the page: bring it into view.
                const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
                window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
                void identifySample(s)
              }}
              aria-pressed={active === s.slug}
              data-testid={`sample-${s.slug}`}
              className={cn(
                'group block w-full text-left disabled:cursor-wait disabled:opacity-60',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
              )}
            >
              <span
                className={cn(
                  'block aspect-[4/3] overflow-hidden rounded-sm border bg-surface-sunken transition-colors',
                  active === s.slug ? 'border-accent' : 'border-border group-hover:border-border-strong',
                )}
              >
                <img
                  src={s.file}
                  alt={`Sample photo: ${s.common_name}`}
                  loading="lazy"
                  width={s.width}
                  height={s.height}
                  className="size-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.03]"
                />
              </span>
              <span className="mt-2 flex items-center justify-between text-small text-fg-secondary group-hover:text-fg">
                {s.common_name}
                <ArrowRight
                  className="size-3.5 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <details className="mt-8 text-caption text-fg-muted">
        <summary className="cursor-pointer select-none hover:text-fg">Photo credits</summary>
        <ul className="mt-3 grid grid-cols-2 gap-x-10 gap-y-1.5">
          {SAMPLES.map((s) => (
            <li key={s.slug} className="flex gap-2">
              <span className="w-28 shrink-0 text-fg-secondary">{s.common_name}</span>
              <Attribution image={s.credit} resized className="min-w-0 truncate" />
            </li>
          ))}
        </ul>
      </details>
    </Section>
  )
}
