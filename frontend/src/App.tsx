import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

interface RiskAwarenessResponse {
  zip_code: string;
  zone: string;
  weather_risk_summary: string;
  severe_weather_events_5yr: number;
  most_common_event_type: string;
  avg_events_per_year: number;
  should_proceed_to_analysis: boolean;
  personalized_message: string;
}

interface BatteryRecommendation {
  qualified: boolean;
  risk_score: number;
  estimated_outage_hours_per_year: number;
  roi_years: number;
  monthly_savings: number;
  recommended_capacity_kwh: number;
  confidence: number;
  qualification_reason: string;
  next_steps?: string;
}

type Stage = 'zip' | 'risk-awareness' | 'details' | 'results';

function App() {
  const [stage, setStage] = useState<Stage>('zip');
  const [zipCode, setZipCode] = useState('');
  const [loading, setLoading] = useState(false);

  const [riskData, setRiskData] = useState<RiskAwarenessResponse | null>(null);
  const [result, setResult] = useState<BatteryRecommendation | null>(null);

  const [formData, setFormData] = useState({
    zip_code: '',
    monthly_kwh: 900,
    average_bill: 120,
    home_size_sqft: 2000,
  });

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(
        'http://localhost:8000/stage1/risk-awareness',
        { zip_code: zipCode }
      );
      setRiskData(response.data);
      setFormData(prev => ({ ...prev, zip_code: zipCode }));
      setStage('risk-awareness');
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to assess risk. Check backend is running on http://localhost:8000');
    } finally {
      setLoading(false);
    }
  };

  const handleConcernedYes = () => {
    setStage('details');
  };

  const handleConcernedNo = () => {
    setStage('zip');
    setZipCode('');
    setRiskData(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: isNaN(Number(value)) ? value : Number(value)
    }));
  };

  const handleAnalyzeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(
        'http://localhost:8000/stage2/analyze',
        formData
      );
      setResult(response.data);
      setStage('results');
    } catch (error) {
      console.error('Error:', error);
      alert('Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStage('zip');
    setZipCode('');
    setRiskData(null);
    setResult(null);
    setFormData({
      zip_code: '',
      monthly_kwh: 900,
      average_bill: 120,
      home_size_sqft: 2000,
    });
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🔋 ResilianceROI</h1>
        <p>Does backup power make sense for your home?</p>
      </header>

      {stage === 'zip' && (
        <div className="container">
          <div className="stage-card">
            <h2>Let's start with your location</h2>
            <p className="subtitle">We'll show you real outage and weather data for your area</p>

            <form onSubmit={handleZipSubmit}>
              <div className="form-group">
                <label>ZIP Code</label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="e.g., 78701"
                  maxLength={5}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || zipCode.length < 5}
              >
                {loading ? 'Analyzing...' : 'See My Area\'s Risk'}
              </button>
            </form>
          </div>
        </div>
      )}

      {stage === 'risk-awareness' && riskData && (
        <div className="container">
          <div className="stage-card risk-card">
            <div className="risk-header">
              <h2>Here's What Happens in {riskData.zone}</h2>
            </div>

            <div className="risk-summary">
              <div className="risk-stat">
                <div className="stat-number">{riskData.severe_weather_events_5yr}</div>
                <div className="stat-label">Severe weather events<br/>in past 5 years</div>
              </div>

              <div className="risk-stat">
                <div className="stat-label">{riskData.most_common_event_type}</div>
                <div className="stat-label">Most common</div>
              </div>

              <div className="risk-stat">
                <div className="stat-number">{riskData.avg_events_per_year.toFixed(1)}</div>
                <div className="stat-label">Events per year<br/>on average</div>
              </div>
            </div>

            <div className="risk-narrative">
              <p>{riskData.weather_risk_summary}</p>
            </div>

            <div className="personalized-message">
              <div className="message-icon">💡</div>
              <p>{riskData.personalized_message}</p>
            </div>

            <div className="decision-question">
              <h3>Does this concern you?</h3>
              <p>If backup power is important to you, let's see if a battery makes financial sense.</p>

              <div className="button-group">
                <button
                  className="btn btn-primary"
                  onClick={handleConcernedYes}
                >
                  Yes, let's analyze it →
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleConcernedNo}
                >
                  Not right now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === 'details' && (
        <div className="container">
          <div className="stage-card">
            <h2>Tell us about your home</h2>
            <p className="subtitle">This helps us calculate battery ROI for your situation</p>

            <form onSubmit={handleAnalyzeSubmit}>
              <div className="form-group">
                <label>Monthly Energy Usage (kWh)</label>
                <input
                  type="number"
                  name="monthly_kwh"
                  value={formData.monthly_kwh}
                  onChange={handleInputChange}
                  min="100"
                  max="5000"
                  required
                />
                <small>Check your electric bill or estimate 10-15 kWh/day for average home</small>
              </div>

              <div className="form-group">
                <label>Average Monthly Bill ($)</label>
                <input
                  type="number"
                  name="average_bill"
                  value={formData.average_bill}
                  onChange={handleInputChange}
                  min="20"
                  max="1000"
                  step="10"
                  required
                />
              </div>

              <div className="form-group">
                <label>Home Size (sq ft)</label>
                <input
                  type="number"
                  name="home_size_sqft"
                  value={formData.home_size_sqft}
                  onChange={handleInputChange}
                  min="500"
                  max="10000"
                  step="100"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Analyzing...' : 'Get My Recommendation'}
              </button>
            </form>
          </div>
        </div>
      )}

      {stage === 'results' && result && (
        <div className="container">
          <div className={`results ${result.qualified ? 'qualified' : 'not-qualified'}`}>
            <div className="result-header">
              <h2>
                {result.qualified
                  ? '✅ Battery Backup Makes Sense For You'
                  : '📊 Battery Backup May Not Be The Right Fit'}
              </h2>
              <div className="qualification-reason">
                {result.qualification_reason}
              </div>
            </div>

            <div className="result-grid">
              <div className="result-card">
                <h3>Outage Risk Score</h3>
                <div className="score">{result.risk_score.toFixed(0)}/100</div>
                <p>{result.estimated_outage_hours_per_year.toFixed(1)} hrs/year</p>
              </div>

              <div className="result-card">
                <h3>Monthly Savings</h3>
                <div className="score">${result.monthly_savings.toFixed(0)}</div>
                <p>From avoided outages</p>
              </div>

              <div className="result-card">
                <h3>Payback Period</h3>
                <div className="score">{result.roi_years.toFixed(1)}</div>
                <p>years to break even</p>
              </div>

              <div className="result-card">
                <h3>Recommended System</h3>
                <div className="score">{result.recommended_capacity_kwh.toFixed(0)}</div>
                <p>kWh capacity</p>
              </div>
            </div>

            {result.qualified && result.next_steps && (
              <div className="next-steps">
                <h3>Next Steps</h3>
                <p>{result.next_steps}</p>
                <button className="btn btn-cta">
                  Connect with a Specialist →
                </button>
              </div>
            )}

            <button
              className="btn btn-secondary"
              onClick={handleReset}
            >
              ← Analyze Another Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
