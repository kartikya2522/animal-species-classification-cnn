"""
Shared classification metrics for Animal-80 model evaluation.

All functions accept either PyTorch tensors or NumPy arrays for predictions
and labels, and return plain Python scalars or dicts so they are usable from
any training or evaluation script without coupling to a specific framework.

Functions
---------
accuracy_score      : overall top-1 accuracy
top_k_accuracy      : top-k accuracy for configurable k
per_class_accuracy  : per-class accuracy dict and macro-averaged accuracy
"""
from __future__ import annotations

from typing import Union

import numpy as np
import torch


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _to_numpy(x: Union[torch.Tensor, np.ndarray]) -> np.ndarray:
    """Convert a tensor or ndarray to a 1-D NumPy int array."""
    if isinstance(x, torch.Tensor):
        x = x.detach().cpu().numpy()
    return np.asarray(x)


# ---------------------------------------------------------------------------
# Public metrics
# ---------------------------------------------------------------------------

def accuracy_score(
    preds: Union[torch.Tensor, np.ndarray],
    labels: Union[torch.Tensor, np.ndarray],
) -> float:
    """
    Compute overall top-1 classification accuracy.

    Parameters
    ----------
    preds : 1-D array-like of int
        Predicted class indices (argmax already applied).
    labels : 1-D array-like of int
        Ground-truth class indices.

    Returns
    -------
    float
        Fraction of correct predictions in [0.0, 1.0].
    """
    preds = _to_numpy(preds)
    labels = _to_numpy(labels)
    if len(preds) == 0:
        return 0.0
    return float(np.mean(preds == labels))


def top_k_accuracy(
    logits: Union[torch.Tensor, np.ndarray],
    labels: Union[torch.Tensor, np.ndarray],
    k: int = 5,
) -> float:
    """
    Compute top-k accuracy.

    A prediction is considered correct if the ground-truth class appears
    among the k highest-scoring classes.

    Parameters
    ----------
    logits : 2-D array-like of shape (N, num_classes)
        Raw model output scores (logits or probabilities).
    labels : 1-D array-like of int, shape (N,)
        Ground-truth class indices.
    k : int
        Number of top predictions to consider.  Defaults to 5.

    Returns
    -------
    float
        Fraction of samples where the true label is in the top-k predictions,
        in [0.0, 1.0].
    """
    if isinstance(logits, torch.Tensor):
        logits = logits.detach().cpu().numpy()
    else:
        logits = np.asarray(logits)

    labels = _to_numpy(labels)

    if len(labels) == 0:
        return 0.0

    # Indices of the k largest scores per sample (unsorted within top-k)
    top_k_indices = np.argpartition(logits, -k, axis=1)[:, -k:]  # (N, k)
    correct = np.any(top_k_indices == labels[:, np.newaxis], axis=1)
    return float(np.mean(correct))


def per_class_accuracy(
    preds: Union[torch.Tensor, np.ndarray],
    labels: Union[torch.Tensor, np.ndarray],
    num_classes: int | None = None,
    class_names: list[str] | None = None,
) -> dict:
    """
    Compute per-class accuracy and macro-averaged accuracy.

    Parameters
    ----------
    preds : 1-D array-like of int
        Predicted class indices (argmax already applied).
    labels : 1-D array-like of int
        Ground-truth class indices.
    num_classes : int, optional
        Total number of classes.  Inferred from the data when not provided.
    class_names : list of str, optional
        Human-readable class names.  When supplied, dict keys are class names
        rather than integer indices.

    Returns
    -------
    dict with keys
        "per_class"    : dict mapping class key → accuracy float (or None if
                         that class has no samples in the evaluation set)
        "macro_avg"    : float — mean accuracy over classes that have at
                         least one sample
    """
    preds = _to_numpy(preds)
    labels = _to_numpy(labels)

    if num_classes is None:
        num_classes = int(max(labels.max(), preds.max())) + 1

    per_class: dict = {}
    accs_with_samples: list[float] = []

    for cls in range(num_classes):
        mask = labels == cls
        key = class_names[cls] if (class_names and cls < len(class_names)) else cls
        if mask.sum() == 0:
            per_class[key] = None  # class not present in this evaluation set
        else:
            acc = float(np.mean(preds[mask] == cls))
            per_class[key] = acc
            accs_with_samples.append(acc)

    macro_avg = float(np.mean(accs_with_samples)) if accs_with_samples else 0.0

    return {
        "per_class": per_class,
        "macro_avg": macro_avg,
    }
