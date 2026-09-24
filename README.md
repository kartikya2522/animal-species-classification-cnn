# Animal Species Classification using CNN Architectures

A comparative study of four CNN/Transformer architectures — a paper-baseline model, an efficient CNN, a modern CNN, and a vision transformer — trained on the Animal-80 dataset to classify 80 animal species.

## Reference Paper

Ukwuoma, C.C., Qin, Z., Yussif, S.B., et al. *"Animal species detection and classification framework based on modified multi-scale attention mechanism and feature pyramid network."* Scientific African, 16 (2022), e01151. [DOI: 10.1016/j.sciaf.2022.e01151](https://doi.org/10.1016/j.sciaf.2022.e01151)

This paper's ResNet-50 backbone and Animal-80 dataset choice motivated the setup of this project, though the paper's own task is two-stage object detection + classification, while this project focuses on pure image classification (see `docs/paper_summary.md` for full details and the scope adjustment).

## Dataset

**Animal-80** (via [Kaggle](https://www.kaggle.com/antoreepjana/animals-detection-images-dataset)) — 80 animal species classes, sourced from Open Images.

- 29,071 raw annotated images (22,566 train / 6,505 test), each with one or more bounding-box annotations
- Severely imbalanced: largest class (Butterfly) has ~268× more images than the smallest (Seahorse)
- Full dataset description, class distribution, and known data-quality limitations documented in `docs/dataset_notes.md`

*Note: the current public release of this dataset contains fewer images than reported in the source paper (45,132 train / 13,010 test) — this discrepancy is documented and accounted for in the preprocessing notes.*

## Preprocessing Pipeline

1. **Cleaning** — verified all 29,071 images against their annotations (0 skipped)
2. **Crop-to-bounding-box** — each annotated object cropped from its source image
3. **Resize** — all crops standardized to 224×224
4. **Normalization** — mean/std computed directly from the processed training set (not generic ImageNet defaults)
5. **Class-imbalance handling** — classes with fewer than 100 training images augmented (rotation, horizontal flip, zoom, translation, shear) up to 150 images each
6. **Stratified split** — train / validation / test, with the original test set kept untouched as a clean holdout

Full pipeline code: `src/preprocessing/`. Full write-up: `docs/dataset_notes.md`.

## Models

All four models were trained under an identical configuration to ensure a fair comparison: **Adam optimizer, learning rate 0.0001, weight decay 1e-4, batch size 32, 12 epochs, CrossEntropyLoss, seed 42, no learning-rate scheduler**, with ImageNet-pretrained initialization. Each model reports test metrics from its best validation-epoch checkpoint.

| Model | Role | Parameters | Accuracy | Precision (macro) | Recall (macro) | F1-score (macro) | AUC (macro, one-vs-rest) | Training Time |
|---|---|---|---|---|---|---|---|---|
| ResNet50 | Paper Baseline | 23,671,952 | 0.7992 | 0.7371 | 0.7453 | 0.7209 | 0.9929 | 136.97 min |
| **EfficientNetV2-S** | Efficient CNN | 20,279,968 | **0.8321** | **0.7717** | **0.7875** | **0.7690** | **0.9941** | **77.01 min** |
| ConvNeXt-Tiny | Modern CNN | 27,881,648 | 0.8152 | 0.7681 | 0.7595 | 0.7403 | — | 112.74 min |
| Swin-Tiny | Advanced (Transformer) | 27,580,874 | 0.7961 | 0.7378 | 0.7456 | 0.7227 | 0.9898 | 88.84 min |

**EfficientNetV2-S was the best-performing and most computationally efficient model overall** — highest accuracy, F1, and AUC, with the fewest parameters and fastest training/inference time. Full analysis, per-class breakdowns, and discussion in `docs/model_comparison.md`.

## Repository Structure

```
├── data/
│   └── manifest.csv                # master index: filepath, label, split
├── docs/
│   ├── paper_summary.md            # 1-page summary of the reference paper
│   ├── paper_info_table.md         # required paper metadata fields
│   ├── dataset_notes.md            # dataset description, stats, preprocessing writeup
│   └── model_comparison.md         # comparative results table + full analysis
├── outputs/
│   ├── figures/                    # confusion matrices, ROC curves, training curves
│   └── results/                    # per-model metrics (JSON/CSV)
├── src/
│   ├── preprocessing/              # crop/resize/normalize/augment/split pipeline
│   ├── models/                     # training scripts for each of the 4 models
│   └── utils/                      # shared dataset loader, transforms, config
└── requirements.txt
```

## Setup

```bash
git clone <this-repo-url>
cd animal-species-classification-cnn

python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
```

The processed image dataset (`data/processed/`) is not tracked in this repository due to size — it must be regenerated locally via the preprocessing scripts in `src/preprocessing/`, or obtained separately.

## Key Findings

- **EfficientNetV2-S dominates on every metric** measured — no accuracy-vs-efficiency trade-off was observed; the best model was also the fastest and smallest.
- **ConvNeXt-Tiny (Modern CNN) improved over the ResNet50 baseline** on both accuracy and F1-score, consistent with expectations for a more modern CNN design.
- **Swin-Tiny (Transformer) did not meaningfully improve over the baseline**, likely due to the limited training data and epoch budget — vision transformers typically require more data/training to outperform CNNs, given their lack of built-in spatial inductive bias.
- All four independently trained models struggled on the same handful of classes (e.g. Bear, Turtle, Squid) — strong evidence that these difficulties stem from data quality/imbalance rather than any single model's weakness.

## License

See `LICENSE`.