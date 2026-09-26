"""
Correlates statewide severe-weather days (NOAA Storm Events) with statewide
ERCOT forced-outage volume (aggregate_ercot.py output), to learn how much
extra outage MW each event type actually drives.

ERCOT outage reports don't say where a resource is, so this can't be done
per-zone/per-county - it's a system-wide signal: "on days Texas sees a
tornado somewhere, system-wide new forced-outage MW runs Nx above baseline."
That statewide multiplier is then applied per-zip in prediction_index.py,
weighted by how often that zip's own county sees each event type.
"""
from pathlib import Path

import pandas as pd

from noaa_storm_events_processor import load_storm_events

# Only unplanned, likely weather/equipment-driven outage types - excludes
# scheduled "Maintenance Level" outages, which aren't storm-reactive.
WEATHER_RELATED_OUTAGE_TYPES = ["Forced", "Forced Extension", "Unavoidable Extension"]

# A new outage can lag the triggering weather by a day (e.g. overnight ice
# accretion trips a unit the next morning) - count MW on the event day and
# the day after as "caused by" that event.
RESPONSE_WINDOW_DAYS = 1

# Empirical-Bayes shrinkage: event types with few sample days (e.g. one
# Blizzard day) produce wild, unreliable multipliers. Blend toward the
# neutral 1.0x baseline with weight n/(n+SHRINKAGE_K) - a type with
# SHRINKAGE_K event days gets pulled halfway back to neutral.
SHRINKAGE_K = 10

# Documented catastrophic ERCOT events that predate our outage report window
# (backend/ercot_data/ only covers ~Sep 2025 - Sep 2026) and so can't enter the
# statistical model above - a "correlation" built from a single event isn't a
# correlation, and averaging one black-swan day into the sensitivity table
# would silently overstate every OTHER "Extreme Cold" day while understating
# just how extreme Uri itself was. Shown separately instead, so the gap is
# visible rather than hidden inside a misleadingly precise-looking number.
CATASTROPHIC_EVENTS = [
    {
        "name": "Winter Storm Uri",
        "date_range": "2021-02-13 to 2021-02-19",
        "event_types": ["Extreme Cold/Wind Chill", "Winter Storm", "Ice Storm"],
        "documented_impact_mw": 34000,
        "impact_description": (
            "34,000 MW of ERCOT generation forced offline at peak, sustained over 2+ "
            "days; ERCOT ordered 20,000 MW of rolling blackouts - the largest manual "
            "load-shed event in U.S. history."
        ),
        "source": (
            "FERC/NERC \"The February 2021 Cold Weather Outages in Texas and the South "
            "Central United States\" joint inquiry final report (Nov 2021)"
        ),
    },
]


def catastrophic_events_with_context(baseline_daily_mw: float) -> list[dict]:
    """CATASTROPHIC_EVENTS with each event's documented MW impact expressed as a
    multiple of our own model's baseline, so it's clear how far outside the
    sensitivity table above these events actually are."""
    out = []
    for event in CATASTROPHIC_EVENTS:
        row = dict(event)
        row["vs_model_baseline"] = (
            round(event["documented_impact_mw"] / baseline_daily_mw, 1) if baseline_daily_mw else None
        )
        out.append(row)
    return out


def build_daily_outage_series(outages_file: str = "ercot_outages_year.csv") -> pd.Series:
    df = pd.read_csv(outages_file, parse_dates=["outage_start"])
    df = df[df["outage_type"].isin(WEATHER_RELATED_OUTAGE_TYPES)]

    daily = df.groupby(df["outage_start"].dt.normalize())["mw_reduction"].sum()
    full_range = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    return daily.reindex(full_range, fill_value=0.0)


def compute_sensitivity(
    outages_file: str = "ercot_outages_year.csv",
    storm_events_dir: str = "./noaa_storm_events",
) -> pd.DataFrame:
    daily_mw = build_daily_outage_series(outages_file)
    baseline = daily_mw.mean()

    events = load_storm_events(storm_events_dir)
    events = events[(events["date"] >= daily_mw.index.min()) & (events["date"] <= daily_mw.index.max())]

    rows = []
    for event_type, grp in events.groupby("event_type"):
        event_days = pd.to_datetime(grp["date"].dt.normalize().unique())

        response_days = set()
        for d in event_days:
            for offset in range(RESPONSE_WINDOW_DAYS + 1):
                response_days.add(d + pd.Timedelta(days=offset))
        response_days = pd.DatetimeIndex(sorted(response_days)).intersection(daily_mw.index)

        if len(response_days) == 0:
            continue

        event_day_avg = daily_mw.loc[response_days].mean()
        n = len(event_days)
        raw_multiplier = event_day_avg / baseline if baseline else 0
        shrinkage_weight = n / (n + SHRINKAGE_K)
        shrunk_multiplier = shrinkage_weight * raw_multiplier + (1 - shrinkage_weight) * 1.0

        rows.append({
            "event_type": event_type,
            "n_event_days": n,
            "avg_event_severity": grp["severity_score"].mean(),
            "baseline_daily_mw": round(baseline, 1),
            "event_response_avg_mw": round(event_day_avg, 1),
            "sensitivity_multiplier_raw": round(raw_multiplier, 3),
            "sensitivity_multiplier": round(shrunk_multiplier, 3),
        })

    result = pd.DataFrame(rows).sort_values("sensitivity_multiplier", ascending=False).reset_index(drop=True)
    return result


if __name__ == "__main__":
    sensitivity = compute_sensitivity()
    out = "weather_outage_sensitivity.csv"
    sensitivity.to_csv(out, index=False)
    print(f"[OK] Sensitivity model for {len(sensitivity)} event types -> {out}")
    print(sensitivity.to_string(index=False))
