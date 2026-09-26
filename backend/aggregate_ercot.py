"""
ERCOT daily zip aggregator - combines daily UnplannedResOutage zips into a single
deduped, normalized year of outage data.

Each zip contains one .xlsx report with two tabs: "Report Info" and
"Unplanned Resource Outages". We read the second (data) tab, whose real
header row is the 5th row of the sheet, and skip the trailing footer/page
row that every report has (it has no Resource Unit Code).

ERCOT re-publishes every still-active outage in each day's report, so the
raw combined data has ~3x as many rows as there are actual outages. This
script dedupes on (Resource Unit Code, Actual Outage Start) - the identity
of a single physical outage - keeping the most recent snapshot of each and
adding first_seen/last_seen/report_count/duration/status fields.
"""
import re
import zipfile
from pathlib import Path

import pandas as pd

DATE_RE = re.compile(r"\.(\d{8})\.\d{6}\.UnplannedResOutage")

RENAME_MAP = {
    "Resource Name": "resource_name",
    "Resource Unit Code": "resource_unit_code",
    "Fuel Type": "fuel_type",
    "Outage Type": "outage_type",
    "Available MW Maximum": "available_mw_maximum",
    "Available MW During Outage": "available_mw_during_outage",
    "Effective MW Reduction Due to Outage": "mw_reduction",
    "Actual Outage Start": "outage_start",
    "Planned End Date": "planned_end_date",
    "Actual End Date": "actual_end_date",
    "Nature Of Work": "nature_of_work",
}


def _report_date_from_filename(name: str) -> str:
    match = DATE_RE.search(name)
    if not match:
        return ""
    raw = match.group(1)
    return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"


def aggregate_ercot_zips(data_dir: str = "./ercot_data") -> pd.DataFrame:
    """
    Read every daily ERCOT outage zip and combine their data tabs into one
    raw DataFrame (one row per resource per daily report - still contains
    the cross-day duplication described above).
    """
    data_path = Path(data_dir)

    if not data_path.exists():
        print(f"[ERROR] Directory not found: {data_dir}")
        return pd.DataFrame()

    zip_files = sorted(data_path.glob("*.zip"))
    print(f"Found {len(zip_files)} daily outage zip files")

    frames = []

    for i, zip_file in enumerate(zip_files):
        try:
            with zipfile.ZipFile(zip_file, "r") as zf:
                xlsx_files = [f for f in zf.namelist() if f.endswith(".xlsx")]
                if not xlsx_files:
                    print(f"  [WARN] No .xlsx found in {zip_file.name}")
                    continue

                with zf.open(xlsx_files[0]) as f:
                    xls = pd.ExcelFile(f)
                    if len(xls.sheet_names) < 2:
                        print(f"  [WARN] {zip_file.name} has no second tab, skipping")
                        continue

                    data_sheet = xls.sheet_names[1]
                    df = pd.read_excel(xls, sheet_name=data_sheet, header=4)

                # Drop the trailing footer/page-count row (no Resource Unit Code)
                df = df.dropna(subset=["Resource Unit Code"])

                df.insert(0, "report_date", _report_date_from_filename(zip_file.name))
                frames.append(df)

        except Exception as e:
            print(f"  [ERROR] {zip_file.name}: {e}")
            continue

        if (i + 1) % 50 == 0:
            print(f"  Processed {i + 1}/{len(zip_files)} zips")

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True)
    combined["report_date"] = pd.to_datetime(combined["report_date"])
    print(f"[OK] Combined {len(combined)} raw report rows ({combined['report_date'].nunique()} daily reports)")
    return combined


def normalize_and_dedupe(raw: pd.DataFrame) -> pd.DataFrame:
    """
    Collapse repeated daily snapshots of the same outage into one row per
    physical outage, with normalized snake_case columns and computed
    duration/status fields.
    """
    df = raw.rename(columns=RENAME_MAP).copy()

    for col in ("outage_start", "planned_end_date", "actual_end_date", "report_date"):
        df[col] = pd.to_datetime(df[col], errors="coerce")

    df = df.sort_values("report_date")

    key = ["resource_unit_code", "outage_start"]
    latest = df.groupby(key, as_index=False).last()
    spans = df.groupby(key).agg(
        first_seen_date=("report_date", "min"),
        last_seen_date=("report_date", "max"),
        report_count=("report_date", "count"),
    ).reset_index()

    deduped = latest.merge(spans, on=key)

    max_report_date = df["report_date"].max()
    has_end = deduped["actual_end_date"].notna()
    still_active = ~has_end & (deduped["last_seen_date"] == max_report_date)

    deduped["status"] = "unknown_end"
    deduped.loc[has_end, "status"] = "completed"
    deduped.loc[still_active, "status"] = "ongoing"

    deduped["duration_hours"] = (
        deduped["actual_end_date"] - deduped["outage_start"]
    ).dt.total_seconds() / 3600

    column_order = [
        "resource_name", "resource_unit_code", "fuel_type", "outage_type",
        "available_mw_maximum", "available_mw_during_outage", "mw_reduction",
        "outage_start", "planned_end_date", "actual_end_date", "duration_hours",
        "status", "nature_of_work", "first_seen_date", "last_seen_date", "report_count",
    ]
    deduped = deduped[column_order].sort_values("outage_start").reset_index(drop=True)

    print(
        f"[OK] Deduped {len(df)} report rows into {len(deduped)} unique outages "
        f"({has_end.sum()} completed, {still_active.sum()} ongoing, "
        f"{(~has_end & ~still_active).sum()} unknown end date)"
    )
    return deduped


if __name__ == "__main__":
    import sys

    data_dir = sys.argv[1] if len(sys.argv) > 1 else "./ercot_data"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "ercot_outages_year.csv"

    raw = aggregate_ercot_zips(data_dir)

    if raw.empty:
        print("[ERROR] No records extracted - check Excel file format")
    else:
        deduped = normalize_and_dedupe(raw)
        deduped.to_csv(output_file, index=False)
        print(f"\n[OK] Successfully created {output_file} ({len(deduped)} unique outages)")
        print("Use this CSV for analysis and backend loading")
