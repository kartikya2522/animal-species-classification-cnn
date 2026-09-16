"""
ResNet50 baseline model for Animal-80 classification.

Loads torchvision's ResNet50 with ImageNet-1K V2 pretrained weights (when
pretrained=True) and replaces the final fully-connected layer to output
`num_classes` logits instead of the original 1000 ImageNet classes.

The convolutional backbone is left entirely unchanged so that ImageNet
feature representations are preserved for fine-tuning.

Usage:
    from src.models.resnet50 import build_resnet50

    model = build_resnet50(num_classes=80, pretrained=True)
"""
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

import torch.nn as nn
from torchvision.models import resnet50, ResNet50_Weights


def build_resnet50(num_classes: int = 80, pretrained: bool = True) -> nn.Module:
    """
    Build a ResNet50 model adapted for `num_classes`-way classification.

    Parameters
    ----------
    num_classes : int
        Number of output classes.  Defaults to 80 (Animal-80 dataset).
    pretrained : bool
        If True, initialise the backbone with ImageNet-1K V2 weights
        (IMAGENET1K_V2).  If False, use random initialisation.

    Returns
    -------
    nn.Module
        ResNet50 with its final ``fc`` layer replaced by
        ``nn.Linear(2048, num_classes)``.
    """
    weights = ResNet50_Weights.IMAGENET1K_V2 if pretrained else None
    model = resnet50(weights=weights)

    # Replace the 1000-class ImageNet head with our task-specific head.
    # in_features is always 2048 for ResNet50.
    model.fc = nn.Linear(model.fc.in_features, num_classes)

    return model
