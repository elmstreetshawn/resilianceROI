"""
Maps our Texas zip list (texas_zips.csv) to county FIPS codes, so NOAA Storm
Events (which locates events by county, not zip) can be joined to a zip code.

Source: Census Bureau 2020 ZCTA5-to-county relationship file. Not every ZIP
has a matching ZCTA (PO-box-only / unique ZIPs like 75242 don't) - for those
we fall back to the county of another zip in the same city.
"""
from pathlib import Path

import pandas as pd

CROSSWALK_FILE = "zcta_county_crosswalk.txt"
ZIPS_FILE = "texas_zips.csv"


def build_zip_to_county(zips_file: str = ZIPS_FILE, crosswalk_file: str = CROSSWALK_FILE) -> pd.DataFrame:
    """
    Returns a DataFrame: zip_code, city, ercot_zone, county_fips, county_name
    """
    if not Path(crosswalk_file).exists():
        raise FileNotFoundError(
            f"{crosswalk_file} not found - download it from "
            "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt"
        )

    cw = pd.read_csv(crosswalk_file, sep="|", dtype=str)
    cw["GEOID_ZCTA5_20"] = cw["GEOID_ZCTA5_20"].str.strip()
    cw["AREALAND_PART"] = pd.to_numeric(cw["AREALAND_PART"], errors="coerce").fillna(0)

    zips = pd.read_csv(zips_file, dtype={"zip_code": str}).drop_duplicates("zip_code")
    zips["zip_code"] = zips["zip_code"].str.zfill(5)

    matched = cw[cw["GEOID_ZCTA5_20"].isin(zips["zip_code"])]
    # A ZCTA can straddle multiple counties - keep the one with the most land area
    primary_idx = matched.groupby("GEOID_ZCTA5_20")["AREALAND_PART"].idxmax()
    primary = matched.loc[primary_idx, ["GEOID_ZCTA5_20", "GEOID_COUNTY_20", "NAMELSAD_COUNTY_20"]]
    primary = primary.rename(columns={
        "GEOID_ZCTA5_20": "zip_code",
        "GEOID_COUNTY_20": "county_fips",
        "NAMELSAD_COUNTY_20": "county_name",
    })

    result = zips.merge(primary, on="zip_code", how="left")

    # Fallback for zips with no ZCTA (PO-box/unique zips): borrow the most
    # common county among other zips sharing the same city.
    city_county = (
        result.dropna(subset=["county_fips"])
        .groupby("city")[["county_fips", "county_name"]]
        .agg(lambda s: s.value_counts().index[0])
    )

    missing = result["county_fips"].isna()
    if missing.any():
        fallback = result.loc[missing, "city"].map(city_county["county_fips"])
        fallback_name = result.loc[missing, "city"].map(city_county["county_name"])
        result.loc[missing, "county_fips"] = fallback
        result.loc[missing, "county_name"] = fallback_name

    still_missing = result["county_fips"].isna().sum()
    if still_missing:
        print(f"[WARN] {still_missing} zips could not be mapped to a county (no ZCTA and no same-city fallback)")

    return result


if __name__ == "__main__":
    df = build_zip_to_county()
    out = "zip_to_county.csv"
    df.to_csv(out, index=False)
    print(f"[OK] Mapped {df['county_fips'].notna().sum()} of {len(df)} zips to counties -> {out}")
    print(df[["zip_code", "city", "county_fips", "county_name"]].head())
