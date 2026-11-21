"""PyTorch vs ONNX (FP32) parity on test images, incl. features output."""
import numpy as np
import pytest

torch = pytest.importorskip("torch")

from preprocessing import load_image, preprocess_batch  # noqa: E402


@pytest.fixture(scope="module")
def outputs(sample_paths, torch_model, ort_session):
    x = preprocess_batch([load_image(p) for p in sample_paths])
    with torch.no_grad():
        t_logits = torch_model(torch.from_numpy(x)).numpy()
    o_logits, o_feats = ort_session.run(["logits", "features"], {"input": x})
    return x, t_logits, o_logits, o_feats


def test_io_signature(ort_session):
    ins = ort_session.get_inputs()
    outs = {o.name: o.shape for o in ort_session.get_outputs()}
    assert [i.name for i in ins] == ["input"]
    assert ins[0].shape[1:] == [3, 224, 224] and isinstance(ins[0].shape[0], str)
    assert outs["logits"][1:] == [80]
    assert outs["features"][1:] == [1280, 7, 7]


def test_logits_parity(outputs):
    _, t, o, _ = outputs
    assert t.shape == o.shape == (50, 80)
    diff = np.abs(t - o).max()
    print(f"max abs logit diff = {diff:.3e}")
    assert diff < 1e-4
    assert (t.argmax(1) == o.argmax(1)).all()


def test_features_reproduce_logits(outputs):
    """logits == fc(GAP(features)) using the exported fc weights."""
    from model_common import FC_NPZ_PATH
    _, _, o_logits, feats = outputs
    fc = np.load(FC_NPZ_PATH)
    recon = np.einsum("nk,ck->nc", feats.mean(axis=(2, 3)), fc["weight"]) + fc["bias"]  # einsum: avoids spurious BLAS FP warnings on macOS/numpy 2.0
    assert np.abs(recon - o_logits).max() < 1e-4


def test_dynamic_batch(ort_session, sample_paths):
    x = preprocess_batch([load_image(p) for p in sample_paths[:3]])
    batched = ort_session.run(["logits"], {"input": x})[0]
    single = np.concatenate([ort_session.run(["logits"], {"input": x[i:i + 1]})[0] for i in range(3)])
    assert np.abs(batched - single).max() < 1e-4


def test_fc_json_matches_npz():
    import json
    from model_common import FC_JSON_PATH, FC_NPZ_PATH
    j = json.loads(FC_JSON_PATH.read_text())
    fc = np.load(FC_NPZ_PATH)
    w = np.asarray(j["weight"], dtype=np.float32).reshape(j["shape"])
    assert np.array_equal(w, fc["weight"])
    assert np.array_equal(np.asarray(j["bias"], dtype=np.float32), fc["bias"])


def test_classes_json():
    from model_common import class_list, load_classes
    classes = load_classes()
    assert len(classes) == 80 and classes == class_list("test") == class_list("train")
    assert classes[0] == "Bear" and classes[-1] == "Zebra"
