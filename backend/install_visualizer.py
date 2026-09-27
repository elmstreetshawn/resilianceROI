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

Also judge whether this spot can realistically fit the unit: is there a clear, unobstructed \
patch of wall-adjacent floor space, roughly 3 feet wide, that isn't blocked by a door, window, \
walkway, parked car, stored items, or other equipment?

Respond with ONLY a JSON object, no other text, in exactly this format:
{"x": <left edge, 0-1 fraction of image width>, "y": <top edge, 0-1 fraction of image height>, \
"width": <0-1 fraction of image width>, "height": <0-1 fraction of image height>, \
"fits": <true if there is realistically enough clear space for the unit, false if the best \
spot is too tight, blocked, or crowded>, "fit_reason": "<one short sentence saying what's in \
the way, or confirming the space is clear>"}

The box's height should be noticeably larger than its width (a standing box, not a wide flat \
one), sized realistically relative to other visible objects in the scene (doors, outlets, the \
panel itself) - typically height around 0.25-0.4 of the image height for a room-scale photo."""

ASSESS_PHOTO_PROMPT = """Look at this photo, taken by a customer for a home battery \
installation site survey. Judge it against BOTH of the criteria a real installer needs a \
survey photo to show:
1. panel_visible - is a residential electrical panel, meter, or breaker box clearly visible?
2. space_visible - is there a reasonably clear, unobstructed patch of wall-adjacent floor or \
wall space visible in the frame (roughly 3 feet wide), not blocked by a door, window, \
walkway, parked car, or stored items?

A single good photo can often show both at once - a panel with some of the wall beside it in \
frame, not just a tight crop of the panel alone.

Respond with ONLY a JSON object, no other text:
{"panel_visible": true|false, "space_visible": true|false, "guidance": "<if either is false, \
one specific, actionable sentence telling the customer exactly what to change when retaking \
this photo - e.g. 'Step back a few feet so the wall space next to the panel is in frame' or \
'Point the camera at the gray panel box on the wall, not the yard'. If both are true, a short \
one-sentence confirmation instead, e.g. 'Panel and clear space are both visible.'>"}"""


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



# Ollama's default context window (4096 tokens) is too small for this: a real phone
# photo's vision tokens plus our prompt regularly exceed it (measured: a 2016x2688
# photo + the placement prompt needed 4416 tokens), and Ollama doesn't truncate - it
# returns HTTP 400 and the caller was silently falling back to the default box on
# every photo above a fairly ordinary size. Raised well above any single photo we send.
MODEL_CONTEXT_TOKENS = 8192


def _call_vision_model(image_bytes: bytes, prompt: str) -> dict:
    """Shared Ollama call: one photo + one prompt, JSON mode. Returns the model's
    parsed JSON. Raises on any failure (network, bad JSON) - callers own the fallback,
    since "unavailable" means something different for placement (use a default box)
    than for a yes/no photo check (don't block the customer on an unverified check)."""
    b64 = base64.b64encode(image_bytes).decode()
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "images": [b64],
            "stream": False,
            "format": "json",
            "options": {"num_ctx": MODEL_CONTEXT_TOKENS},
        },
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return json.loads(resp.json()["response"])


def get_placement(image_bytes: bytes) -> dict:
    """
    Asks the local vision model where the battery should go, and whether it actually
    fits there. Returns a dict with x/y/width/height (0-1 fractions), `fits` + a real
    `fit_reason` from the model, and a `source` field ("model" or "default") so the
    caller can be honest with the customer about which one they got - fits defaults to
    True on the default-box fallback since there's no real assessment to report, only
    a guess.
    """
    try:
        box = _call_vision_model(image_bytes, PROMPT)
        if not _valid_box(box):
            raise ValueError(f"model returned an unusable box: {box}")

        fits = bool(box.get("fits", True))
        fit_reason = str(box.get("fit_reason", "") or "")

        box = {k: _clamp01(float(box[k])) for k in ("x", "y", "width", "height")}
        box["width"] = min(box["width"], 1.0 - box["x"])
        box["height"] = min(box["height"], 1.0 - box["y"])
        box = _clamp_size(_apply_real_aspect_ratio(box))
        box["source"] = "model"
        box["fits"] = fits
        box["fit_reason"] = fit_reason
        return box

    except (requests.RequestException, json.JSONDecodeError, ValueError, KeyError) as e:
        print(f"[WARN] Local vision placement failed ({e}) - using default placement")
        return {
            **_clamp_size(_apply_real_aspect_ratio(DEFAULT_BOX)),
            "source": "default",
            "fits": True,
            "fit_reason": "",
        }


def assess_install_photo(image_bytes: bytes) -> dict:
    """
    Judges ANY install-area photo against both real criteria an installer needs - is
    the panel visible, is there clear space near it - in one pass, and asks the model
    for concrete guidance the customer can act on immediately instead of a bare
    pass/fail. Runs on every install-area photo as it's added (not just the first),
    since a customer might get a good combined shot on the first try, or need
    specific direction on the second.

    Fails open: if the local model is unavailable, this does NOT block the customer -
    `checked: False` says so honestly instead of claiming a check that didn't happen.
    """
    try:
        result = _call_vision_model(image_bytes, ASSESS_PHOTO_PROMPT)
        return {
            "panel_visible": bool(result.get("panel_visible")),
            "space_visible": bool(result.get("space_visible")),
            "guidance": str(result.get("guidance", "") or ""),
            "checked": True,
        }
    except (requests.RequestException, json.JSONDecodeError, ValueError, KeyError) as e:
        print(f"[WARN] Photo assessment failed ({e}) - not blocking, marking unverified")
        return {"panel_visible": True, "space_visible": True, "guidance": "", "checked": False}


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
