/**
 * Static facts quoted on the Home, Research and About pages. Every value is copied from a
 * project write-up; the comment above each block names the file. Live model metrics come from
 * `/api/metrics` instead (see `src/lib/research.ts`); these constants are the narrative copy and
 * the numbers that are not in the results files.
 */
import distribution from '@/content/class-distribution.json'

/** docs/paper_info_table.md · docs/paper_summary.md */
export const PAPER = {
  /** As cited in the root README (first three authors, et al.; the full list is in docs/paper_info_table.md). */
  authors: 'Ukwuoma, C.C., Qin, Z., Yussif, S.B., et al.',
  shortAuthors: 'Ukwuoma et al.',
  year: 2022,
  title:
    'Animal species detection and classification framework based on modified multi-scale attention mechanism and feature pyramid network',
  journal: 'Scientific African',
  volume: '16',
  article: 'e01151',
  doi: '10.1016/j.sciaf.2022.e01151',
  doiUrl: 'https://doi.org/10.1016/j.sciaf.2022.e01151',
  method:
    'Two-stage network: a ResNet-50 backbone with a modified multi-scale attention mechanism and a Feature Pyramid Network for detection, then a DenseNet classification head, trained with Focal Loss.',
  reported:
    'mAP 0.87 on the 4-class African Wildlife dataset with attention (0.85 without); on Animal-80, about +0.1% mAP from attention, with per-class AP gains of 5–20%.',
  paperDataset: { train: 45_132, test: 13_010, inputSize: 356 },
} as const

/** docs/dataset_notes.md (raw counts) · data/manifest.csv (crop counts, via class-distribution.json) */
export const DATASET = {
  name: 'Animal-80',
  sourceName: 'Kaggle: Animals Detection Images Dataset (Open Images subset)',
  sourceUrl: 'https://www.kaggle.com/antoreepjana/animals-detection-images-dataset',
  classes: 80,
  rawTrain: 22_566,
  rawTest: 6_505,
  rawTotal: 29_071,
  skipped: 0,
  largest: { label: 'Butterfly', rawTrain: 1_875 },
  smallest: { label: 'Seahorse', rawTrain: 7 },
  imbalanceRatio: 268,
  rarest: [
    ['Seahorse', 7],
    ['Squid', 15],
    ['Turtle', 24],
    ['Shrimp', 30],
    ['Red panda', 45],
  ] as const,
  rawWidth: [522, 6000],
  rawHeight: [289, 4000],
  split: {
    train: distribution.totals.train,
    val: distribution.totals.val,
    test: distribution.totals.test,
    augmented: distribution.totals.augmented,
  },
  augmentedClasses: distribution.classes.filter((c) => c.augmented > 0).length,
  augmentThreshold: 100,
  augmentTarget: 150,
  mean: [0.4629, 0.4413, 0.3891],
  std: [0.2658, 0.252, 0.2598],
} as const

/** README.md "Models" · docs/model_comparison.md */
export const TRAINING = {
  optimizer: 'Adam',
  learningRate: '0.0001',
  weightDecay: '1e-4',
  batchSize: 32,
  epochs: 12,
  loss: 'Cross-entropy',
  seed: 42,
  scheduler: 'none',
  init: 'ImageNet-pretrained',
} as const

export const MODEL_ROLES: Record<string, string> = {
  resnet50: 'Paper baseline',
  efficientnetv2_s: 'Efficient CNN',
  convnext_tiny: 'Modern CNN',
  swin_tiny: 'Vision transformer',
}

/** Display order everywhere (and the categorical colour order, `--model-1…4`). */
export const MODEL_ORDER = ['resnet50', 'efficientnetv2_s', 'convnext_tiny', 'swin_tiny'] as const

/** The model whose weights are exported and served (models/registry.json). */
export const DEPLOYED_MODEL = 'efficientnetv2_s'

/**
 * README.md "Key findings": the write-up's statement about classes every model found hard.
 * Per-class numbers exist for EfficientNetV2-S, ResNet50 and ConvNeXt-Tiny in outputs/results.
 */
export const STUDY_HARD_CLASSES = ['Bear', 'Turtle', 'Squid'] as const

/** Phase 0/1/4 results · models/efficientnetv2_s_onnx_eval.json · backend/README.md */
export const DEPLOYMENT = {
  fp32: { sizeMb: 81.0, top1: 0.8321, maxLogitDiff: '6.1 × 10⁻⁶', parityImages: 50, opset: 17 },
  fp16: { sizeMb: 40.6, top1: 0.8322, agreement: 0.9989, top5SetAgreement: 0.9968 },
  latency: { predictCrop: 79, hardware: 'Intel Core i5-12450H, Docker on Windows' },
} as const

/** backend/README.md "Low-confidence threshold" (test split, 7,576 images, ONNX FP32). */
export const LOW_CONFIDENCE = {
  threshold: 0.5,
  flagged: 0.056,
  accuracyWhenFlagged: 0.38,
  accuracyOtherwise: 0.859,
  errorsFlagged: 0.207,
} as const

export const TOP5_ACCURACY = 0.9847

/**
 * docs/model_comparison.md, shared test set (7,576 crops). Used by the static home page; the
 * Research page reads the same values live from /api/metrics.
 */
export const STUDY_RESULTS: Array<{
  id: (typeof MODEL_ORDER)[number]
  name: string
  accuracy: number
  f1: number
  paramsM: number
}> = [
  { id: 'resnet50', name: 'ResNet50', accuracy: 0.7992, f1: 0.7209, paramsM: 23.7 },
  { id: 'efficientnetv2_s', name: 'EfficientNetV2-S', accuracy: 0.8321, f1: 0.769, paramsM: 20.3 },
  { id: 'convnext_tiny', name: 'ConvNeXt-Tiny', accuracy: 0.8152, f1: 0.7403, paramsM: 27.9 },
  { id: 'swin_tiny', name: 'Swin-Tiny', accuracy: 0.7961, f1: 0.7227, paramsM: 27.6 },
]
