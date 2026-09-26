# ResilianceROI — Intelligent Battery Lead Qualifier

A lead-qualification funnel for Base Power (whole-home battery, sold as a subscription
add-on to their fixed-rate energy plan) that replaces generic screening questions with
real, address-specific severe-weather/grid-risk data — then carries that same qualified
lead through photo-based site survey, AR-style battery placement, permitting lookup, and
scheduling, instead of dropping it at "email us."

## The problem

Base's live funnel asks questions that don't qualify anyone ("what's your main reason
for considering Base?"), asks the same thing twice in different words (provider choice),
and dead-ends customers who already own a battery with a manual mailto link. See
`frontend/src/before/CurrentFunnel.tsx` for a faithful reproduction, and `/compare` in
the running app for a side-by-side against what we built.

## What we built

**Real data, not hype.** A per-ZIP severe-weather/grid-risk index built from:
- **ERCOT** Unplanned Resource Outages Report — 364 daily zip reports, deduped to
  unique outages, correlated against weather-event days to learn how much each event
  *type* actually moves forced-outage MW (`backend/weather_outage_correlation.py`)
- **NOAA Storm Events Database** — real severe-weather events by Texas county/zone,
  2021–2026 (spans Winter Storm Uri) (`backend/noaa_storm_events_processor.py`)
- **EIA-861** utility SAIDI/SAIFI reliability filings, as a systemwide reliability
  baseline per TDU
- Census ZCTA↔county crosswalk to join ZIP-level customers to county-level weather data

These combine into `zip_risk_index.csv` (a 0–100 `risk_score` and tier per ZIP) via
`backend/prediction_index.py`, which the funnel shows the customer directly — including
a full "how we calculated this" breakdown per ZIP (`/methodology/<zip_code>`), not just
a black-box number.

**No ROI/payback math.** The battery is bundled into Base's subscription and never
purchased outright, so there's no customer capex to pay back. Instead we use a
four-square-style value framing (rate savings vs. market, backup hours at their usage,
outage cost avoided, rate certainty) — see `_qualify()` in `backend/main.py` and
`buildFourSquare()` in `frontend/src/after/NewFunnel.tsx`.

**Resumable leads.** A completed lead gets a durable id and link (`backend/leads_db.py`,
SQLite) so a customer can leave after picking a plan and come back later to finish site
survey and scheduling, instead of losing all progress to React state.

**Site survey + AR-style placement.** After lead creation: photo upload (validated with
Pillow), a real municipal permitting lookup by city (`backend/municipal_permitting.py`,
sourced fire-code/NEC/permitting-center citations for Dallas/Arlington/Houston/Austin),
and "see it in your space" battery placement over the customer's own photo. Placement
uses a **local** vision model (Ollama + Qwen2.5-VL, no API key, no cloud dependency —
`backend/install_visualizer.py`) to suggest a bounding box, corrected to the battery's
real aspect ratio (30.68"W × 35.9"H × 22"D) and rendered as a draggable/resizable layer
in the browser (`frontend/src/components/PlacementCanvas.tsx`), not a server-flattened
image.

**Scheduling.** Once survey is complete, the customer can request a sales follow-up with
a specific window (`/follow-up-windows`, `/leads/<id>/follow-up-request`).

## Architecture

### Backend (Flask, not FastAPI)

Run with `python main.py` — a plain WSGI Flask app (`app.run(...)`), not an ASGI app,
so `uvicorn` does not apply here.

| Module | Responsibility |
|---|---|
| `main.py` | Flask app + all routes; loads pre-built CSVs at startup |
| `prediction_index.py` | Builds `zip_risk_index.csv` / `zip_risk_breakdown.csv` (batch script, not run per-request) |
| `weather_outage_correlation.py` | Weather-type → ERCOT outage sensitivity, empirical-Bayes shrinkage |
| `noaa_storm_events_processor.py` | Loads/normalizes NOAA Storm Events (county + zone types) |
| `aggregate_ercot.py` | Parses the 364 daily ERCOT outage zips into one deduped CSV |
| `zip_county_mapper.py` / `zip_utility_mapper.py` | ZIP→county, city→utility lookups |
| `leads_db.py` | SQLite lead persistence (resumable state) |
| `install_visualizer.py` | Ollama/Qwen2.5-VL battery-placement suggestion |
| `municipal_permitting.py` | Sourced per-city permitting requirements |
| `bill_analyzer.py` | OCR power-bill upload → instant usage/bill extraction |

All file paths in `main.py`/`leads_db.py` are anchored to the script's own directory
(`BACKEND_DIR = Path(__file__).resolve().parent`), so the backend can be launched from
any working directory — the repo root, `backend/`, or an IDE run button — without
silently falling back to default data.

### Frontend (React + Vite + TypeScript)

Hash-based routing (no React Router). `frontend/src/after/NewFunnel.tsx` is the new
funnel; `frontend/src/before/CurrentFunnel.tsx` is the faithful "what Base has today"
reproduction; `frontend/src/compare/Compare.tsx` renders both side by side.

---

## Setup

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Check: `http://localhost:8000/health` and `http://localhost:8000/data-status`

The risk index (`zip_risk_index.csv` and friends) ships pre-built in the repo. To
regenerate it after refreshing `ercot_data/` or the NOAA storm-events files:

```bash
cd backend
python aggregate_ercot.py        # rebuild the deduped ERCOT outage CSV
python prediction_index.py       # rebuild zip_risk_index.csv / zip_risk_breakdown.csv
```

### 2. (Optional) Local vision model for site-survey placement

```bash
winget install Ollama.Ollama
ollama pull qwen2.5vl:7b
```

If Ollama isn't running, `/visualize-install` falls back to a default placement box
instead of failing.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (defaults to `http://localhost:5173` or `3000`/`3002`
depending on port availability).

---

## API endpoints

| Route | Method | Purpose |
|---|---|---|
| `/stage1/risk-awareness` | POST | Real weather/outage risk summary for a ZIP |
| `/methodology/<zip_code>` | GET | Full "how we calculated this" breakdown |
| `/stage2/analyze` | POST | Qualification + outage-protection value (no ROI/payback) |
| `/analyze-power-bill` | POST | OCR a power-bill photo, then qualify from extracted usage |
| `/leads` | POST | Create a resumable lead |
| `/leads/<lead_id>` | GET | Fetch a lead by id |
| `/site-survey` | POST | Upload site-survey photos |
| `/visualize-install` | POST | Suggested battery placement box over a customer photo |
| `/assets/battery-product.png` | GET | Battery product image asset |
| `/permitting/<zip_code>` | GET | Municipal permitting requirements for that city |
| `/follow-up-windows` | GET | Available scheduling windows |
| `/leads/<lead_id>/follow-up-request` | POST | Request a sales follow-up (requires name/phone/email) |
| `/health` | GET | Liveness check |
| `/data-status` | GET | Risk index load status (`risk_index_loaded`, `zips_covered`, `zones_covered`) |

### Example: `/stage2/analyze`

Request:
```json
{ "zip_code": "77001", "monthly_kwh": 900, "average_bill": 120 }
```

Response:
```json
{
  "qualified": true,
  "zip_code": "77001",
  "risk_score": 52.5,
  "risk_tier": "MODERATE",
  "estimated_outage_hours_per_year": 18.5,
  "recommended_capacity_kwh": 30,
  "outage_protection_value_monthly": 45.5,
  "outage_protection_value_annual": 546.0,
  "confidence": 0.85,
  "qualification_reason": "Meaningful outage risk in your area (52/100). A battery adds real protection, bundled into your plan at no extra upfront cost.",
  "next_steps": "[OK] You qualify! A 30kWh battery is included in your Base subscription at no upfront cost. Connect with a Base Power specialist for a custom quote."
}
```

---

## Qualification logic

Qualification is risk-based, not ROI-based (there's no capex to pay back):

```python
# backend/main.py
MIN_QUALIFYING_RISK_SCORE = 30
qualified = risk_score > MIN_QUALIFYING_RISK_SCORE
```

`outage_protection_value_monthly` (see `calculate_outage_protection_value()` in
`main.py`) is an insurance-style estimate — what an outage of that length would cost at
that address's bill size — not a return on an investment. The rate-savings side of the
four-square pitch is priced against live PowerToChoose plan data, which only the
frontend loads (`frontend/src/lib/data.ts`), so it isn't duplicated on the backend.

To change the qualification bar, edit `MIN_QUALIFYING_RISK_SCORE` in `backend/main.py`.

---

## Testing

Backend:
```bash
cd backend && python main.py
curl http://localhost:8000/data-status
```

Frontend (Vitest + React Testing Library, one suite per funnel screen):
```bash
cd frontend
npm test
```

**Test ZIP codes:** 77001 (Houston), 75201 (Dallas), 78701 (Austin) are all inside the
built risk index; other Texas ZIPs fall back to their ERCOT zone average.

---

## Also in this repo

`housepowerbackup.com` is a separate, live, publicly deployed site (not part of this
funnel) — a ZIP-driven neutral comparison engine for standby generators, solar+battery,
and portable generators, citing EIA/NOAA/DOE data. It doesn't currently feature Base;
see `docs/hackathon-pitch-script.md` for how it fits the pitch.
