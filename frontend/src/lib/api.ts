// Optional link to the Flask backend (backend/main.py). The funnel works from the
// static CSVs alone; when the backend is up it adds NOAA severe-weather history.

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface WeatherRisk {
  severe_weather_events_5yr: number;
  most_common_event_type: string;
  avg_events_per_year: number;
  weather_risk_summary: string;
  // 0-100 composite from real NOAA Storm Events + ERCOT outage correlation + utility SAIDI
  // (backend/prediction_index.py) - not just the raw event count above.
  risk_score: number;
  risk_tier: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
}

export async function fetchWeatherRisk(zip: string): Promise<WeatherRisk | null> {
  try {
    const r = await fetch(`${API_URL}/stage1/risk-awareness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip_code: zip }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const data: WeatherRisk = await r.json();
    // The backend returns 0 events when it has no NOAA data loaded; hide rather than mislead
    return data.severe_weather_events_5yr > 0 ? data : null;
  } catch {
    return null;
  }
}

export interface SensitivityRow {
  event_type: string;
  n_event_days: string;
  avg_event_severity: string;
  sensitivity_multiplier: string;
  sensitivity_multiplier_raw: string;
}

export interface RiskBreakdownRow {
  event_type: string;
  event_count: string;
  events_per_year: string;
  avg_severity: string;
  sensitivity_multiplier: string;
  risk_contribution: string;
}

export interface StormEvent {
  date: string;
  event_type: string;
  severity_score: string;
  damage_property: string;
}

export interface CatastrophicEvent {
  name: string;
  date_range: string;
  event_types: string[];
  documented_impact_mw: number;
  impact_description: string;
  source: string;
  vs_model_baseline: number | null;
}

export interface Methodology {
  zip_code: string;
  county_name: string | null;
  risk_score: number | null;
  data_covers: string;
  saidi_caveat: string;
  sensitivity_table: SensitivityRow[];
  risk_breakdown: RiskBreakdownRow[];
  county_total_events: number;
  recent_events: StormEvent[];
  catastrophic_events: CatastrophicEvent[];
  sources: string[];
}

/** "Show your work" - every artifact behind a zip's risk score (backend/main.py's
 * /methodology endpoint). Fetched lazily, only when the panel is opened. */
export async function fetchMethodology(zip: string): Promise<Methodology | null> {
  try {
    const r = await fetch(`${API_URL}/methodology/${zip}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return (await r.json()) as Methodology;
  } catch {
    return null;
  }
}

export interface StageTwoAnalysis {
  qualified: boolean;
  risk_score: number;
  risk_tier: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  estimated_outage_hours_per_year: number;
  // No ROI/payback field on purpose - the battery is bundled into the subscription,
  // never purchased, so there's no capex to pay back. See backend/main.py.
  outage_protection_value_monthly: number;
  outage_protection_value_annual: number;
  recommended_capacity_kwh: number;
  confidence: number;
  qualification_reason: string;
  next_steps: string | null;
}

/** Real ROI/qualification math from backend/main.py's /stage2/analyze - risk score,
 * payback years, monthly savings - not the client-side estimate in battery.ts. */
export async function fetchStageTwoAnalysis(
  zip: string,
  monthlyKwh: number,
  averageBill: number,
): Promise<StageTwoAnalysis | null> {
  try {
    const r = await fetch(`${API_URL}/stage2/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip_code: zip, monthly_kwh: monthlyKwh, average_bill: averageBill }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    return (await r.json()) as StageTwoAnalysis;
  } catch {
    return null;
  }
}

export interface Permitting {
  zip_code: string;
  city: string | null;
  jurisdiction: string;
  permit_required: boolean;
  authority: string;
  requirements: string;
  typical_fee: string;
  typical_timeline: string;
  source: string;
}

/** Real, sourced permit requirements for this zip's city (backend/municipal_permitting.py). */
export async function fetchPermitting(zip: string): Promise<Permitting | null> {
  try {
    const r = await fetch(`${API_URL}/permitting/${zip}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return (await r.json()) as Permitting;
  } catch {
    return null;
  }
}

export interface SurveyPhotoResult {
  ok: boolean;
  width?: number;
  height?: number;
  size_bytes?: number;
}

export interface SurveyCategoryResult {
  uploaded: number;
  passed: number;
  issues: string[];
  photos: SurveyPhotoResult[];
}

export interface SiteSurveyResult {
  zip_code: string;
  lead_id: string | null;
  ready_for_installer_review: boolean;
  categories: Record<'install_area' | 'backyard', SurveyCategoryResult>;
  saved_to: string | null;
  permitting: Permitting;
}

/** Uploads install-area/backyard photos for basic automated validation (file type,
 * size, real decoded dimensions - see backend/main.py's _validate_photo) and saves
 * the ones that pass for installer review. Tags the upload with leadId when resuming
 * a saved lead, so it lands in that lead's record instead of a bare zip+timestamp one. */
export async function submitSiteSurvey(
  zip: string,
  installAreaPhotos: File[],
  backyardPhotos: File[],
  leadId?: string | null,
): Promise<SiteSurveyResult | null> {
  try {
    const form = new FormData();
    form.set('zip_code', zip);
    if (leadId) form.set('lead_id', leadId);
    installAreaPhotos.forEach(f => form.append('install_area', f));
    backyardPhotos.forEach(f => form.append('backyard', f));

    const r = await fetch(`${API_URL}/site-survey`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    return (await r.json()) as SiteSurveyResult;
  } catch {
    return null;
  }
}

export interface Lead {
  id: string;
  zip_code: string;
  utility: string;
  monthly_kwh: number;
  reason: string;
  choice: 'energy' | 'battery' | '';
  status: 'plan_selected' | 'survey_complete' | 'follow_up_requested';
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

/** Persists a completed lead (plan already picked) so the funnel can hand back a
 * resumable link (?lead=<id>) instead of losing everything if the customer leaves
 * before finishing the site survey. */
export async function createLead(
  zip: string,
  utility: string,
  monthlyKwh: number,
  reason: string,
  choice: string,
  customerName?: string,
  phone?: string,
  email?: string,
): Promise<string | null> {
  try {
    const r = await fetch(`${API_URL}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zip_code: zip,
        utility,
        monthly_kwh: monthlyKwh,
        reason,
        choice,
        customer_name: customerName ?? '',
        phone: phone ?? '',
        email: email ?? '',
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    return ((await r.json()) as { lead_id: string }).lead_id;
  } catch {
    return null;
  }
}

/** Restores funnel state for a resumable link. */
export async function fetchLead(leadId: string): Promise<Lead | null> {
  try {
    const r = await fetch(`${API_URL}/leads/${leadId}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return (await r.json()) as Lead;
  } catch {
    return null;
  }
}

export interface VisualizeResult {
  placement: { x: number; y: number; width: number; height: number; source: 'model' | 'default' };
  product_image_url: string;
  product_aspect_ratio: number;
}

/** "See it in your space" - a local vision model (Ollama, no API key, nothing leaves
 * this machine - see backend/install_visualizer.py) suggests where the battery goes in
 * the customer's own install-area photo. Returns the placement + the product image URL
 * only, NOT a flattened composite - the frontend renders the product as its own movable/
 * resizable layer over the photo so the customer can adjust it, rather than trusting a
 * server-baked image. Can take ~1-60s depending on whether the model is already warm. */
export async function visualizeInstall(photo: File): Promise<VisualizeResult | null> {
  try {
    const form = new FormData();
    form.set('photo', photo);
    const r = await fetch(`${API_URL}/visualize-install`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) return null;
    return (await r.json()) as VisualizeResult;
  } catch {
    return null;
  }
}

export interface FollowUpWindow {
  date: string;
  weekday: string;
  window: string;
  window_label: string;
  spots_remaining: number;
}

/** Next available sales follow-up windows - weekdays only, capacity-capped server-side
 * so this is the same source of truth for every customer checking at once. */
export async function fetchFollowUpWindows(): Promise<FollowUpWindow[]> {
  try {
    const r = await fetch(`${API_URL}/follow-up-windows`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    return ((await r.json()) as { slots: FollowUpWindow[] }).slots;
  } catch {
    return [];
  }
}

export interface FollowUpRequestConfirmation {
  lead_id: string;
  date: string;
  window: string;
  window_label: string;
}

/** Submits a preferred sales follow-up window against a lead. Returns null on failure
 * (e.g. the window filled up between fetching and confirming - caller should re-fetch). */
export async function requestSalesFollowUp(
  leadId: string,
  date: string,
  window: string,
  customerName?: string,
  phone?: string,
  email?: string,
): Promise<FollowUpRequestConfirmation | null> {
  try {
    const r = await fetch(`${API_URL}/leads/${leadId}/follow-up-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, window, customer_name: customerName ?? '', phone: phone ?? '', email: email ?? '' }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    return (await r.json()) as FollowUpRequestConfirmation;
  } catch {
    return null;
  }
}
