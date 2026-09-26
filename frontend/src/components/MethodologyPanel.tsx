import { useState } from 'react';
import { fetchMethodology, type Methodology } from '../lib/api';
import { RiskBreakdownChart } from './RiskBreakdownChart';

/** "Show your work" panel - lazily fetches /methodology/<zip> the first time it's
 * opened, so it costs nothing on screens where nobody expands it. */
export function MethodologyPanel({ zip }: { zip: string }) {
  const [data, setData] = useState<Methodology | null>(null);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);

  const onToggle = async (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open || opened) return;
    setOpened(true);
    setLoading(true);
    setData(await fetchMethodology(zip));
    setLoading(false);
  };

  return (
    <details className="methodology" onToggle={onToggle} style={{ marginTop: 12 }}>
      <summary className="small">How we calculated this</summary>
      {loading && <p className="small">Loading...</p>}
      {!loading && opened && !data && <p className="small">Methodology data unavailable right now.</p>}
      {data && (
        <div style={{ marginTop: 10 }}>
          <p className="small">{data.saidi_caveat}</p>

          {data.catastrophic_events.length > 0 && (
            <div className="callout callout--warn" style={{ marginTop: 10 }}>
              {data.catastrophic_events.map(e => (
                <p className="small" key={e.name} style={{ margin: 0 }}>
                  <strong>
                    {e.name} ({e.date_range}) predates our ERCOT outage data and isn't in the grid-sensitivity
                    numbers below.
                  </strong>{' '}
                  Documented impact: {e.impact_description}{' '}
                  {e.vs_model_baseline != null && (
                    <>
                      That's about <strong>{e.vs_model_baseline}x</strong> our model's normal-year baseline - a
                      one-off event this large can't be statistically estimated from a single data point, so it's
                      shown here instead of folded into the multipliers below. Source: {e.source}.
                    </>
                  )}
                </p>
              ))}
            </div>
          )}

          {data.risk_breakdown.length > 0 && (
            <>
              <p className="small" style={{ marginTop: 10, marginBottom: 4 }}>
                <strong>
                  {data.county_name ?? 'This county'}'s real weather history, weighted by how much each event type
                  actually drove ERCOT-wide forced-outage MW in our outage data - largest contributor first:
                </strong>
              </p>
              <RiskBreakdownChart rows={data.risk_breakdown} />
            </>
          )}

          {/* Progressive disclosure: the chart above is the answer for most people;
              the raw numbers and event log are one more click away, not shown by default. */}
          <details style={{ marginTop: 12 }}>
            <summary className="small">Show the full numbers</summary>
            <div style={{ marginTop: 10 }}>
              {data.risk_breakdown.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Event type</th>
                        <th className="num">Events/yr</th>
                        <th className="num">Avg severity</th>
                        <th className="num" title="How much this event type moved statewide ERCOT outage MW, vs. baseline">
                          Grid sensitivity
                        </th>
                        <th className="num">Score contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.risk_breakdown.map(r => (
                        <tr key={r.event_type}>
                          <td>{r.event_type}</td>
                          <td className="num">{Number(r.events_per_year).toFixed(1)}</td>
                          <td className="num">{Number(r.avg_severity).toFixed(1)}/10</td>
                          <td className="num">{Number(r.sensitivity_multiplier).toFixed(2)}x</td>
                          <td className="num">{Number(r.risk_contribution).toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.recent_events.length > 0 && (
                <>
                  <p className="small" style={{ marginTop: 10, marginBottom: 4 }}>
                    <strong>
                      {data.county_total_events} real NOAA storm events on record for this county. Most recent:
                    </strong>
                  </p>
                  <ul className="cost-list">
                    {data.recent_events.slice(0, 6).map((e, i) => (
                      <li key={i}>
                        <span>
                          {e.event_type} · {e.date.slice(0, 10)}
                        </span>
                        <span>severity {Number(e.severity_score).toFixed(1)}/10</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="small" style={{ marginTop: 10, color: 'var(--grey-60)' }}>
                Sources: {data.sources.join(' · ')}
              </p>
            </div>
          </details>
        </div>
      )}
    </details>
  );
}
