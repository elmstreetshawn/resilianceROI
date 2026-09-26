"""
"See it in your space" - composites a battery product photo onto the
customer's own install-area photo, at a placement a local vision model
picked by looking at the room.

Runs entirely locally via Ollama (no API key, no per-request cost, no photo
ever leaves this machine) - the vision model's job is narrow: look at the
photo and return a bounding box for where a floor-standing unit would
realistically sit. The actual compositing is deterministic PIL work, not
part of what the model does. This is NOT photorealistic AR (no shadow/
lighting matching) - it's a "roughly here, roughly this size" preview, the
same category Amazon shipped before they went full-AR.
"""
import base64
import json
import re

import requests
from PIL import Image

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5vl:7b"
REQUEST_TIMEOUT = 60

# width / height of the real product (30.68" x 35.9"). In testing, the model picks a
# plausible floor location and scale but is unreliable at matching this ratio even with
# explicit prompting (it tends toward short, wide boxes) - so the model's output is used
# for location/scale only, and this ratio is enforced deterministically afterward.
PRODUCT_ASPECT_RATIO = 30.68 / 35.9

# Fallback placement (fraction of image width/height) if the model is unavailable or
# returns something unusable - bottom-right area, sized to the unit's real ~0.85
# width:height ratio (30.68" x 35.9", a squat cube, not a tall narrow box), so the
# feature degrades to a plausible placement instead of failing outright.
DEFAULT_BOX = {"x": 0.60, "y": 0.48, "width": 0.26, "height": 0.30}

PROMPT = """You are helping place a floor-standing home battery unit in this photo of an \
electrical panel / install area. The unit is 30.68 inches wide, 22 inches deep, and 35.9 \
inches tall - about waist height, roughly as wide as it is tall (width is about 85% of height).

Find the best wall-adjacent floor spot near the electrical panel with visible clearance, \
avoiding doors, windows, walkways, and existing equipment. The unit stands upright against \
the wall - in the photo this looks like a box roughly as tall as it is wide, NOT a short \
wide box lying along the floor.

Respond with ONLY a JSON object, no other text, in exactly this format:
{"x": <left edge, 0-1 fraction of image width>, "y": <top edge, 0-1 fraction of image height>, \
"width": <0-1 fraction of image width>, "height": <0-1 fraction of image height>}

The box's height should be noticeably larger than its width (a standing box, not a wide flat \
one), sized realistically relative to other visible objects in the scene (doors, outlets, the \
panel itself) - typically height around 0.25-0.4 of the image height for a room-scale photo."""


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _valid_box(box: dict) -> bool:
    try:
        return all(k in box for k in ("x", "y", "width", "height")) and box["width"] > 0.02 and box["height"] > 0.02
    except (TypeError, KeyError):
        return False


# A battery taller than this fraction of the photo would mean it's implausibly close to
# the camera - caps runaway sizes (e.g. the model's width carried over from a bad wide/flat
# guess, which _apply_real_aspect_ratio would otherwise blow up further to fix the ratio).
MAX_HEIGHT_FRACTION = 0.45


def _clamp_size(box: dict) -> dict:
    if box["height"] <= MAX_HEIGHT_FRACTION:
        return box
    scale = MAX_HEIGHT_FRACTION / box["height"]
    floor_y = box["y"] + box["height"]
    center_x = box["x"] + box["width"] / 2
    new_width = box["width"] * scale
    new_height = box["height"] * scale
    return {"x": center_x - new_width / 2, "y": floor_y - new_height, "width": new_width, "height": new_height}


def _apply_real_aspect_ratio(box: dict) -> dict:
    """Keeps the model's chosen width and floor line (where the unit's base sits), but
    recomputes height from the real product's width:height ratio, so the silhouette
    matches the actual battery instead of whatever shape the model guessed."""
    corrected = dict(box)
    floor_y = box["y"] + box["height"]
    corrected["height"] = corrected["width"] / PRODUCT_ASPECT_RATIO
    corrected["y"] = floor_y - corrected["height"]

    if corrected["y"] < 0:
        # Full height would poke above the image top - shrink in place instead.
        scale = floor_y / corrected["height"] if corrected["height"] else 1
        corrected["width"] *= scale
        corrected["height"] = floor_y
        corrected["y"] = 0.0

    return corrected


def get_placement(image_bytes: bytes) -> dict:
    """
    Asks the local vision model where the battery should go. Returns a dict with
    x/y/width/height (0-1 fractions) plus a `source` field ("model" or "default")
    so the caller can be honest with the customer about which one they got.
    """
    try:
        b64 = base64.b64encode(image_bytes).decode()
        resp = requests.post(
            OLLAMA_URL,
            json={"model": MODEL, "prompt": PROMPT, "images": [b64], "stream": False, "format": "json"},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        raw = resp.json()["response"]

        box = json.loads(raw)
        if not _valid_box(box):
            raise ValueError(f"model returned an unusable box: {box}")

        box = {k: _clamp01(float(box[k])) for k in ("x", "y", "width", "height")}
        box["width"] = min(box["width"], 1.0 - box["x"])
        box["height"] = min(box["height"], 1.0 - box["y"])
        box = _clamp_size(_apply_real_aspect_ratio(box))
        box["source"] = "model"
        return box

    except (requests.RequestException, json.JSONDecodeError, ValueError, KeyError) as e:
        print(f"[WARN] Local vision placement failed ({e}) - using default placement")
        return {**_clamp_size(_apply_real_aspect_ratio(DEFAULT_BOX)), "source": "default"}


def composite(photo: Image.Image, product: Image.Image, box: dict) -> Image.Image:
    """Pastes the product image (alpha-composited) into the photo at the given box."""
    width, height = photo.size
    x = int(box["x"] * width)
    y = int(box["y"] * height)
    w = max(1, int(box["width"] * width))
    h = max(1, int(box["height"] * height))

    resized = product.convert("RGBA").resize((w, h), Image.LANCZOS)
    result = photo.convert("RGBA")
    result.paste(resized, (x, y), resized)
    return result.convert("RGB")
