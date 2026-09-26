import { useState } from 'react';

// Side-by-side "what they have" vs "what we made", one pair per funnel moment.
// Both sides are the live app in iframes, so the demo can click through either.

const PAIRS = [
  {
    id: 'utility',
    title: 'ZIP & utility',
    before: 'home',
    after: 'zip',
    notes: [
      'Signup starts at the homepage ZIP box. For a split ZIP, the next screen asks "Who\'s your local utility?" using the names of wire companies most customers have never seen. The fallback is to dig through your bill or email.',
      'One question, only for split ZIPs, in words people know: who sends your electric bill? It settles retail choice too, so nothing is asked twice.',
    ],
  },
  {
    id: 'provider',
    title: 'Provider (asked again)',
    before: 'provider',
    after: 'zip',
    notes: [
      'Step 4 asks again, in different words, something the utility already settled. Answer "assigned" from Oncor territory and you land on the waitlist, a lost customer.',
      'This step doesn\'t exist. The ZIP, or the one bill question, already answered it.',
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
            Base's signup funnel
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
      <p className="small" style={{ color: 'var(--grey-60)', marginTop: -8, marginBottom: 16 }}>
        Each tab jumps both funnels straight to that one moment for comparison - it's not a live, continuous
        session, so switching tabs doesn't mean you selected anything on the previous one.
      </p>

      <div className="compare-cols">
        <div>
          <div className="compare-col__head">
            <span className="chip chip--neutral">Today: basepowercompany.com</span>
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
