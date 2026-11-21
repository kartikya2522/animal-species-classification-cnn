"""Median /api/predict latency against the running server (30 requests after 3 warm-ups)."""
import statistics, time, urllib.request, uuid
from pathlib import Path

IMG = Path("frontend/src/fixtures/red-panda.jpg").read_bytes()
URL = "http://127.0.0.1:8000/api/predict"

def once() -> float:
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.jpg\"\r\n"
            f"Content-Type: image/jpeg\r\n\r\n").encode() + IMG + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(URL, body, {"Content-Type": f"multipart/form-data; boundary={b}"})
    t = time.perf_counter()
    urllib.request.urlopen(req).read()
    return (time.perf_counter() - t) * 1000

for _ in range(3):
    once()
ms = [once() for _ in range(30)]
print(f"median {statistics.median(ms):.1f} ms, min {min(ms):.1f}, max {max(ms):.1f}")