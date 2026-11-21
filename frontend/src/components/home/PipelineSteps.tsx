import { DATASET } from '@/content/study'
import { formatNumber } from '@/lib/format'

/** docs/dataset_notes.md §2 — the preprocessing pipeline, in the write-up's order. */
const STEPS = [
  {
    title: 'Crop to the bounding box',
    detail:
      'Each annotated animal is cut out of its photograph, so a photo with three animals gives three crops and background clutter is removed.',
    spec: 'one crop per box',
  },
  {
    title: 'Resize',
    detail: `Raw photos range from ${formatNumber(DATASET.rawWidth[0])} to ${formatNumber(DATASET.rawWidth[1])} px wide; every crop is resized to the input size of ImageNet-pretrained backbones.`,
    spec: '224 × 224, bilinear',
  },
  {
    title: 'Normalise',
    detail: `Per-channel mean (${DATASET.mean.join(', ')}) and standard deviation measured on 2,000 training crops, rather than generic ImageNet values.`,
    spec: 'dataset mean and std',
  },
  {
    title: 'Augment rare classes',
    detail: `The ${DATASET.augmentedClasses} classes with fewer than ${DATASET.augmentThreshold} training crops get rotated, flipped, zoomed, shifted and sheared copies, training split only. No vertical flips: animals are rarely photographed upside down.`,
    spec: `up to ${DATASET.augmentTarget} per class`,
  },
  {
    title: 'Stratified split',
    detail: `The dataset's own test folder is kept untouched as the holdout; the training folder is split per class into train and validation, with at least two validation crops for every class.`,
    spec: `train ${formatNumber(DATASET.split.train)} · val ${formatNumber(DATASET.split.val)} · test ${formatNumber(DATASET.split.test)}`,
  },
]

export function PipelineSteps() {
  return (
    <ol className="relative grid grid-cols-5 gap-8">
      <span
        aria-hidden="true"
        className="absolute left-[10%] right-[10%] top-[1.0625rem] h-px bg-border-strong"
      />
      {STEPS.map((s, i) => (
        <li key={s.title} className="relative flex flex-col">
          <span className="tabular relative z-10 mx-auto flex size-[2.125rem] items-center justify-center rounded-full border border-border-strong bg-bg font-mono text-caption text-fg">
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3 className="type-h4 mt-6 text-center !text-[1.0625rem]">{s.title}</h3>
          <p className="type-mono mt-2 text-center !text-accent-text">{s.spec}</p>
          <p className="mt-4 text-small text-fg-secondary">{s.detail}</p>
        </li>
      ))}
    </ol>
  )
}
