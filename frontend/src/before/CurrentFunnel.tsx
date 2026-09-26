import { Option, Step } from '../components/Step';

// Faithful re-creation of Base's live funnel screens (captured 2026-09-26) so the demo
// can show "what they have" next to "what we made". Copy is verbatim.

export const BEFORE_SCREENS = ['reason', 'provider', 'plan', 'deadend'] as const;
export type BeforeScreen = (typeof BEFORE_SCREENS)[number];

interface Props {
  screen: BeforeScreen;
  go: (s: BeforeScreen) => void;
}

export function CurrentFunnel({ screen, go }: Props) {
  const next = () => {
    const i = BEFORE_SCREENS.indexOf(screen);
    if (i < BEFORE_SCREENS.length - 1) go(BEFORE_SCREENS[i + 1]);
  };
  const back = () => {
    const i = BEFORE_SCREENS.indexOf(screen);
    if (i > 0) go(BEFORE_SCREENS[i - 1]);
  };

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
              <button className="btn btn--block" onClick={next}>
                Select plan
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
              <button className="btn btn--block" onClick={next}>
                Select plan
              </button>
            </div>
          </div>
        </div>
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
