import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteSurvey } from './SiteSurvey';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    fetchPermitting: vi.fn(),
    submitSiteSurvey: vi.fn(),
    visualizeInstall: vi.fn(),
    checkInstallPhoto: vi.fn(),
  };
});

function makeFile(name: string) {
  return new File(['x'.repeat(1000)], name, { type: 'image/jpeg' });
}

/** Big enough (>=5000 bytes) to pass the byte-size floor - MockImage in test/setup.ts
 * then supplies a passing width/height so this clears every quality check. */
function makeRealisticFile(name: string) {
  return new File(['x'.repeat(10_000)], name, { type: 'image/jpeg' });
}

/** Fills the contact-details fields now required before either submit action. */
async function fillContactDetails() {
  await userEvent.type(screen.getByLabelText('Full name'), 'Jane Smith');
  await userEvent.type(screen.getByLabelText('Phone number'), '5551234567');
  await userEvent.type(screen.getByLabelText('Email address'), 'jane@example.com');
}

describe('SiteSurvey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchPermitting).mockResolvedValue({
      zip_code: '75201',
      city: 'Dallas',
      jurisdiction: 'City of Dallas',
      permit_required: true,
      authority: 'Dallas Dept. of Sustainable Development & Construction',
      requirements: 'Electrical permit required.',
      typical_fee: '$100-$500',
      typical_timeline: '1-2 weeks',
      source: 'Dallas Fire Code 2021',
    });
    // Sane default so tests that don't care about the photo check don't see a false
    // "not usable" warning; tests that DO care override this per-test.
    vi.mocked(api.checkInstallPhoto).mockResolvedValue({
      panel_visible: true,
      space_visible: true,
      guidance: '',
      checked: true,
    });
  });

  it('keeps submit disabled until both categories have a photo AND contact details', async () => {
    render(<SiteSurvey zip="75201" />);
    const submit = screen.getByText('Submit for installer review');
    expect(submit).toBeDisabled();

    const inputs = document.querySelectorAll('input[type="file"]');
    expect(inputs).toHaveLength(2);

    // Only install_area photo added - still disabled
    await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('install.jpg'));
    expect(submit).toBeDisabled();

    // Guards the addPhotos contract: a picked file must land in component state.
    // Note: this does NOT reproduce the real 2026-09-26 bug (reading the FileList
    // lazily inside the setState updater, after input.value = '' had cleared it) -
    // jsdom's file input doesn't clear .files on a value reset the way real browsers
    // do, so that failure only showed up in a real-browser (Playwright) walkthrough.
    // Kept here as a same-behavior regression guard, not a reproduction of that bug.
    await userEvent.upload(inputs[1] as HTMLInputElement, makeFile('backyard.jpg'));
    // Both photos present, but no contact details yet - still disabled. This is the
    // real 2026-09-27 gap: a customer used to be able to submit photos with no way
    // for an installer to reach them.
    expect(submit).toBeDisabled();
    expect(screen.getByText(/add your contact details above/i)).toBeInTheDocument();

    await fillContactDetails();
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it('lists each added photo by filename and lets you remove it', async () => {
    render(<SiteSurvey zip="75201" />);
    const inputs = document.querySelectorAll('input[type="file"]');
    await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('install.jpg'));

    expect(await screen.findByText('install.jpg')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Remove'));
    expect(screen.queryByText('install.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('Submit for installer review')).toBeDisabled();
  });

  it('supports adding multiple photos to the same category', async () => {
    render(<SiteSurvey zip="75201" />);
    const inputs = document.querySelectorAll('input[type="file"]');
    await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('a.jpg'));
    await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('b.jpg'));

    expect(await screen.findByText('a.jpg')).toBeInTheDocument();
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
  });

  it('shows the real permitting requirements once fetched', async () => {
    render(<SiteSurvey zip="75201" />);
    expect(await screen.findByText(/permit is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Electrical permit required/)).toBeInTheDocument();
  });

  it('renders a per-category pass/fail result after a successful submit', async () => {
    vi.mocked(api.submitSiteSurvey).mockResolvedValue({
      zip_code: '75201',
      lead_id: null,
      ready_for_installer_review: true,
      categories: {
        install_area: { uploaded: 1, passed: 1, issues: [], photos: [{ ok: true }] },
        backyard: { uploaded: 1, passed: 1, issues: [], photos: [{ ok: true }] },
      },
      saved_to: 'site_surveys/75201_x',
      permitting: {
        zip_code: '75201', city: 'Dallas', jurisdiction: 'City of Dallas', permit_required: true,
        authority: 'x', requirements: 'x', typical_fee: 'x', typical_timeline: 'x', source: 'x',
      },
    });

    render(<SiteSurvey zip="75201" />);
    const inputs = document.querySelectorAll('input[type="file"]');
    await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('install.jpg'));
    await userEvent.upload(inputs[1] as HTMLInputElement, makeFile('backyard.jpg'));
    await fillContactDetails();

    const submit = await screen.findByText('Submit for installer review');
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);

    expect(await screen.findByText(/all set/i)).toBeInTheDocument();
    expect(api.submitSiteSurvey).toHaveBeenCalledWith('75201', [expect.any(File)], [expect.any(File)], undefined);
  });

  it('shows a warning state and lets you retake when the backend rejects photos', async () => {
    vi.mocked(api.submitSiteSurvey).mockResolvedValue({
      zip_code: '75201',
      lead_id: null,
      ready_for_installer_review: false,
      categories: {
        install_area: { uploaded: 1, passed: 0, issues: ['Image too small (50x50px) - retake closer or at higher resolution'], photos: [] },
        backyard: { uploaded: 1, passed: 1, issues: [], photos: [{ ok: true }] },
      },
      saved_to: null,
      permitting: {
        zip_code: '75201', city: 'Dallas', jurisdiction: 'City of Dallas', permit_required: true,
        authority: 'x', requirements: 'x', typical_fee: 'x', typical_timeline: 'x', source: 'x',
      },
    });

    render(<SiteSurvey zip="75201" />);
    const inputs = document.querySelectorAll('input[type="file"]');
    await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('install.jpg'));
    await userEvent.upload(inputs[1] as HTMLInputElement, makeFile('backyard.jpg'));
    await fillContactDetails();
    const submit = await screen.findByText('Submit for installer review');
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);

    expect(await screen.findByText(/need a retake/i)).toBeInTheDocument();
    expect(screen.getByText(/Image too small/)).toBeInTheDocument();
    expect(screen.getByText('Retake and resubmit')).toBeInTheDocument();
  });

  describe('"See it in your space" visualization', () => {
    it('needs a second install-area photo before the button appears', async () => {
      render(<SiteSurvey zip="75201" />);
      expect(screen.queryByText('👁 See it in your space')).not.toBeInTheDocument();

      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[1] as HTMLInputElement, makeFile('backyard.jpg')); // backyard only
      expect(screen.queryByText('👁 See it in your space')).not.toBeInTheDocument();

      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));
      expect(screen.queryByText('👁 See it in your space')).not.toBeInTheDocument();
      expect(screen.getByText(/add a second, wider photo/i)).toBeInTheDocument();

      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('wide-shot.jpg'));
      expect(await screen.findByText('👁 See it in your space')).toBeInTheDocument();
    });

    const mockPlacement = {
      placement: { x: 0.3, y: 0.45, width: 0.38, height: 0.45, source: 'model' as const, fits: true, fit_reason: '' },
      product_image_url: '/assets/battery-product.png',
      product_aspect_ratio: 0.855,
    };

    it('uses the 2nd install-area photo, not the 1st, for placement', async () => {
      vi.mocked(api.visualizeInstall).mockResolvedValue(mockPlacement);
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('wide-shot.jpg'));

      await userEvent.click(await screen.findByText('👁 See it in your space'));
      await screen.findByAltText(/battery \(drag to reposition\)/i);

      const calledWith = vi.mocked(api.visualizeInstall).mock.calls[0][0];
      expect(calledWith.name).toBe('wide-shot.jpg');
    });

    it('renders the photo and a movable/resizable battery layer on success, not a flattened image', async () => {
      vi.mocked(api.visualizeInstall).mockResolvedValue(mockPlacement);
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('wide-shot.jpg'));

      await userEvent.click(await screen.findByText('👁 See it in your space'));
      expect(await screen.findByAltText(/your install area/i)).toBeInTheDocument();
      const productLayer = await screen.findByAltText(/battery \(drag to reposition\)/i);
      expect(productLayer).toHaveAttribute('src', expect.stringContaining('/assets/battery-product.png'));
      // Positioned from the model's placement, not baked into pixels - draggable by the customer.
      expect((productLayer.parentElement as HTMLElement).style.left).toBe('30%');
      expect(screen.getByText(/drag the battery to reposition/i)).toBeInTheDocument();
    });

    it('degrades gracefully (photos still submittable) when the local model is unavailable', async () => {
      vi.mocked(api.visualizeInstall).mockResolvedValue(null);
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('wide-shot.jpg'));

      await userEvent.click(await screen.findByText('👁 See it in your space'));
      expect(await screen.findByText(/couldn't generate a preview/i)).toBeInTheDocument();
      expect(screen.getByText('Submit for installer review')).toBeInTheDocument();
    });

    it('flags a default (non-model) placement so the customer knows to drag it into place', async () => {
      vi.mocked(api.visualizeInstall).mockResolvedValue({ ...mockPlacement, placement: { ...mockPlacement.placement, source: 'default' } });
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('wide-shot.jpg'));

      await userEvent.click(await screen.findByText('👁 See it in your space'));
      expect(await screen.findByText(/couldn't reach the local placement model/i)).toBeInTheDocument();
    });

    it('clears a stale preview when an install-area photo is removed', async () => {
      vi.mocked(api.visualizeInstall).mockResolvedValue(mockPlacement);
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('wide-shot.jpg'));
      await userEvent.click(await screen.findByText('👁 See it in your space'));
      await screen.findByAltText(/battery \(drag to reposition\)/i);

      await userEvent.click(screen.getAllByText('Remove')[0]);
      expect(screen.queryByAltText(/battery \(drag to reposition\)/i)).not.toBeInTheDocument();
    });

    it('warns, but does not block, when the model judges the spot too tight to fit the unit', async () => {
      vi.mocked(api.visualizeInstall).mockResolvedValue({
        ...mockPlacement,
        placement: { ...mockPlacement.placement, fits: false, fit_reason: 'A parked bike blocks the wall space.' },
      });
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('wide-shot.jpg'));

      await userEvent.click(await screen.findByText('👁 See it in your space'));
      expect(await screen.findByText(/looks tight/i)).toBeInTheDocument();
      expect(screen.getByText(/parked bike blocks the wall space/i)).toBeInTheDocument();
      // Still just a warning - submission isn't gated on this.
      expect(screen.getByText('Submit for installer review')).toBeInTheDocument();
    });

    it('does not warn about fit on the default (non-model) placement, which has no real assessment', async () => {
      vi.mocked(api.visualizeInstall).mockResolvedValue({
        ...mockPlacement,
        placement: { ...mockPlacement.placement, source: 'default', fits: true, fit_reason: '' },
      });
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('wide-shot.jpg'));

      await userEvent.click(await screen.findByText('👁 See it in your space'));
      await screen.findByText(/couldn't reach the local placement model/i);
      expect(screen.queryByText(/looks tight/i)).not.toBeInTheDocument();
    });
  });

  describe('combined panel/space check with guidance (every install-area photo)', () => {
    it('runs automatically on a photo and shows the model\'s guidance, without blocking, when panel is not seen', async () => {
      vi.mocked(api.checkInstallPhoto).mockResolvedValue({
        panel_visible: false,
        space_visible: true,
        guidance: 'Point the camera at the gray panel box on the wall, not the yard.',
        checked: true,
      });
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));

      expect(await screen.findByText(/may not be usable as-is/i)).toBeInTheDocument();
      expect(screen.getByText(/Point the camera at the gray panel box/i)).toBeInTheDocument();
      expect(api.checkInstallPhoto).toHaveBeenCalledTimes(1);
      const calledWith = vi.mocked(api.checkInstallPhoto).mock.calls[0][0];
      expect(calledWith.name).toBe('closeup.jpg');
    });

    it('also warns when the panel is visible but there is no clear space near it', async () => {
      vi.mocked(api.checkInstallPhoto).mockResolvedValue({
        panel_visible: true,
        space_visible: false,
        guidance: 'Step back a few feet so the wall space next to the panel is in frame.',
        checked: true,
      });
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('too-tight.jpg'));

      expect(await screen.findByText(/may not be usable as-is/i)).toBeInTheDocument();
      expect(screen.getByText(/Step back a few feet/i)).toBeInTheDocument();
    });

    it('shows nothing extra when both panel and space are confirmed', async () => {
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('good-shot.jpg'));

      await waitFor(() => expect(api.checkInstallPhoto).toHaveBeenCalled());
      expect(screen.queryByText(/may not be usable as-is/i)).not.toBeInTheDocument();
    });

    it('says nothing (fails open) when the local model is unavailable', async () => {
      vi.mocked(api.checkInstallPhoto).mockResolvedValue(null);
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));

      await waitFor(() => expect(api.checkInstallPhoto).toHaveBeenCalled());
      expect(screen.queryByText(/may not be usable as-is/i)).not.toBeInTheDocument();
    });

    it('checks every photo added, not just the first', async () => {
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('closeup.jpg'));
      await waitFor(() => expect(api.checkInstallPhoto).toHaveBeenCalledTimes(1));

      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('wide-shot.jpg'));
      await waitFor(() => expect(api.checkInstallPhoto).toHaveBeenCalledTimes(2));
      const secondCall = vi.mocked(api.checkInstallPhoto).mock.calls[1][0];
      expect(secondCall.name).toBe('wide-shot.jpg');
    });

    it('can flag one photo while leaving another clean, keeping guidance aligned to the right photo', async () => {
      vi.mocked(api.checkInstallPhoto)
        .mockResolvedValueOnce({ panel_visible: true, space_visible: true, guidance: '', checked: true })
        .mockResolvedValueOnce({
          panel_visible: false,
          space_visible: false,
          guidance: 'Neither the panel nor clear space is visible - try a wider shot centered on the panel.',
          checked: true,
        });
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('good.jpg'));
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('bad.jpg'));

      const warning = await screen.findByText(/"bad.jpg" may not be usable as-is/i);
      expect(warning).toBeInTheDocument();
      expect(screen.queryByText(/"good.jpg" may not be usable as-is/i)).not.toBeInTheDocument();
    });
  });

  describe('real-time photo quality feedback (file type/size/dimensions)', () => {
    it('flags a too-small file the moment it is picked, before any submit attempt', async () => {
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[1] as HTMLInputElement, makeFile('backyard.jpg')); // 1000 bytes

      expect(await screen.findByText(/File too small to be a real photo/i)).toBeInTheDocument();
      // Never submitted - this is purely from picking the file.
      expect(api.submitSiteSurvey).not.toHaveBeenCalled();
    });

    it('shows no issue for a photo that passes every check', async () => {
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[1] as HTMLInputElement, makeRealisticFile('backyard.jpg'));

      await screen.findByText('backyard.jpg');
      await waitFor(() => expect(screen.queryByText(/checking\.\.\./i)).not.toBeInTheDocument());
      expect(screen.queryByText(/too small|too large|Unsupported|not a readable/i)).not.toBeInTheDocument();
    });

    it('checks every photo in both categories, not just install-area', async () => {
      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[1] as HTMLInputElement, makeFile('tiny-backyard.jpg'));
      expect(await screen.findByText(/File too small/i)).toBeInTheDocument();
    });

    it('still allows submit even when a photo has a flagged issue (informational, not blocking)', async () => {
      vi.mocked(api.submitSiteSurvey).mockResolvedValue({
        zip_code: '75201',
        lead_id: null,
        ready_for_installer_review: false,
        categories: {
          install_area: { uploaded: 1, passed: 0, issues: ['File too small to be a real photo'], photos: [] },
          backyard: { uploaded: 1, passed: 1, issues: [], photos: [{ ok: true }] },
        },
        saved_to: null,
        permitting: {
          zip_code: '75201', city: 'Dallas', jurisdiction: 'City of Dallas', permit_required: true,
          authority: 'x', requirements: 'x', typical_fee: 'x', typical_timeline: 'x', source: 'x',
        },
      });

      render(<SiteSurvey zip="75201" />);
      const inputs = document.querySelectorAll('input[type="file"]');
      await userEvent.upload(inputs[0] as HTMLInputElement, makeFile('install.jpg'));
      await userEvent.upload(inputs[1] as HTMLInputElement, makeRealisticFile('backyard.jpg'));
      await fillContactDetails();
      expect(await screen.findByText(/File too small/i)).toBeInTheDocument();

      const submit = screen.getByText('Submit for installer review');
      await waitFor(() => expect(submit).toBeEnabled());
      await userEvent.click(submit);
      expect(await screen.findByText(/need a retake/i)).toBeInTheDocument();
    });
  });
});
