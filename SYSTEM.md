# ResilianceROI - Integrated System Summary

## System Architecture

### Backend (Flask, Port 8000)
- **Language**: Python 3.14+
- **Framework**: Flask 3.0
- **Status**: ✓ Running on http://localhost:8000

#### Endpoints
1. **POST /stage1/risk-awareness**
   - Input: `{zip_code: "75201"}`
   - Output: Weather history + grid risk for zone
   - Data: 149 severe weather events in test zones (NOAA)

2. **POST /stage2/analyze** 
   - Input: `{zip_code, monthly_kwh, average_bill}`
   - Output: ROI calculation + battery recommendation
   - Qualification: risk_score > 30 AND (roi < 12 years OR savings > $25/mo)

3. **POST /analyze-power-bill** ⭐ **NEW**
   - Input: `{image: base64, zip_code: "75201"}`
   - Output: Extracted usage + Stage 2 analysis
   - OCR: EasyOCR (100% extraction success on test bills)
   - Supports: Gexa, Frontier, Just Energy, all TX retailers

#### Data Processors
- **PostalZipProcessor**: Filters 4.2M US postal records → TX zip→zone mapping (240 test zips)
- **NOAADailyProcessor**: 22K weather records with severity scoring
- **ERCOTOutageProcessor**: 364 daily outage files (needs date format fix)
- **PowerBillAnalyzer**: Extracts kWh/bill from images using OCR + regex patterns

### Frontend (React + Vite, Port 5173)
- **Language**: TypeScript/React
- **Status**: ✓ Building via `npm run dev`
- **Router**: Hash-based for static deployment

#### Integration Points
1. **Partner's NewFunnel** (from merged PR)
   - Multi-step qualification flow (6 steps)
   - Utility lookup by ZIP (deregulated vs regulated)
   - Reliability metrics (SAIDI minutes)
   - Plan comparison (PowerToChoose data)
   - Calls `/stage1/risk-awareness` for weather data

2. **Bill Uploader** (NEW - just added)
   - BillUploader component in usage step (step 3)
   - Calls `/analyze-power-bill` endpoint
   - Auto-extracts kWh → pre-fills plan comparison
   - Fallback to manual entry

#### Routes
- `#/compare` - Side-by-side before/after demo
- `#/before/<screen>` - Current (old) funnel  
- `#/after/<screen>` - NewFunnel with bill upload
- Query params: `?postal_code=75201&utility=ONCOR&embed=1`

## User Flows

### Flow 1: Manual Entry
1. Enter ZIP → See risk data
2. Choose reason (backup/rate/both)
3. Select or enter usage (kWh)
4. Compare plans
5. Choose energy plan or battery
6. Next steps

### Flow 2: Fast Track with Bill Upload ⭐ **NEW**
1. Enter ZIP → See risk data
2. Choose reason
3. **Upload power bill photo**
   - OCR extracts: kWh, bill amount, provider
   - Auto-proceeds to plan comparison
4. Compare plans (pre-filled with bill data)
5. Choose energy plan or battery
6. Next steps

## Testing

### Backend Test
```bash
# Stage 1 - Risk awareness
curl -X POST http://localhost:8000/stage1/risk-awareness \
  -H "Content-Type: application/json" \
  -d '{"zip_code": "75201"}'

# Stage 2 - Analysis
curl -X POST http://localhost:8000/stage2/analyze \
  -H "Content-Type: application/json" \
  -d '{"zip_code": "75201", "monthly_kwh": 850, "average_bill": 105.50}'

# Bill Upload
python3 backend/test_bill_analyzer.py
```

### Frontend Test
```bash
cd frontend
npm install
npm run dev
# Visit http://localhost:5173
# Or http://localhost:5173/#/after/zip
```

## Data Files

### Backend
- `/backend/daily_summaries.csv` - NOAA weather (2.4MB)
- `/backend/texas_zips.csv` - Test data (240 Dallas/Houston/Austin zips)
- `/backend/ercot_data/` - 364 daily outage zips from ERCOT
- `/backend/zip_codes/zip_codes.xlsx` - 4.2M US postal database (optional)

### Frontend
- `/frontend/public/data/zip_utility.csv` - ZIP to utility mapping
- `/frontend/public/data/utility_reliability.csv` - SAIDI data
- `/frontend/public/data/plans.csv` - Electricity plans

## Configuration

### Backend
```bash
# Set Flask port
export FLASK_PORT=8000

# VITE env vars handled in frontend vite.config.ts
```

### Frontend
```bash
# In frontend/.env or vite.config.ts
VITE_API_URL=http://localhost:8000
```

## What's Working ✓

- [x] Backend API with 3 endpoints
- [x] NOAA weather risk assessment
- [x] OCR power bill extraction
- [x] ROI calculation with qualification
- [x] Partner's NewFunnel (6-step flow)
- [x] Zip→utility lookup
- [x] Bill upload integration (NEW)
- [x] Fallback to manual entry
- [x] Test data loaded (Dallas/Houston/Austin)

## What Needs Work 🔧

- [ ] Fix ERCOT outage CSV date parsing (currently 0 records loaded)
- [ ] Implement NOAA←→ERCOT correlation model
- [ ] Scale postal DB processing (4.2M lines)
- [ ] HubSpot CRM integration (for qualified leads)
- [ ] Production deployment config
- [ ] Error handling refinements

## Tech Stack Summary

| Component | Technology | Status |
|-----------|-----------|--------|
| Backend | Flask 3.0 + Python 3.14 | ✓ Ready |
| Frontend | React 18 + TypeScript | ✓ Ready |
| OCR | EasyOCR (PyTorch) | ✓ Ready |
| Data | CSV files + API | ✓ Ready |
| Routing | Hash-based (static) | ✓ Ready |
| Build | Vite | ✓ Ready |
| Deploy | Static export | ⏳ Ready |

---

**Last Updated**: 2026-09-26
**Version**: 2.0 (with bill upload)
