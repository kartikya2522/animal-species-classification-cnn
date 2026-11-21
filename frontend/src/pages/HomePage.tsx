import { ArrowRight, BookOpen, Camera, MessageSquareText } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'

import { Attribution } from '@/components/Attribution'
import { ClassDistribution } from '@/components/home/ClassDistribution'
import { PipelineSteps } from '@/components/home/PipelineSteps'
import { Reveal } from '@/components/home/Reveal'
import { Container } from '@/components/layout/Container'
import { ScientificName } from '@/components/ScientificName'
import { Section, SectionHeader } from '@/components/Section'
import { StatRow, StatTile } from '@/components/StatTile'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DATASET,
  DEPLOYED_MODEL,
  DEPLOYMENT,
  LOW_CONFIDENCE,
  MODEL_ROLES,
  PAPER,
  STUDY_RESULTS,
  TOP5_ACCURACY,
  TRAINING,
} from '@/content/study'
import { formatNumber, formatPercent } from '@/lib/format'
import { usePageMeta } from '@/lib/page-meta'
import { modelColor } from '@/lib/model-colors'
import { useParallax } from '@/lib/motion'
import { cn } from '@/lib/utils'

const ResultExample = lazy(() => import('@/components/home/ResultExample'))

/**
 * CC0 photograph from the knowledge base (Wikimedia Commons), committed as a resized 1280×848
 * copy under `public/images/` so the home page works offline.
 */
const HERO = {
  src: '/images/hero-red-panda.jpg',
  alt: 'A red panda resting on a branch',
  image: {
    artist: 'Mathias Appel',
    license: 'CC0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source_url: 'https://commons.wikimedia.org/wiki/File:Red_Panda_(24986761703).jpg',
    provider: 'Wikimedia Commons',
  },
}

const CROPS_TOTAL = DATASET.split.train + DATASET.split.val + DATASET.split.test
const BEST = STUDY_RESULTS.reduce((a, b) => (b.accuracy > a.accuracy ? b : a))

function Hero() {
  const photo = useParallax<HTMLImageElement>()
  return (
    <Container width="content" className="grid grid-cols-12 items-center gap-12 pb-20 pt-20">
      <div className="col-span-5">
        <p className="type-overline mb-6 flex items-center gap-3">
          <span aria-hidden="true" className="h-px w-8 bg-accent" />
          Species identification · 80 classes
        </p>
        <h1 className="type-display">See the animal. Understand the model.</h1>
        <p className="type-lead mt-6 max-w-md">
          WildLens identifies animals in photographs, shows which parts of the image the model relied on, and
          connects each result to a field-guide profile of the species.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Button asChild size="lg">
            <Link to="/identify">
              Identify a photo <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="#story">Read the story</a>
          </Button>
        </div>
      </div>
      <figure className="col-span-7">
        <div className="grain aspect-[3/2] overflow-hidden rounded bg-surface-sunken">
          <img
            ref={photo}
            src={HERO.src}
            alt={HERO.alt}
            width={1280}
            height={848}
            className="size-full scale-[1.08] object-cover"
          />
        </div>
        <figcaption className="mt-3 flex items-baseline justify-between gap-6">
          <span className="text-small text-fg-secondary">
            Red panda, <ScientificName name="Ailurus fulgens" /> — Endangered
          </span>
          <Attribution image={HERO.image} resized />
        </figcaption>
      </figure>
    </Container>
  )
}

/** Numbered chapter heading shared by the story sections. */
function Chapter({ n, label }: { n: number; label: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="tabular font-mono text-caption tracking-normal text-fg-muted">
        {String(n).padStart(2, '0')}
      </span>
      {label}
    </span>
  )
}

export function HomePage() {
  usePageMeta(
    null,
    'WildLens identifies animals in photographs with an EfficientNetV2-S model trained on 80 classes, shows a heatmap of what the model looked at, and explains the study behind it.',
  )
  return (
    <>
      <Hero />

      <Section spacing="compact" width="content" className="pt-0">
        <StatRow>
          <StatTile value="80" label="Animal classes" footnote="Mammals, birds, reptiles, insects and more" />
          <StatTile
            value="83.2"
            unit="%"
            label="Top-1 test accuracy"
            footnote="EfficientNetV2-S on 7,576 held-out crops"
          />
          <StatTile
            value={(TOP5_ACCURACY * 100).toFixed(1)}
            unit="%"
            label="Top-5 test accuracy"
            footnote="Correct class among the top five"
          />
          <StatTile
            value={String(Math.round(DEPLOYMENT.latency.predictCrop))}
            unit="ms"
            label="Inference on a laptop CPU"
            footnote={`Median server round-trip, ${DEPLOYMENT.latency.hardware}`}
          />
        </StatRow>
      </Section>

      {/* 01 — Why it matters */}
      <Section id="story" aria-labelledby="why-title" className="scroll-mt-20 pt-16">
        <div className="grid grid-cols-12 gap-12">
          <Reveal className="col-span-5">
            <SectionHeader
              id="why-title"
              eyebrow={<Chapter n={1} label="Why it matters" />}
              title="Too many photographs, too few people to name them"
              className="mb-0"
            />
          </Reveal>
          <Reveal className="col-span-6 col-start-7 space-y-5 pt-10 text-body text-fg-secondary" delay={0.1}>
            <p className="type-lead !text-fg">
              Camera traps, field surveys and citizen-science apps can collect more wildlife photographs than
              people can comfortably label by hand. Software that suggests which animal is in a picture can
              help sort that backlog, so that experts spend their time on the difficult cases.
            </p>
            <p>
              The paper this project builds on, {PAPER.shortAuthors} ({PAPER.year}) in <i>{PAPER.journal}</i>,
              frames the problem around conservation, biodiversity monitoring and reducing human–animal
              conflict, and notes that older hand-crafted methods needed manually cropped images and
              generalised poorly.
            </p>
            <p>
              WildLens is a study and a demonstration, not a validated field tool. It knows 80 classes from
              one public dataset, and every result is meant to be checked by a person — which is why it shows
              its confidence and where it looked.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* 02 — The dataset */}
      <Section tone="surface" aria-labelledby="data-title">
        <Reveal>
          <SectionHeader
            id="data-title"
            eyebrow={<Chapter n={2} label="The dataset" />}
            title="Animal-80: eighty classes, very unevenly shared"
            lead={
              <>
                Photographs from Open Images, published on Kaggle with a bounding box around every animal.
                Some classes have thousands of examples; a few have barely any.
              </>
            }
          />
        </Reveal>
        <Reveal delay={0.05}>
          <StatRow columns={4} className="mb-14">
            <StatTile
              size="md"
              value={formatNumber(DATASET.rawTotal)}
              label="Annotated photographs"
              footnote={`${formatNumber(DATASET.rawTrain)} train · ${formatNumber(DATASET.rawTest)} test`}
            />
            <StatTile
              size="md"
              value={formatNumber(CROPS_TOTAL)}
              label="Animal crops"
              footnote="One per bounding box, before augmentation"
            />
            <StatTile
              size="md"
              value={`${DATASET.imbalanceRatio}×`}
              label="Largest vs smallest class"
              footnote={`${DATASET.largest.label} ${formatNumber(DATASET.largest.rawTrain)} vs ${DATASET.smallest.label} ${DATASET.smallest.rawTrain} training photos`}
            />
            <StatTile
              size="md"
              value={String(DATASET.rarest.length)}
              label="Classes under 50 photos"
              footnote={DATASET.rarest.map(([l]) => l).join(', ')}
            />
          </StatRow>
        </Reveal>
        <Reveal delay={0.1}>
          <ClassDistribution />
        </Reveal>
        <p className="type-caption mt-6 max-w-3xl">
          Counts are crops after the train/validation split (from{' '}
          <code className="font-mono">data/manifest.csv</code>), so they differ from the photograph counts
          above: Butterfly has 1,875 training photographs but 2,333 training crops. The public release is
          about half the size the paper reports ({formatNumber(PAPER.paperDataset.train)} train /{' '}
          {formatNumber(PAPER.paperDataset.test)} test images); the public dataset has since been revised by
          its maintainer.
        </p>
      </Section>

      {/* 03 — The pipeline */}
      <Section aria-labelledby="pipeline-title">
        <Reveal>
          <SectionHeader
            id="pipeline-title"
            eyebrow={<Chapter n={3} label="The pipeline" />}
            title="From a detection dataset to a classification one"
            lead={`The dataset was built for finding animals in scenes. All ${formatNumber(DATASET.rawTotal)} photographs were checked first (none had to be skipped); then five steps turn each annotated animal into a clean training example.`}
          />
        </Reveal>
        <Reveal delay={0.08}>
          <PipelineSteps />
        </Reveal>
      </Section>

      {/* 04 — The models */}
      <Section tone="surface" aria-labelledby="models-title">
        <Reveal>
          <SectionHeader
            id="models-title"
            eyebrow={<Chapter n={4} label="The models" />}
            title="Four architectures, one recipe"
            lead={`Each model started from ImageNet weights and was trained the same way: ${TRAINING.optimizer}, learning rate ${TRAINING.learningRate}, batch size ${TRAINING.batchSize}, ${TRAINING.epochs} epochs, seed ${TRAINING.seed}. Each was then scored on the same ${formatNumber(DATASET.split.test)} test crops.`}
            actions={
              <Button asChild variant="secondary">
                <Link to="/research">
                  Full comparison <ArrowRight />
                </Link>
              </Button>
            }
          />
        </Reveal>
        <Reveal delay={0.06}>
          <ul className="grid grid-cols-4 gap-px overflow-hidden rounded border border-border bg-border">
            {STUDY_RESULTS.map((m) => (
              <li key={m.id} className="flex flex-col bg-surface-raised p-7">
                <span
                  aria-hidden="true"
                  className="mb-5 h-1 w-10 rounded-full"
                  style={{ background: modelColor(m.id) }}
                />
                <p className="type-overline !text-fg-muted">{MODEL_ROLES[m.id]}</p>
                <h3 className="type-h3 mt-2">{m.name}</h3>
                <dl className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-caption text-fg-muted">Accuracy</dt>
                    <dd className="tabular font-serif text-h3 leading-tight text-fg">
                      {formatPercent(m.accuracy)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-fg-muted">Macro F1</dt>
                    <dd className="tabular font-serif text-h3 leading-tight text-fg">{m.f1.toFixed(3)}</dd>
                  </div>
                </dl>
                <p className="tabular mt-4 text-caption text-fg-muted">{m.paramsM.toFixed(1)} M parameters</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-6">
                  {m.id === BEST.id && (
                    <span className="rounded-sm border border-border-strong px-2 py-0.5 text-caption font-medium text-fg">
                      Best in the study
                    </span>
                  )}
                  {m.id === DEPLOYED_MODEL && (
                    <span className="rounded-sm bg-accent-subtle px-2 py-0.5 text-caption font-medium text-accent-text">
                      Runs the live demo
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1} className="mt-12 grid grid-cols-12 gap-12">
          <p className="col-span-6 text-body text-fg-secondary">
            <strong className="font-semibold text-fg">
              {BEST.name} was the strongest model in the study
            </strong>{' '}
            — the highest accuracy, macro F1 and AUC, with the fewest parameters. The modern CNN,
            ConvNeXt-Tiny, also beat the baseline; the Swin-Tiny transformer did not meaningfully improve on
            it with this amount of data and only {TRAINING.epochs} epochs.
          </p>
          <p className="col-span-6 text-body text-fg-secondary">
            <strong className="font-semibold text-fg">The live demo runs EfficientNetV2-S</strong>, one of the
            models evaluated in the study. The platform reads its models from a registry, so additional models
            can be added as options once their weights are exported.
          </p>
        </Reveal>
      </Section>

      {/* 05 — How to read a result */}
      <Section aria-labelledby="read-title">
        <Reveal>
          <SectionHeader
            id="read-title"
            eyebrow={<Chapter n={5} label="How to read a result" />}
            title="A ranked guess, and where the model looked"
            lead="This is a real result from the live model on the red-panda photograph above."
          />
        </Reveal>
        <Reveal delay={0.06}>
          <Suspense fallback={<Skeleton className="aspect-[2.4/1] w-full" />}>
            <ResultExample />
          </Suspense>
        </Reveal>
        <Reveal delay={0.1}>
          <ol className="mt-14 grid grid-cols-3 gap-10 border-t border-border pt-10">
            <li>
              <h3 className="type-h4">Top five, not one answer</h3>
              <p className="mt-3 text-small text-fg-secondary">
                The model gives a probability for each of the 80 classes and WildLens shows the five highest.
                On the test crops, the right class is first {formatPercent(0.7992)} of the time and among the
                five {formatPercent(TOP5_ACCURACY)} of the time — so look at the runners-up when the top two
                are close.
              </p>
            </li>
            <li>
              <h3 className="type-h4">The heatmap shows evidence, not proof</h3>
              <p className="mt-3 text-small text-fg-secondary">
                A class-activation map (CAM) highlights the regions that pushed the score of the predicted
                class up. A heatmap on the animal is reassuring; one on the background suggests the model may
                be relying on context. It is computed on a 7 × 7 grid, so it is coarse by design.
              </p>
            </li>
            <li>
              <h3 className="type-h4">Below {formatPercent(LOW_CONFIDENCE.threshold, 0)}, a warning</h3>
              <p className="mt-3 text-small text-fg-secondary">
                When the top probability is under {LOW_CONFIDENCE.threshold}, WildLens flags the result. On
                the test set that flags {formatPercent(LOW_CONFIDENCE.flagged)} of crops, and those are right
                only {formatPercent(LOW_CONFIDENCE.accuracyWhenFlagged, 0)} of the time (
                {formatPercent(LOW_CONFIDENCE.accuracyOtherwise)} for the rest). Full scenes and animals
                outside the 80 classes are expected to be flagged more often.
              </p>
            </li>
          </ol>
        </Reveal>
      </Section>

      {/* CTA band */}
      <section aria-labelledby="cta-title" className="bg-surface-sunken py-24">
        <Container width="content">
          <Reveal>
            <h2 id="cta-title" className="type-h2 max-w-2xl">
              Try it with your own photograph, or explore the 80 classes.
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <ul className="mt-12 grid grid-cols-3 gap-6">
              {[
                {
                  to: '/identify',
                  icon: Camera,
                  title: 'Identify',
                  text: 'Upload a photo or pick a sample: top five, confidence and heatmap.',
                },
                {
                  to: '/species',
                  icon: BookOpen,
                  title: 'Species Atlas',
                  text: 'All 80 classes with conservation status, occurrence maps and per-class accuracy.',
                },
                {
                  to: '/ask',
                  icon: MessageSquareText,
                  title: 'Field Guide',
                  text: 'Ask about any animal; answers cite Wikipedia, Wikidata and iNaturalist.',
                },
              ].map(({ to, icon: Icon, title, text }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className={cn(
                      'group flex h-full flex-col rounded border border-border bg-surface-raised p-7 transition-colors',
                      'hover:border-border-strong',
                    )}
                  >
                    <Icon className="size-5 text-accent-text" strokeWidth={1.5} aria-hidden="true" />
                    <span className="mt-5 flex items-center justify-between font-serif text-h3 text-fg">
                      {title}
                      <ArrowRight
                        className="size-5 text-fg-muted transition-transform duration-300 ease-editorial group-hover:translate-x-1"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-3 text-small text-fg-secondary">{text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>
    </>
  )
}
