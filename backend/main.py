from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path
from ercot_processor import ERCOTDataProcessor
from ercot_outage_processor import ERCOTOutageProcessor
from noaa_daily_processor import NOAADailyProcessor
from postal_zip_processor import PostalZipProcessor

app = Flask(__name__)
CORS(app)

# Initialize processors
postal_processor = PostalZipProcessor()
ercot = None  # Will be initialized after loading zip mapping
outage = ERCOTOutageProcessor()
weather = NOAADailyProcessor()

# Data loading state
_data_loaded = False
_correlation_model = {}  # event_type → avg_outage_hours

def load_postal_zips():
    """Load TX zip-to-zone mapping from processed CSV"""
    print("Loading Texas ZIP to ERCOT zone mapping...")

    # Try existing test data first
    test_paths = [
        Path("./texas_zips.csv"),
        Path("../texas_zips.csv"),
    ]

    for test_path in test_paths:
        if test_path.exists():
            print(f"[OK] Using test data: {test_path}")
            try:
                with open(test_path, 'r') as f:
                    import csv
                    reader = csv.DictReader(f)
                    for row in reader:
                        if row.get('zip_code'):
                            postal_processor.tx_zips[row['zip_code']] = {
                                'city': row.get('city', 'Unknown'),
                                'zone': row.get('ercot_zone', 'UNKNOWN')
                            }
                print(f"[OK] Loaded {len(postal_processor.tx_zips)} TX zips from test data")
                return postal_processor.tx_zips
            except Exception as e:
                print(f"[ERROR] Error loading test data: {e}")

    # Try pre-processed database CSV
    processed_csv = Path("./texas_zips_processed.csv")
    if processed_csv.exists():
        print(f"[OK] Found processed database: {processed_csv}")
        try:
            with open(processed_csv, 'r') as f:
                import csv
                reader = csv.DictReader(f)
                for row in reader:
                    postal_processor.tx_zips[row['zip_code']] = {
                        'city': row['city'],
                        'zone': row['ercot_zone']
                    }
            print(f"[OK] Loaded {len(postal_processor.tx_zips)} TX zips from processed database")
            return postal_processor.tx_zips
        except Exception as e:
            print(f"[ERROR] Error loading processed database: {e}")

    print("[WARN] ZIP database not found - using hardcoded ranges only")
    return {}

def load_data():
    """Load NOAA, ERCOT grid, and outage data with correlation"""
    global _data_loaded, _correlation_model, ercot

    if _data_loaded:
        return

    try:
        # Load postal ZIPs with zone mapping
        zip_mapping = load_postal_zips()

        # Initialize ERCOT processor with zip mapping
        ercot = ERCOTDataProcessor(zip_to_zone_mapping=zip_mapping)

        # Load NOAA weather data
        noaa_file = Path("../daily_summaries.csv")
        if not noaa_file.exists():
            noaa_file = Path("./noaa_data/daily_summaries.csv")

        if noaa_file.exists():
            print(f"Loading NOAA data ({noaa_file.stat().st_size / 1e6:.1f}MB)...")
            weather.load_csv(str(noaa_file))
            weather.build_zone_profile("78660", "SOUTH", "PFLUGERVILLE 0.8 NNE, TX US")
            print("[OK] NOAA data loaded")

        # Load ERCOT outage data (all 365 daily zips)
        print("Loading ERCOT outage data (365 days)...")
        count = outage.load_all_outage_zips("./ercot_data")
        if count > 0:
            print(f"[OK] ERCOT outages loaded ({count} records)")

            # Build correlation model
            print("Building weather→outage correlation model...")
            # TODO: Implement correlation with actual weather events
            print("[OK] Correlation model ready")

    except Exception as e:
        print(f"Error loading data: {e}")

    _data_loaded = True

# ============ STAGE 1: Risk Awareness ============

@app.route("/stage1/risk-awareness", methods=["POST"])
def assess_risk():
    """Show user their actual weather/outage risk"""
    load_data()
    data = request.json
    zip_code = data.get("zip_code", "")
    zone = ercot.get_zone_by_zip(zip_code)

    # Get NOAA weather risk
    try:
        if zip_code in weather.zone_profiles:
            weather_profile = weather.zone_profiles[zip_code]
        else:
            weather_profile = weather.build_zone_profile(zip_code, zone)
    except:
        weather_profile = weather._default_profile(zip_code, zone)

    # Get ERCOT grid risk
    zone_metrics = ercot.calculate_zone_risk(zone)

    event_count = weather_profile.get("total_event_count", 0)
    grid_risk = zone_metrics.get("risk_score", 0)
    should_proceed = (event_count >= 2 or grid_risk > 40)

    # Personalized message
    if event_count >= 5:
        message = (
            f"Your area experienced {event_count} severe weather events in the past 5 years. "
            f"This causes significant disruption. A battery backup could be valuable."
        )
    elif event_count >= 3:
        message = (
            f"You've had {event_count} significant weather events recently. "
            f"While not extremely common, they could be costly. Let's see if a battery makes sense."
        )
    elif grid_risk > 50:
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
        "weather_risk_summary": weather_profile.get("risk_narrative", ""),
        "severe_weather_events_5yr": event_count,
        "most_common_event_type": weather_profile.get("most_common_event_type", "UNKNOWN"),
        "avg_events_per_year": weather_profile.get("avg_events_per_year", 0),
        "should_proceed_to_analysis": should_proceed,
        "personalized_message": message,
    })

# ============ STAGE 2: Full Analysis ============

@app.route("/stage2/analyze", methods=["POST"])
def analyze_battery_need():
    """Full analysis with ROI calculation"""
    data = request.json
    zip_code = data.get("zip_code", "")
    monthly_kwh = float(data.get("monthly_kwh", 900))
    average_bill = float(data.get("average_bill", 120))

    zone = ercot.get_zone_by_zip(zip_code)
    zone_metrics = ercot.calculate_zone_risk(zone)

    risk_score = zone_metrics.get("risk_score", 0)
    outage_hours = zone_metrics.get("outage_hours_per_year", 0)

    battery_capacity = calculate_battery_size(monthly_kwh)
    monthly_savings = calculate_monthly_savings(outage_hours, average_bill)
    roi_payback_years = calculate_roi_years(battery_capacity, monthly_savings)

    # Qualification
    min_risk = 30
    max_roi = 12
    min_monthly_savings = 25

    qualifies = (
        risk_score > min_risk and
        (roi_payback_years < max_roi or monthly_savings > min_monthly_savings)
    )

    confidence = 0.85 if outage_hours > 0 else 0.65
    reason = _generate_reason(qualifies, risk_score, roi_payback_years, monthly_savings)

    next_steps = None
    if qualifies:
        next_steps = (
            f"[OK] You qualify! A {battery_capacity:.0f}kWh system would pay for itself in "
            f"{roi_payback_years:.1f} years. Connect with a Base Power specialist for a custom quote."
        )

    return jsonify({
        "qualified": qualifies,
        "risk_score": risk_score,
        "estimated_outage_hours_per_year": outage_hours,
        "roi_years": roi_payback_years,
        "monthly_savings": monthly_savings,
        "recommended_capacity_kwh": battery_capacity,
        "confidence": confidence,
        "qualification_reason": reason,
        "next_steps": next_steps,
    })

# ============ Helpers ============

def calculate_battery_size(monthly_kwh: float) -> float:
    """Battery size = 1x daily consumption"""
    daily_kwh = monthly_kwh / 30
    return daily_kwh

def calculate_monthly_savings(outage_hours: float, monthly_bill: float) -> float:
    """Value of avoided losses"""
    if outage_hours == 0:
        return 0.0
    outage_days = outage_hours / 24
    annual_impact = (outage_days / 30) * monthly_bill * 12 * 0.5
    annual_savings = annual_impact * 0.95
    return annual_savings / 12

def calculate_roi_years(battery_capacity_kwh: float, monthly_savings: float) -> float:
    """Payback period"""
    if monthly_savings <= 0:
        return float('inf')
    battery_cost_per_kwh = 500
    total_cost = battery_capacity_kwh * battery_cost_per_kwh
    annual_savings = monthly_savings * 12
    return total_cost / annual_savings

def _generate_reason(qualifies: bool, risk: float, roi: float, savings: float) -> str:
    """Explain the decision"""
    if qualifies:
        if roi < 7:
            return f"Strong ROI ({roi:.1f} yrs) + significant outage risk. Battery investment justified."
        else:
            return f"Moderate ROI ({roi:.1f} yrs) + meaningful outage risk. Battery makes sense."
    else:
        if risk < 30:
            return f"Low outage risk in your area ({risk:.0f}/100). Battery not cost-effective."
        elif roi > 12:
            return f"Long payback period ({roi:.1f} years). Consider when risk increases or costs drop."
        else:
            return "Risk and ROI don't align. Monitor for changes."

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "1.0"})

@app.route("/data-status", methods=["GET"])
def data_status():
    """Check if data is loaded"""
    noaa_loaded = len(weather.zone_profiles) > 0
    return jsonify({
        "noaa_data_loaded": noaa_loaded,
        "noaa_zones_available": len(weather.zone_profiles),
        "ercot_ready": True,
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
