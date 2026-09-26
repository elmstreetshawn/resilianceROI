import { useState } from 'react';

// Side-by-side "what they have" vs "what we made", one pair per funnel moment.
// Both sides are the live app in iframes, so the demo can click through either.

const PAIRS = [
  {
    id: 'provider',
    title: 'Utility & provider',
    before: 'provider',
    after: 'zip',
    notes: [
      'Base already has ?utility=ONCOR in the URL, yet asks the customer to self-report.',
      '"I\'m not sure" is a dead-weight answer. We detect utility and retail choice from the ZIP instead.',
    ],
  },
  {
    id: 'reason',
    title: 'Why Base?',
    before: 'reason',
    after: 'risk',
    notes: [
      'Before: asks what the customer values with zero evidence.',
      "After: shows their utility's real outage history (EIA-861) first, then asks.",
    ],
  },
  {
    id: 'compare',
    title: 'Compare the market',
    before: 'plan',
    after: 'compare',
    notes: [
      'Before: no market context. Customers leave to shop on PowerToChoose.',
      'After: PowerToChoose data inside the funnel, priced at their usage, with minimum-usage traps flagged.',
    ],
  },
  {
    id: 'plan',
    title: 'Pick a plan',
    before: 'plan',
    after: 'plan',
    notes: [
      'Before: two equal cards, one line of copy each.',
      'After: battery recommended, with a "Help me decide" panel: outage hours, backup hours at their usage, outage cost.',
    ],
  },
  {
    id: 'deadend',
    title: 'Already have a battery',
    before: 'deadend',
    after: 'deadend',
    notes: [
      'Before: "Please email us" and the lead is gone.',
      'After: one click opens a pre-filled email to enrollments with ZIP, utility and usage.',
    ],
  },
];

export function Compare({ search }: { search: string }) {
  const [pairId, setPairId] = useState(PAIRS[0].id);
  const pair = PAIRS.find(p => p.id === pairId)!;
  const src = (side: 'before' | 'after', screen: string) => `${search || '?'}${search ? '&' : ''}embed=1#/${side}/${screen}`;

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="compare-top">
        <div>
          <div className="eyebrow">Before / after</div>
          <h1 className="h1" style={{ marginBottom: 0 }}>
            Base's signup funnel, rebuilt to sell the battery
          </h1>
        </div>
        <div className="compare-tabs">
          {PAIRS.map(p => (
            <button
              key={p.id}
              className={`compare-tab ${p.id === pairId ? 'compare-tab--on' : ''}`}
              onClick={() => setPairId(p.id)}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      <div className="compare-cols">
        <div>
          <div className="compare-col__head">
            <span className="chip chip--neutral">Today: join.basepowercompany.com</span>
          </div>
          <iframe key={`b-${pair.id}`} className="compare-frame" src={src('before', pair.before)} title="Current funnel" />
          <ul className="compare-note">
            <li>{pair.notes[0]}</li>
          </ul>
        </div>
        <div>
          <div className="compare-col__head">
            <span className="chip">ResilienceROI</span>
          </div>
          <iframe key={`a-${pair.id}`} className="compare-frame" src={src('after', pair.after)} title="New funnel" />
          <ul className="compare-note">
            <li>{pair.notes[1]}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
