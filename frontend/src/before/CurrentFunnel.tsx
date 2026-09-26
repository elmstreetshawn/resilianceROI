import { useState } from 'react';
import { Option, Step } from '../components/Step';
import { resolveUtility } from '../lib/data';

// Faithful re-creation of Base's live funnel screens (captured 2026-09-26) so the demo
// can show "what they have" next to "what we made". Copy is verbatim.

export const BEFORE_SCREENS = ['home', 'utility', 'reason', 'provider', 'plan', 'deadend'] as const;
export type BeforeScreen = (typeof BEFORE_SCREENS)[number];

interface Props {
  screen: BeforeScreen;
  go: (s: BeforeScreen) => void;
  /** ZIP shown on the utility screen when it's opened directly (not typed on the homepage) */
  zip?: string;
}

export function CurrentFunnel({ screen, go, zip = '78660' }: Props) {
  const [selected, setSelected] = useState<'energy' | 'battery' | null>(null);
  const [homeZip, setHomeZip] = useState(''); // Base's homepage box starts empty

  // home -> utility -> reason -> provider -> plan only. 'home' is Base's homepage ZIP
  // box; 'utility' is the question it shows for split ZIPs before the funnel starts. 'deadend' is NOT the "next" screen
  // after a normal plan pick - it's Base's real dead-end for "I already have a
  // whole-home battery", reached from an earlier (unreproduced) screen. It was a real
  // bug that both "Select plan" buttons used to fall through this same next() and
  // always landed there regardless of which plan was chosen - fixed below with a local
  // confirmation instead of a forced screen change. 'deadend' stays reachable for
  // Compare.tsx's side-by-side demo, which deep-links to it directly.
  const FORWARD_ORDER: BeforeScreen[] = ['home', 'utility', 'reason', 'provider', 'plan'];
  const next = () => {
    const i = FORWARD_ORDER.indexOf(screen);
    if (i >= 0 && i < FORWARD_ORDER.length - 1) go(FORWARD_ORDER[i + 1]);
  };
  const back = () => {
    const i = BEFORE_SCREENS.indexOf(screen);
    if (i > 0) go(BEFORE_SCREENS[i - 1]);
  };

  // Homepage hero (www.basepowercompany.com): the ZIP box is the first step of signup.
  // A split ZIP (per Base's zip-router) goes to the utility question; others go straight
  // into the funnel, as on the live site.
  if (screen === 'home')
    return (
      <div className="home-hero">
        <nav className="home-hero__nav">
          <span className="home-hero__logo">BASE</span>
          <span className="home-hero__links">Products · Pricing · Resources · Utilities · Company</span>
          <span className="home-hero__cta">Get started</span>
        </nav>
        <div className="home-hero__body">
          <div className="home-hero__rating">4.8 stars ★★★★★</div>
          <h1 className="home-hero__title">Save money. Stay powered.</h1>
          <p className="home-hero__sub">The power company bringing affordable, reliable energy to homes across America.</p>
          <form
            className="home-hero__zip"
            onSubmit={async e => {
              e.preventDefault();
              if (!/^\d{5}$/.test(homeZip)) return;
              const { options } = await resolveUtility(homeZip);
              go(options.length > 1 ? 'utility' : 'reason');
            }}
          >
            <input
              inputMode="numeric"
              maxLength={5}
              placeholder="Enter your zip code"
              value={homeZip}
              onChange={e => setHomeZip(e.target.value.replace(/\D/g, ''))}
              aria-label="ZIP code"
            />
            <button className="btn" type="submit">
              See available plans
            </button>
          </form>
          <div className="home-hero__note">Join 30,000+ homes powered by Base</div>
        </div>
      </div>
    );

  // Homepage (www.basepowercompany.com) after entering a split ZIP, before the funnel starts
  if (screen === 'utility')
    return (
      <div className="card">
        <div className="step-head">
          <span className="step-back" aria-hidden>
            ←
          </span>
        </div>
        <div className="split" style={{ alignItems: 'stretch' }}>
          <div style={{ padding: '24px 8px' }}>
            <div className="step-label" style={{ marginBottom: 6 }}>
              {homeZip || zip}
            </div>
            <h1 className="h1">Who's your local utility?</h1>
            <p className="sub">So we can show the right plan and next steps for this address.</p>
            <div className="options">
              <Option onClick={next}>Austin Energy</Option>
              <Option onClick={next}>Oncor</Option>
            </div>
            <div className="spacer" />
            <p className="small">
              <strong style={{ color: 'var(--grey-100)' }}>Not sure?</strong>
              <br />
              Look at your bill for the "Delivery" or "TDU" section
              <br />
              Search your inbox for outage texts or alerts
              <br />
              Still can't find it? Email us: <u>team@basepowercompany.com</u>
            </p>
          </div>
          <div className="hero-art" />
        </div>
      </div>
    );

  if (screen === 'reason')
    return (
      <Step step={2} total={10}>
        <h1 className="h1">What's your main reason for considering Base?</h1>
        <div className="spacer" />
        <div className="options">
          <Option onClick={next}>Having reliable backup power at an affordable price</Option>
          <Option onClick={next}>Paying a low, fixed energy rate</Option>
          <Option onClick={next}>Both — saving on energy and staying backed up</Option>
        </div>
      </Step>
    );

  if (screen === 'provider')
    return (
      <Step step={4} total={10} onBack={back}>
        <h1 className="h1">How do you get your electricity today?</h1>
        <div className="spacer" />
        <div className="options">
          <Option onClick={next}>I pick my own electricity plan — I can choose my electricity provider</Option>
          <Option onClick={next}>
            My electricity provider is assigned — I get electricity from my city or electric co-op and can't switch
          </Option>
          <Option onClick={next}>I'm not sure</Option>
        </div>
      </Step>
    );

  if (screen === 'plan')
    return (
      <Step step={7} total={10} onBack={back}>
        <h1 className="h1">You have two options to power your home with Base.</h1>
        <p className="sub">Select which plan you would prefer:</p>
        <div className="plans">
          <div className="plan">
            <div className="plan__art">
              <div className="plan__icons">
                <span className="plan__icon">⚡</span>
              </div>
            </div>
            <div className="plan__body">
              <div className="plan__name">Base energy plan</div>
              <p className="plan__desc">Low, fixed electricity rates guaranteed below market average.</p>
              <button className="btn btn--block" onClick={() => setSelected('energy')}>
                {selected === 'energy' ? '✓ Selected' : 'Select plan'}
              </button>
            </div>
          </div>
          <div className="plan">
            <div className="plan__art plan__art--battery">
              <div className="plan__icons">
                <span className="plan__icon plan__icon--dark">⚡</span>
                <span className="plan__icon plan__icon--dark">▮</span>
              </div>
            </div>
            <div className="plan__body">
              <div className="plan__name">Base energy + battery</div>
              <p className="plan__desc">
                The same low rate, plus a Base home battery so you're covered when the grid goes down.*
              </p>
              <button className="btn btn--block" onClick={() => setSelected('battery')}>
                {selected === 'battery' ? '✓ Selected' : 'Select plan'}
              </button>
            </div>
          </div>
        </div>
        {selected && (
          <p className="small" style={{ marginTop: 16, color: 'var(--grey-60)' }}>
            This recreation stops here - Base's real funnel continues to address/scheduling screens we didn't
            capture. (The dead-end screen shown elsewhere in this demo is a separate path, for customers who already
            have a whole-home battery - it's not what happens after a normal plan pick.)
          </p>
        )}
      </Step>
    );

  return (
    <Step step={10} total={10} label="Last step" onBack={back}>
      <div className="split">
        <div>
          <h1 className="h1">Base battery isn't available—but you can still switch to Base Power's plan.</h1>
          <p className="sub">
            Because you already have a whole-home battery system, we are unable to install a Base battery system at your
            home.
          </p>
          <p className="small" style={{ color: 'var(--grey-80)' }}>
            <strong>The good news: you can still switch to Base Power's Battery-enabled energy plan.</strong> Please
            email us at <u>enrollments@basepowercompany.com</u> to get started.
          </p>
        </div>
        <div className="hero-art">
          <div className="hero-art__badge">
            Switch and save on
            <br />
            your power bill
          </div>
        </div>
      </div>
    </Step>
  );
}
