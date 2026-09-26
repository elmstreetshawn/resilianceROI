// Optional link to the Flask backend (backend/main.py). The funnel works from the
// static CSVs alone; when the backend is up it adds NOAA severe-weather history.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface WeatherRisk {
  severe_weather_events_5yr: number;
  most_common_event_type: string;
  avg_events_per_year: number;
  weather_risk_summary: string;
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
