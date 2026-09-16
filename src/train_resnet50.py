"""
Training script for the ResNet50 baseline on Animal-80.

Finalized common training configuration (shared across all team models)
-----------------------------------------------------------------------
  optimizer   : Adam
  lr          : 1e-4
  weight_decay: 1e-4
  batch_size  : 32
  epochs      : 12
  loss        : CrossEntropyLoss
  scheduler   : None
  seed        : 42
  pretrained  : ImageNet-1K V2

All models in this project use identical hyperparameters, the same
AnimalDataset, and the same transforms so that results are comparable.

Note on determinism
-------------------
Python/NumPy/PyTorch seeds are set for reproducibility.  MPS (Apple Silicon
GPU) does not guarantee bit-exact reproducibility across runs even with fixed
seeds; results may vary slightly between runs on MPS.

Usage
-----
  python src/train_resnet50.py [options]

  Run  python src/train_resnet50.py --help  for full option list.
"""

import argparse
import csv
import json
import os
import random
import sys
import time
from pathlib import Path

# ── resolve project root so all src.* imports work regardless of cwd ──────────
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from src.models.resnet50 import build_resnet50
from src.utils.config import MANIFEST_PATH
from src.utils.dataset import AnimalDataset
from src.utils.metrics import accuracy_score, per_class_accuracy, top_k_accuracy
from src.utils.transforms import get_eval_transform, get_train_transform


# ── reproducibility ────────────────────────────────────────────────────────────

def set_seed(seed: int) -> None:
    """Seed Python, NumPy, and PyTorch for reproducibility.

    MPS does not guarantee bit-exact results across runs even with a fixed
    seed.  CPU runs are fully deterministic with this setup.
    """
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    # For CPU: enable full determinism
    torch.use_deterministic_algorithms(False)  # MPS does not support all ops deterministically


# ── device selection ───────────────────────────────────────────────────────────

def select_device() -> torch.device:
    """Return MPS if available on Apple Silicon, otherwise CPU."""
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


# ── data loading ───────────────────────────────────────────────────────────────

def make_dataloaders(
    manifest_path: Path,
    batch_size: int,
    num_workers: int,
) -> tuple[DataLoader, DataLoader, DataLoader]:
    """Build train, val, and test DataLoaders from the manifest.

    Uses AnimalDataset and the shared transforms exactly as provided by
    the project — no additional preprocessing is added here.
    """
    train_dataset = AnimalDataset(str(manifest_path), "train", get_train_transform())
    val_dataset   = AnimalDataset(str(manifest_path), "val",   get_eval_transform())
    test_dataset  = AnimalDataset(str(manifest_path), "test",  get_eval_transform())

    # persistent_workers=False is safer on macOS with spawn multiprocessing.
    loader_kwargs = dict(
        batch_size=batch_size,
        num_workers=num_workers,
        pin_memory=False,          # pin_memory is only beneficial for CUDA
        persistent_workers=(num_workers > 0),
    )

    train_loader = DataLoader(train_dataset, shuffle=True,  **loader_kwargs)
    val_loader   = DataLoader(val_dataset,   shuffle=False, **loader_kwargs)
    test_loader  = DataLoader(test_dataset,  shuffle=False, **loader_kwargs)

    return train_loader, val_loader, test_loader


# ── one epoch of training ──────────────────────────────────────────────────────

def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> tuple[float, float]:
    """Run one full training epoch.

    Returns
    -------
    (mean_loss, accuracy) both as plain floats.
    """
    model.train()
    total_loss = 0.0
    all_preds: list[np.ndarray] = []
    all_labels: list[np.ndarray] = []

    for images, labels in loader:
        images = images.to(device)
        labels = labels.to(device)

        optimizer.zero_grad()
        logits = model(images)
        loss   = criterion(logits, labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * images.size(0)

        preds = logits.argmax(dim=1).cpu().numpy()
        all_preds.append(preds)
        all_labels.append(labels.cpu().numpy())

    n = len(loader.dataset)
    mean_loss = total_loss / n
    acc = accuracy_score(
        np.concatenate(all_preds),
        np.concatenate(all_labels),
    )
    return mean_loss, acc


# ── evaluation (val or test) ───────────────────────────────────────────────────

def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> tuple[float, float]:
    """Evaluate model on a DataLoader.

    Returns
    -------
    (mean_loss, accuracy) both as plain floats.
    """
    model.eval()
    total_loss = 0.0
    all_preds: list[np.ndarray] = []
    all_labels: list[np.ndarray] = []

    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)

            logits = model(images)
            loss   = criterion(logits, labels)

            total_loss += loss.item() * images.size(0)

            preds = logits.argmax(dim=1).cpu().numpy()
            all_preds.append(preds)
            all_labels.append(labels.cpu().numpy())

    n = len(loader.dataset)
    mean_loss = total_loss / n
    acc = accuracy_score(
        np.concatenate(all_preds),
        np.concatenate(all_labels),
    )
    return mean_loss, acc


def evaluate_test(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    class_names: list[str],
) -> dict:
    """Full test-set evaluation including top-5 and per-class accuracy.

    Returns a dict with all test metrics.
    """
    model.eval()
    total_loss = 0.0
    all_logits: list[np.ndarray] = []
    all_preds:  list[np.ndarray] = []
    all_labels: list[np.ndarray] = []

    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)

            logits = model(images)
            loss   = criterion(logits, labels)

            total_loss += loss.item() * images.size(0)

            all_logits.append(logits.cpu().numpy())
            all_preds.append(logits.argmax(dim=1).cpu().numpy())
            all_labels.append(labels.cpu().numpy())

    n = len(loader.dataset)
    preds_arr  = np.concatenate(all_preds)
    labels_arr = np.concatenate(all_labels)
    logits_arr = np.concatenate(all_logits)

    acc     = accuracy_score(preds_arr, labels_arr)
    top5    = top_k_accuracy(logits_arr, labels_arr, k=5)
    per_cls = per_class_accuracy(
        preds_arr, labels_arr,
        num_classes=len(class_names),
        class_names=class_names,
    )

    return {
        "test_loss":          total_loss / n,
        "test_accuracy":      acc,
        "test_top5_accuracy": top5,
        "per_class_accuracy": per_cls["per_class"],
        "macro_avg_accuracy": per_cls["macro_avg"],
    }


# ── checkpoint helpers ─────────────────────────────────────────────────────────

def save_checkpoint(
    path: Path,
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    epoch: int,
    best_val_acc: float,
    hparams: dict,
) -> None:
    torch.save(
        {
            "epoch":         epoch,
            "model_state":   model.state_dict(),
            "optimizer_state": optimizer.state_dict(),
            "best_val_acc":  best_val_acc,
            "hparams":       hparams,
        },
        path,
    )


# ── argument parsing ───────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Train ResNet50 baseline on Animal-80",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    # -- finalized common training configuration --
    p.add_argument("--lr",           type=float, default=1e-4,
                   help="Adam learning rate")
    p.add_argument("--weight-decay", type=float, default=1e-4,
                   help="Adam weight decay")
    p.add_argument("--epochs",       type=int,   default=12,
                   help="Training epochs")
    p.add_argument("--batch-size",   type=int,   default=32,
                   help="Batch size")
    p.add_argument("--num-workers",  type=int,   default=2,
                   help="DataLoader workers (conservative default for macOS)")
    p.add_argument("--seed",         type=int,   default=42,
                   help="Random seed")
    p.add_argument("--output-dir",   type=str,   default="outputs",
                   help="Root output directory")
    p.add_argument("--smoke-test",   action="store_true",
                   help="Run only 2 batches per split (for fast verification)")
    return p.parse_args()


# ── main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()

    # ── paths ──────────────────────────────────────────────────────────────────
    output_dir   = PROJECT_ROOT / args.output_dir
    ckpt_dir     = output_dir / "checkpoints"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path    = ckpt_dir / "resnet50_best.pt"
    history_path = output_dir / "resnet50_history.csv"
    results_path = output_dir / "resnet50_results.json"

    # ── reproducibility ────────────────────────────────────────────────────────
    set_seed(args.seed)

    # ── device ─────────────────────────────────────────────────────────────────
    device = select_device()
    print(f"Device : {device}")

    # ── data ───────────────────────────────────────────────────────────────────
    print("Loading datasets …")
    train_loader, val_loader, test_loader = make_dataloaders(
        MANIFEST_PATH, args.batch_size, args.num_workers
    )

    # Derive class names from the training split (same source as AnimalDataset)
    train_dataset: AnimalDataset = train_loader.dataset  # type: ignore[assignment]
    class_names = train_dataset.classes           # sorted list, matches class_to_idx
    num_classes = len(class_names)

    print(f"Classes: {num_classes}")
    print(f"Train  : {len(train_loader.dataset):>6} samples  |  "
          f"{len(train_loader):>4} batches")
    print(f"Val    : {len(val_loader.dataset):>6} samples  |  "
          f"{len(val_loader):>4} batches")
    print(f"Test   : {len(test_loader.dataset):>6} samples  |  "
          f"{len(test_loader):>4} batches")

    # ── model ──────────────────────────────────────────────────────────────────
    print("Building model …")
    model = build_resnet50(num_classes=num_classes, pretrained=True)
    model = model.to(device)

    total_params     = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Parameters: {total_params:,} total  |  {trainable_params:,} trainable")

    # ── loss, optimizer ────────────────────────────────────────────────────────
    # CrossEntropyLoss: standard for multi-class classification.
    criterion = nn.CrossEntropyLoss()

    # Adam: finalized common optimizer for all team models.
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )

    # No learning-rate scheduler (finalized common configuration).

    # ── hyperparameter record (for checkpoint + results file) ──────────────────
    hparams = {
        "model":        "resnet50",
        "pretrained":   True,
        "num_classes":  num_classes,
        "optimizer":    "Adam",
        "lr":           args.lr,
        "weight_decay": args.weight_decay,
        "scheduler":    None,
        "loss":         "CrossEntropyLoss",
        "epochs":       args.epochs,
        "batch_size":   args.batch_size,
        "seed":         args.seed,
        "device":       str(device),
    }

    print("\nHyperparameters:")
    for k, v in hparams.items():
        print(f"  {k:<15} = {v}")
    print()

    # ── smoke-test mode: limit to 2 batches per split ──────────────────────────
    if args.smoke_test:
        print("*** SMOKE TEST MODE — 2 batches per split ***\n")

    # ── training loop ──────────────────────────────────────────────────────────
    history: list[dict] = []
    best_val_acc  = -1.0   # sentinel: guarantees epoch-1 always saves a checkpoint
    wall_start    = time.time()
    epoch_times:  list[float] = []

    header_printed = False

    for epoch in range(1, args.epochs + 1):
        epoch_start = time.time()

        # ── train ──────────────────────────────────────────────────────────────
        if args.smoke_test:
            # Two-batch smoke: run manually instead of full epoch helper
            model.train()
            smoke_loss = 0.0
            smoke_preds: list[np.ndarray] = []
            smoke_labels: list[np.ndarray] = []
            for batch_idx, (images, labels) in enumerate(train_loader):
                if batch_idx >= 2:
                    break
                images = images.to(device)
                labels = labels.to(device)
                optimizer.zero_grad()
                logits = model(images)
                loss   = criterion(logits, labels)
                loss.backward()
                optimizer.step()
                smoke_loss += loss.item() * images.size(0)
                smoke_preds.append(logits.argmax(1).cpu().numpy())
                smoke_labels.append(labels.cpu().numpy())
            n_smoke = sum(len(x) for x in smoke_preds)
            train_loss = smoke_loss / max(n_smoke, 1)
            train_acc  = accuracy_score(
                np.concatenate(smoke_preds), np.concatenate(smoke_labels)
            )
        else:
            train_loss, train_acc = train_one_epoch(
                model, train_loader, criterion, optimizer, device
            )

        # ── validate ───────────────────────────────────────────────────────────
        if args.smoke_test:
            model.eval()
            smoke_val_loss = 0.0
            smoke_val_preds: list[np.ndarray] = []
            smoke_val_labels: list[np.ndarray] = []
            with torch.no_grad():
                for batch_idx, (images, labels) in enumerate(val_loader):
                    if batch_idx >= 2:
                        break
                    images = images.to(device)
                    labels = labels.to(device)
                    logits = model(images)
                    loss   = criterion(logits, labels)
                    smoke_val_loss += loss.item() * images.size(0)
                    smoke_val_preds.append(logits.argmax(1).cpu().numpy())
                    smoke_val_labels.append(labels.cpu().numpy())
            n_val_smoke = sum(len(x) for x in smoke_val_preds)
            val_loss = smoke_val_loss / max(n_val_smoke, 1)
            val_acc  = accuracy_score(
                np.concatenate(smoke_val_preds), np.concatenate(smoke_val_labels)
            )
        else:
            val_loss, val_acc = evaluate(model, val_loader, criterion, device)

        epoch_elapsed = time.time() - epoch_start
        epoch_times.append(epoch_elapsed)
        current_lr = args.lr  # no scheduler; lr is constant throughout training
        row = {
            "epoch":      epoch,
            "train_loss": round(train_loss, 6),
            "train_acc":  round(train_acc,  6),
            "val_loss":   round(val_loss,   6),
            "val_acc":    round(val_acc,    6),
            "lr":         current_lr,
            "epoch_time": round(epoch_elapsed, 2),
        }
        history.append(row)

        # ── checkpoint: save whenever val accuracy improves ────────────────────
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            save_checkpoint(ckpt_path, model, optimizer, epoch, best_val_acc, hparams)
            ckpt_marker = "  ← saved"
        else:
            ckpt_marker = ""

        # ── console log ────────────────────────────────────────────────────────
        if not header_printed:
            print(f"{'Epoch':>5}  {'T-Loss':>8}  {'T-Acc':>7}  "
                  f"{'V-Loss':>8}  {'V-Acc':>7}  {'LR':>8}  {'Time':>6}")
            print("-" * 62)
            header_printed = True

        print(
            f"{epoch:>5}  {train_loss:>8.4f}  {train_acc:>7.4f}  "
            f"{val_loss:>8.4f}  {val_acc:>7.4f}  {current_lr:>8.2e}  "
            f"{epoch_elapsed:>5.1f}s{ckpt_marker}"
        )

        # ── write CSV history after every epoch ────────────────────────────────
        with open(history_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=row.keys())
            writer.writeheader()
            writer.writerows(history)

        # ── smoke test: one epoch is enough ────────────────────────────────────
        if args.smoke_test:
            break

    # ── training summary ───────────────────────────────────────────────────────
    wall_total     = time.time() - wall_start
    avg_epoch_time = float(np.mean(epoch_times))

    print(f"\nTraining complete.")
    print(f"  Best val accuracy : {best_val_acc:.4f}")
    print(f"  Total time        : {wall_total:.1f}s")
    print(f"  Avg epoch time    : {avg_epoch_time:.1f}s")

    # ── test evaluation using best checkpoint ──────────────────────────────────
    if ckpt_path.exists():
        print(f"\nLoading best checkpoint from {ckpt_path} …")
        ckpt = torch.load(ckpt_path, map_location=device, weights_only=True)
        model.load_state_dict(ckpt["model_state"])
        print(f"  Checkpoint epoch  : {ckpt['epoch']}")
        print(f"  Checkpoint val acc: {ckpt['best_val_acc']:.4f}")
    else:
        print("\nNo checkpoint found — evaluating with current weights.")

    print("Evaluating on test set …")
    test_start   = time.time()
    test_metrics = evaluate_test(model, test_loader, criterion, device, class_names)
    test_time    = time.time() - test_start

    print(f"  Test accuracy     : {test_metrics['test_accuracy']:.4f}")
    print(f"  Test top-5 acc    : {test_metrics['test_top5_accuracy']:.4f}")
    print(f"  Macro avg acc     : {test_metrics['macro_avg_accuracy']:.4f}")
    print(f"  Test eval time    : {test_time:.1f}s")

    # ── save final results JSON ────────────────────────────────────────────────
    results = {
        "hparams":            hparams,
        "total_params":       total_params,
        "trainable_params":   trainable_params,
        "best_val_accuracy":  best_val_acc,
        "total_train_time_s": round(wall_total, 2),
        "avg_epoch_time_s":   round(avg_epoch_time, 2),
        "test_eval_time_s":   round(test_time, 2),
        "test_accuracy":      test_metrics["test_accuracy"],
        "test_top5_accuracy": test_metrics["test_top5_accuracy"],
        "macro_avg_accuracy": test_metrics["macro_avg_accuracy"],
        "per_class_accuracy": test_metrics["per_class_accuracy"],
    }

    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved  → {results_path}")
    print(f"History CSV    → {history_path}")
    print(f"Best checkpoint→ {ckpt_path}")


if __name__ == "__main__":
    main()
