"""CAM from ONNX outputs (no autograd) must equal torch Grad-CAM on the last conv features."""
import numpy as np
import pytest

torch = pytest.importorskip("torch")

from model_common import FC_NPZ_PATH  # noqa: E402
from preprocessing import load_image, preprocess_batch  # noqa: E402


def cam_numpy(features, weight, cls):
    """features (1280,7,7), weight (80,1280) -> ReLU(sum_k W[c,k] A_k), shape (7,7)."""
    return np.maximum(np.tensordot(weight[cls], features, axes=1), 0.0)


def grad_cam_torch(model, x, cls):
    store = {}
    h = model.features.register_forward_hook(lambda m, i, o: store.__setitem__("a", o))
    try:
        logits = model(x)
        a = store["a"]
        g = torch.autograd.grad(logits[0, cls], a)[0]
    finally:
        h.remove()
    weights = g.mean(dim=(2, 3), keepdim=True)  # alpha_k
    return torch.relu((weights * a).sum(1))[0].detach().numpy()


def test_cam_equals_grad_cam(sample_paths, torch_model, ort_session):
    fc = np.load(FC_NPZ_PATH)
    x = preprocess_batch([load_image(p) for p in sample_paths[:5]])
    logits, feats = ort_session.run(["logits", "features"], {"input": x})
    for i in range(len(x)):
        for cls in (int(logits[i].argmax()), int(np.argsort(-logits[i])[1])):
            cam = cam_numpy(feats[i], fc["weight"], cls)
            gc = grad_cam_torch(torch_model, torch.from_numpy(x[i:i + 1]), cls)
            # Grad-CAM alpha_k = W[c,k] / (7*7) for a GAP->Linear head: same map up to scale 1/49.
            assert cam.shape == gc.shape == (7, 7)
            assert np.allclose(gc * 49.0, cam, rtol=1e-3, atol=1e-4), np.abs(gc * 49 - cam).max()
            if cam.std() > 0:
                assert np.corrcoef(cam.ravel(), gc.ravel())[0, 1] > 0.9999
