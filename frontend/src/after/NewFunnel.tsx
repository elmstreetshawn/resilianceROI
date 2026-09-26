import { useEffect, useMemo, useState } from 'react';
import { Option, Step } from '../components/Step';
import { OutageChart } from '../components/OutageChart';
import { BillUploader, type BillData } from '../components/BillUploader';
import { fetchWeatherRisk, type WeatherRisk } from '../lib/api';
import {
  BATTERY_KWH,
  DEFAULT_MONTHLY_KWH,
  OUTAGE_COSTS,
  OUTAGE_COST_TOTAL,
  backupHours,
} from '../lib/battery';
import {
  median,
  minUsageTraps,
  monthlyBill,
  plansFor,
  priceAt,
  reliabilityFor,
  resolveUtility,
  type Plan,
  type Reliability,
  type UtilityInfo,
} from '../lib/data';

export const AFTER_SCREENS = ['zip', 'risk', 'usage', 'compare', 'plan', 'done', 'deadend'] as const;
export type AfterScreen = (typeof AFTER_SCREENS)[number];

// Step numbers shown in the header; 'deadend' and 'done' are terminal
const STEP_OF: Record<AfterScreen, number> = { zip: 1, risk: 2, usage: 3, compare: 4, plan: 5, done: 6, deadend: 6 };
const TOTAL = 6;

const REASONS = [
  { id: 'backup', label: 'Having reliable backup power at an affordable price' },
  { id: 'rate', label: 'Paying a low, fixed energy rate' },
  { id: 'both', label: 'Both — saving on energy and staying backed up' },
] as const;
type Reason = (typeof REASONS)[number]['id'];

const USAGE_PRESETS = [
  { kwh: 500, hint: 'Apartment or small home' },
  { kwh: 1000, hint: 'Average Texas home' },
  { kwh: 2000, hint: 'Large home, pool or EV' },
];

interface Props {
  screen: AfterScreen;
  go: (s: AfterScreen) => void;
  initialZip: string;
  utilityParam: string | null;
}

export function NewFunnel({ screen, go, initialZip, utilityParam }: Props) {
  const [zipInput, setZipInput] = useState(initialZip);
  const [zip, setZip] = useState(initialZip);
  const [utility, setUtility] = useState<UtilityInfo | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [reliability, setReliability] = useState<Reliability[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [weather, setWeather] = useState<WeatherRisk | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [kwh, setKwh] = useState<number>(1000);
  const [choice, setChoice] = useState<'energy' | 'battery' | null>(null);

  // Everything downstream is derived from the ZIP, so any screen can be deep-linked
  useEffect(() => {
    let live = true;
    setLookupDone(false);
    (async () => {
      // A URL utility only applies to the ZIP it came with
      const { info, city } = await resolveUtility(zip, zip === initialZip ? utilityParam : null);
      if (!live) return;
      setUtility(info);
      setCity(city);
      setLookupDone(true);
      if (info) {
        const [rel, pl] = await Promise.all([reliabilityFor(info.code), plansFor(info.code)]);
        if (!live) return;
        setReliability(rel);
        setPlans(pl);
      } else {
        setReliability([]);
        setPlans([]);
      }
      const w = await fetchWeatherRisk(zip);
      if (live) setWeather(w);
    })();
    return () => {
      live = false;
    };
  }, [zip, initialZip, utilityParam]);

  const back = () => {
    const order: AfterScreen[] = ['zip', 'risk', 'usage', 'compare', 'plan'];
    const i = order.indexOf(screen);
    if (screen === 'done' || screen === 'deadend') go('plan');
    else if (i > 0) go(order[i - 1]);
  };

  const worst = useMemo(
    () => reliability.reduce<Reliability | null>((w, r) => (!w || r.saidi_minutes > w.saidi_minutes ? r : w), null),
    [reliability],
  );
  const avgHours = reliability.length
    ? reliability.reduce((s, r) => s + r.saidi_minutes, 0) / reliability.length / 60
    : 0;
  const backup = backupHours(kwh || DEFAULT_MONTHLY_KWH);

  // ---------- 1. ZIP → utility (replaces "How do you get your electricity today?") ----------
  if (screen === 'zip') {
    const valid = /^\d{5}$/.test(zipInput);
    return (
      <Step step={STEP_OF.zip} total={TOTAL}>
        <h1 className="h1">Let's look up your home.</h1>
        <p className="sub">Your ZIP code tells us your utility, your grid's track record and the plans you can pick.</p>
        <form
          className="row"
          onSubmit={e => {
            e.preventDefault();
            if (valid) setZip(zipInput);
          }}
        >
          <input
            className="input"
            style={{ flex: 1, minWidth: 160 }}
            inputMode="numeric"
            maxLength={5}
            value={zipInput}
            onChange={e => setZipInput(e.target.value.replace(/\D/g, ''))}
            aria-label="ZIP code"
          />
          <button className="btn btn--ghost" type="submit" disabled={!valid || zipInput === zip}>
            Look up
          </button>
        </form>
        <div className="spacer" />
        {lookupDone && utility && (
          <div className="detect">
            <span className="detect__icon">✓</span>
            <div>
              <div className="h2" style={{ marginBottom: 2 }}>
                {utility.name} delivers your power{city ? ` in ${city}` : ''}.
              </div>
              {utility.choice ? (
                <p className="small">
                  Your area is deregulated, so <strong>you can choose your electricity provider</strong>. No need to
                  ask: we worked it out from your ZIP.
                </p>
              ) : (
                <p className="small">
                  {utility.name} is a city utility or co-op, so your electricity provider is assigned. We'll show you
                  what Base can still do for your home.
                </p>
              )}
            </div>
          </div>
        )}
        {lookupDone && !utility && (
          <div className="callout callout--warn">
            We don't have ZIP {zip} mapped yet. Try 78660 (Oncor), 77096 (CenterPoint), 77550 (TNMP) or 78701
            (Austin Energy).
          </div>
        )}
        <div className="spacer" />
        <button className="btn btn--block" disabled={!utility} onClick={() => go('risk')}>
          Continue
        </button>
      </Step>
    );
  }

  // ---------- 2. Evidence + reason (replaces the bare "main reason" question) ----------
  if (screen === 'risk') {
    return (
      <Step step={STEP_OF.risk} total={TOTAL} onBack={back}>
        <div className="eyebrow">Your grid, by the numbers</div>
        <h1 className="h1">
          {worst && worst.saidi_minutes >= 600
            ? `In ${worst.year}, ${utility?.name} customers averaged ${Math.round(worst.saidi_minutes / 60)} hours without power.`
            : `Here's how often ${utility?.name ?? 'your utility'} loses power.`}
        </h1>
        <p className="sub">
          Average hours each {utility?.name} customer spent in the dark, per year, from U.S. EIA-861 utility
          reliability filings.{' '}
          {worst && backup.essentials >= worst.saidi_minutes / 60 && (
            <strong>A Base battery would have kept your essentials running through every hour of it.</strong>
          )}
        </p>

        {reliability.length > 0 ? (
          <>
            <div className="stats">
              <div className="stat">
                <div className="stat__value stat__value--alert">{Math.round((worst?.saidi_minutes ?? 0) / 60)}h</div>
                <div className="stat__label">Worst year ({worst?.year}) without power</div>
              </div>
              <div className="stat">
                <div className="stat__value">{avgHours.toFixed(0)}h</div>
                <div className="stat__label">
                  Average per year, {reliability[0].year}–{reliability[reliability.length - 1].year}
                </div>
              </div>
              <div className="stat">
                <div className="stat__value">{Math.round(backup.essentials)}h</div>
                <div className="stat__label">Backup a {BATTERY_KWH} kWh Base battery gives your essentials</div>
              </div>
            </div>
            <OutageChart rows={reliability} utilityName={utility?.name ?? ''} />
          </>
        ) : (
          <div className="callout">No reliability filing for {utility?.name} yet.</div>
        )}

        {weather && (
          <div className="callout" style={{ marginTop: 12 }}>
            <strong>Severe weather near you:</strong> {weather.severe_weather_events_5yr} events in 5 years (NOAA).{' '}
            {weather.weather_risk_summary}
          </div>
        )}

        <div className="spacer" />
        <div className="h2">Knowing this, what matters most to you?</div>
        <div className="options">
          {REASONS.map(r => (
            <Option
              key={r.id}
              selected={reason === r.id}
              onClick={() => {
                setReason(r.id);
                go('usage');
              }}
            >
              {r.label}
            </Option>
          ))}
        </div>
      </Step>
    );
  }

  // ---------- 3. Usage (PowerToChoose step) ----------
  if (screen === 'usage') {
    const [showBillUpload, setShowBillUpload] = useState(true);

    const handleBillUploadSuccess = (data: BillData) => {
      setKwh(data.monthly_kwh);
      setShowBillUpload(false);
      // Auto-proceed to compare
      setTimeout(() => go('compare'), 500);
    };

    return (
      <Step step={STEP_OF.usage} total={TOTAL} onBack={back}>
        {showBillUpload && (
          <>
            <BillUploader
              zip={zip}
              onSuccess={handleBillUploadSuccess}
              onCancel={() => setShowBillUpload(false)}
            />
            <div style={{ marginBottom: 24 }} />
          </>
        )}

        <h1 className="h1">About how much electricity do you use a month?</h1>
        <p className="sub">
          Texas plans are priced at 500, 1,000 and 2,000 kWh, and some plans charge more if you use less. Check a recent
          bill, or pick the closest size.
        </p>
        <div className="usage-picks">
          {USAGE_PRESETS.map(p => (
            <Option key={p.kwh} className="usage-pick" selected={kwh === p.kwh} onClick={() => setKwh(p.kwh)} hint={p.hint}>
              <span className="usage-pick__kwh">{p.kwh.toLocaleString()}</span>
              kWh / month
            </Option>
          ))}
        </div>
        <div className="spacer" />
        <label className="small" htmlFor="kwh">
          Or enter your exact usage (kWh)
        </label>
        <input
          id="kwh"
          className="input"
          inputMode="numeric"
          value={kwh || ''}
          onChange={e => setKwh(Number(e.target.value.replace(/\D/g, '')) || 0)}
        />
        <div className="spacer" />
        <button className="btn btn--block" disabled={kwh < 100} onClick={() => go('compare')}>
          Compare plans in my area
        </button>
      </Step>
    );
  }

  // ---------- 4. Compare (PowerToChoose results, Base-styled) ----------
  if (screen === 'compare') {
    return (
      <Step step={STEP_OF.compare} total={TOTAL} onBack={back}>
        <ComparePlans plans={plans} kwh={kwh} utility={utility} onNext={() => go('plan')} />
      </Step>
    );
  }

  // ---------- 5. Plan choice with "Help me decide" (replaces step 7) ----------
  if (screen === 'plan') {
    const recommendBattery = reason !== 'rate' || (worst?.saidi_minutes ?? 0) >= 600;
    const worstHours = (worst?.saidi_minutes ?? 0) / 60;
    return (
      <Step step={STEP_OF.plan} total={TOTAL} onBack={back}>
        <h1 className="h1">You have two options to power your home with Base.</h1>
        <p className="sub">
          Same low fixed rate either way. The difference is what happens when the grid goes down.
        </p>
        <div className="plans">
          <PlanCard
            name="Base energy plan"
            desc="Low, fixed electricity rates guaranteed below market average."
            items={['Fixed rate, below market average', 'No minimum-usage fee', { text: 'No backup in an outage', no: true }]}
            onSelect={() => {
              setChoice('energy');
              go('done');
            }}
          />
          <PlanCard
            battery
            recommended={recommendBattery}
            name="Base energy + battery"
            desc="The same low rate, plus a Base home battery so you're covered when the grid goes down."
            items={[
              'Same fixed rate, no minimum-usage fee',
              `About ${Math.round(backup.essentials)}h of backup for your essentials`,
              'Switches on automatically when the grid goes down',
            ]}
            onSelect={() => {
              setChoice('battery');
              go('done');
            }}
          />
        </div>

        <div className="decide">
          <div className="eyebrow">Help me decide</div>
          <div className="h2">What the battery means at your address</div>
          <div className="decide__grid">
            <div>
              <div className="stat__value stat__value--alert">{Math.round(worstHours)}h</div>
              <p className="small">
                average time without power for {utility?.name} customers in {worst?.year}
                {worst && MAJOR_EVENT_NOTE(worst.year)}.
              </p>
            </div>
            <div>
              <div className="stat__value">{Math.round(backup.essentials)}h</div>
              <p className="small">
                essentials backup from {BATTERY_KWH} kWh at your {kwh.toLocaleString()} kWh/month
                ({Math.round(backup.wholeHome)}h if you run the whole house).
              </p>
            </div>
            <div>
              <p className="small" style={{ marginBottom: 6 }}>
                One multi-day outage without backup:
              </p>
              <ul className="cost-list">
                {OUTAGE_COSTS.map(c => (
                  <li key={c.label}>
                    <span>{c.label}</span>
                    <span>${c.amount}</span>
                  </li>
                ))}
                <li className="total">
                  <span>Estimated out-of-pocket</span>
                  <span>${OUTAGE_COST_TOTAL}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="spacer" />
        <button className="link-btn" onClick={() => go('deadend')}>
          I already have a whole-home battery
        </button>
      </Step>
    );
  }

  // ---------- Fixed dead end: one-click forward instead of "please email us" ----------
  if (screen === 'deadend') {
    return <DeadEnd zip={zip} utility={utility} kwh={kwh} onBack={back} />;
  }

  // ---------- 6. Done ----------
  return (
    <Step step={STEP_OF.done} total={TOTAL} onBack={back}>
      <div className="split">
        <div>
          <div className="chip">✓ Plan selected</div>
          <div className="spacer" />
          <h1 className="h1">
            {choice === 'battery' ? "You're getting Base energy + battery." : "You're getting the Base energy plan."}
          </h1>
          <p className="sub">
            {choice === 'battery'
              ? `Next we'll schedule a site check at ${zip}. Your battery covers about ${Math.round(backup.essentials)} hours of essentials.`
              : 'Next we\'ll confirm your address and start your switch.'}
          </p>
          <button className="btn">Continue to address</button>
        </div>
        <div className={`hero-art ${choice === 'battery' ? 'plan__art--battery' : ''}`}>
          <div className="hero-art__badge">
            {choice === 'battery' ? 'Covered when' : 'Switch and save on'}
            <br />
            {choice === 'battery' ? 'the grid goes down' : 'your power bill'}
          </div>
        </div>
      </div>
    </Step>
  );
}

const MAJOR_EVENT_NOTE = (year: number) =>
  ({ 2021: ', the year of Winter Storm Uri', 2023: ', the year of Winter Storm Mara', 2024: ', the year of Hurricane Beryl' })[
    year
  ] ?? '';

// ---------- Pieces ----------

function PlanCard(props: {
  name: string;
  desc: string;
  items: (string | { text: string; no: boolean })[];
  battery?: boolean;
  recommended?: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={`plan ${props.recommended ? 'plan--recommended' : ''}`}>
      {props.recommended && <span className="plan__ribbon">Recommended for you</span>}
      <div className={`plan__art ${props.battery ? 'plan__art--battery' : ''}`}>
        <div className="plan__icons">
          <span className={`plan__icon ${props.battery ? 'plan__icon--dark' : ''}`}>⚡</span>
          {props.battery && <span className="plan__icon plan__icon--dark">▮</span>}
        </div>
      </div>
      <div className="plan__body">
        <div className="plan__name">{props.name}</div>
        <p className="plan__desc">{props.desc}</p>
        <ul className="plan__list">
          {props.items.map(i =>
            typeof i === 'string' ? (
              <li key={i}>{i}</li>
            ) : (
              <li key={i.text} className="no">
                {i.text}
              </li>
            ),
          )}
        </ul>
        <button className={`btn btn--block ${props.recommended ? 'btn--dark' : ''}`} onClick={props.onSelect}>
          Select plan
        </button>
      </div>
    </div>
  );
}

function ComparePlans({
  plans,
  kwh,
  utility,
  onNext,
}: {
  plans: Plan[];
  kwh: number;
  utility: UtilityInfo | null;
  onNext: () => void;
}) {
  const [fixedOnly, setFixedOnly] = useState(true);
  const [hideMinUsage, setHideMinUsage] = useState(false);

  const base = plans.find(p => p.company === 'Base Power');
  const market = plans.filter(p => p.company !== 'Base Power' && !p.prepaid);
  const shown = market
    .filter(p => (!fixedOnly || p.rate_type === 'Fixed') && (!hideMinUsage || !p.min_usage))
    .sort((a, b) => priceAt(a, kwh) - priceAt(b, kwh))
    .slice(0, 6);
  const marketMedian = median(market.map(p => priceAt(p, kwh)));
  const traps = minUsageTraps(market);
  const topTrap = traps[0];
  // Usage swings with the seasons; a mild spring month exposes minimum-usage penalties
  const mild = Math.round(kwh * 0.6);

  if (!utility?.choice) {
    return (
      <>
        <h1 className="h1">{utility?.name ?? 'Your utility'} sets your rate.</h1>
        <p className="sub">
          Your area doesn't have retail choice, so there are no plans to compare. The battery can still keep your
          lights on during an outage.
        </p>
        <button className="btn btn--block" onClick={onNext}>
          See my options
        </button>
      </>
    );
  }

  return (
    <>
      <h1 className="h1">
        {market.length} plans in {utility.name} territory. Here's what they cost at {kwh.toLocaleString()} kWh.
      </h1>
      <p className="sub">
        Live offers from PowerToChoose.org, the state's official comparison site, priced at your usage.
      </p>

      {topTrap && (
        <div className="callout callout--warn">
          <strong>Watch the minimum-usage trap.</strong> {traps.length} of these plans charge a fee or pull a bill
          credit if you use too little. {topTrap.plan.company}'s "{topTrap.plan.product}" advertises{' '}
          {(topTrap.plan.kwh1000 * 100).toFixed(1)}¢ at 1,000 kWh but costs{' '}
          <strong>{(topTrap.plan.kwh500 * 100).toFixed(1)}¢ at 500 kWh</strong>
          {topTrap.plan.fees_credits ? ` (${topTrap.plan.fees_credits.replace(/\.$/, '')})` : ''}. A mild month can wipe
          out the "deal". <strong>Base has no minimum-usage fee.</strong>
        </div>
      )}

      <div className="spacer" />
      <div className="row" style={{ marginBottom: 10 }}>
        <Option className="chip chip--neutral" selected={fixedOnly} onClick={() => setFixedOnly(v => !v)}>
          Fixed rate only
        </Option>
        <Option className="chip chip--neutral" selected={hideMinUsage} onClick={() => setHideMinUsage(v => !v)}>
          Hide minimum-usage fees
        </Option>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Provider & plan</th>
              <th className="num">¢/kWh at {kwh.toLocaleString()}</th>
              <th className="num">Est. monthly</th>
              <th className="num" title="Same plan in a month where you use 40% less">Mild month</th>
              <th className="num">Term</th>
            </tr>
          </thead>
          <tbody>
            <tr className="is-base">
              <td>
                Base Power · {base ? base.product : 'Base energy plan'}
                <div className="small">Fixed · no minimum-usage fee · battery option</div>
              </td>
              <td className="num">{base ? (priceAt(base, kwh) * 100).toFixed(1) : `< ${(marketMedian * 100).toFixed(1)}`}</td>
              <td className="num">{base ? `$${monthlyBill(base, kwh).toFixed(0)}` : 'below median'}</td>
              <td className="num">{base ? `$${monthlyBill(base, mild).toFixed(0)}` : 'no penalty'}</td>
              <td className="num">{base ? `${base.term_months} mo` : '—'}</td>
            </tr>
            {shown.map(p => (
              <tr key={`${p.company}-${p.product}`} className={p.min_usage ? 'is-trap' : ''}>
                <td>
                  {p.company} · {p.product}
                  <div className="small">
                    {p.rate_type}
                    {p.min_usage && ' · ⚠ minimum-usage fee/credit'}
                    {p.time_of_use && ' · time-of-use'}
                    {p.facts_url && (
                      <>
                        {' · '}
                        <a href={p.facts_url} target="_blank" rel="noreferrer">
                          EFL
                        </a>
                      </>
                    )}
                  </div>
                </td>
                <td className="num">{(priceAt(p, kwh) * 100).toFixed(1)}</td>
                <td className="num">${monthlyBill(p, kwh).toFixed(0)}</td>
                <td className="num">
                  ${monthlyBill(p, mild).toFixed(0)}
                  <div className="small">{(priceAt(p, mild) * 100).toFixed(1)}¢</div>
                </td>
                <td className="num">{p.term_months} mo</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small" style={{ marginTop: 8 }}>
        "Mild month" is the same plan at {mild.toLocaleString()} kWh. Market median at your usage:{' '}
        {(marketMedian * 100).toFixed(1)}¢/kWh
        {base ? '' : '. Base guarantees a rate below market average; your exact rate is quoted at signup'}. Prices
        include delivery charges, per each plan's Electricity Facts Label.
      </p>

      <div className="spacer" />
      <div className="callout callout--good">
        <strong>None of these plans keep your lights on in an outage.</strong> Only Base pairs a fixed rate with a home
        battery.
      </div>
      <div className="spacer" />
      <button className="btn btn--block" onClick={onNext}>
        See my Base options
      </button>
    </>
  );
}

function DeadEnd({
  zip,
  utility,
  kwh,
  onBack,
}: {
  zip: string;
  utility: UtilityInfo | null;
  kwh: number;
  onBack: () => void;
}) {
  const [sent, setSent] = useState(false);
  const subject = `Battery-enabled energy plan: existing home battery (${zip})`;
  const body = [
    'Hi Base enrollments team,',
    '',
    "I already have a whole-home battery and would like to switch to Base Power's battery-enabled energy plan.",
    '',
    `ZIP: ${zip}`,
    `Utility: ${utility?.name ?? 'unknown'}`,
    `Monthly usage: ~${kwh} kWh`,
    '',
    'Please reach out to finish my enrollment.',
  ].join('\n');
  const mailto = `mailto:enrollments@basepowercompany.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Step step={STEP_OF.deadend} total={TOTAL} label="Last step" onBack={onBack}>
      <div className="split">
        <div>
          <h1 className="h1">You already have a battery. You can still switch to Base Power's plan.</h1>
          <p className="sub">
            We can't install a second battery system, but Base's battery-enabled energy plan works for your home. We've
            filled in your details; one click sends them to our enrollments team.
          </p>
          {!sent ? (
            <a className="btn btn--dark btn--block" href={mailto} onClick={() => setSent(true)}>
              Send my info to enrollments →
            </a>
          ) : (
            <div className="callout callout--good">
              <strong>Your email is ready to send.</strong> Hit send in your mail app and enrollments will take it from there.
            </div>
          )}
          <details style={{ marginTop: 12 }}>
            <summary className="small">What we'll send</summary>
            <pre className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
              {body}
            </pre>
          </details>
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
