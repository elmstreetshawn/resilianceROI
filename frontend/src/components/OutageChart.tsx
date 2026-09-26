import { useState } from 'react';
import { MAJOR_EVENTS, type Reliability } from '../lib/data';

interface Props {
  rows: Reliability[];
  utilityName: string;
}

const W = 560;
const H = 200;
const PAD = { top: 28, right: 8, bottom: 40, left: 36 };

/**
 * Single-series bar chart: average hours each customer spent without power, by year
 * (EIA SAIDI incl. major events). One hue, so no legend; the heading names the series.
 */
export function OutageChart({ rows, utilityName }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return null;

  const hours = rows.map(r => r.saidi_minutes / 60);
  const max = niceMax(Math.max(...hours));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / rows.length;
  const barW = Math.min(56, slot * 0.55);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];

  const hovered = hover !== null ? rows[hover] : null;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Hours without power per ${utilityName} customer, by year`}>
        {ticks.map(t => (
          <g key={t}>
            <line className="chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="chart__axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {Math.round(t)}h
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const h = hours[i];
          const cx = PAD.left + slot * i + slot / 2;
          const top = y(h);
          const event = MAJOR_EVENTS[r.year];
          const isMajor = event && h >= 10;
          return (
            <g key={r.year}>
              <path
                className={`chart__bar ${hover !== null && hover !== i ? 'chart__bar--dim' : ''}`}
                d={roundedTop(cx - barW / 2, top, barW, PAD.top + innerH - top, 4)}
              />
              <text className="chart__value" x={cx} y={top - 6} textAnchor="middle">
                {h < 10 ? h.toFixed(1) : Math.round(h)}h
              </text>
              <text className="chart__axis" x={cx} y={H - PAD.bottom + 16} textAnchor="middle">
                {r.year}
              </text>
              {isMajor && (
                <text className="chart__event" x={cx} y={H - PAD.bottom + 30} textAnchor="middle">
                  {event}
                </text>
              )}
              <rect
                className="chart__hit"
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={innerH}
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
            left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%`,
            top: `${(y(hours[hover]) / H) * 100}%`,
          }}
        >
          <strong>{hovered.year}</strong> · {hours[hover].toFixed(1)} hours without power
          <br />
          {hovered.saifi_times ? `${hovered.saifi_times.toFixed(1)} outages per customer` : null}
          {hovered.saidi_minutes_no_major_events
            ? ` · ${(hovered.saidi_minutes_no_major_events / 60).toFixed(1)}h on normal days`
            : null}
        </div>
      )}
    </div>
  );
}

function niceMax(v: number) {
  const steps = [2, 5, 10, 20, 40, 60, 80, 100];
  return steps.find(s => s >= v * 1.1) ?? Math.ceil(v / 20) * 20;
}

/** Bar with 4px rounded top corners, square at the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
