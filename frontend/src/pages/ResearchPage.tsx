import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { MetricDotPlot } from '@/components/charts/MetricDotPlot'
import { TrainingCurves, type CurveMetric } from '@/components/charts/TrainingCurves'
import { Container } from '@/components/layout/Container'
import { ComparisonTable } from '@/components/research/ComparisonTable'
import { FigureGallery } from '@/components/research/FigureGallery'
import { PerClassView } from '@/components/research/PerClassView'
import { Section, SectionHeader } from '@/components/Section'
import { ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DATASET,
  DEPLOYED_MODEL,
  DEPLOYMENT,
  PAPER,
  STUDY_HARD_CLASSES,
  TOP5_ACCURACY,
  TRAINING,
} from '@/content/study'
import { api } from '@/lib/api'
import { formatNumber, formatPercent } from '@/lib/format'
import { usePageMeta } from '@/lib/page-meta'
import {
  buildClassRows,
  buildComparisonRows,
  buildCurves,
  COLUMNS,
  derivedCells,
  deviceName,
  groupFigures,
  hardForAll,
  missingNotes,
  orderModels,
} from '@/lib/research'
import { useSpeciesList } from '@/lib/species'

const SECTIONS = [
  ['comparison', 'Comparison'],
  ['training', 'Training'],
  ['per-class', 'Per class'],
  ['figures', 'Figures'],
  ['deployment', 'Deployment'],
  ['limitations', 'Limitations'],
  ['paper', 'Reference paper'],
] as const

function Note({ children }: { children: ReactNode }) {
  return <p className="type-caption max-w-4xl">{children}</p>
}

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading metrics">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export default function ResearchPage() {
  usePageMeta(
    'Research',
    'How ResNet50, EfficientNetV2-S, ConvNeXt-Tiny and Swin-Tiny compare on Animal-80: metrics, training curves, per-class accuracy, figures, deployment and limitations.',
  )
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: ({ signal }) => api.metrics(signal),
    staleTime: Infinity,
  })
  const figures = useQuery({
    queryKey: ['figures'],
    queryFn: ({ signal }) => api.figures(signal),
    staleTime: Infinity,
  })
  const species = useSpeciesList()
  const [curveMetric, setCurveMetric] = useState<CurveMetric>('accuracy')

  const data = metrics.data
  const rows = useMemo(() => (data ? buildComparisonRows(data) : []), [data])
  const curves = useMemo(() => (data ? buildCurves(data) : []), [data])
  const models = useMemo(() => (data ? orderModels(data.models) : []), [data])
  const names = useMemo(() => Object.fromEntries(models.map((m) => [m.id, m.display_name])), [models])
  const primary = data?.models[DEPLOYED_MODEL]
  const compare = models.find((m) => m.id !== DEPLOYED_MODEL && m.per_class_accuracy)
  const classRows = useMemo(() => buildClassRows(primary, compare), [primary, compare])
  const hardBoth = useMemo(() => hardForAll(models, 0.35), [models])
  const groups = useMemo(
    () => (figures.data ? groupFigures(figures.data.figures, names) : []),
    [figures.data, names],
  )
  const devices = rows.map((r) => `${r.name}: ${deviceName(r.device) ?? 'not recorded'}`).join('; ')
  const derived = derivedCells(rows)
  const missing = missingNotes(rows)
  const deployedRow = rows.find((r) => r.id === DEPLOYED_MODEL)

  const error = metrics.isError && (
    <ErrorState
      title="Metrics unavailable"
      message="The research figures come from the backend (/api/metrics). Start it and reload this page."
      detail={metrics.error instanceof Error ? metrics.error.message : undefined}
      action={
        <Button variant="secondary" size="sm" onClick={() => void metrics.refetch()}>
          Try again
        </Button>
      }
    />
  )

  return (
    <>
      <Section spacing="compact" className="pb-10 pt-20">
        <SectionHeader
          as="h1"
          eyebrow="Research"
          title="How the models compare"
          lead={`Four architectures trained with the same recipe on Animal-80 and evaluated on the same ${formatNumber(DATASET.split.test)} held-out crops — and an honest account of where they fall short.`}
          className="mb-10"
        />
        <nav aria-label="On this page" className="border-y border-border py-3">
          <ul className="flex flex-wrap gap-x-7 gap-y-2 text-small">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-fg-secondary transition-colors hover:text-fg">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Section>

      {/* Comparison */}
      <Section id="comparison" spacing="compact" className="scroll-mt-16" aria-labelledby="comparison-title">
        <SectionHeader
          id="comparison-title"
          size="md"
          title="Model comparison"
          lead={`Same training recipe for all four: ${TRAINING.init}, ${TRAINING.optimizer} at ${TRAINING.learningRate} with weight decay ${TRAINING.weightDecay}, batch ${TRAINING.batchSize}, ${TRAINING.epochs} epochs, ${TRAINING.loss.toLowerCase()} loss, seed ${TRAINING.seed}, no scheduler. Each is tested from its best-validation checkpoint.`}
        />
        {metrics.isPending && <Loading />}
        {error}
        {rows.length > 0 && (
          <div className="space-y-8">
            <ComparisonTable rows={rows} id="comparison-table" />
            <div className="space-y-2">
              {derived.length > 0 && (
                <Note>
                  <span className="text-accent-text">†</span> Derived from the same results files, as in{' '}
                  <code className="font-mono">docs/model_comparison.md</code>:{' '}
                  {derived
                    .map(
                      (d) =>
                        `${d.model} ${d.columns.map((c) => COLUMNS.find((x) => x.key === c)?.short.replace(/^(?!F1)\w+/, (w) => w.toLowerCase())).join(', ')}`,
                    )
                    .join('; ')}
                  . Macro precision, recall and F1 are the mean of the per-class report; inference time is the
                  total test-evaluation time divided by the number of test crops.
                </Note>
              )}
              {missing.map((m) => (
                <Note key={m}>* {m}</Note>
              ))}
              <Note>
                Times were measured on the machine each model was trained on ({devices}), so the training and
                inference columns are indicative rather than a controlled benchmark; parameter counts and test
                metrics are directly comparable.
                {deployedRow &&
                  ` Top-5 accuracy was measured only for the deployed EfficientNetV2-S: ${formatPercent(TOP5_ACCURACY)}.`}
              </Note>
            </div>
            <div className="grid grid-cols-12 gap-12 border-t border-border pt-10">
              <div className="col-span-8">
                <h3 className="type-h4 mb-1">Classification metrics at a glance</h3>
                <p className="type-caption mb-5">
                  Dots rather than bars: the values sit between about 0.72 and 0.83, and bars would need a cut
                  axis. AUC (0.99 for every model that has it) is only in the table.
                </p>
                <MetricDotPlot rows={rows} describedBy="comparison-table" />
              </div>
              <div className="col-span-4 space-y-4 pt-1 text-small text-fg-secondary">
                <h3 className="type-h4 text-fg">Reading it</h3>
                <p>
                  <strong className="font-semibold text-fg">EfficientNetV2-S leads every metric</strong> with
                  the fewest parameters. ConvNeXt-Tiny is second on accuracy and F1.
                </p>
                <p>
                  ResNet50 and Swin-Tiny are close: Swin-Tiny is 0.3 points lower on accuracy and 0.002 higher
                  on F1. With one training run per model, a gap that small should not be read as a ranking.
                </p>
                <p>
                  The live demo uses <strong className="font-semibold text-fg">EfficientNetV2-S</strong>, the
                  best model in the study on accuracy, F1 and AUC, with the fewest parameters and the shortest
                  training time.
                </p>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Training */}
      <Section
        id="training"
        tone="surface"
        spacing="compact"
        className="scroll-mt-16"
        aria-labelledby="training-title"
      >
        <SectionHeader
          id="training-title"
          size="md"
          title="Training curves"
          lead="Accuracy and loss per epoch on the training and validation splits, from each run's history, on shared axes."
          actions={
            <Tabs value={curveMetric} onValueChange={(v) => setCurveMetric(v as CurveMetric)}>
              <TabsList aria-label="Curve metric">
                <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
                <TabsTrigger value="loss">Loss</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />
        {metrics.isPending && <Loading />}
        {error}
        {curves.length > 0 && (
          <>
            <TrainingCurves series={curves} metric={curveMetric} />
            <div className="mt-8 grid grid-cols-2 gap-12 text-small text-fg-secondary">
              <p>
                Every model fits the training split ever more closely while validation accuracy stays flat or
                drifts down after its first few epochs, and validation loss rises. That is overfitting; it is
                why the evaluated checkpoint is the best-validation epoch rather than the last one.
              </p>
              <p>
                EfficientNetV2-S peaked at epoch {primary?.summary.best_epoch ?? 2} (
                {formatPercent(primary?.summary.best_val_accuracy ?? null)} validation accuracy), then
                validation accuracy slipped while training accuracy kept rising. The fixed 12-epoch budget
                with no learning-rate schedule was chosen for a fair comparison, not tuned per model.
              </p>
            </div>
            <details className="mt-6 text-small">
              <summary className="cursor-pointer text-fg-secondary hover:text-fg">
                Show validation {curveMetric} as a table
              </summary>
              <div className="mt-3 overflow-x-auto rounded border border-border bg-surface-raised">
                <table className="tabular w-full text-right text-caption">
                  <thead className="border-b border-border text-fg-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        Model
                      </th>
                      {curves[0]?.points.map((p) => (
                        <th key={p.epoch} scope="col" className="px-3 py-2 font-medium">
                          {p.epoch}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-fg-secondary">
                    {curves.map((s) => (
                      <tr key={s.id}>
                        <th scope="row" className="px-3 py-1.5 text-left font-medium text-fg">
                          {s.name}
                        </th>
                        {s.points.map((p) => {
                          const v = curveMetric === 'accuracy' ? p.valAcc : p.valLoss
                          return (
                            <td key={p.epoch} className="px-3 py-1.5">
                              {v == null
                                ? '—'
                                : curveMetric === 'accuracy'
                                  ? (v * 100).toFixed(1)
                                  : v.toFixed(3)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </Section>

      {/* Per class */}
      <Section id="per-class" spacing="compact" className="scroll-mt-16" aria-labelledby="per-class-title">
        <SectionHeader
          id="per-class-title"
          size="md"
          title="Per-class accuracy"
          lead={`Test accuracy for each class for ${primary?.display_name ?? 'the deployed model'}, the deployed model${compare ? `, next to ${compare.display_name}` : ''}. Per-class results exist for three of the four runs; the table compares the deployed model with the paper baseline. Class names link to their species profiles.`}
        />
        {metrics.isPending && <Loading />}
        {error}
        {primary && classRows.length > 0 && (
          <>
            <PerClassView
              rows={classRows}
              primaryId={primary.id}
              primaryName={primary.display_name}
              compareId={compare?.id}
              compareName={compare?.display_name}
              species={species.data?.species}
            />
            <div className="mt-10 grid grid-cols-2 gap-12 border-t border-border pt-8 text-small text-fg-secondary">
              <div>
                <h3 className="type-h4 mb-3 text-fg">Hard for every model</h3>
                <p>
                  The study&rsquo;s write-up reports that all four models struggled on the same handful of
                  classes ({STUDY_HARD_CLASSES.join(', ')}), pointing to the data rather than any one
                  architecture. In the per-class results available here, these classes are below 35% for both
                  models:{' '}
                  <span className="text-fg" data-testid="hard-for-all">
                    {hardBoth.join(', ')}
                  </span>
                  . The two sources differ on Bear: by per-class accuracy it sits mid-table here (57–60% for
                  both models), well above the classes listed.
                </p>
              </div>
              <div>
                <h3 className="type-h4 mb-3 text-fg">Read rare classes with care</h3>
                <p>
                  Several of the hardest classes are also the rarest. Their test sets are tiny — Tick has a
                  single test crop and Turtle seven — so one image moves the score by many points. Several
                  hard classes also have close relatives among the 80 (Turtle, Sea turtle and Tortoise; Goose,
                  Duck and Swan); the confusion matrices below show where their predictions go.
                </p>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* Figures */}
      <Section
        id="figures"
        tone="surface"
        spacing="compact"
        className="scroll-mt-16"
        aria-labelledby="figures-title"
      >
        <SectionHeader
          id="figures-title"
          size="md"
          title="Figures"
          lead="The plots produced by the study (outputs/figures), served by the backend. Select one to enlarge it."
        />
        {figures.isPending && <Loading />}
        {figures.isError && (
          <ErrorState title="Figures unavailable" message="The figure list comes from /api/figures." />
        )}
        {groups.length > 0 && <FigureGallery groups={groups} />}
      </Section>

      {/* Deployment */}
      <Section id="deployment" spacing="compact" className="scroll-mt-16" aria-labelledby="deployment-title">
        <SectionHeader
          id="deployment-title"
          size="md"
          title="From checkpoint to live demo"
          lead="How the trained EfficientNetV2-S became one portable model file that runs the same way on the server and in the browser."
        />
        <div className="grid grid-cols-12 gap-12">
          <div className="col-span-8 space-y-8 text-body text-fg-secondary">
            <div>
              <h3 className="type-h4 mb-3 text-fg">One ONNX file, two runtimes</h3>
              <p>
                The PyTorch checkpoint is exported once to ONNX (opset {DEPLOYMENT.fp32.opset}) with two
                outputs: the 80 class scores and the 1280 × 7 × 7 feature map of the last convolutional block.
                The FastAPI backend runs it with ONNX Runtime on the CPU; the browser mode runs the same file
                with onnxruntime-web, so PyTorch is not needed at run time. Preprocessing is reimplemented on
                both sides and tested against the training transform.
              </p>
            </div>
            <div>
              <h3 className="type-h4 mb-3 text-fg">Parity checks</h3>
              <ul className="space-y-2">
                <li>
                  ONNX FP32 on the full test split reproduces the reported accuracy exactly (
                  {formatPercent(DEPLOYMENT.fp32.top1, 2)}, difference 0.0); PyTorch and ONNX logits differ by
                  at most {DEPLOYMENT.fp32.maxLogitDiff} on {DEPLOYMENT.fp32.parityImages} test images.
                </li>
                <li>
                  Browser (WebAssembly) and server give identical top-5 on 20 of 20 test images with the FP32
                  model and with the FP16 model.
                </li>
                <li>
                  An FP16 copy is half the size ({DEPLOYMENT.fp16.sizeMb} MB vs {DEPLOYMENT.fp32.sizeMb} MB)
                  and agrees with FP32 on {formatPercent(DEPLOYMENT.fp16.agreement, 2)} of test-set top-1
                  predictions, so it is the browser default.
                </li>
              </ul>
            </div>
            <div>
              <h3 className="type-h4 mb-3 text-fg">Why the heatmap needs no gradients</h3>
              <p>
                EfficientNetV2-S ends with global average pooling, dropout (inactive at inference) and a
                single linear layer. For that head the gradient Grad-CAM uses is constant over the 7 × 7 grid
                — it is just the linear weight divided by 49 — so Grad-CAM equals the original
                class-activation map (CAM) up to a scale that disappears when the map is normalised. WildLens
                therefore computes it directly from the feature map and the exported weights, on the server in
                NumPy and in the browser in plain TypeScript.
              </p>
              <p
                className="mt-4 rounded border border-border bg-surface px-5 py-4 text-center font-serif text-h4 text-fg"
                aria-label="CAM for class c equals ReLU of the sum over channels k of w c k times A k"
              >
                <span aria-hidden="true">
                  CAM<sub className="text-small">c</sub> = ReLU( Σ<sub className="text-small">k</sub> w
                  <sub className="text-small">c,k</sub> · A<sub className="text-small">k</sub> )
                </span>
              </p>
              <p className="type-caption mt-2">
                A<sub>k</sub>: channel k of the 1280 × 7 × 7 feature map; w<sub>c,k</sub>: the linear
                layer&rsquo;s weight from channel k to class c. Checked against PyTorch Grad-CAM in the test
                suite.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Limitations */}
      <Section
        id="limitations"
        tone="sunken"
        spacing="compact"
        className="scroll-mt-16"
        aria-labelledby="limitations-title"
      >
        <SectionHeader
          id="limitations-title"
          size="md"
          title="Limitations"
          lead="What this project does not show, and where its results should not be trusted."
        />
        <ol className="grid grid-cols-2 gap-x-14 gap-y-8">
          {[
            [
              'Noisy, unbalanced labels',
              `Animal-80 comes from Open Images, and some labels are wrong (a "Bear" that looks like a red panda) or not photographs (an engraved "Elephant"). The largest class has ${DATASET.imbalanceRatio}× the photographs of the smallest; augmenting rare classes to ${DATASET.augmentTarget} training crops narrows the gap but does not close it.`,
            ],
            [
              'Trained on tight crops',
              'The models only ever saw an animal cropped to its bounding box. The accuracy above describes such crops, not full photographs: expect more mistakes and more low-confidence warnings on wide scenes, small or partly hidden animals, and several animals in one frame.',
            ],
            [
              'Groups, not always species',
              'Only 17 of the 80 labels are single species; 53 are groups (Bear, Fish, Monkey, Moths and butterflies), 9 are domestic forms and 1 is a hybrid (Mule). Some overlap — Butterfly and Moths and butterflies, Bear and Brown bear — so a "wrong" answer is sometimes a defensible one.',
            ],
            [
              'Occurrence maps include captive animals',
              'Species profiles show GBIF occurrence density, which includes zoo and other captive records (red pandas appear in North America, for example). Groups that GBIF does not have use the nearest available taxon, noted on the profile.',
            ],
            [
              'The Field Guide can still be wrong',
              'Answers are grounded in retrieved Wikipedia, Wikidata and iNaturalist text and cite it, but retrieval can pick the wrong animal and a language model can misread a source. Check the citations for anything that matters.',
            ],
            [
              'A smaller dataset, one run per model',
              `The public release has ${formatNumber(DATASET.rawTotal)} photographs, about half the ${formatNumber(PAPER.paperDataset.train + PAPER.paperDataset.test)} the paper reports. Each model was trained once (seed ${TRAINING.seed}, ${TRAINING.epochs} epochs), so there is no estimate of run-to-run variation.`,
            ],
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-5">
              <span className="tabular pt-1 font-mono text-caption text-fg-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="type-h4">{title}</h3>
                <p className="mt-2 text-small text-fg-secondary">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Reference paper */}
      <Section id="paper" spacing="compact" className="scroll-mt-16" aria-labelledby="paper-title">
        <SectionHeader id="paper-title" size="md" title="Reference paper" />
        <div className="grid grid-cols-12 gap-12">
          <article className="col-span-7 rounded border border-border bg-surface-raised p-8">
            <p className="type-overline !text-fg-muted">
              {PAPER.journal} · {PAPER.year}
            </p>
            <h3 className="type-h3 mt-3">{PAPER.title}</h3>
            <p className="mt-4 text-small text-fg-secondary">{PAPER.authors}</p>
            <p className="mt-1 text-small text-fg-secondary">
              <i>{PAPER.journal}</i>, {PAPER.volume} ({PAPER.year}), {PAPER.article}.
            </p>
            <p className="mt-6 text-small text-fg-secondary">{PAPER.method}</p>
            <p className="mt-3 text-small text-fg-secondary">Reported: {PAPER.reported}</p>
            <Button asChild variant="secondary" size="sm" className="mt-6">
              <a href={PAPER.doiUrl} target="_blank" rel="noreferrer">
                DOI {PAPER.doi} <ArrowUpRight />
              </a>
            </Button>
          </article>
          <div className="col-span-5 space-y-4 text-small text-fg-secondary">
            <h3 className="type-h4 text-fg">How this project differs</h3>
            <p>
              The paper detects animals in whole scenes and then classifies them, and reports mean average
              precision. This project uses the same Animal-80 dataset and the same ResNet-50 backbone, but
              only classifies: each annotated animal is cropped out first, and models are scored by accuracy
              on those crops. The two sets of numbers measure different tasks and should not be compared
              directly.
            </p>
            <p>
              Training also differs: the paper used {PAPER.paperDataset.inputSize} ×{' '}
              {PAPER.paperDataset.inputSize} inputs, SGD for 100 epochs, focal loss and no augmentation; this
              study uses 224 × 224 crops, Adam for {TRAINING.epochs} epochs, cross-entropy loss and rare-class
              augmentation, and compares four architectures instead of proposing one.
            </p>
            <p>
              <Link to="/" className="link">
                The project story
              </Link>{' '}
              walks through the dataset and pipeline.
            </p>
          </div>
        </div>
      </Section>
      <Container width="content" className="pb-6" />
    </>
  )
}
