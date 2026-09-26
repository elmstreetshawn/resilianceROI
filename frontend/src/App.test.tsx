import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as data from './lib/data';
import * as api from './lib/api';

vi.mock('./lib/data', async () => {
  const actual = await vi.importActual<typeof data>('./lib/data');
  return { ...actual, resolveUtility: vi.fn().mockResolvedValue({ info: null, city: null }), reliabilityFor: vi.fn().mockResolvedValue([]), plansFor: vi.fn().mockResolvedValue([]) };
});
vi.mock('./lib/api', async () => {
  const actual = await vi.importActual<typeof api>('./lib/api');
  return { ...actual, fetchWeatherRisk: vi.fn().mockResolvedValue(null) };
});

function setRoute(hash: string, search = '') {
  window.history.pushState({}, '', `${search}${hash}`);
}

describe('App routing', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('defaults to the compare view with no hash', () => {
    setRoute('');
    render(<App />);
    expect(screen.getByText("Base's signup funnel")).toBeInTheDocument();
  });

  describe('the "before" (current funnel) section', () => {
    it('shows a context note explaining the curated step numbers, not embedded', () => {
      setRoute('#/before/reason');
      render(<App />);
      expect(screen.getByText(/reproduces 6 specific screens/i)).toBeInTheDocument();
    });

    it('hides the context note when embedded (used inside Compare\'s iframes)', () => {
      setRoute('#/before/reason', '?embed=1');
      render(<App />);
      expect(screen.queryByText(/reproduces 6 specific screens/i)).not.toBeInTheDocument();
    });

    it('falls back to the homepage ZIP box, the first step of signup, for an unknown before-screen', () => {
      setRoute('#/before/nonsense');
      render(<App />);
      expect(screen.getByText('Save money. Stay powered.')).toBeInTheDocument();
    });
  });

  describe('the "after" (new funnel) section', () => {
    it('falls back to the zip screen for an unknown after-screen', async () => {
      setRoute('#/after/nonsense');
      render(<App />);
      expect(await screen.findByText(/look up your home/i)).toBeInTheDocument();
    });
  });
});

describe('Compare view', () => {
  beforeEach(() => setRoute(''));
  afterEach(() => window.history.pushState({}, '', '/'));

  it('explains that each tab jumps both funnels to one moment, not a continuous session', () => {
    render(<App />);
    expect(screen.getByText(/not a live, continuous session/i)).toBeInTheDocument();
  });

  it('has a tab for every comparison pair, defaulting to the first', () => {
    render(<App />);
    const tabs = ['ZIP & utility', 'Provider (asked again)', 'Why Base?', 'Compare the market', 'Pick a plan', 'Already have a battery'];
    for (const t of tabs) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByText('ZIP & utility')).toHaveClass('compare-tab--on');
  });
});
