# Frontend: Base signup funnel

React 18 + TypeScript + Vite. It is styled with Base's own design tokens (colors
pulled from `join.basepowercompany.com`'s CSS), so the new screens read as part of
their funnel.

## Quick start

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

| Route | What it is |
|-------|------------|
| `#/compare` (default) | **Demo view.** Base's current screen next to ours, one tab per funnel moment |
| `#/before/<home\|utility\|reason\|provider\|plan\|deadend>` | Re-creation of Base's live signup, starting at the homepage ZIP box (copy verbatim, captured 2026-09-26) |
| `#/after/<zip\|risk\|usage\|compare\|plan\|done\|deadend>` | Our funnel |

Query params mirror Base's funnel: `?postal_code=77096&utility=CENTERPOINT`.
Demo ZIP: **77096** (Houston, CenterPoint, the 72 h outage year). Both ZIP boxes start
empty, so type it. Others: **78660** (Pflugerville, split between Oncor and Austin
Energy, so it shows the one "who sends your bill?" question), **77590** (Texas City,
TNMP), **78701** (Austin Energy, no retail choice). Screens opened directly by URL
default to 77096.

The backend is optional. If `VITE_API_URL` (default `http://localhost:8000`) is
reachable, step 2 adds NOAA severe-weather history from `backend/main.py`. Without it,
everything runs from static CSVs.

## What changed vs. Base's funnel

| Base today | Ours |
|------------|------|
| Step 4 asks "How do you get your electricity?" even though the URL already has `utility=ONCOR` | Step 1 detects the utility and retail choice from the ZIP |
| Step 2 asks "main reason?" with no evidence | Step 2 shows the utility's real outage hours per year, then asks |
| No market context; shoppers leave for PowerToChoose | Steps 3–4 bring PowerToChoose inside the funnel, priced at the customer's usage, with **minimum-usage traps** flagged |
| Step 7 shows two equal plan cards | Battery plan recommended, plus a **Help me decide** panel (outage hours, backup hours at their usage, outage cost) |
| "Already have a battery? Please email us" | One-click pre-filled email to enrollments |

## Data (`public/data/`, rebuilt by `data/build_frontend_data.py`)

| File | Source | Notes |
|------|--------|-------|
| `utility_reliability.csv` | [EIA-861](https://www.eia.gov/electricity/data/eia861/) Reliability tables, 2021–2024 | SAIDI (minutes without power per customer per year) including major events. IEEE 1366 figures where reported; Oncor and TNMP only file under "Other Standard" |
| `plans.csv` | [PowerToChoose.org](https://www.powertochoose.org) CSV export (`/en-us/Plan/ExportToCsv`) | English offers plus Base's own listing. Prices are EFL averages at 500/1000/2000 kWh, including delivery; the app interpolates between them |
| `zip_utility.csv` | Demo table, checked against Base's own ZIP router (`account.basepowercompany.com/api/zip-router`) on 2026-09-26 | One row per utility, so split ZIPs have two rows. The `utility` URL param overrides it, as in Base's funnel |

Both public sources need no credentials. To refresh:
`pip install pandas openpyxl && python data/build_frontend_data.py`

## Assumptions (all in `src/lib/battery.ts`)

- **Battery usable capacity: 25 kWh.** Not confirmed; check against Base's spec.
- Essentials are 35% of average household load.
- Outage cost ($700) is a rough estimate: food spoilage $250, 2 hotel nights $300, eating out $150.
- The "mild month" column assumes 40% lower usage than the customer's entry.

## Known limitations / next steps

- ZIP to utility covers only the demo ZIPs. Next step is the PUCT TDU ZIP lists or HIFLD service territories.
- Reliability is utility-wide. County-level outage history (DOE EAGLE-I) would make it hyper-local.
- Base's rate is only in PowerToChoose for CenterPoint. Elsewhere we show "below market median", Base's own guarantee.
- The enrollments hand-off is a `mailto:`. A real integration would POST to Base's CRM.
- Font: PP Neue Montreal is licensed, so it is named but not bundled. The fallback is Inter/system UI.
