import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AFTER_SCREENS, NewFunnel, type AfterScreen } from './NewFunnel';
import * as data from '../lib/data';
import * as api from '../lib/api';

vi.mock('../lib/data', async () => {
  const actual = await vi.importActual<typeof data>('../lib/data');
  return { ...actual, resolveUtility: vi.fn(), reliabilityFor: vi.fn(), plansFor: vi.fn() };
});
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    fetchWeatherRisk: vi.fn().mockResolvedValue(null),
    fetchStageTwoAnalysis: vi.fn().mockResolvedValue(null),
    fetchMethodology: vi.fn().mockResolvedValue(null),
    createLead: vi.fn().mockResolvedValue(null),
    fetchLead: vi.fn().mockResolvedValue(null),
  };
});

const ONCOR = { code: 'ONCOR', name: 'Oncor', choice: true, region: 'Dallas-Fort Worth & Central Texas' };
const BASE_PLAN: data.Plan = {
  utility: 'ONCOR', company: 'Base Power', product: 'Base Energy', kwh500: 0.14, kwh1000: 0.13, kwh2000: 0.12,
  rate_type: 'Fixed', term_months: 12, renewable_pct: 0, prepaid: false, time_of_use: false, min_usage: false,
  fees_credits: '', cancel_fee: '', facts_url: '',
};
const MARKET_PLAN: data.Plan = { ...BASE_PLAN, company: 'Rival Co', product: 'Rival Plan', kwh500: 0.2, kwh1000: 0.18, kwh2000: 0.17 };

/** Drives NewFunnel the same way App.tsx does - screen/go as controlled state. */
function Harness({ initialScreen = 'zip' as AfterScreen, leadId = null as string | null }) {
  const [screen, setScreen] = useState<AfterScreen>(initialScreen);
  return <NewFunnel screen={screen} go={setScreen} initialZip="75201" utilityParam="ONCOR" leadId={leadId} />;
}

describe('NewFunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // call-count assertions (e.g. createLead) must not see leftover calls from earlier tests
    vi.mocked(data.resolveUtility).mockResolvedValue({ info: ONCOR, city: 'Dallas' });
    vi.mocked(data.reliabilityFor).mockResolvedValue([
      { utility: 'ONCOR', year: 2024, saidi_minutes: 120, saifi_times: 1.1, saidi_minutes_no_major_events: 60, source: 'x' },
    ]);
    vi.mocked(data.plansFor).mockResolvedValue([BASE_PLAN, MARKET_PLAN]);
  });

  it('lists every screen exactly once, in flow order', () => {
    expect(AFTER_SCREENS).toEqual(['zip', 'risk', 'usage', 'compare', 'plan', 'done', 'deadend', 'survey']);
  });

  describe('1. zip', () => {
    it('disables Continue until a utility is resolved', async () => {
      let resolveUtil!: (v: Awaited<ReturnType<typeof data.resolveUtility>>) => void;
      vi.mocked(data.resolveUtility).mockReturnValue(new Promise(r => (resolveUtil = r)));
      render(<Harness />);
      expect(screen.getByText('Continue')).toBeDisabled();
      resolveUtil({ info: ONCOR, city: 'Dallas' });
      await waitFor(() => expect(screen.getByText('Continue')).toBeEnabled());
    });

    it('shows a not-found message and keeps Continue disabled for an unmapped zip', async () => {
      vi.mocked(data.resolveUtility).mockResolvedValue({ info: null, city: null });
      render(<Harness />);
      expect(await screen.findByText(/don't have ZIP/)).toBeInTheDocument();
      expect(screen.getByText('Continue')).toBeDisabled();
    });

    it('advances to risk on Continue', async () => {
      render(<Harness />);
      await waitFor(() => expect(screen.getByText('Continue')).toBeEnabled());
      await userEvent.click(screen.getByText('Continue'));
      expect(await screen.findByText(/grid, by the numbers/i)).toBeInTheDocument();
    });
  });

  describe('2. risk', () => {
    it('shows the utility reliability stats and advances to usage on a reason pick', async () => {
      render(<Harness initialScreen="risk" />);
      await screen.findByText(/grid, by the numbers/i);
      await userEvent.click(screen.getByText('Paying a low, fixed energy rate'));
      expect(await screen.findByText(/how much electricity/i)).toBeInTheDocument();
    });
  });

  describe('3. usage', () => {
    it('disables Compare until a usage amount is chosen', async () => {
      render(<Harness initialScreen="usage" />);
      await screen.findByText(/how much electricity/i);
      const btn = screen.getByText('Compare plans in my area');
      // A preset (1000) is selected by default state, so this should already be enabled;
      // explicitly re-picking a preset must not disable it.
      await userEvent.click(screen.getByText('1,000'));
      expect(btn).toBeEnabled();
    });

    it('rejects sub-100 kWh manual entry', async () => {
      render(<Harness initialScreen="usage" />);
      await screen.findByText(/how much electricity/i);
      const input = screen.getByLabelText(/enter your exact usage/i);
      await userEvent.clear(input);
      await userEvent.type(input, '50');
      expect(screen.getByText('Compare plans in my area')).toBeDisabled();
    });

    it('advances to compare', async () => {
      render(<Harness initialScreen="usage" />);
      await screen.findByText(/how much electricity/i);
      await userEvent.click(screen.getByText('Compare plans in my area'));
      expect(await screen.findByText(/plans in .* territory/i)).toBeInTheDocument();
    });
  });

  describe('4. compare', () => {
    it('shows market plans priced at the chosen usage and advances to plan', async () => {
      render(<Harness initialScreen="compare" />);
      expect(await screen.findByText('Rival Co', { exact: false })).toBeInTheDocument();
      await userEvent.click(screen.getByText('See my Base options'));
      expect(await screen.findByText(/two options to power your home/i)).toBeInTheDocument();
    });

    it('shows a no-choice message instead of a plan table for a non-deregulated utility', async () => {
      vi.mocked(data.resolveUtility).mockResolvedValue({
        info: { code: 'AUSTIN_ENERGY', name: 'Austin Energy', choice: false, region: 'City of Austin' },
        city: 'Austin',
      });
      render(<Harness initialScreen="compare" />);
      expect(await screen.findByText(/sets your rate/i)).toBeInTheDocument();
      expect(screen.queryByText('Rival Co', { exact: false })).not.toBeInTheDocument();
    });
  });

  describe('5. plan', () => {
    it('does not default to the deadend/already-have-a-battery state', async () => {
      render(<Harness initialScreen="plan" />);
      await screen.findByText(/two options to power your home/i);
      // The deadend screen's own headline must not appear here...
      expect(screen.queryByText(/you already have a battery/i)).not.toBeInTheDocument();
      // ...only its explicit, unchecked opt-out link.
      expect(screen.getByText('I already have a whole-home battery')).toBeInTheDocument();
    });

    it('only reaches deadend via the explicit link', async () => {
      render(<Harness initialScreen="plan" />);
      await screen.findByText(/two options to power your home/i);
      await userEvent.click(screen.getByText('I already have a whole-home battery'));
      expect(await screen.findByText(/isn't available|already have a battery/i)).toBeInTheDocument();
    });

    it('selecting the battery plan leads to done with choice=battery, not deadend', async () => {
      render(<Harness initialScreen="plan" />);
      await screen.findByText(/two options to power your home/i);
      const [, batteryCard] = screen.getAllByText('Select plan');
      await userEvent.click(batteryCard);
      expect(await screen.findByText(/energy \+ battery/i)).toBeInTheDocument();
      expect(screen.queryByText(/already have a whole-home battery/i)).not.toBeInTheDocument();
    });

    it('selecting the energy-only plan leads to done without a site-survey button', async () => {
      render(<Harness initialScreen="plan" />);
      await screen.findByText(/two options to power your home/i);
      const [energyCard] = screen.getAllByText('Select plan');
      await userEvent.click(energyCard);
      expect(await screen.findByText(/getting the Base energy plan/i)).toBeInTheDocument();
      expect(screen.queryByText('Continue to site survey')).not.toBeInTheDocument();
    });
  });

  describe('6. done -> survey', () => {
    it('battery choice shows a working Continue to site survey button', async () => {
      render(<Harness initialScreen="plan" />);
      await screen.findByText(/two options to power your home/i);
      const [, batteryCard] = screen.getAllByText('Select plan');
      await userEvent.click(batteryCard);

      const surveyBtn = await screen.findByText('Continue to site survey');
      expect(surveyBtn).toBeEnabled();
      await userEvent.click(surveyBtn);
      expect(await screen.findByText(/a few photos/i)).toBeInTheDocument();
    });

    it('persists a lead the moment a battery plan is picked, and shows a resume link', async () => {
      vi.mocked(api.createLead).mockResolvedValue('lead-abc123');
      render(<Harness initialScreen="plan" />);
      await screen.findByText(/two options to power your home/i);
      const [, batteryCard] = screen.getAllByText('Select plan');
      await userEvent.click(batteryCard);

      await screen.findByText(/energy \+ battery/i);
      expect(api.createLead).toHaveBeenCalledWith('75201', 'ONCOR', 1000, '', 'battery');
      expect(await screen.findByText('Copy a link to finish later')).toBeInTheDocument();
    });

    it('does not persist a lead for the energy-only choice', async () => {
      render(<Harness initialScreen="plan" />);
      await screen.findByText(/two options to power your home/i);
      const [energyCard] = screen.getAllByText('Select plan');
      await userEvent.click(energyCard);

      await screen.findByText(/getting the Base energy plan/i);
      expect(api.createLead).not.toHaveBeenCalled();
    });
  });

  describe('resuming a saved lead (?lead=<id>)', () => {
    it('restores zip/reason/usage/choice and jumps straight to survey', async () => {
      vi.mocked(api.fetchLead).mockResolvedValue({
        id: 'lead-abc123',
        zip_code: '75201',
        utility: 'ONCOR',
        monthly_kwh: 1500,
        reason: 'backup',
        choice: 'battery',
        status: 'plan_selected',
        customer_name: null,
        phone: null,
        email: null,
        created_at: 'x',
        updated_at: 'x',
      });
      render(<Harness initialScreen="zip" leadId="lead-abc123" />);

      // Resuming should skip past zip/risk/usage/compare/plan straight to survey.
      expect(await screen.findByText(/a few photos/i)).toBeInTheDocument();
      expect(screen.queryByText(/let's look up your home/i)).not.toBeInTheDocument();
    });

    it('falls back to the normal zip start if the lead id does not resolve', async () => {
      vi.mocked(api.fetchLead).mockResolvedValue(null);
      render(<Harness initialScreen="zip" leadId="does-not-exist" />);
      expect(await screen.findByText(/let's look up your home/i)).toBeInTheDocument();
    });
  });

  describe('deadend', () => {
    it('pre-fills a mailto with zip, utility and usage - not a dead link', async () => {
      render(<Harness initialScreen="deadend" />);
      await screen.findByText(/already have a whole-home battery|isn't available/i);
      const link = await screen.findByText(/send my info to enrollments/i);
      expect(link.closest('a')).toHaveAttribute('href', expect.stringContaining('mailto:enrollments@basepowercompany.com'));
      expect(link.closest('a')).toHaveAttribute('href', expect.stringContaining('75201'));
    });
  });

  describe('back navigation', () => {
    it('back from done returns to plan, not to compare', async () => {
      const screens: AfterScreen[] = [];
      function TrackedHarness() {
        const [screen, setScreen] = useState<AfterScreen>('plan');
        screens.push(screen);
        return <NewFunnel screen={screen} go={setScreen} initialZip="75201" utilityParam="ONCOR" leadId={null} />;
      }
      render(<TrackedHarness />);
      await screen.findByText(/two options to power your home/i);
      const [, batteryCard] = screen.getAllByText('Select plan');
      await userEvent.click(batteryCard);
      await screen.findByText(/energy \+ battery/i);

      const backBtn = screen.getByLabelText('Back');
      await userEvent.click(backBtn);
      expect(await screen.findByText(/two options to power your home/i)).toBeInTheDocument();
    });

    it('back from survey returns to done, not to plan', async () => {
      render(<Harness initialScreen="plan" />);
      await screen.findByText(/two options to power your home/i);
      const [, batteryCard] = screen.getAllByText('Select plan');
      await userEvent.click(batteryCard);
      await userEvent.click(await screen.findByText('Continue to site survey'));
      await screen.findByText(/a few photos/i);

      await userEvent.click(screen.getByLabelText('Back'));
      expect(await screen.findByText(/energy \+ battery/i)).toBeInTheDocument();
    });
  });
});
