"""
NOAA Storm Events Database processor - real, statewide severe weather events
(tornado, hurricane, ice storm, high wind, hail, etc.) by Texas county.

Replaces the old single-station daily_summaries.csv (which only covered a
handful of Pflugerville rain gauges) with actual event-typed data covering
every Texas county, sourced from:
  https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/

NOAA splits events across two geography types that both need to reach a
county FIPS to join against our zip->county map:
  - CZ_TYPE == 'C' (county-based): convective/localized events - Hail,
    Thunderstorm Wind, Tornado, Flash Flood, Flood, Lightning. CZ_FIPS is a
    county FIPS code directly.
  - CZ_TYPE == 'Z' (NWS forecast zone): every synoptic/widespread event type
    that actually drives system-wide ERCOT stress - Winter Storm, Ice Storm,
    Extreme Cold, Excessive Heat, Hurricane/Tropical Storm, High Wind,
    Drought, Wildfire. In Texas these zones are ~1:1 with counties and
    CZ_NAME carries the county name (sometimes with a directional/coastal
    prefix, e.g. "INLAND HARRIS", "COASTAL HARRIS" both -> Harris County),
    so we match on normalized name instead of FIPS. A handful of exotic
    sub-county zones (island/mountain splits) won't resolve this way and are
    dropped - acceptable for our current zip coverage, see zip_to_county.csv.
"""
import glob
import re
from pathlib import Path

import pandas as pd

ZONE_NAME_PREFIXES = re.compile(
    r"^(COASTAL|INLAND|EASTERN|WESTERN|CENTRAL|NORTHERN|SOUTHERN|UPPER|LOWER)\s+"
)

# Grid-impact severity weight per event type, 0-10 scale. Reflects how likely
# this event type is to cause forced generation/transmission outages, not
# general destructiveness (e.g. Drought is costly but rarely trips equipment).
EVENT_SEVERITY = {
    "Hurricane": 9.0, "Hurricane (Typhoon)": 9.0, "Tropical Storm": 6.5,
    "Tornado": 8.5, "Ice Storm": 8.5, "Blizzard": 8.0, "Winter Storm": 7.0,
    "Storm Surge/Tide": 7.0, "Extreme Cold/Wind Chill": 6.5, "High Wind": 6.0,
    "Flash Flood": 6.0, "Excessive Heat": 5.5, "Winter Weather": 5.0,
    "Heavy Snow": 5.0, "Thunderstorm Wind": 5.0, "Flood": 4.5,
    "Coastal Flood": 4.5, "Wildfire": 4.5, "Cold/Wind Chill": 4.0,
    "Hail": 4.0, "Strong Wind": 4.0, "Funnel Cloud": 3.5, "Dust Storm": 3.5,
    "Frost/Freeze": 3.0, "Heat": 3.0, "Sleet": 3.0, "Heavy Rain": 2.5,
    "Lightning": 2.5, "Drought": 1.5, "Dense Fog": 1.0,
    "Astronomical Low Tide": 0.5, "Rip Current": 0.5,
}
DEFAULT_SEVERITY = 3.0

TOR_SCALE_BONUS = {"EF0": 0, "EF1": 0.5, "EF2": 1.0, "EF3": 1.5, "EF4": 2.0, "EF5": 2.5,
                    "F0": 0, "F1": 0.5, "F2": 1.0, "F3": 1.5, "F4": 2.0, "F5": 2.5}


def _load_county_fips_by_name(crosswalk_file: str) -> dict:
    """normalized county name (no 'COUNTY', no directional prefix) -> 5-digit FIPS, for Texas (state FIPS 48)."""
    cw = pd.read_csv(crosswalk_file, sep="|", dtype=str)
    tx = cw[cw["GEOID_COUNTY_20"].str.startswith("48", na=False)][["GEOID_COUNTY_20", "NAMELSAD_COUNTY_20"]].dropna().drop_duplicates()
    names = tx["NAMELSAD_COUNTY_20"].str.upper().str.replace(" COUNTY", "", regex=False).str.strip()
    return dict(zip(names, tx["GEOID_COUNTY_20"]))


def load_storm_events(
    data_dir: str = "./noaa_storm_events", state: str = "TEXAS",
    crosswalk_file: str = "zcta_county_crosswalk.txt",
) -> pd.DataFrame:
    """Load and combine all StormEvents_details*.csv.gz files, filtered to one state."""
    files = sorted(glob.glob(str(Path(data_dir) / "StormEvents_details*.csv.gz")))
    if not files:
        raise FileNotFoundError(f"No StormEvents_details*.csv.gz files found in {data_dir}")

    frames = [pd.read_csv(f, compression="gzip", low_memory=False) for f in files]
    df = pd.concat(frames, ignore_index=True)
    df = df[df["STATE"] == state].copy()

    is_county = df["CZ_TYPE"] == "C"
    df.loc[is_county, "county_fips"] = (
        df.loc[is_county, "STATE_FIPS"].astype(int).astype(str).str.zfill(2)
        + df.loc[is_county, "CZ_FIPS"].astype(int).astype(str).str.zfill(3)
    )

    is_zone = df["CZ_TYPE"] == "Z"
    fips_by_name = _load_county_fips_by_name(crosswalk_file)
    zone_name = df.loc[is_zone, "CZ_NAME"].str.upper().str.strip()
    zone_name = zone_name.str.replace(ZONE_NAME_PREFIXES, "", regex=True)
    df.loc[is_zone, "county_fips"] = zone_name.map(fips_by_name)

    unresolved_zones = is_zone & df["county_fips"].isna()
    if unresolved_zones.any():
        print(f"[WARN] {unresolved_zones.sum()} zone-based events couldn't be matched to a county "
              f"(exotic sub-county zones, e.g. {sorted(df.loc[unresolved_zones, 'CZ_NAME'].unique())[:5]})")

    df = df.dropna(subset=["county_fips"]).copy()

    df["date"] = pd.to_datetime(df["BEGIN_DATE_TIME"], format="%d-%b-%y %H:%M:%S", errors="coerce")
    df = df.dropna(subset=["date"])

    df["severity_score"] = df["EVENT_TYPE"].map(EVENT_SEVERITY).fillna(DEFAULT_SEVERITY)
    tor_bonus = df["TOR_F_SCALE"].map(TOR_SCALE_BONUS).fillna(0)
    df["severity_score"] = (df["severity_score"] + tor_bonus).clip(upper=10.0)

    return df[[
        "date", "county_fips", "CZ_NAME", "EVENT_TYPE", "severity_score",
        "MAGNITUDE", "MAGNITUDE_TYPE", "TOR_F_SCALE", "DAMAGE_PROPERTY", "DEATHS_DIRECT", "INJURIES_DIRECT",
    ]].rename(columns={
        "CZ_NAME": "county_name", "EVENT_TYPE": "event_type", "MAGNITUDE": "magnitude",
        "MAGNITUDE_TYPE": "magnitude_type", "TOR_F_SCALE": "tor_scale", "DAMAGE_PROPERTY": "damage_property",
        "DEATHS_DIRECT": "deaths", "INJURIES_DIRECT": "injuries",
    }).sort_values("date").reset_index(drop=True)


if __name__ == "__main__":
    events = load_storm_events()
    out = "tx_storm_events.csv"
    events.to_csv(out, index=False)
    print(f"[OK] {len(events)} Texas county-level storm events ({events['date'].min().date()} to {events['date'].max().date()}) -> {out}")
    print(events["event_type"].value_counts().head(10))
