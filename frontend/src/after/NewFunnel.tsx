import { useEffect, useMemo, useRef, useState } from 'react';
import { Option, Step } from '../components/Step';
import { OutageChart } from '../components/OutageChart';
import { BillUploader, type BillData } from '../components/BillUploader';
import { MethodologyPanel } from '../components/MethodologyPanel';
import { SiteSurvey } from '../components/SiteSurvey';
import {
  createLead,
  fetchLead,
  fetchStageTwoAnalysis,
  fetchWeatherRisk,
  type StageTwoAnalysis,
  type WeatherRisk,
} from '../lib/api';
import { BATTERY_KWH, DEFAULT_MONTHLY_KWH, OUTAGE_COST_TOTAL, backupHours } from '../lib/battery';
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

export const AFTER_SCREENS = ['zip', 'risk', 'usage', 'compare', 'plan', 'done', 'deadend', 'survey'] as const;
export type AfterScreen = (typeof AFTER_SCREENS)[number];

// Step numbers shown in the header; 'deadend', 'done' and 'survey' are terminal
const STEP_OF: Record<AfterScreen, number> = {
  zip: 1, risk: 2, usage: 3, compare: 4, plan: 5, done: 6, deadend: 6, survey: 6,
};
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
  /** From ?lead=<id> - present when the customer is resuming a previously saved lead. */
  leadId: string | null;
}

export function NewFunnel({ screen, go, initialZip, utilityParam, leadId }: Props) {
  // The ZIP box starts empty (the customer types it); deep links to later screens
  // still get a ZIP from the URL or the demo default so they can render.
  const [zipInput, setZipInput] = useState('');
  const [zip, setZip] = useState(screen === 'zip' ? '' : initialZip);
  const [utility, setUtility] = useState<UtilityInfo | null>(null);
  // More than one entry = split ZIP; the customer answers one plain-language question
  const [utilityOptions, setUtilityOptions] = useState<UtilityInfo[]>([]);
  const [city, setCity] = useState<string | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [reliability, setReliability] = useState<Reliability[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [weather, setWeather] = useState<WeatherRisk | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [kwh, setKwh] = useState<number>(1000);
  // Set by OCR (the real extracted bill amount) - when absent, estimated from plan pricing.
  const [billAmount, setBillAmount] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<StageTwoAnalysis | null>(null);
  const [choice, setChoice] = useState<'energy' | 'battery' | null>(null);
  // Declared at top level, not inside the 'usage' screen branch below - conditionally
  // calling useState only on some screens breaks React's Rules of Hooks (the hook count
  // must be identical on every render of this component) and crashes on screen changes.
  const [showBillUpload, setShowBillUpload] = useState(true);
  // Set once we have a persisted lead - either resumed from ?lead=<id>, or created the
  // moment a battery plan is picked. This is what makes the funnel resumable: the
  // customer can leave and come back later to finish the site survey via a saved link,
  // instead of the whole thing living only in this component's state.
  const [savedLeadId, setSavedLeadId] = useState<string | null>(null);

  // Resume a saved lead: restore its zip/reason/usage/choice and jump straight to the
  // site survey, so a customer who left mid-flow doesn't have to redo the funnel.
  useEffect(() => {
    if (!leadId) return;
    let live = true;
    fetchLead(leadId).then(lead => {
      if (!live || !lead) return;
      setSavedLeadId(lead.id);
      setZip(lead.zip_code);
      setZipInput(lead.zip_code);
      if (REASONS.some(r => r.id === lead.reason)) setReason(lead.reason as Reason);
      if (lead.monthly_kwh) setKwh(lead.monthly_kwh);
      if (lead.choice === 'energy' || lead.choice === 'battery') setChoice(lead.choice);
      go('survey');
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // The moment a battery plan is picked (and we're not already resuming a saved lead),
  // persist it - this is what a resumable link points at. creatingLead guards the
  // in-flight window: savedLeadId alone only blocks a second call AFTER the first
  // resolves, so a re-render while the request is still pending could otherwise fire
  // a duplicate create.
  const creatingLead = useRef(false);
  useEffect(() => {
    if (screen !== 'done' || choice !== 'battery' || savedLeadId || creatingLead.current) return;
    let live = true;
    creatingLead.current = true;
    createLead(zip, utility?.code ?? '', kwh, reason ?? '', choice).then(id => {
      creatingLead.current = false;
      if (live && id) setSavedLeadId(id);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, choice]);

  // Everything downstream is derived from the ZIP, so any screen can be deep-linked
  useEffect(() => {
    let live = true;
    setLookupDone(false);
    if (!/^\d{5}$/.test(zip)) {
      setUtility(null);
      setUtilityOptions([]);
      return;
    }
    (async () => {
      // A URL utility only applies to the ZIP it came with
      const { info, options = [], city } = await resolveUtility(zip, zip === initialZip ? utilityParam : null);
      if (!live) return;
      // Deep links past step 1 on a split ZIP fall back to the retail-choice utility
      setUtility(info ?? (screen !== 'zip' ? options.find(o => o.choice) ?? options[0] ?? null : null));
      setUtilityOptions(info ? [] : options);
      setCity(city);
      setLookupDone(true);
      const w = await fetchWeatherRisk(zip);
      if (live) setWeather(w);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zip, initialZip, utilityParam]);

  // Utility-specific data loads once the utility is known (directly, or from the split-ZIP answer)
  useEffect(() => {
    let live = true;
    if (!utility) {
      setReliability([]);
      setPlans([]);
      return;
    }
    Promise.all([reliabilityFor(utility.code), plansFor(utility.code)]).then(([rel, pl]) => {
      if (!live) return;
      setReliability(rel);
      setPlans(pl);
    });
    return () => {
      live = false;
    };
  }, [utility]);

  // Real ROI/qualification math (backend/main.py's /stage2/analyze: risk score from
  // ERCOT outage correlation + NOAA severe weather + utility SAIDI, payback years,
  // monthly savings) - refetches whenever the ZIP or usage estimate changes.
  useEffect(() => {
    if (!zip || kwh < 100) return;
    let live = true;
    const bill = billAmount ?? estimateMonthlyBill(plans, kwh);
    fetchStageTwoAnalysis(zip, kwh, bill).then(a => {
      if (live) setAnalysis(a);
    });
    return () => {
      live = false;
    };
  }, [zip, kwh, billAmount, plans]);

  const back = () => {
    const order: AfterScreen[] = ['zip', 'risk', 'usage', 'compare', 'plan'];
    const i = order.indexOf(screen);
    if (screen === 'deadend') go('plan');
    else if (screen === 'done' || screen === 'survey') go(screen === 'survey' ? 'done' : 'plan');
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
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '');
              setZipInput(v);
              if (v.length === 5) setZip(v); // look up as soon as the ZIP is complete
            }}
            aria-label="ZIP code"
          />
          <button className="btn btn--ghost" type="submit" disabled={!valid || zipInput === zip}>
            Look up
          </button>
        </form>
        <div className="spacer" />
        {lookupDone && utilityOptions.length > 1 && <SplitZipQuestion options={utilityOptions} city={city} selected={utility} onPick={setUtility} />}
        {lookupDone && utility && (
          <div className="detect" style={utilityOptions.length > 1 ? { marginTop: 12 } : undefined}>
            <span className="detect__icon">✓</span>
            <div>
              {utility.choice ? (
                <>
                  <div className="h2" style={{ marginBottom: 2 }}>
                    You can choose your electricity provider{city ? ` in ${city}` : ''}.
                  </div>
                  <p className="small">
                    {utility.name} maintains the lines, and you pick who sells you power.{' '}
                    {utilityOptions.length > 1 ? 'That answer settles it; ' : 'We worked it out from your ZIP; '}
                    there's nothing else to ask.
                  </p>
                </>
              ) : (
                <>
                  <div className="h2" style={{ marginBottom: 2 }}>
                    {utility.name} is your electricity provider{city ? ` in ${city}` : ''}.
                  </div>
                  <p className="small">
                    It's a city utility or co-op, so the provider is assigned. We'll show you what Base can do for your
                    home.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
        {lookupDone && !utility && utilityOptions.length === 0 && (
          <div className="callout callout--warn">
            We don't have ZIP {zip} mapped yet. Try 78660 (Pflugerville), 77096 (Houston), 77590 (Texas City) or
            78701 (Austin).
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
            ? `In ${worst.year}, homes on your grid averaged ${Math.round(worst.saidi_minutes / 60)} hours without power.`
            : `Here's how often the power goes out where you live.`}
        </h1>
        <p className="sub">
          Average hours each customer of {utility?.name}, the company that runs your lines, spent in the dark, per
          year, from U.S. EIA-861 utility
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
              {weather && (
                <div className="stat">
                  <div
                    className={`stat__value ${weather.risk_tier === 'HIGH' || weather.risk_tier === 'SEVERE' ? 'stat__value--alert' : ''}`}
                  >
                    {weather.risk_tier}
                  </div>
                  <div className="stat__label">
                    Weather + grid risk score ({Math.round(weather.risk_score)}/100), from ERCOT outage history + NOAA
                    severe weather
                  </div>
                </div>
              )}
            </div>
            <OutageChart rows={reliability} utilityName={utility?.name ?? ''} />
          </>
        ) : (
          <div className="callout">No reliability filing for {utility?.name} yet.</div>
        )}

        {weather && (
          <div
            className={`callout ${weather.risk_tier === 'HIGH' || weather.risk_tier === 'SEVERE' ? 'callout--warn' : ''}`}
            style={{ marginTop: 12 }}
          >
            <strong>Severe weather near you:</strong> ~{weather.avg_events_per_year.toFixed(1)} events/year, most
            commonly {weather.most_common_event_type.toLowerCase()} (NOAA Storm Events). {weather.weather_risk_summary}
          </div>
        )}
        {weather && <MethodologyPanel zip={zip} />}

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
    const handleBillUploadSuccess = (data: BillData) => {
      setKwh(data.monthly_kwh);
      setBillAmount(data.bill_amount);
      if (data.analysis) setAnalysis(data.analysis);
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
    // Real qualification (ERCOT outage correlation + NOAA severe weather + utility SAIDI)
    // when the backend answered; otherwise the same heuristic as before so the demo still
    // works with the backend offline.
    const recommendBattery = analysis ? analysis.qualified : reason !== 'rate' || (worst?.saidi_minutes ?? 0) >= 600;
    const squares = buildFourSquare({ plans, kwh, backup, analysis, reason });
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
              'Battery subscription + install pricing reviewed during enrollment',
            ]}
            onSelect={() => {
              setChoice('battery');
              go('done');
            }}
          />
        </div>

        <div className="decide">
          <div className="eyebrow">Help me decide</div>
          <div className="h2">What Base means at your address</div>
          <div className="decide__grid">
            {squares.map((s, i) => (
              <div key={s.id}>
                <div className={`stat__value ${i === 0 ? 'stat__value--alert' : ''}`}>{s.value}</div>
                <p className="small">{s.caption}</p>
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 12, color: 'var(--grey-60)' }}>
            Battery pricing, subscription terms, and install costs are reviewed during enrollment and may vary by home.
          </p>
          <details style={{ marginTop: 14 }}>
            <summary className="small">Why can Base offer a fixed rate below market?</summary>
            <p className="small" style={{ marginTop: 6 }}>
              Your battery isn't just backup - it's part of a fleet. Base buys and stores wholesale power when it's
              cheap (often a few cents/kWh) and draws on it at peak, when wholesale prices spike into the double
              digits. The more homes in the fleet, the stronger Base's position to lock in that spread - which is
              what funds your fixed rate, no matter what the grid does.
            </p>
          </details>
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

  // ---------- Site survey: install-area/backyard photos + real permitting logistics ----------
  if (screen === 'survey') {
    return (
      <Step step={STEP_OF.survey} total={TOTAL} label="Site survey" onBack={back}>
        <h1 className="h1">A few photos so we can review your home.</h1>
        <p className="sub">This helps our team assess your property and decide whether a battery solution makes sense for your home.</p>
        <SiteSurvey zip={zip} leadId={savedLeadId} />
      </Step>
    );
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
              ? `Next, a quick home review at ${zip} so a Base specialist can confirm the fit and reach out with next steps. Your battery covers about ${Math.round(backup.essentials)} hours of essentials.`
              : 'Next we\'ll confirm your address and start your switch.'}
          </p>
          {choice === 'battery' ? (
            <>
              <button className="btn" onClick={() => go('survey')}>
                Continue to site survey
              </button>
              {savedLeadId && <ResumeLink leadId={savedLeadId} zip={zip} />}
            </>
          ) : (
            <button className="btn">Continue to address</button>
          )}
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

/** Shows the resumable link for a saved lead, so the customer can finish the site
 * survey later instead of right now - the actual "known state to return to". */
function ResumeLink({ leadId, zip }: { leadId: string; zip: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${window.location.pathname}?postal_code=${zip}&lead=${leadId}#/after/survey`;

  return (
    <div className="small" style={{ marginTop: 12, color: 'var(--grey-60)' }}>
      Not ready for photos right now?{' '}
      <button
        className="link-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            // clipboard API can be unavailable (e.g. non-HTTPS); the link is still shown below
          }
          setCopied(true);
        }}
      >
        {copied ? 'Link copied ✓' : 'Copy a link to finish later'}
      </button>
    </div>
  );
}

/** Dollar estimate for /stage2/analyze's average_bill input when we don't have a real
 * bill amount from OCR yet - Base's own price at this usage, else the market median. */
function estimateMonthlyBill(plans: Plan[], kwh: number): number {
  const base = plans.find(p => p.company === 'Base Power');
  if (base) return monthlyBill(base, kwh);
  const market = plans.filter(p => p.company !== 'Base Power' && !p.prepaid);
  if (market.length) return median(market.map(p => priceAt(p, kwh))) * kwh;
  return kwh * 0.14; // rough TX average before plans load
}

interface Square {
  id: 'rate' | 'backup' | 'outage_cost' | 'certainty';
  value: string;
  caption: string;
}

/**
 * Automotive four-square instinct: compute all four numbers, then lead with whichever
 * one actually closes this customer instead of a fixed "our best stat first" order.
 * There's no ROI/payback square - the battery is bundled into the subscription, never
 * purchased, so a payback period doesn't exist for this product.
 */
function buildFourSquare({
  plans,
  kwh,
  backup,
  analysis,
  reason,
}: {
  plans: Plan[];
  kwh: number;
  backup: { essentials: number; wholeHome: number };
  analysis: StageTwoAnalysis | null;
  reason: Reason | null;
}): Square[] {
  const base = plans.find(p => p.company === 'Base Power');
  const market = plans.filter(p => p.company !== 'Base Power' && !p.prepaid);
  const rateSavings =
    base && market.length ? median(market.map(p => priceAt(p, kwh))) * kwh - monthlyBill(base, kwh) : null;

  const outageAnnual = analysis?.outage_protection_value_annual ?? OUTAGE_COST_TOTAL;
  const riskScore = analysis?.risk_score ?? null;
  const riskTier = analysis?.risk_tier ?? null;

  const squares: Record<Square['id'], Square> = {
    rate: {
      id: 'rate',
      value: rateSavings != null && rateSavings > 0 ? `$${Math.round(rateSavings)}/mo` : 'Below market',
      caption: 'lower than the median plan at your usage, locked in - no minimum-usage fee',
    },
    backup: {
      id: 'backup',
      value: `${Math.round(backup.essentials)}h`,
      caption: `of essentials backup from a ${BATTERY_KWH} kWh battery included with the Base plan`,
    },
    outage_cost: {
      id: 'outage_cost',
      value: `$${Math.round(outageAnnual)}/yr`,
      caption: 'in outage costs (spoiled food, hotels, eating out) a battery typically avoids at your address',
    },
    certainty: {
      id: 'certainty',
      value: riskTier ?? 'Fixed rate',
      caption: riskScore != null
        ? `weather + grid risk here (${Math.round(riskScore)}/100) - your rate stays fixed no matter what wholesale prices do`
        : 'Your rate stays fixed no matter what wholesale power prices do',
    },
  };

  const order: Square['id'][] =
    reason === 'rate'
      ? ['rate', 'certainty', 'outage_cost', 'backup']
      : riskTier === 'SEVERE' || riskTier === 'HIGH'
        ? ['outage_cost', 'backup', 'certainty', 'rate']
        : reason === 'backup'
          ? ['backup', 'outage_cost', 'certainty', 'rate']
          : rateSavings && rateSavings > 15
            ? ['rate', 'outage_cost', 'backup', 'certainty']
            : ['backup', 'outage_cost', 'rate', 'certainty'];

  return order.map(id => squares[id]);
}

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
        {market.length} plans available at your address. Here's what they cost at {kwh.toLocaleString()} kWh.
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

/**
 * Split ZIPs (e.g. 78660: Austin Energy or Oncor) need one answer. Customers rarely know
 * which company owns their wires, but they do know who sends their bill: a city
 * utility or co-op bills directly, while in retail-choice areas the bill comes from
 * the provider they picked.
 */
function SplitZipQuestion({
  options,
  city,
  selected,
  onPick,
}: {
  options: UtilityInfo[];
  city: string | null;
  selected: UtilityInfo | null;
  onPick: (u: UtilityInfo) => void;
}) {
  const assigned = options.find(o => !o.choice);
  const open = options.find(o => o.choice);
  if (assigned && open) {
    return (
      <div>
        <div className="h2">{city ? `${city} is served by two utilities. ` : ''}Who sends your electric bill?</div>
        <div className="options">
          <Option selected={selected?.code === assigned.code} onClick={() => onPick(assigned)}>
            {assigned.name}
          </Option>
          <Option
            selected={selected?.code === open.code}
            onClick={() => onPick(open)}
            hint="Any retail provider, like TXU, Reliant or Gexa"
          >
            Another company
          </Option>
        </div>
      </div>
    );
  }
  // Two retail-choice utilities: fall back to naming them, with a pointer to the bill
  return (
    <div>
      <div className="h2">Which company's name is under "Delivery" on your bill?</div>
      <div className="options">
        {options.map(o => (
          <Option key={o.code} selected={selected?.code === o.code} onClick={() => onPick(o)}>
            {o.name}
          </Option>
        ))}
      </div>
    </div>
  );
}
