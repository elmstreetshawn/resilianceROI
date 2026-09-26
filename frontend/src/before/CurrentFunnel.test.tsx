import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BEFORE_SCREENS, CurrentFunnel, type BeforeScreen } from './CurrentFunnel';

function Harness({ initialScreen = 'reason' as BeforeScreen }) {
  const [screen, setScreen] = useState<BeforeScreen>(initialScreen);
  return <CurrentFunnel screen={screen} go={setScreen} />;
}

describe('CurrentFunnel', () => {
  it('the four screens are numbered 2, 4, 7, 10 of Base\'s real 10-step funnel, by design', () => {
    // This is a documentation test, not a bug guard: the app-level context note
    // (App.tsx) is what tells a viewer this is intentional curation, not a broken
    // reproduction that skips step 1. See App.test.tsx for that note's presence.
    expect(BEFORE_SCREENS).toEqual(['reason', 'provider', 'plan', 'deadend']);
    render(<Harness initialScreen="reason" />);
    expect(screen.getByText('Step 2 of 10')).toBeInTheDocument();
  });

  it('reason has no back button (nothing to go back to)', () => {
    render(<Harness initialScreen="reason" />);
    expect(screen.getByLabelText('Back')).toBeDisabled();
  });

  it('walks reason -> provider -> plan in order on each Option click', async () => {
    render(<Harness initialScreen="reason" />);
    await userEvent.click(screen.getByText('Paying a low, fixed energy rate'));
    expect(await screen.findByText('Step 4 of 10')).toBeInTheDocument();

    await userEvent.click(screen.getByText(/I pick my own electricity plan/));
    expect(await screen.findByText('Step 7 of 10')).toBeInTheDocument();
  });

  describe('plan selection (regression: both buttons used to fall through to deadend)', () => {
    it('picking either plan shows a local confirmation, not the dead-end screen', async () => {
      render(<Harness initialScreen="plan" />);
      const [energyBtn, batteryBtn] = screen.getAllByText('Select plan');

      await userEvent.click(batteryBtn);
      // Still on the plan screen - a plan pick must never silently reach deadend.
      expect(screen.getByText('Step 7 of 10')).toBeInTheDocument();
      expect(screen.queryByText(/battery isn't available/i)).not.toBeInTheDocument();
      expect(await screen.findByText('✓ Selected')).toBeInTheDocument();

      // The other button is untouched and still offers a real choice.
      expect(energyBtn).toHaveTextContent('Select plan');
    });

    it('picking the energy-only plan also stays on plan, confirmed', async () => {
      render(<Harness initialScreen="plan" />);
      const [energyBtn] = screen.getAllByText('Select plan');
      await userEvent.click(energyBtn);
      expect(screen.getByText('Step 7 of 10')).toBeInTheDocument();
      expect(await screen.findByText('✓ Selected')).toBeInTheDocument();
    });
  });

  it('back steps through in reverse order', async () => {
    render(<Harness initialScreen="plan" />);
    expect(screen.getByText('Step 7 of 10')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Back'));
    expect(await screen.findByText('Step 4 of 10')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Back'));
    expect(await screen.findByText('Step 2 of 10')).toBeInTheDocument();
  });

  it('the dead-end screen only offers a manual mailto, unlike the new funnel\'s one-click version', () => {
    render(<Harness initialScreen="deadend" />);
    expect(screen.getByText(/enrollments@basepowercompany.com/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /send my info/i })).not.toBeInTheDocument();
  });
});
