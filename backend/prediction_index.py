"""
Builds the zip-level Severe Weather Grid Risk Index - the core prediction
output of the project.

For each zip code:
  1. Look up its county (zip_county_mapper.py)
  2. Pull that county's real NOAA severe-weather event history (noaa_storm_events_processor.py)
  3. Weight each event type by how strongly it actually drove ERCOT-wide
     forced-outage MW in our outage history (weather_outage_correlation.py)
  4. Scale by that zip's utility's baseline distribution-grid reliability
     (zip_utility_mapper.py + EIA-861 SAIDI), since ERCOT's own outage data
     has no location and can't tell Oncor's grid from CenterPoint's
  5. Sum into a single risk score, then rank all zips against each other

Neither ERCOT outage reports nor EIA-861 give a location finer than "this
utility's whole territory" - so this does NOT claim a specific outage
duration/MW at a specific address (see weather_outage_correlation.py
docstring). What it produces is a defensible relative ranking: "this zip's
weather exposure, run through how reactive the grid actually is to each
weather type and how reliable its utility's distribution grid normally is,
is higher/lower than that zip's."
"""
from pathlib import Path

import pandas as pd

from zip_county_mapper import build_zip_to_county
from zip_utility_mapper import build_zip_to_utility
from noaa_storm_events_processor import load_storm_events
from weather_outage_correlation import compute_sensitivity

WEATHER_RELATED_OUTAGE_TYPES = ["Forced", "Forced Extension", "Unavoidable Extension"]
UTILITY_RELIABILITY_FILE = "../frontend/public/data/utility_reliability.csv"


def _load_utility_reliability_factor(reliability_file: str) -> pd.Series:
    """
    utility -> baseline distribution-grid fragility factor, centered at 1.0.

    Uses saidi_minutes_no_major_events (routine outage-minutes per customer/year,
    major storm days excluded) rather than raw saidi_minutes - major-event
    minutes are exactly what the weather-sensitivity term above already
    covers, so including them here would double-count storms.
    """
    df = pd.read_csv(reliability_file)
    baseline = df.groupby("utility")["saidi_minutes_no_major_events"].mean()
    return baseline / baseline.mean()


def _median_weather_outage_duration_hours(outages_file: str) -> float:
    """Typical single-outage duration for weather/equipment-driven trips - median, not mean,
    since a handful of multi-month outages skew the mean 10x above what a storm-triggered
    trip usually looks like."""
    df = pd.read_csv(outages_file)
    w = df[df["outage_type"].isin(WEATHER_RELATED_OUTAGE_TYPES) & (df["status"] == "completed")]
    return float(w["duration_hours"].median())


def build_prediction_index(
    zips_file: str = "texas_zips.csv",
    crosswalk_file: str = "zcta_county_crosswalk.txt",
    storm_events_dir: str = "./noaa_storm_events",
    outages_file: str = "ercot_outages_year.csv",
    utility_reliability_file: str = UTILITY_RELIABILITY_FILE,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (index, breakdown) - one row per zip, and one row per (zip, event_type) term."""
    zip_county = build_zip_to_county(zips_file, crosswalk_file)
    zip_utility = build_zip_to_utility(zips_file)
    events = load_storm_events(storm_events_dir, crosswalk_file=crosswalk_file)
    sensitivity = compute_sensitivity(outages_file, storm_events_dir).set_index("event_type")
    utility_factor = _load_utility_reliability_factor(utility_reliability_file)

    # Derived from the actual event data span, not hardcoded - so adding more years of
    # NOAA history (e.g. to include Winter Storm Uri, Feb 2021) doesn't silently inflate
    # events_per_year by counting more years of events over the same fixed denominator.
    years_of_data = (events["date"].max() - events["date"].min()).days / 365.25
    print(f"Event history spans {years_of_data:.1f} years ({events['date'].min().date()} to {events['date'].max().date()})")

    # events already filtered to Texas; join gives one row per (zip, event)
    ev = events.merge(zip_county[["zip_code", "county_fips"]], on="county_fips", how="inner")

    rows = []
    breakdown_rows = []  # every (zip, event_type) term that sums into raw_risk_score - see zip_risk_breakdown.csv
    for zip_code, grp in ev.groupby("zip_code"):
        by_type = grp.groupby("event_type").agg(
            event_count=("date", "count"),
            avg_severity=("severity_score", "mean"),
        )
        by_type = by_type.join(sensitivity[["sensitivity_multiplier"]], how="left")
        by_type["sensitivity_multiplier"] = by_type["sensitivity_multiplier"].fillna(1.0)
        by_type["events_per_year"] = by_type["event_count"] / years_of_data
        by_type["risk_contribution"] = (
            by_type["events_per_year"] * by_type["avg_severity"] * by_type["sensitivity_multiplier"]
        )

        for event_type, r in by_type.iterrows():
            breakdown_rows.append({
                "zip_code": zip_code,
                "event_type": event_type,
                "event_count": int(r["event_count"]),
                "events_per_year": round(r["events_per_year"], 2),
                "avg_severity": round(r["avg_severity"], 2),
                "sensitivity_multiplier": round(r["sensitivity_multiplier"], 3),
                "risk_contribution": round(r["risk_contribution"], 3),
            })

        top_types = by_type.sort_values("risk_contribution", ascending=False)
        most_common = by_type["event_count"].idxmax()

        utility = zip_utility.loc[zip_utility["zip_code"] == zip_code, "utility"]
        utility = utility.iloc[0] if len(utility) and pd.notna(utility.iloc[0]) else None
        reliability_factor = utility_factor.get(utility, 1.0) if utility else 1.0

        weather_score = by_type["risk_contribution"].sum()

        rows.append({
            "zip_code": zip_code,
            "total_events": int(grp.shape[0]),
            "events_per_year": round(grp.shape[0] / years_of_data, 2),
            "avg_event_severity": round(grp["severity_score"].mean(), 2),
            "most_common_event_type": most_common,
            "top_risk_event_type": top_types.index[0],
            "utility": utility or "UNKNOWN",
            "utility_reliability_factor": round(reliability_factor, 3),
            "raw_risk_score": round(weather_score * reliability_factor, 3),
        })

    index = pd.DataFrame(rows)

    # 0-100 relative scale, so it can qualify/rank leads without carrying units
    lo, hi = index["raw_risk_score"].min(), index["raw_risk_score"].max()
    index["risk_score"] = ((index["raw_risk_score"] - lo) / (hi - lo) * 100).round(1) if hi > lo else 50.0

    # Rank first, then cut - qcut on the raw score fails whenever >25% of zips tie at
    # the same value (e.g. many share the statewide-max after a catastrophic event
    # pushes several counties to the ceiling), since it can't find 4 distinct bin edges.
    index["risk_tier"] = pd.qcut(
        index["risk_score"].rank(method="first"), q=4,
        labels=["LOW", "MODERATE", "HIGH", "SEVERE"],
    )

    index = index.merge(zip_county[["zip_code", "city", "ercot_zone", "county_name"]], on="zip_code", how="left")

    # Estimated hours/year of elevated outage risk = local event frequency x the typical
    # (median) duration of a weather-driven ERCOT outage, statewide. Framed as an estimate,
    # not a location-specific measurement - see module docstring.
    median_duration = _median_weather_outage_duration_hours(outages_file)
    index["estimated_outage_hours_per_year"] = (index["events_per_year"] * median_duration).round(1)

    index["narrative"] = index.apply(_narrative, axis=1)

    column_order = [
        "zip_code", "city", "county_name", "ercot_zone", "utility", "risk_score", "risk_tier",
        "events_per_year", "avg_event_severity", "most_common_event_type", "top_risk_event_type",
        "estimated_outage_hours_per_year", "utility_reliability_factor",
        "total_events", "raw_risk_score", "narrative",
    ]
    index = index[column_order].sort_values("risk_score", ascending=False).reset_index(drop=True)

    breakdown = pd.DataFrame(breakdown_rows).sort_values(
        ["zip_code", "risk_contribution"], ascending=[True, False]
    ).reset_index(drop=True)

    return index, breakdown


def _narrative(row) -> str:
    reliability_note = (
        "worse-than-average" if row["utility_reliability_factor"] > 1.1
        else "better-than-average" if row["utility_reliability_factor"] < 0.9
        else "typical"
    )
    return (
        f"{row['city']} ({row['county_name']}) sees ~{row['events_per_year']:.1f} severe weather "
        f"events/year, most commonly {row['most_common_event_type'].lower()}. "
        f"{row['top_risk_event_type']} carries the most grid-outage risk here historically. "
        f"{row['utility']} has {reliability_note} baseline grid reliability for Texas. "
        f"Risk tier: {row['risk_tier']}."
    )


if __name__ == "__main__":
    index, breakdown = build_prediction_index()

    index.to_csv("zip_risk_index.csv", index=False)
    print(f"\n[OK] Built risk index for {len(index)} zips -> zip_risk_index.csv")
    print(index["risk_tier"].value_counts())
    print()
    print(index.head(10)[["zip_code", "city", "risk_score", "risk_tier", "most_common_event_type"]].to_string(index=False))

    breakdown.to_csv("zip_risk_breakdown.csv", index=False)
    print(f"\n[OK] Wrote per-(zip, event type) risk contribution terms ({len(breakdown)} rows) -> zip_risk_breakdown.csv")
