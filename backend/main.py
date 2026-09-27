from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from pathlib import Path
from datetime import datetime, timedelta, timezone
import base64
import csv
import io
from bill_analyzer import PowerBillAnalyzer
from weather_outage_correlation import catastrophic_events_with_context
from municipal_permitting import get_permitting_for_city
from PIL import Image, UnidentifiedImageError
import leads_db
import install_visualizer

app = Flask(__name__)
CORS(app)

# All data-file paths below are anchored here, not to the process's cwd - `python
# main.py` from backend/, `python backend/main.py` from the repo root, and an IDE
# "run" button that defaults elsewhere all need to find the same files. Running from
# the wrong directory used to fail silently (zip_risk_index.csv "not found" logged at
# startup, then every request quietly served a zeroed-out default risk with no error).
BACKEND_DIR = Path(__file__).resolve().parent

bill_analyzer = PowerBillAnalyzer()

# Data loading state
_data_loaded = False
_risk_by_zip = {}       # zip_code -> row dict from zip_risk_index.csv
_risk_by_zone = {}      # ercot_zone -> average risk_score/outage_hours, for zips outside our test set
_county_fips_by_zip = {}    # zip_code -> county_fips, from zip_to_county.csv
_events_by_county_fips = {}  # county_fips -> [event dict, ...], from tx_storm_events.csv
_breakdown_by_zip = {}      # zip_code -> [{event_type, ...risk_contribution}, ...], from zip_risk_breakdown.csv
_sensitivity_table = []     # [{event_type, sensitivity_multiplier, ...}, ...], from weather_outage_sensitivity.csv
_DEFAULT_RISK = {
    "risk_score": 50.0, "risk_tier": "MODERATE", "events_per_year": 0,
    "avg_event_severity": 0, "most_common_event_type": "UNKNOWN",
    "estimated_outage_hours_per_year": 0,
    "narrative": "No weather/outage history available for this area yet.",
}


def load_data():
    """
    Load the pre-built zip-level Severe Weather Grid Risk Index.

    This index (zip_risk_index.csv) is a batch-computed artifact, not
    something we recompute per request - regenerate it with:
        python prediction_index.py
    after refreshing ercot_data/ or the NOAA storm events files. See
    prediction_index.py for how it combines real NOAA Storm Events data with
    ERCOT's actual weather->outage sensitivity.
    """
    global _data_loaded, _risk_by_zip, _risk_by_zone

    if _data_loaded:
        return

    leads_db.init_db()

    index_path = BACKEND_DIR / "zip_risk_index.csv"
    if not index_path.exists():
        print(f"[ERROR] {index_path} not found - run `python prediction_index.py` to build it")
        _data_loaded = True
        return

    with open(index_path, "r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    for row in rows:
        _risk_by_zip[row["zip_code"]] = row

    # Zone-level fallback average, for zip codes outside our 240-zip test set
    zone_scores = {}
    for row in rows:
        zone_scores.setdefault(row["ercot_zone"], []).append(row)
    for zone, zone_rows in zone_scores.items():
        n = len(zone_rows)
        _risk_by_zone[zone] = {
            "risk_score": sum(float(r["risk_score"]) for r in zone_rows) / n,
            "risk_tier": "MODERATE",
            "events_per_year": sum(float(r["events_per_year"]) for r in zone_rows) / n,
            "avg_event_severity": sum(float(r["avg_event_severity"]) for r in zone_rows) / n,
            "most_common_event_type": max(
                {r["most_common_event_type"] for r in zone_rows},
                key=lambda t: sum(1 for r in zone_rows if r["most_common_event_type"] == t),
            ),
            "estimated_outage_hours_per_year": sum(float(r["estimated_outage_hours_per_year"]) for r in zone_rows) / n,
            "narrative": f"Estimated from {zone} zone average (no direct data for this zip).",
        }

    print(f"[OK] Loaded risk index for {len(_risk_by_zip)} zips across {len(_risk_by_zone)} zones")

    _load_methodology_data()
    _data_loaded = True


def _load_methodology_data():
    """
    Load the artifacts behind the risk score, for the /methodology endpoint - the
    "show your work" view: which real NOAA storm events fed a zip's score, how much
    each event type is weighted, and each term of the sum that produced risk_score.
    All are batch-computed by prediction_index.py; regenerate them the same way.
    """
    county_path = BACKEND_DIR / "zip_to_county.csv"
    if county_path.exists():
        with open(county_path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                _county_fips_by_zip[row["zip_code"]] = row["county_fips"]

    events_path = BACKEND_DIR / "tx_storm_events.csv"
    if events_path.exists():
        with open(events_path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                _events_by_county_fips.setdefault(row["county_fips"], []).append(row)

    breakdown_path = BACKEND_DIR / "zip_risk_breakdown.csv"
    if breakdown_path.exists():
        with open(breakdown_path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                _breakdown_by_zip.setdefault(row["zip_code"], []).append(row)

    sensitivity_path = BACKEND_DIR / "weather_outage_sensitivity.csv"
    if sensitivity_path.exists():
        with open(sensitivity_path, "r", encoding="utf-8") as f:
            _sensitivity_table.extend(csv.DictReader(f))
        _sensitivity_table.sort(key=lambda r: float(r["sensitivity_multiplier"]), reverse=True)

    print(
        f"[OK] Loaded methodology data: {len(_events_by_county_fips)} counties with storm events, "
        f"{len(_breakdown_by_zip)} zips with score breakdowns, {len(_sensitivity_table)} event-type weights"
    )


def get_zone_for_zip(zip_code: str) -> str:
    """ERCOT zone fallback for zips outside our test set, by ZIP prefix range."""
    try:
        zip_int = int(zip_code[:5])
    except (ValueError, TypeError):
        return "SOUTH"
    if 75000 <= zip_int < 76000:
        return "NORTH"
    if 77000 <= zip_int < 78000:
        return "SOUTH"
    if 78700 <= zip_int < 79000:
        return "WEST"
    if 78000 <= zip_int < 78700:
        return "CENTRAL"
    return "SOUTH"


def get_risk_for_zip(zip_code: str) -> dict:
    """Real per-zip risk if we have it, else the zone average, else a neutral default."""
    load_data()
    if zip_code in _risk_by_zip:
        return _risk_by_zip[zip_code]
    zone = get_zone_for_zip(zip_code)
    if zone in _risk_by_zone:
        return _risk_by_zone[zone]
    return _DEFAULT_RISK

# ============ STAGE 1: Risk Awareness ============

@app.route("/stage1/risk-awareness", methods=["POST"])
def assess_risk():
    """Show user their actual weather/outage risk"""
    data = request.json
    zip_code = data.get("zip_code", "")
    zone = get_zone_for_zip(zip_code)
    risk = get_risk_for_zip(zip_code)

    risk_score = float(risk.get("risk_score", 0))
    events_per_year = float(risk.get("events_per_year", 0))
    should_proceed = (events_per_year >= 2 or risk_score > 40)

    # Personalized message
    if events_per_year >= 5:
        message = (
            f"Your area sees ~{events_per_year:.1f} severe weather events per year. "
            f"This causes significant disruption. A battery backup could be valuable."
        )
    elif events_per_year >= 3:
        message = (
            f"You see a meaningful number of severe weather events (~{events_per_year:.1f}/year). "
            f"While not extreme, they could be costly. Let's see if a battery makes sense."
        )
    elif risk_score > 50:
        message = (
            f"Your grid is frequently stressed. Outages are above average for Texas. "
            f"A battery could protect your home and provide peace of mind."
        )
    else:
        message = (
            f"Your area has moderate weather risk. "
            f"A battery backup might still provide value. Let's analyze your situation."
        )

    return jsonify({
        "zip_code": zip_code,
        "zone": zone,
        "weather_risk_summary": risk.get("narrative", ""),
        # events_per_year is computed over our actual NOAA data span (2021-2026, see
        # prediction_index.py) and scaled to a 5yr-equivalent count here for the frontend.
        "severe_weather_events_5yr": round(events_per_year * 5),
        "risk_score": risk_score,
        "risk_tier": risk.get("risk_tier", "MODERATE"),
        "avg_events_per_year": events_per_year,
        "most_common_event_type": risk.get("most_common_event_type", "UNKNOWN"),
        "should_proceed_to_analysis": should_proceed,
        "personalized_message": message,
    })

# ============ METHODOLOGY ("show your work") ============

@app.route("/methodology/<zip_code>", methods=["GET"])
def methodology(zip_code):
    """
    Every artifact behind that zip's risk score, so it can be inspected rather than
    taken on faith:
      - sensitivity_table: how much each weather type actually moved ERCOT-wide
        forced-outage MW in our outage history (weather_outage_correlation.py)
      - risk_breakdown: this zip's own terms of that sum - one row per event type,
        events/year x avg severity x sensitivity multiplier = that type's
        contribution to raw_risk_score (prediction_index.py)
      - recent_events: actual NOAA Storm Events records for this zip's county
      - saidi_caveat: EIA-861 SAIDI (shown elsewhere in the app) is a systemwide
        average across every customer and cause for the whole year - a customer
        actually caught in an event like Winter Storm Uri's rolling blackouts was
        typically out far longer than that average, because SAIDI dilutes their
        experience across millions of customers who saw little or no outage that
        year. That's why this page exists: the event-level data below is the real
        signal the SAIDI number can't show.
      - catastrophic_events: documented major events (Uri) that predate our ERCOT
        outage window and so couldn't enter the sensitivity model statistically -
        shown with their real, sourced MW impact instead of being silently dropped
        or forced into a model that can't support an n=1 correlation.
    """
    load_data()

    county_fips = _county_fips_by_zip.get(zip_code)
    county_events = _events_by_county_fips.get(county_fips, []) if county_fips else []
    recent_events = sorted(county_events, key=lambda e: e["date"], reverse=True)[:15]

    risk = _risk_by_zip.get(zip_code)

    baseline_daily_mw = float(_sensitivity_table[0]["baseline_daily_mw"]) if _sensitivity_table else 0
    catastrophic_events = catastrophic_events_with_context(baseline_daily_mw)

    return jsonify({
        "zip_code": zip_code,
        "county_name": risk.get("county_name") if risk else None,
        "risk_score": float(risk["risk_score"]) if risk else None,
        "data_covers": (
            "NOAA Storm Events 2021-2026 (event frequency/severity); "
            "ERCOT outage correlation Sept 2025-Sept 2026 (event-type sensitivity weighting)"
        ),
        "saidi_caveat": (
            "The utility SAIDI figure shown elsewhere on this site is a systemwide average "
            "across every customer and outage cause for the whole year - not what any one "
            "customer experienced. A customer actually in a major event's outage rotation "
            "(e.g. Winter Storm Uri, Feb 2021) was often out far longer than that average, "
            "because SAIDI spreads their hours across millions of customers who saw little "
            "or no outage that year. The event-level data below is the real signal behind "
            "this zip's risk score."
        ),
        "sensitivity_table": _sensitivity_table,
        "risk_breakdown": _breakdown_by_zip.get(zip_code, []),
        "county_total_events": len(county_events),
        "recent_events": recent_events,
        "catastrophic_events": catastrophic_events,
        "sources": [
            "NOAA Storm Events Database (ncei.noaa.gov) - real severe weather events by county, 2021-2026",
            "ERCOT Unplanned Resource Outages Report - 364 daily reports, deduped to unique outages",
            "EIA-861 utility reliability filings (SAIDI/SAIFI) - baseline grid fragility by TDU",
            "FERC/NERC Winter Storm Uri joint inquiry final report (Nov 2021) - catastrophic_events figures",
        ],
    })

# ============ LEADS (resumable state - the "come back later" gap) ============

@app.route("/leads", methods=["POST"])
def create_lead():
    """
    Persist a completed lead (plan already picked) so the funnel can hand back a
    resumable link instead of losing everything if the customer leaves before
    finishing the site survey. Not just React state - a real row that outlives
    the browser tab.
    """
    data = request.json or {}
    zip_code = data.get("zip_code", "")
    if not zip_code:
        return jsonify({"error": "zip_code required"}), 400

    lead_id = leads_db.create_lead(
        zip_code=zip_code,
        utility=data.get("utility", ""),
        monthly_kwh=float(data.get("monthly_kwh", 0)),
        reason=data.get("reason", ""),
        choice=data.get("choice", ""),
        customer_name=data.get("customer_name", ""),
        phone=data.get("phone", ""),
        email=data.get("email", ""),
    )
    return jsonify({"lead_id": lead_id})


@app.route("/leads/<lead_id>", methods=["GET"])
def get_lead(lead_id):
    """Restores funnel state for a resumable link (?lead=<id>)."""
    lead = leads_db.get_lead(lead_id)
    if not lead:
        return jsonify({"error": "Lead not found"}), 404
    return jsonify(lead)

# ============ SCHEDULING (choose an install date after photos are submitted) ============

FOLLOW_UP_WINDOWS = [
    {"id": "morning", "label": "Morning (8am-12pm)"},
    {"id": "afternoon", "label": "Afternoon (12pm-5pm)"},
]
FOLLOW_UP_CAPACITY = 3  # request slots per date+window before a follow-up is considered full
FOLLOW_UP_LOOKAHEAD_DAYS = 14  # calendar days to scan for business-day follow-up windows


@app.route("/follow-up-windows", methods=["GET"])
@app.route("/schedule-slots", methods=["GET"])  # backward-compatible alias
def follow_up_windows():
    """
    Preferred sales follow-up windows - weekdays only, starting tomorrow, each window
    capped so a date can't silently overfill. This is a request for outreach, not a
    final install booking; the website is offering a slot for a Base sales specialist
    to reach out and qualify the home.
    """
    slots = []
    d = datetime.now(timezone.utc).date() + timedelta(days=1)
    scanned = 0
    while len(slots) < 8 and scanned < FOLLOW_UP_LOOKAHEAD_DAYS:
        if d.weekday() < 5:  # Mon-Fri
            date_str = d.isoformat()
            for w in FOLLOW_UP_WINDOWS:
                booked = leads_db.count_follow_up_requests(date_str, w["id"])
                if booked < FOLLOW_UP_CAPACITY:
                    slots.append({
                        "date": date_str,
                        "weekday": d.strftime("%A"),
                        "window": w["id"],
                        "window_label": w["label"],
                        "spots_remaining": FOLLOW_UP_CAPACITY - booked,
                    })
        d += timedelta(days=1)
        scanned += 1
    return jsonify({"slots": slots})


@app.route("/leads/<lead_id>/follow-up-request", methods=["POST"])
@app.route("/leads/<lead_id>/schedule", methods=["POST"])  # backward-compatible alias
def follow_up_request_route(lead_id):
    """Submit a preferred sales follow-up time for a qualified customer."""
    data = request.json or {}
    date = data.get("date", "")
    window = data.get("window", "")
    customer_name = str(data.get("customer_name", "") or "").strip()
    phone = str(data.get("phone", "") or "").strip()
    email = str(data.get("email", "") or "").strip()

    if not customer_name or not phone or not email:
        return jsonify({"error": "customer_name, phone, and email are required"}), 400

    if window not in {w["id"] for w in FOLLOW_UP_WINDOWS}:
        return jsonify({"error": f"Invalid window - must be one of {[w['id'] for w in FOLLOW_UP_WINDOWS]}"}), 400
    try:
        parsed = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    if parsed <= datetime.now(timezone.utc).date():
        return jsonify({"error": "date must be in the future"}), 400

    if leads_db.count_follow_up_requests(date, window) >= FOLLOW_UP_CAPACITY:
        return jsonify({"error": "That follow-up window just filled up - pick another"}), 409

    if not leads_db.request_follow_up(lead_id, date, window):
        return jsonify({"error": "Lead not found"}), 404

    leads_db.update_lead_contact(lead_id, customer_name, phone, email)

    window_label = next(w["label"] for w in FOLLOW_UP_WINDOWS if w["id"] == window)
    return jsonify({"lead_id": lead_id, "date": date, "window": window, "window_label": window_label})

# ============ SITE SURVEY (post-submission: install photos + permitting logistics) ============

SITE_SURVEY_DIR = BACKEND_DIR / "site_surveys"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MIN_PHOTO_BYTES = 5_000       # reject empty/near-empty files - not a real photo
MAX_PHOTO_BYTES = 15_000_000  # 15MB
MIN_DIMENSION_PX = 400        # reject thumbnails too small for an installer to actually assess
SURVEY_CATEGORIES = ["install_area", "backyard"]


@app.route("/permitting/<zip_code>", methods=["GET"])
def permitting(zip_code):
    """Real permit requirements for this zip's city - see municipal_permitting.py."""
    load_data()
    risk = _risk_by_zip.get(zip_code)
    city = risk.get("city") if risk else None
    return jsonify({"zip_code": zip_code, "city": city, **get_permitting_for_city(city)})


def _validate_photo(file_storage) -> dict:
    """
    Basic automated checks on one uploaded photo - real validation (file type,
    size, and actual decodable image dimensions via Pillow), not a rubber stamp.
    This is not computer-vision site assessment; it's the same sanity-checking a
    human intake coordinator would do before forwarding photos to an installer.
    """
    data = file_storage.read()
    size = len(data)

    if file_storage.content_type not in ALLOWED_IMAGE_TYPES:
        return {"ok": False, "reason": f"Unsupported file type: {file_storage.content_type}"}
    if size < MIN_PHOTO_BYTES:
        return {"ok": False, "reason": "File too small to be a real photo"}
    if size > MAX_PHOTO_BYTES:
        return {"ok": False, "reason": "File too large (max 15MB)"}

    try:
        Image.open(io.BytesIO(data)).verify()  # cheap structural check; invalidates the handle
        img = Image.open(io.BytesIO(data))     # reopen to actually read it
        width, height = img.size
    except UnidentifiedImageError:
        return {"ok": False, "reason": "Not a readable image file"}

    if width < MIN_DIMENSION_PX or height < MIN_DIMENSION_PX:
        return {"ok": False, "reason": f"Image too small ({width}x{height}px) - retake closer or at higher resolution"}

    return {"ok": True, "width": width, "height": height, "size_bytes": size, "_data": data, "_ext": (img.format or "JPEG").lower()}


@app.route("/site-survey", methods=["POST"])
def site_survey():
    """
    Accepts install-area and backyard photos as multipart form fields, validates
    each one, saves the ones that pass to disk for installer review, and returns
    the real permitting requirements for this address in the same response.
    """
    load_data()
    zip_code = request.form.get("zip_code", "")
    lead_id = request.form.get("lead_id", "")
    if not zip_code:
        return jsonify({"error": "zip_code required"}), 400

    results = {}
    saved_dir = None

    for category in SURVEY_CATEGORIES:
        checked = [_validate_photo(f) for f in request.files.getlist(category)]
        passed = [c for c in checked if c["ok"]]

        if passed:
            if saved_dir is None:
                # Group by lead when we have one (so a resumed submission lands in the
                # same folder as the rest of that lead's record), else by zip+timestamp.
                stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                dir_name = f"lead_{lead_id}" if lead_id else f"{zip_code}_{stamp}"
                saved_dir = SITE_SURVEY_DIR / dir_name
                saved_dir.mkdir(parents=True, exist_ok=True)
            for i, c in enumerate(passed):
                (saved_dir / f"{category}_{i}.{c.pop('_ext')}").write_bytes(c.pop("_data"))

        results[category] = {
            "uploaded": len(checked),
            "passed": len(passed),
            "issues": [c["reason"] for c in checked if not c["ok"]],
            "photos": passed,
        }

    ready = all(results[c]["passed"] >= 1 for c in SURVEY_CATEGORIES)
    if ready and lead_id:
        leads_db.update_lead_status(lead_id, "survey_complete")

    risk = _risk_by_zip.get(zip_code)
    city = risk.get("city") if risk else None

    return jsonify({
        "zip_code": zip_code,
        "lead_id": lead_id or None,
        "ready_for_installer_review": ready,
        "categories": results,
        "saved_to": str(saved_dir) if saved_dir else None,
        "permitting": {"city": city, **get_permitting_for_city(city)},
    })

# ============ INSTALL VISUALIZATION ("see it in your space") ============

PRODUCT_IMAGE_PATH = BACKEND_DIR / "assets" / "base_battery_high_power_isolated.png"


@app.route("/assets/battery-product.png", methods=["GET"])
def battery_product_image():
    """Serves the product PNG directly so the frontend can render it as its own
    draggable/resizable layer over the customer's photo, instead of a flattened
    server-side composite the customer can't adjust."""
    if not PRODUCT_IMAGE_PATH.exists():
        return jsonify({"error": "Product image not configured"}), 404
    return send_file(PRODUCT_IMAGE_PATH, mimetype="image/png")


@app.route("/visualize-install", methods=["POST"])
def visualize_install():
    """
    Finds where the battery should go in the customer's own install-area photo,
    using a local vision model (Ollama + Qwen2.5-VL - no API key, nothing leaves
    this machine) - see install_visualizer.py for how the placement is found and
    corrected to the product's real proportions. Returns the placement only; the
    frontend renders the product image as its own movable/resizable layer on top
    of the photo rather than a flattened image, so the customer can adjust it.
    """
    if "photo" not in request.files:
        return jsonify({"error": "photo required"}), 400

    if not PRODUCT_IMAGE_PATH.exists():
        return jsonify({
            "error": "Product image not configured",
            "hint": f"Place a battery product PNG (ideally transparent background) at {PRODUCT_IMAGE_PATH}",
        }), 503

    photo_bytes = request.files["photo"].read()
    try:
        Image.open(io.BytesIO(photo_bytes)).verify()
    except UnidentifiedImageError:
        return jsonify({"error": "Not a readable image file"}), 400

    placement = install_visualizer.get_placement(photo_bytes)

    return jsonify({
        "placement": placement,
        "product_image_url": "/assets/battery-product.png",
        "product_aspect_ratio": install_visualizer.PRODUCT_ASPECT_RATIO,
    })


@app.route("/check-install-photo", methods=["POST"])
def check_install_photo():
    """
    Same local vision model as /visualize-install, judging any install-area photo
    against both real criteria at once - is the panel visible, is there clear space
    near it - and returning concrete guidance the customer can act on. Run the moment
    each install-area photo is picked, so a customer who photographed the wrong thing
    finds out (and what to do about it) before they submit - not when an installer
    opens the file days later. Informational only: `checked: false` means the local
    model wasn't reachable, and the frontend should not treat that as a failed check.
    """
    if "photo" not in request.files:
        return jsonify({"error": "photo required"}), 400

    photo_bytes = request.files["photo"].read()
    try:
        Image.open(io.BytesIO(photo_bytes)).verify()
    except UnidentifiedImageError:
        return jsonify({"error": "Not a readable image file"}), 400

    return jsonify(install_visualizer.assess_install_photo(photo_bytes))

# ============ STAGE 2: Full Analysis ============

@app.route("/stage2/analyze", methods=["POST"])
def analyze_battery_need():
    """Full analysis: risk + outage-protection value. No ROI/payback - the battery is
    bundled into the subscription, never purchased, so there's no capex to pay back."""
    data = request.json
    zip_code = data.get("zip_code", "")
    monthly_kwh = float(data.get("monthly_kwh", 900))
    average_bill = float(data.get("average_bill", 120))

    return jsonify(_qualify(zip_code, monthly_kwh, average_bill))

# ============ BILL ANALYSIS (Skip Manual Entry) ============

@app.route("/analyze-power-bill", methods=["POST"])
def analyze_power_bill():
    """Upload power bill image, extract usage, return ROI directly"""
    load_data()

    try:
        data = request.json or {}
        image_source = data.get("image", "")
        zip_code = data.get("zip_code", "")

        if not image_source:
            # Try file upload
            if 'file' in request.files:
                file = request.files['file']
                if file:
                    image_source = file.read()
                    image_source = base64.b64encode(image_source).decode('utf-8')
            else:
                return jsonify({"error": "No image provided"}), 400

        if not zip_code:
            return jsonify({"error": "ZIP code required for zone mapping"}), 400

        # Analyze bill image
        bill_data = bill_analyzer.analyze_bill_image(image_source)

        if not bill_analyzer.validate_extraction():
            return jsonify({
                "error": "Could not extract bill data from image",
                "ocr_result": bill_data,
                "hint": "Make sure the bill image is clear and contains usage and amount due"
            }), 400

        # Get extracted values
        monthly_kwh = bill_data.get("monthly_kwh", 900)
        average_bill = bill_data.get("bill_amount", 120)

        result = _qualify(zip_code, monthly_kwh, average_bill)

        return jsonify({
            "extraction": bill_data,
            "extracted_monthly_kwh": monthly_kwh,
            "extracted_bill_amount": average_bill,
            **result,
        })

    except Exception as e:
        print(f"[ERROR] Bill analysis error: {e}")
        return jsonify({"error": str(e)}), 500

# ============ Helpers ============
#
# No ROI/payback math here on purpose: the battery is bundled into Base's
# subscription, never purchased outright, so there's no customer capex to pay
# back. Qualification is about whether backup has real value at this address
# (weather/outage risk) - the fixed-rate savings side of the pitch is priced
# against live PowerToChoose market data, which only the frontend has loaded
# (see frontend/src/lib/data.ts), so it isn't duplicated here.

MIN_QUALIFYING_RISK_SCORE = 30


def calculate_battery_size(monthly_kwh: float) -> float:
    """Recommended capacity = 1x daily consumption"""
    return monthly_kwh / 30


def calculate_outage_protection_value(outage_hours: float, monthly_bill: float) -> float:
    """
    Monthly $ value of the outages a battery would cover - spoilage, hotel nights,
    eating out, lost time - scaled by this address's bill size and its real
    estimated outage hours/year. This is an insurance-style value (what an outage
    would have cost you), not a return on an investment that doesn't exist.
    """
    if outage_hours <= 0:
        return 0.0
    outage_days = outage_hours / 24
    annual_impact = (outage_days / 30) * monthly_bill * 12 * 0.5
    return (annual_impact * 0.95) / 12


def _qualify(zip_code: str, monthly_kwh: float, average_bill: float) -> dict:
    """Shared by /stage2/analyze and /analyze-power-bill."""
    risk = get_risk_for_zip(zip_code)
    risk_score = float(risk.get("risk_score", 0))
    risk_tier = risk.get("risk_tier", "MODERATE")
    outage_hours = float(risk.get("estimated_outage_hours_per_year", 0))

    battery_capacity = calculate_battery_size(monthly_kwh)
    outage_protection_value_monthly = calculate_outage_protection_value(outage_hours, average_bill)

    qualified = risk_score > MIN_QUALIFYING_RISK_SCORE
    confidence = 0.85 if outage_hours > 0 else 0.65
    reason = _generate_reason(qualified, risk_score, outage_protection_value_monthly)

    next_steps = None
    if qualified:
        next_steps = (
            f"[OK] You qualify! A {battery_capacity:.0f}kWh battery is included in your Base "
            f"subscription at no upfront cost. Connect with a Base Power specialist for a custom quote."
        )

    return {
        "qualified": qualified,
        "zip_code": zip_code,
        "risk_score": risk_score,
        "risk_tier": risk_tier,
        "estimated_outage_hours_per_year": outage_hours,
        "recommended_capacity_kwh": battery_capacity,
        "outage_protection_value_monthly": round(outage_protection_value_monthly, 2),
        "outage_protection_value_annual": round(outage_protection_value_monthly * 12, 2),
        "confidence": confidence,
        "qualification_reason": reason,
        "next_steps": next_steps,
    }


def _generate_reason(qualified: bool, risk_score: float, outage_protection_value_monthly: float) -> str:
    """Explain the decision - no ROI/payback language, the battery is never purchased."""
    if qualified:
        if risk_score >= 60:
            return (
                f"High weather/outage risk here ({risk_score:.0f}/100) - backup has real value, "
                f"worth an estimated ${outage_protection_value_monthly:.0f}/mo in avoided outage costs. "
                f"It's included in your subscription at no upfront cost."
            )
        return (
            f"Meaningful outage risk in your area ({risk_score:.0f}/100). A battery adds real "
            f"protection, bundled into your plan at no extra upfront cost."
        )
    return (
        f"Low outage risk in your area ({risk_score:.0f}/100). The fixed-rate energy plan alone "
        f"may be the better fit here - no need to pay for backup you're unlikely to use."
    )

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "1.0"})

@app.route("/data-status", methods=["GET"])
def data_status():
    """Check if the risk index is loaded"""
    load_data()
    return jsonify({
        "risk_index_loaded": len(_risk_by_zip) > 0,
        "zips_covered": len(_risk_by_zip),
        "zones_covered": list(_risk_by_zone.keys()),
    })

if __name__ == "__main__":
    print("=" * 60)
    print("ResilianceROI - Loading data at startup...")
    print("=" * 60)
    load_data()
    print("=" * 60)
    print("Backend ready! Starting Flask server...")
    print("=" * 60)
    app.run(debug=True, port=8000)
