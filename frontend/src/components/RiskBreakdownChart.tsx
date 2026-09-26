import { useState } from 'react';
import type { RiskBreakdownRow } from '../lib/api';

interface Props {
  rows: RiskBreakdownRow[];
}

const W = 560;
const ROW_H = 26;
const PAD = { top: 4, right: 44, bottom: 4, left: 150 };

/**
 * Horizontal Pareto bar chart: each event type's contribution to the risk score,
 * already sorted descending by the backend. Horizontal because the category labels
 * (event type names) are long and variable-width - a vertical layout would need
 * rotated or truncated labels to fit as many rows as a single county can have.
 * Single series (one measure: risk_contribution) so no legend, per the dataviz skill.
 */
export function RiskBreakdownChart({ rows }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return null;

  const values = rows.map(r => Number(r.risk_contribution));
  const max = Math.max(...values);
  const innerW = W - PAD.left - PAD.right;
  const H = PAD.top + PAD.bottom + rows.length * ROW_H;
  const barH = 14;
  const x = (v: number) => (max > 0 ? (v / max) * innerW : 0);

  const hovered = hover !== null ? rows[hover] : null;

  return (
    <div className="chart" style={{ marginTop: 8 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Each weather event type's contribution to this zip's risk score, largest first"
      >
        {rows.map((r, i) => {
          const cy = PAD.top + i * ROW_H + ROW_H / 2;
          const w = Math.max(2, x(values[i]));
          return (
            <g key={r.event_type}>
              <text className="chart__axis" x={PAD.left - 8} y={cy + 4} textAnchor="end">
                {r.event_type}
              </text>
              <path
                className={`chart__bar ${hover !== null && hover !== i ? 'chart__bar--dim' : ''}`}
                d={roundedRight(PAD.left, cy - barH / 2, w, barH, 4)}
              />
              <text className="chart__value" x={PAD.left + w + 6} y={cy + 4} textAnchor="start">
                {values[i].toFixed(1)}
              </text>
              <rect
                className="chart__hit"
                x={0}
                y={PAD.top + i * ROW_H}
                width={W}
                height={ROW_H}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          className="tooltip"
          style={{
            left: `${((PAD.left + x(values[hover]) / 2) / W) * 100}%`,
            top: `${((PAD.top + hover * ROW_H) / H) * 100}%`,
          }}
        >
          <strong>{hovered.event_type}</strong>
          <br />
          {Number(hovered.events_per_year).toFixed(1)}/yr · severity {Number(hovered.avg_severity).toFixed(1)}/10 ·{' '}
          {Number(hovered.sensitivity_multiplier).toFixed(2)}x grid sensitivity
        </div>
      )}
    </div>
  );
}

/** Bar with 4px rounded right corners, square at the baseline (left) edge. */
function roundedRight(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} H${x} Z`;
}
