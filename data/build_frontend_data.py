"""
Builds the CSVs the frontend reads from frontend/public/data/.

  utility_reliability.csv  EIA-861 reliability (SAIDI/SAIFI) for Texas utilities, 2021-2024
  plans.csv                PowerToChoose.org offer export, English rows, compact columns

Usage:  pip install pandas openpyxl && python data/build_frontend_data.py [reliability] [plans]
Both sources are public and need no credentials.
"""
import csv
import io
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "data"
UA = {"User-Agent": "Mozilla/5.0"}

EIA_YEARS = [2021, 2022, 2023, 2024]
# Latest year lives at /zip/, older years move to /archive/zip/
EIA_URLS = [
    "https://www.eia.gov/electricity/data/eia861/zip/f861{y}.zip",
    "https://www.eia.gov/electricity/data/eia861/archive/zip/f861{y}.zip",
]

# EIA utility name -> the utility code used in Base's funnel URL (?utility=ONCOR)
UTILITIES = {
    "Oncor Electric Delivery Company LLC": "ONCOR",
    "CenterPoint Energy": "CENTERPOINT",
    "AEP Texas Central Company": "AEP_CENTRAL",
    "AEP Texas North Company": "AEP_NORTH",
    "Texas-New Mexico Power Co": "TNMP",
    "Austin Energy": "AUSTIN_ENERGY",
    "City of San Antonio - (TX)": "CPS",
    "Pedernales Electric Coop, Inc": "PEDERNALES",
    "Bluebonnet Electric Coop, Inc": "BLUEBONNET",
}


def fetch(url: str, want_zip: bool = False) -> bytes | None:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            data = r.read()
        return data if data[:2] == b"PK" or not want_zip else None
    except Exception:
        return None


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def eia_year(year: int) -> list[dict]:
    blob = next((b for u in EIA_URLS if (b := fetch(u.format(y=year), want_zip=True))), None)
    if blob is None:
        raise RuntimeError(f"EIA-861 {year} download failed")
    z = zipfile.ZipFile(io.BytesIO(blob))
    name = next(n for n in z.namelist() if "Reliability" in n and n.endswith(".xlsx"))
    df = pd.read_excel(z.open(name), header=None, skiprows=3)

    rows = []
    for _, r in df[df[3] == "TX"].iterrows():
        code = UTILITIES.get(str(r[2]).strip())
        if not code:
            continue
        # Prefer IEEE 1366 "all events" columns (5,6); some utilities (Oncor, TNMP)
        # only report under "Other Standard" (17,18).
        saidi, saifi, standard = num(r[5]), num(r[6]), "IEEE"
        if saidi is None:
            saidi, saifi, standard = num(r[17]), num(r[18]), "Other"
        saidi_no_med = num(r[8]) if standard == "IEEE" else num(r[20])
        if saidi is None:
            continue
        rows.append({
            "utility": code,
            "utility_name": str(r[2]).strip(),
            "year": year,
            "saidi_minutes": round(saidi, 1),
            "saifi_times": round(saifi, 3) if saifi is not None else "",
            "saidi_minutes_no_major_events": round(saidi_no_med, 1) if saidi_no_med is not None else "",
            "standard": standard,
            "source": f"EIA-861 {year} Reliability",
        })
    return rows


def build_reliability():
    rows = [r for y in EIA_YEARS for r in eia_year(y)]
    write(OUT / "utility_reliability.csv", rows)


PTC_URL = "https://www.powertochoose.org/en-us/Plan/ExportToCsv"
# PowerToChoose TDU names -> utility codes
TDUS = {
    "ONCOR ELECTRIC DELIVERY COMPANY": "ONCOR",
    "CENTERPOINT ENERGY HOUSTON ELECTRIC LLC": "CENTERPOINT",
    "AEP TEXAS CENTRAL": "AEP_CENTRAL",
    "AEP TEXAS NORTH": "AEP_NORTH",
    "TEXAS-NEW MEXICO POWER COMPANY": "TNMP",
    "LUBBOCK POWER & LIGHT SYSTEM": "LPL",
}


def build_plans():
    text = fetch(PTC_URL).decode("utf-8-sig")
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        r = {k.strip("[]"): (v or "").strip() for k, v in r.items() if k}
        code = TDUS.get(r.get("TduCompanyName", ""))
        # Base only lists a Spanish row, so keep it regardless of language
        is_base = r.get("RepCompany") == "Base Power"
        if not code or (r.get("Language") != "English" and not is_base):
            continue
        rows.append({
            "utility": code,
            "company": r["RepCompany"],
            "product": r["Product"],
            "kwh500": r["kwh500"],
            "kwh1000": r["kwh1000"],
            "kwh2000": r["kwh2000"],
            "rate_type": r["RateType"],
            "term_months": r["TermValue"],
            "renewable_pct": r["Renewable"],
            "prepaid": str(r["PrePaid"].lower() == "true").lower(),
            "time_of_use": str(r["TimeOfUse"].lower() == "true").lower(),
            "min_usage": str(r["MinUsageFeesCredits"].upper() == "TRUE").lower(),
            "fees_credits": r["Fees/Credits"],
            "cancel_fee": r["CancelFee"],
            "facts_url": r["FactsURL"],
        })
    write(OUT / "plans.csv", rows)


def write(path: Path, rows: list[dict]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows -> {path.name}")


if __name__ == "__main__":
    import sys
    targets = sys.argv[1:] or ["reliability", "plans"]
    if "reliability" in targets:
        build_reliability()
    if "plans" in targets:
        build_plans()
