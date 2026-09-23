# Model Comparison and Analysis — Activity 2

## Step 11: Comparative Results Table

| Model | Role | Parameters | Accuracy | Precision (macro) | Recall (macro) | F1-score (macro) | AUC (macro, one-vs-rest) | Training Time | Inference Time (per image) |
|---|---|---|---|---|---|---|---|---|---|
| ResNet50 | Paper Baseline | 23,671,952 | 0.7992 | 0.7371 | 0.7453 | 0.7209 | 0.9929 | 136.97 min | 7.19 ms |
| EfficientNetV2-S | Efficient CNN | **20,279,968** | **0.8321** | **0.7717** | **0.7875** | **0.7690** | **0.9941** | **77.01 min** | **5.12 ms** |
| ConvNeXt-Tiny | Modern CNN | 27,881,648 | 0.8152 | 0.7681 | 0.7595 | 0.7403 | — | 112.74 min | 6.78 ms |
| Swin-Tiny | Advanced (Transformer) | 27,580,874 | 0.7961 | 0.7378 | 0.7456 | 0.7227 | 0.9898 | 88.84 min | 6.45 ms |

*Bold = best value in that column.*

All four models were trained under an identical configuration to ensure a fair comparison: Adam optimizer, learning rate 0.0001, weight decay 1e-4, batch size 32, 12 epochs, CrossEntropyLoss, seed 42, no learning-rate scheduler, and ImageNet-pretrained initialization. Each model's reported test metrics come from its best validation-epoch checkpoint, not necessarily the final epoch.

---

## Section 6.E: Analysis Questions

**1. Which model achieved the highest accuracy?**
EfficientNetV2-S, with a test accuracy of 83.21% — approximately 3.3 percentage points higher than the weakest performer (Swin-Tiny, 79.61%).

**2. Which model achieved the highest F1-score?**
EfficientNetV2-S again, with a macro F1-score of 0.7690, ahead of ConvNeXt-Tiny (0.7400), Swin-Tiny (0.7227), and ResNet50 (0.7209).

**3. Which model had the lowest training/inference time?**
EfficientNetV2-S had both the lowest training time (77.01 minutes) and the lowest per-image inference time (5.12 ms), making it the fastest model to both train and deploy among the four.

**4. Which model had the smallest number of parameters?**
EfficientNetV2-S, with approximately 20.28 million parameters — around 3.4 million fewer than ResNet50, and roughly 7.3–7.6 million fewer than ConvNeXt-Tiny and Swin-Tiny.

**5. Which model is most suitable for this application?**
EfficientNetV2-S is the clear choice. It simultaneously achieves the highest accuracy, the highest F1-score, the highest AUC, the fewest parameters, the shortest training time, and the fastest inference — there is no trade-off to weigh here, as it leads on every measured criterion. For a real-world animal species classification deployment (e.g., on edge devices or for rapid batch processing), this combination of accuracy and efficiency makes it the most practical and suitable model.

**6. Did the modern CNN / advanced model improve over the paper's baseline?**
Results differ depending on which newer model is considered. ConvNeXt-Tiny (Modern CNN) improved over the ResNet50 baseline on both accuracy (81.52% vs. 79.92%, a gain of 1.6 percentage points) and F1-score (0.740 vs. 0.721), supporting the expectation that newer CNN architectures with improved design outperform older ones. Swin-Tiny (Advanced/Transformer), however, did not meaningfully improve over the baseline — its accuracy (79.61%) was marginally lower than ResNet50's, and its F1-score (0.7227) was only negligibly higher than the baseline's 0.7209. This is consistent with a well-documented characteristic of vision transformers: they generally lack the built-in spatial inductive bias that convolutional networks have, and tend to need larger training datasets or longer training schedules to outperform CNNs. With only 12 epochs and ~26,000 training images, Swin-Tiny was likely undertrained relative to its architectural potential.

**7. What is the trade-off between accuracy and computational complexity?**
The results show that a higher parameter count does not guarantee better performance. ConvNeXt-Tiny and Swin-Tiny both have more parameters (~27.6–27.9M) than EfficientNetV2-S (~20.3M) and took considerably longer to train (112.7 and 88.8 minutes respectively, versus EfficientNetV2-S's 77.0 minutes), yet neither matched EfficientNetV2-S's accuracy or F1-score. This demonstrates that architectural efficiency (how a model uses its parameters) matters more than raw parameter count — EfficientNetV2-S achieves a better accuracy-per-parameter and accuracy-per-training-minute ratio than the larger models tested, making it the most computationally efficient choice without sacrificing performance.

---

## Section 7: Final Conclusion

Based on the experimental results, **EfficientNetV2-S** achieved the best classification performance with **an accuracy of 83.21% and a macro F1-score of 0.769**. However, **EfficientNetV2-S** was also the most computationally efficient of the four models, requiring the fewest parameters (20.28M), the shortest training time (77.01 minutes), and the fastest inference (5.12 ms per image) — meaning the best-performing model was also the most efficient one, rather than requiring a trade-off. The modern CNN, **ConvNeXt-Tiny, improved** performance compared with the baseline ResNet50 model, while the advanced transformer-based model, **Swin-Tiny, did not meaningfully improve** over the baseline, likely due to the limited training data and epoch budget available for this activity. Considering accuracy, F1-score, computational cost, and the practical requirements of an animal species classification application, **EfficientNetV2-S** is the most suitable model for this application.
