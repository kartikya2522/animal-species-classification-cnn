from __future__ import annotations

import numpy as np

from app.services import cam


def test_compute_cam_is_relu_weighted_sum():
    rng = np.random.default_rng(0)
    feats = rng.random((8, 7, 7), dtype=np.float32)
    w = rng.standard_normal((3, 8)).astype(np.float32)
    got = cam.compute_cam(feats, w, 1)
    ref = np.maximum((w[1][:, None, None] * feats).sum(0), 0)
    assert got.shape == (7, 7) and np.allclose(got, ref, atol=1e-5)


def test_normalize_and_constant_map():
    assert np.allclose(cam.normalize(np.zeros((7, 7))), 0)
    n = cam.normalize(np.arange(49, dtype=np.float32).reshape(7, 7))
    assert n.min() == 0 and n.max() == 1


def test_upsample_shape_and_range():
    up = cam.upsample(cam.normalize(np.random.default_rng(1).random((7, 7)).astype(np.float32)), (300, 200))
    assert up.shape == (200, 300) and up.min() >= 0 and up.max() <= 1


def test_colormaps_endpoints():
    jet = cam.colorize(np.array([[0.0, 1.0]]), "jet")
    assert jet[0, 0].tolist() == [0, 0, 128] and jet[0, 1].tolist() == [128, 0, 0]
    amber = cam.colorize(np.array([[0.0, 1.0]]), "amber")
    assert amber[0, 0].tolist() == [0x0F, 0x1F, 0x17]


def test_fit_within():
    assert cam.fit_within((2000, 1000), 1024) == (1024, 512)
    assert cam.fit_within((224, 224), 1024) == (224, 224)
