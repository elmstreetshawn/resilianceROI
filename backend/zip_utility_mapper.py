"""
Maps our Texas zip list to its transmission & distribution utility (TDU) -
the actual entity that owns the wires and reports outage/reliability stats
to EIA-861 (frontend/public/data/utility_reliability.csv).

texas_zips.csv only carries a coarse city label (every zip is bucketed to
its nearest of 4 metro names), so this mapping is metro-level, not a real
service-territory lookup - good enough for our current Dallas/Houston/Austin
test zips, where each metro sits almost entirely inside one TDU's territory.
"""
import pandas as pd

CITY_TO_UTILITY = {
    "DALLAS": "ONCOR",
    "ARLINGTON": "ONCOR",
    "HOUSTON": "CENTERPOINT",
    "AUSTIN": "AUSTIN_ENERGY",
}


def build_zip_to_utility(zips_file: str = "texas_zips.csv") -> pd.DataFrame:
    zips = pd.read_csv(zips_file, dtype={"zip_code": str}).drop_duplicates("zip_code")
    zips["utility"] = zips["city"].str.upper().map(CITY_TO_UTILITY)

    unmapped = zips["utility"].isna()
    if unmapped.any():
        print(f"[WARN] {unmapped.sum()} zips have no utility mapping (city not in CITY_TO_UTILITY): "
              f"{sorted(zips.loc[unmapped, 'city'].unique())}")

    return zips[["zip_code", "city", "utility"]]


if __name__ == "__main__":
    df = build_zip_to_utility()
    out = "zip_to_utility.csv"
    df.to_csv(out, index=False)
    print(f"[OK] Mapped {df['utility'].notna().sum()} of {len(df)} zips to a utility -> {out}")
    print(df["utility"].value_counts())
