"""
Evaluation script for the ResNet50 baseline — Animal-80.

Loads the best validation checkpoint (outputs/checkpoints/resnet50_best.pt),
runs inference on the TEST split, and produces the six required outputs:

  1. Macro Precision, Recall, F1-score
  2. Confusion matrix image
  3. Multiclass one-vs-rest ROC/AUC image + macro AUC value
  4. Training curves image  (from outputs/resnet50_history.csv — no retraining)
  5. outputs/resnet50_evaluation.json  (all metrics in one place)

Usage (run from project root):
    python src/evaluate_resnet50.py
"""

import csv
import json
import sys
from pathlib import Path

# ── project root resolution (mirrors train_resnet50.py convention) ─────────────
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

import matplotlib
matplotlib.use("Agg")          # headless — no display required
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker

from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)
from sklearn.preprocessing import label_binarize

from src.models.resnet50 import build_resnet50
from src.utils.config import MANIFEST_PATH
from src.utils.dataset import AnimalDataset
from src.utils.transforms import get_eval_transform


# ── constants ──────────────────────────────────────────────────────────────────
CKPT_PATH     = PROJECT_ROOT / "outputs" / "checkpoints" / "resnet50_best.pt"
HISTORY_PATH  = PROJECT_ROOT / "outputs" / "resnet50_history.csv"
FIGURES_DIR   = PROJECT_ROOT / "outputs" / "figures"
EVAL_JSON     = PROJECT_ROOT / "outputs" / "resnet50_evaluation.json"

CM_PATH       = FIGURES_DIR / "resnet50_confusion_matrix.png"
ROC_PATH      = FIGURES_DIR / "resnet50_roc_auc.png"
CURVES_PATH   = FIGURES_DIR / "resnet50_training_curves.png"

NUM_WORKERS   = 2
BATCH_SIZE    = 32


# ── device ─────────────────────────────────────────────────────────────────────
def select_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


# ── inference on test split ────────────────────────────────────────────────────
def run_inference(model, loader, device):
    """Return (all_labels, all_preds, all_probs) as numpy arrays."""
    model.eval()
    all_labels, all_preds, all_probs = [], [], []

    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            logits = model(images)
            probs  = torch.softmax(logits, dim=1)

            all_labels.append(labels.numpy())
            all_preds.append(logits.argmax(dim=1).cpu().numpy())
            all_probs.append(probs.cpu().numpy())

    return (
        np.concatenate(all_labels),
        np.concatenate(all_preds),
        np.concatenate(all_probs),   # shape (N, 80)
    )


# ── plot: confusion matrix ─────────────────────────────────────────────────────
def plot_confusion_matrix(cm, class_names, save_path):
    """Save an 80×80 normalised confusion matrix as a high-resolution PNG."""
    n = len(class_names)
    # Row-normalise so each cell shows recall (0–1)
    row_sums = cm.sum(axis=1, keepdims=True).clip(min=1)
    cm_norm  = cm.astype(float) / row_sums

    fig, ax = plt.subplots(figsize=(32, 28))
    im = ax.imshow(cm_norm, interpolation="nearest", cmap="Blues", vmin=0, vmax=1)

    cbar = fig.colorbar(im, ax=ax, fraction=0.02, pad=0.02)
    cbar.set_label("Recall (row-normalised)", fontsize=11)

    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels(class_names, rotation=90, fontsize=5.5, ha="right")
    ax.set_yticklabels(class_names, fontsize=5.5)
    ax.set_xlabel("Predicted class", fontsize=13, labelpad=10)
    ax.set_ylabel("True class",      fontsize=13, labelpad=10)
    ax.set_title(
        "ResNet50 — Confusion Matrix (row-normalised, Test set, 80 classes)",
        fontsize=14, pad=14,
    )

    plt.tight_layout()
    fig.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved: {save_path}")


# ── plot: ROC curves ───────────────────────────────────────────────────────────
def plot_roc_auc(labels, probs, class_names, save_path):
    """
    One-vs-rest ROC curves for every class + macro-average.
    Returns macro_auc float.
    """
    n_classes = len(class_names)
    classes   = list(range(n_classes))

    # Binarise labels for one-vs-rest
    labels_bin = label_binarize(labels, classes=classes)   # (N, 80)

    # Per-class AUC (handle classes absent from test set gracefully)
    per_class_auc = []
    for i in range(n_classes):
        if labels_bin[:, i].sum() == 0:
            per_class_auc.append(float("nan"))
        else:
            per_class_auc.append(
                roc_auc_score(labels_bin[:, i], probs[:, i])
            )

    valid_aucs  = [a for a in per_class_auc if not np.isnan(a)]
    macro_auc   = float(np.mean(valid_aucs))

    # Also compute sklearn's built-in macro OvR AUC for cross-check
    macro_auc_sk = roc_auc_score(
        labels_bin, probs, average="macro",   multi_class="ovr"
    )

    # ── figure: top-20 best + top-20 worst + macro line ───────────────────────
    sorted_idx  = np.argsort(per_class_auc)[::-1]          # descending

    fig, axes = plt.subplots(1, 2, figsize=(18, 8))

    for ax, idx_slice, title in [
        (axes[0], sorted_idx[:20],  "Top-20 classes by AUC"),
        (axes[1], sorted_idx[-20:], "Bottom-20 classes by AUC"),
    ]:
        from sklearn.metrics import roc_curve
        for i in idx_slice:
            if np.isnan(per_class_auc[i]):
                continue
            fpr, tpr, _ = roc_curve(labels_bin[:, i], probs[:, i])
            ax.plot(fpr, tpr, lw=0.9, alpha=0.75,
                    label=f"{class_names[i]} ({per_class_auc[i]:.2f})")
        ax.plot([0, 1], [0, 1], "k--", lw=1)
        ax.axhline(y=macro_auc, color="red", lw=1.5, linestyle=":",
                   label=f"Macro AUC = {macro_auc:.4f}")
        ax.set_xlim([0, 1]); ax.set_ylim([0, 1.02])
        ax.set_xlabel("False Positive Rate", fontsize=11)
        ax.set_ylabel("True Positive Rate",  fontsize=11)
        ax.set_title(title, fontsize=12)
        ax.legend(fontsize=6, loc="lower right", ncol=1)

    fig.suptitle(
        f"ResNet50 — One-vs-Rest ROC Curves  |  Macro AUC = {macro_auc:.4f}",
        fontsize=14,
    )
    plt.tight_layout()
    fig.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved: {save_path}")

    return macro_auc, macro_auc_sk


# ── plot: training curves ──────────────────────────────────────────────────────
def plot_training_curves(history_path, save_path):
    """Read resnet50_history.csv and plot loss + accuracy curves."""
    epochs, t_loss, v_loss, t_acc, v_acc = [], [], [], [], []
    with open(history_path) as f:
        for row in csv.DictReader(f):
            epochs.append(int(row["epoch"]))
            t_loss.append(float(row["train_loss"]))
            v_loss.append(float(row["val_loss"]))
            t_acc.append(float(row["train_acc"]))
            v_acc.append(float(row["val_acc"]))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5))

    # ── loss ──────────────────────────────────────────────────────────────────
    ax1.plot(epochs, t_loss, "o-", color="#2196F3", lw=2, label="Train loss")
    ax1.plot(epochs, v_loss, "s--", color="#F44336", lw=2, label="Val loss")
    ax1.set_xlabel("Epoch", fontsize=12)
    ax1.set_ylabel("CrossEntropy Loss", fontsize=12)
    ax1.set_title("ResNet50 — Loss Curves", fontsize=13)
    ax1.xaxis.set_major_locator(ticker.MaxNLocator(integer=True))
    ax1.legend(fontsize=11)
    ax1.grid(True, alpha=0.3)

    # ── accuracy ──────────────────────────────────────────────────────────────
    ax2.plot(epochs, [a * 100 for a in t_acc], "o-", color="#2196F3",
             lw=2, label="Train accuracy")
    ax2.plot(epochs, [a * 100 for a in v_acc], "s--", color="#F44336",
             lw=2, label="Val accuracy")
    ax2.set_xlabel("Epoch", fontsize=12)
    ax2.set_ylabel("Accuracy (%)", fontsize=12)
    ax2.set_title("ResNet50 — Accuracy Curves", fontsize=13)
    ax2.xaxis.set_major_locator(ticker.MaxNLocator(integer=True))
    ax2.legend(fontsize=11)
    ax2.grid(True, alpha=0.3)

    # annotate best val point
    best_ep  = epochs[v_acc.index(max(v_acc))]
    best_val = max(v_acc) * 100
    ax2.annotate(
        f"Best val\n{best_val:.2f}% @ ep {best_ep}",
        xy=(best_ep, best_val),
        xytext=(best_ep + 0.6, best_val - 4),
        arrowprops=dict(arrowstyle="->", color="black"),
        fontsize=9,
    )

    fig.suptitle("ResNet50 — Training History (12 epochs)", fontsize=14)
    plt.tight_layout()
    fig.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved: {save_path}")


# ── main ───────────────────────────────────────────────────────────────────────
def main():
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)

    # ── device ─────────────────────────────────────────────────────────────────
    device = select_device()
    print(f"Device : {device}")

    # ── load checkpoint ────────────────────────────────────────────────────────
    print(f"\nLoading checkpoint: {CKPT_PATH}")
    ckpt = torch.load(CKPT_PATH, map_location=device, weights_only=True)
    ckpt_epoch   = ckpt["epoch"]
    ckpt_val_acc = ckpt["best_val_acc"]
    print(f"  Checkpoint epoch   : {ckpt_epoch}")
    print(f"  Checkpoint val acc : {ckpt_val_acc:.4f}")
    assert ckpt_epoch == 1,          f"Expected epoch 1, got {ckpt_epoch}"
    assert abs(ckpt_val_acc - 0.875) < 1e-6, "Unexpected checkpoint val acc"

    # ── build model ────────────────────────────────────────────────────────────
    print("\nBuilding model …")
    model = build_resnet50(num_classes=80, pretrained=False)
    model.load_state_dict(ckpt["model_state"])
    model = model.to(device)
    model.eval()

    # ── test dataloader ────────────────────────────────────────────────────────
    print("Loading test dataset …")
    test_ds = AnimalDataset(str(MANIFEST_PATH), "test", get_eval_transform())
    test_loader = DataLoader(
        test_ds,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=NUM_WORKERS,
        pin_memory=False,
        persistent_workers=(NUM_WORKERS > 0),
    )
    class_names = test_ds.classes     # sorted list of 80 names
    num_classes = len(class_names)
    print(f"  Test samples : {len(test_ds)}")
    print(f"  Classes      : {num_classes}")
    assert num_classes == 80, f"Expected 80 classes, got {num_classes}"

    # ── run inference ──────────────────────────────────────────────────────────
    print("\nRunning inference on test set …")
    labels_arr, preds_arr, probs_arr = run_inference(model, test_loader, device)

    # sanity-check: top-1 accuracy must match PART 6 reported value (79.92 %)
    top1_acc = float(np.mean(preds_arr == labels_arr))
    print(f"  Top-1 accuracy (cross-check) : {top1_acc:.4f}  "
          f"(expected ≈ 0.7992)")
    assert abs(top1_acc - 0.7992) < 0.0005, \
        f"Top-1 mismatch: got {top1_acc:.4f} — wrong checkpoint?"

    # ── precision / recall / F1 ────────────────────────────────────────────────
    print("\nComputing Precision / Recall / F1 …")
    macro_precision = precision_score(
        labels_arr, preds_arr, average="macro", zero_division=0
    )
    macro_recall = recall_score(
        labels_arr, preds_arr, average="macro", zero_division=0
    )
    macro_f1 = f1_score(
        labels_arr, preds_arr, average="macro", zero_division=0
    )
    print(f"  Macro Precision : {macro_precision:.4f}")
    print(f"  Macro Recall    : {macro_recall:.4f}")
    print(f"  Macro F1-score  : {macro_f1:.4f}")

    # ── confusion matrix ───────────────────────────────────────────────────────
    print("\nGenerating confusion matrix …")
    cm = confusion_matrix(labels_arr, preds_arr, labels=list(range(num_classes)))
    print(f"  Matrix shape : {cm.shape}  (should be (80, 80))")
    assert cm.shape == (80, 80)
    plot_confusion_matrix(cm, class_names, CM_PATH)

    # ── ROC / AUC ──────────────────────────────────────────────────────────────
    print("\nComputing ROC / AUC …")
    macro_auc, macro_auc_sk = plot_roc_auc(
        labels_arr, probs_arr, class_names, ROC_PATH
    )
    print(f"  Macro ROC-AUC (manual mean) : {macro_auc:.4f}")
    print(f"  Macro ROC-AUC (sklearn OvR) : {macro_auc_sk:.4f}")

    # ── training curves ────────────────────────────────────────────────────────
    print("\nGenerating training curves from CSV (no retraining) …")
    plot_training_curves(HISTORY_PATH, CURVES_PATH)

    # ── save evaluation JSON ───────────────────────────────────────────────────
    eval_results = {
        "model":                "resnet50",
        "checkpoint_epoch":     ckpt_epoch,
        "checkpoint_val_acc":   ckpt_val_acc,
        "test_samples":         int(len(test_ds)),
        "num_classes":          num_classes,
        "test_top1_accuracy":   round(top1_acc, 6),
        "macro_precision":      round(macro_precision, 6),
        "macro_recall":         round(macro_recall, 6),
        "macro_f1":             round(macro_f1, 6),
        "macro_roc_auc":        round(macro_auc, 6),
        "figures": {
            "confusion_matrix":  str(CM_PATH),
            "roc_auc":           str(ROC_PATH),
            "training_curves":   str(CURVES_PATH),
        },
    }

    with open(EVAL_JSON, "w") as f:
        json.dump(eval_results, f, indent=2)
    print(f"\n  Saved: {EVAL_JSON}")

    # ── final summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 50)
    print("EVALUATION SUMMARY")
    print("=" * 50)
    print(f"  Checkpoint epoch  : {ckpt_epoch}  (best val: {ckpt_val_acc:.4f})")
    print(f"  Test samples      : {len(test_ds)}")
    print(f"  Top-1 accuracy    : {top1_acc:.4f}")
    print(f"  Macro Precision   : {macro_precision:.4f}")
    print(f"  Macro Recall      : {macro_recall:.4f}")
    print(f"  Macro F1-score    : {macro_f1:.4f}")
    print(f"  Macro ROC-AUC     : {macro_auc:.4f}")
    print("=" * 50)


if __name__ == "__main__":
    main()
