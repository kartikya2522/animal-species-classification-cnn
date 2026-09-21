"""
Swin Transformer-Tiny — Advanced model for Animal-80 classification.
Follows the exact same methodology as ResNet50, EfficientNetV2-S, and
ConvNeXt-Tiny in this project: identical hyperparameters, full seeding,
best-epoch checkpointing, and the complete set of required metrics/figures.

Run from project root:
    python -m src.models.swin_tiny
"""
import sys
import time
import json
import random
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import models
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, ConfusionMatrixDisplay, roc_auc_score,
    roc_curve, auc
)
from sklearn.preprocessing import label_binarize

sys.path.append(str(Path(__file__).resolve().parents[2]))
from src.utils.dataset import AnimalDataset
from src.utils.transforms import get_train_transform, get_eval_transform

# ---------- Reproducibility ----------
# Full seeding, including CUDA — this trains on a CUDA GPU (Colab T4), and
# Swin Transformer has internal dropout/stochastic-depth layers whose
# randomness runs on the GPU's own RNG when tensors live on cuda.
# torch.manual_seed() alone only controls the CPU RNG.
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(SEED)

MODEL_NAME = "swin_tiny"
OUTPUT_DIR = Path("outputs")
(OUTPUT_DIR / "models").mkdir(parents=True, exist_ok=True)
(OUTPUT_DIR / "figures").mkdir(parents=True, exist_ok=True)
(OUTPUT_DIR / "results").mkdir(parents=True, exist_ok=True)

CKPT_PATH = OUTPUT_DIR / "models" / f"{MODEL_NAME}.pth"

# ---------- 1. Load data ----------
train_dataset = AnimalDataset("data/manifest.csv", "train", get_train_transform())
val_dataset = AnimalDataset("data/manifest.csv", "val", get_eval_transform())
test_dataset = AnimalDataset("data/manifest.csv", "test", get_eval_transform())

num_classes = len(train_dataset.classes)
class_names = train_dataset.classes
print(f"Loaded {len(train_dataset)} train / {len(val_dataset)} val / "
      f"{len(test_dataset)} test images across {num_classes} classes.")

train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True, num_workers=0)
val_loader = DataLoader(val_dataset, batch_size=32, shuffle=False, num_workers=0)
test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False, num_workers=0)

# ---------- 2. Define the model ----------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

model = models.swin_t(weights="IMAGENET1K_V1")
model.head = nn.Linear(model.head.in_features, num_classes)
model = model.to(device)

total_params = sum(p.numel() for p in model.parameters())
trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"Total parameters: {total_params:,} | Trainable: {trainable_params:,}")

# ---------- 3. Hyperparameters (identical to every other model — NO scheduler) ----------
optimizer = torch.optim.Adam(model.parameters(), lr=0.0001, weight_decay=1e-4)
criterion = nn.CrossEntropyLoss()
num_epochs = 12

# ---------- 4. Training loop with best-checkpoint saving ----------
history = {"train_acc": [], "val_acc": [], "train_loss": [], "val_loss": []}
best_val_acc = -1.0
best_epoch = -1

training_start = time.time()

for epoch in range(num_epochs):
    model.train()
    running_loss, correct, total = 0.0, 0, 0

    for images, labels in train_loader:
        images, labels = images.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        _, predicted = outputs.max(1)
        correct += predicted.eq(labels).sum().item()
        total += labels.size(0)

    train_acc = correct / total
    train_loss = running_loss / total

    model.eval()
    val_running_loss, val_correct, val_total = 0.0, 0, 0
    with torch.no_grad():
        for images, labels in val_loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)

            val_running_loss += loss.item() * images.size(0)
            _, predicted = outputs.max(1)
            val_correct += predicted.eq(labels).sum().item()
            val_total += labels.size(0)

    val_acc = val_correct / val_total
    val_loss = val_running_loss / val_total

    history["train_acc"].append(train_acc)
    history["val_acc"].append(val_acc)
    history["train_loss"].append(train_loss)
    history["val_loss"].append(val_loss)

    ckpt_marker = ""
    if val_acc > best_val_acc:
        best_val_acc = val_acc
        best_epoch = epoch + 1
        torch.save(model.state_dict(), CKPT_PATH)
        ckpt_marker = "  <- saved (best so far)"

    print(f"Epoch {epoch+1}/{num_epochs} | "
          f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.4f} | "
          f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.4f}{ckpt_marker}")

training_time_sec = time.time() - training_start
print(f"\nTotal training time: {training_time_sec/60:.2f} minutes")
print(f"Best val accuracy: {best_val_acc:.4f} at epoch {best_epoch}")

# ---------- 5. Load the BEST checkpoint before final evaluation ----------
model.load_state_dict(torch.load(CKPT_PATH, map_location=device))
model.eval()
print(f"Loaded best checkpoint (epoch {best_epoch}) for test evaluation.")

# ---------- 6. Test set evaluation ----------
all_preds, all_labels, all_probs = [], [], []

inference_start = time.time()
with torch.no_grad():
    for images, labels in test_loader:
        images = images.to(device)
        outputs = model(images)
        probs = torch.softmax(outputs, dim=1)
        _, predicted = outputs.max(1)
        all_preds.extend(predicted.cpu().numpy())
        all_labels.extend(labels.numpy())
        all_probs.extend(probs.cpu().numpy())
inference_time_sec = time.time() - inference_start
avg_inference_time_ms = (inference_time_sec / len(test_dataset)) * 1000

all_labels_arr = np.array(all_labels)
all_preds_arr = np.array(all_preds)
all_probs_arr = np.array(all_probs)

test_accuracy = accuracy_score(all_labels_arr, all_preds_arr)
test_precision = precision_score(all_labels_arr, all_preds_arr, average="macro", zero_division=0)
test_recall = recall_score(all_labels_arr, all_preds_arr, average="macro", zero_division=0)
test_f1 = f1_score(all_labels_arr, all_preds_arr, average="macro", zero_division=0)

try:
    test_auc = roc_auc_score(
        all_labels_arr, all_probs_arr, multi_class="ovr", average="macro",
        labels=list(range(num_classes))
    )
except ValueError as e:
    print(f"AUC could not be computed: {e}")
    test_auc = None

print(f"\n--- Test Set Results (best checkpoint, epoch {best_epoch}) ---")
print(f"Accuracy:  {test_accuracy:.4f}")
print(f"Precision: {test_precision:.4f}")
print(f"Recall:    {test_recall:.4f}")
print(f"F1-score:  {test_f1:.4f}")
print(f"AUC:       {test_auc:.4f}" if test_auc is not None else "AUC:       N/A")

# ---------- 7. Save metrics JSON ----------
metrics = {
    "model_name": MODEL_NAME,
    "total_parameters": total_params,
    "trainable_parameters": trainable_params,
    "training_time_minutes": round(training_time_sec / 60, 2),
    "avg_inference_time_ms_per_image": round(avg_inference_time_ms, 3),
    "best_epoch": best_epoch,
    "best_val_accuracy": round(best_val_acc, 4),
    "test_accuracy": round(test_accuracy, 4),
    "test_precision_macro": round(test_precision, 4),
    "test_recall_macro": round(test_recall, 4),
    "test_f1_macro": round(test_f1, 4),
    "test_auc_macro_ovr": round(test_auc, 4) if test_auc is not None else None,
    "num_epochs": num_epochs,
    "batch_size": 32,
    "learning_rate": 0.0001,
    "optimizer": "Adam",
    "scheduler": None,
    "seed": SEED,
    "history": history,
}
metrics_path = OUTPUT_DIR / "results" / f"{MODEL_NAME}_metrics.json"
with open(metrics_path, "w") as f:
    json.dump(metrics, f, indent=2)
print(f"Saved metrics to {metrics_path}")

# ---------- 8. Training curves ----------
epochs_range = range(1, num_epochs + 1)
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

axes[0].plot(epochs_range, history["train_acc"], label="Train Accuracy")
axes[0].plot(epochs_range, history["val_acc"], label="Validation Accuracy")
axes[0].axvline(best_epoch, color="green", linestyle=":", alpha=0.6,
                 label=f"Best epoch ({best_epoch})")
axes[0].set_xlabel("Epoch")
axes[0].set_ylabel("Accuracy")
axes[0].set_title(f"{MODEL_NAME} — Accuracy vs Epoch")
axes[0].legend()
axes[0].grid(alpha=0.3)

axes[1].plot(epochs_range, history["train_loss"], label="Train Loss")
axes[1].plot(epochs_range, history["val_loss"], label="Validation Loss")
axes[1].axvline(best_epoch, color="green", linestyle=":", alpha=0.6,
                 label=f"Best epoch ({best_epoch})")
axes[1].set_xlabel("Epoch")
axes[1].set_ylabel("Loss")
axes[1].set_title(f"{MODEL_NAME} — Loss vs Epoch")
axes[1].legend()
axes[1].grid(alpha=0.3)

plt.tight_layout()
curves_path = OUTPUT_DIR / "figures" / f"{MODEL_NAME}_training_curves.png"
plt.savefig(curves_path, dpi=150)
plt.close()
print(f"Saved training curves to {curves_path}")

# ---------- 9. Confusion matrix (raw counts, with class labels) ----------
cm_raw = confusion_matrix(all_labels_arr, all_preds_arr)
fig, ax = plt.subplots(figsize=(20, 20))
disp = ConfusionMatrixDisplay(confusion_matrix=cm_raw, display_labels=class_names)
disp.plot(ax=ax, xticks_rotation=90, colorbar=True, cmap="Blues")
plt.title(f"{MODEL_NAME} — Confusion Matrix (Test Set)")
plt.tight_layout()
cm_path = OUTPUT_DIR / "figures" / f"{MODEL_NAME}_confusion_matrix.png"
plt.savefig(cm_path, dpi=150)
plt.close()
print(f"Saved confusion matrix to {cm_path}")

# ---------- 10. Confusion matrix (row-normalized) ----------
cm_norm = confusion_matrix(all_labels_arr, all_preds_arr, normalize="true")
fig, ax = plt.subplots(figsize=(20, 20))
disp = ConfusionMatrixDisplay(confusion_matrix=cm_norm, display_labels=class_names)
disp.plot(ax=ax, xticks_rotation=90, colorbar=True, cmap="Blues", values_format=".2f")
plt.title(f"{MODEL_NAME} — Confusion Matrix (row-normalized, Test set, {num_classes} classes)")
plt.tight_layout()
cm_norm_path = OUTPUT_DIR / "figures" / f"{MODEL_NAME}_confusion_matrix_normalized.png"
plt.savefig(cm_norm_path, dpi=150)
plt.close()
print(f"Saved normalized confusion matrix to {cm_norm_path}")

# ---------- 11. Per-class ROC / AUC (top-20 / bottom-20) ----------
labels_binarized = label_binarize(all_labels_arr, classes=list(range(num_classes)))

per_class_auc = {}
roc_data = {}
for i, class_name in enumerate(class_names):
    if labels_binarized[:, i].sum() == 0:
        continue
    fpr, tpr, _ = roc_curve(labels_binarized[:, i], all_probs_arr[:, i])
    class_auc = auc(fpr, tpr)
    per_class_auc[class_name] = class_auc
    roc_data[class_name] = (fpr, tpr)

macro_auc_check = np.mean(list(per_class_auc.values()))
sorted_classes = sorted(per_class_auc.items(), key=lambda x: x[1], reverse=True)
top20 = sorted_classes[:20]
bottom20 = sorted_classes[-20:]

fig, axes = plt.subplots(1, 2, figsize=(20, 9))
fig.suptitle(f"{MODEL_NAME} — One-vs-Rest ROC Curves  |  Macro AUC = {macro_auc_check:.4f}", fontsize=14)

for ax, subset, title in [(axes[0], top20, "Top-20 classes by AUC"),
                            (axes[1], bottom20, "Bottom-20 classes by AUC")]:
    for class_name, class_auc in subset:
        fpr, tpr = roc_data[class_name]
        ax.plot(fpr, tpr, label=f"{class_name} ({class_auc:.2f})")
    ax.plot([0, 1], [0, 1], "k--")
    ax.axhline(macro_auc_check, color="red", linestyle=":", label=f"Macro AUC = {macro_auc_check:.4f}")
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title(title)
    ax.legend(fontsize=7, loc="lower right")

plt.tight_layout()
roc_path = OUTPUT_DIR / "figures" / f"{MODEL_NAME}_roc_auc.png"
plt.savefig(roc_path, dpi=150)
plt.close()
print(f"Saved ROC/AUC figure to {roc_path}")

print("\nDone. All outputs saved under outputs/models, outputs/figures, outputs/results.")