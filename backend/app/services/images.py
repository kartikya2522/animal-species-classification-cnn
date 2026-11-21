"""Upload decoding/validation: format is checked by decoding, never by the
client-supplied content type. EXIF orientation is applied, output is RGB."""
from __future__ import annotations

import io
import warnings
from typing import Tuple

from PIL import Image, ImageOps, UnidentifiedImageError

ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


class ImageValidationError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def decode_image(data: bytes, max_pixels: int) -> Tuple[Image.Image, str]:
    """bytes -> (RGB PIL image with EXIF orientation applied, format name).

    Raises ImageValidationError: 422 for empty/undecodable/truncated data or
    images over the pixel limit, 415 for decodable but unsupported formats.
    """
    if not data:
        raise ImageValidationError(422, "Uploaded file is empty.")
    try:
        with warnings.catch_warnings():
            # Pillow warns (DecompressionBombWarning) before raising; we enforce our own limit.
            warnings.simplefilter("ignore", Image.DecompressionBombWarning)
            img = Image.open(io.BytesIO(data))
            fmt = img.format or ""
            if fmt not in ALLOWED_FORMATS:
                raise ImageValidationError(
                    415,
                    f"Unsupported image format {fmt or 'unknown'!r}. Upload a JPEG, PNG or WebP image.",
                )
            w, h = img.size
            if w * h > max_pixels:
                raise ImageValidationError(
                    422, f"Image is too large ({w}x{h} px); the limit is {max_pixels:,} pixels."
                )
            img.load()  # force full decode: catches truncated/corrupt files
    except ImageValidationError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError):
        raise ImageValidationError(
            422, "Could not decode the uploaded file as an image. Upload a JPEG, PNG or WebP image."
        )
    except (OSError, SyntaxError, ValueError) as exc:
        raise ImageValidationError(422, f"The image file is corrupt or truncated ({exc}).")

    try:
        img = ImageOps.exif_transpose(img)
    except Exception:  # malformed EXIF must not fail the request; keep stored orientation
        pass
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img, fmt
