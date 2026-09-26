import { useEffect, useRef, useState } from 'react';
import {
  fetchPermitting,
  fetchFollowUpWindows,
  requestSalesFollowUp,
  submitSiteSurvey,
  visualizeInstall,
  type FollowUpRequestConfirmation,
  type FollowUpWindow,
  type Permitting,
  type SiteSurveyResult,
  type VisualizeResult,
} from '../lib/api';
import { PlacementCanvas } from './PlacementCanvas';

interface Props {
  zip: string;
  leadId?: string | null;
}

interface PhotoSet {
  install_area: File[];
  backyard: File[];
}

const CATEGORY_LABEL: Record<keyof PhotoSet, string> = {
  install_area: 'Install area (near your panel/meter)',
  backyard: 'Backyard',
};

/**
 * Post-submission step: real permitting requirements for this address (not
 * boilerplate - see backend/municipal_permitting.py), plus install-area/backyard
 * photos with basic automated checks (file type, size, actual decoded dimensions),
 * saved for installer review. Not computer-vision site assessment - the same
 * sanity-checking an intake coordinator does before forwarding photos along.
 */
export function SiteSurvey({ zip, leadId }: Props) {
  const [permitting, setPermitting] = useState<Permitting | null>(null);
  const [photos, setPhotos] = useState<PhotoSet>({ install_area: [], backyard: [] });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SiteSurveyResult | null>(null);
  const [visualizing, setVisualizing] = useState(false);
  const [visualization, setVisualization] = useState<VisualizeResult | null>(null);
  const [visualizedPhoto, setVisualizedPhoto] = useState<File | null>(null);
  const [visualizeFailed, setVisualizeFailed] = useState(false);
  const [slots, setSlots] = useState<FollowUpWindow[]>([]);
  const [requestSubmitted, setRequestSubmitted] = useState<FollowUpRequestConfirmation | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactExpanded, setContactExpanded] = useState(true);
  const inputRefs = { install_area: useRef<HTMLInputElement>(null), backyard: useRef<HTMLInputElement>(null) };

  useEffect(() => {
    let live = true;
    fetchPermitting(zip).then(p => {
      if (live) setPermitting(p);
    });
    fetchFollowUpWindows().then(s => {
      if (live) setSlots(s);
    });
    return () => {
      live = false;
    };
  }, [zip]);

  const addPhotos = (category: keyof PhotoSet, files: FileList | null) => {
    if (!files) return;
    // Snapshot now - the caller resets input.value right after this call, which
    // clears the live FileList, so reading it lazily inside the setState updater
    // would see an empty list.
    const newFiles = Array.from(files);
    setPhotos(p => ({ ...p, [category]: [...p[category], ...newFiles] }));
    if (category === 'install_area') {
      setVisualization(null);
      setVisualizedPhoto(null);
      setVisualizeFailed(false);
    }
  };

  const removePhoto = (category: keyof PhotoSet, index: number) => {
    setPhotos(p => ({ ...p, [category]: p[category].filter((_, i) => i !== index) }));
    if (category === 'install_area') {
      setVisualization(null);
      setVisualizedPhoto(null);
      setVisualizeFailed(false);
    }
  };

  const visualize = async () => {
    // The 2nd install-area photo, not the 1st: the first shot tends to be a close-up
    // of the panel itself, while a second "step back" shot gives the vision model
    // more of the surrounding wall/floor to reason about scale and placement from.
    const photo = photos.install_area[1];
    if (!photo) return;
    setVisualizing(true);
    setVisualizeFailed(false);
    const r = await visualizeInstall(photo);
    setVisualization(r);
    setVisualizedPhoto(r ? photo : null);
    setVisualizeFailed(!r);
    setVisualizing(false);
  };

  const submit = async () => {
    setSubmitting(true);
    const r = await submitSiteSurvey(zip, photos.install_area, photos.backyard, leadId);
    setResult(r);
    setSubmitting(false);
  };

  const requestInstall = async (date: string, window: string) => {
    if (!leadId) return;
    setRequesting(true);
    setRequestError(null);
    const r = await requestSalesFollowUp(leadId, date, window, customerName, phone, email);
    if (r) {
      setRequestSubmitted(r);
    } else {
      setRequestError('That preference is no longer available. Please choose another option.');
      const refreshed = await fetchFollowUpWindows();
      setSlots(refreshed);
    }
    setRequesting(false);
  };

  const canSubmit = photos.install_area.length > 0 && photos.backyard.length > 0 && !submitting;
  const canRequestWindow = customerName.trim() && phone.trim() && email.trim() && !requesting;

  if (requestSubmitted) {
    return (
      <div className="stack">
        <div className="callout callout--good">
          <strong>Sales follow-up request received.</strong> We’ve noted your preferred time for {requestSubmitted.window_label} on{' '}
          {new Date(`${requestSubmitted.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}. A Base sales specialist will review your details and reach out to qualify your home.
        </div>
        <p className="small">
          Reference ID: <strong>{requestSubmitted.lead_id}</strong>
        </p>
      </div>
    );
  }

  if (result) {
    return (
      <div>
        <div className={`callout ${result.ready_for_installer_review ? 'callout--good' : 'callout--warn'}`}>
          <strong>
            {result.ready_for_installer_review
              ? "You're all set - your photos are ready for installer review."
              : 'A couple of photos need a retake before we can forward this to an installer.'}
          </strong>
        </div>
        {(Object.keys(result.categories) as (keyof PhotoSet)[]).map(cat => {
          const c = result.categories[cat];
          return (
            <div key={cat} style={{ marginTop: 12 }}>
              <p className="small">
                <strong>{CATEGORY_LABEL[cat]}:</strong> {c.passed} of {c.uploaded} photo{c.uploaded === 1 ? '' : 's'}{' '}
                passed
              </p>
              {c.issues.length > 0 && (
                <ul className="cost-list">
                  {c.issues.map((issue, i) => (
                    <li key={i}>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {!result.ready_for_installer_review && (
          <button className="btn btn--block" style={{ marginTop: 16 }} onClick={() => setResult(null)}>
            Retake and resubmit
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {permitting && (
        <div className="callout" style={{ marginBottom: 16 }}>
          <strong>
            {permitting.permit_required ? 'A permit is required for this install.' : 'No permit required here.'}
          </strong>{' '}
          {permitting.requirements} ({permitting.jurisdiction}
          {permitting.typical_timeline !== 'N/A - no permit to wait on' && permitting.typical_timeline !== 'Not published'
            ? `, typically ${permitting.typical_timeline}`
            : ''}
          )
        </div>
      )}

      {(Object.keys(CATEGORY_LABEL) as (keyof PhotoSet)[]).map(category => (
        <div key={category} style={{ marginBottom: 20 }}>
          <div className="h2" style={{ marginBottom: 8 }}>
            {CATEGORY_LABEL[category]}
          </div>
          <input
            ref={inputRefs[category]}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              addPhotos(category, e.target.files);
              e.target.value = '';
            }}
          />
          <button className="btn btn--ghost" onClick={() => inputRefs[category].current?.click()}>
            📸 Add photo{photos[category].length > 0 ? 's' : ''}
          </button>
          {category === 'install_area' && (
            <p className="small" style={{ marginTop: 6, color: 'var(--grey-60)' }}>
              Take two: one close-up of the panel, then step back for a second, wider shot - we use the wider one to
              figure out battery placement.
            </p>
          )}
          {photos[category].length > 0 && (
            <ul className="cost-list" style={{ marginTop: 8 }}>
              {photos[category].map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <span>{f.name}</span>
                  <button className="link-btn" onClick={() => removePhoto(category, i)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {category === 'install_area' && photos.install_area.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {photos.install_area.length < 2 && (
                <p className="small" style={{ color: 'var(--grey-60)' }}>
                  Add a second, wider photo to see the battery placed in your space.
                </p>
              )}
              {photos.install_area.length >= 2 && !visualization && (
                <button className="btn btn--ghost" disabled={visualizing} onClick={visualize}>
                  {visualizing ? 'Placing your battery... (runs locally, can take up to a minute)' : '👁 See it in your space'}
                </button>
              )}
              {visualizeFailed && (
                <p className="small" style={{ marginTop: 6, color: 'var(--grey-60)' }}>
                  Couldn't generate a preview right now - this runs on a local model and may not be available. Your
                  photos are still fine to submit.
                </p>
              )}
              {visualization && visualizedPhoto && (
                <div style={{ marginTop: 10 }}>
                  {visualization.placement.source === 'default' && (
                    <p className="small" style={{ marginBottom: 6, color: 'var(--grey-60)' }}>
                      Couldn't reach the local placement model, so this starts at a default spot - drag it to where
                      it actually belongs.
                    </p>
                  )}
                  <PlacementCanvas
                    photo={visualizedPhoto}
                    initialPlacement={visualization.placement}
                    productImageUrl={visualization.product_image_url}
                    productAspectRatio={visualization.product_aspect_ratio}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ marginTop: 20 }}>
        <button className="btn btn--block" disabled={!canSubmit} onClick={submit}>
          {submitting ? 'Uploading...' : 'Submit for installer review'}
        </button>
      </div>

      {slots.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="h2" style={{ marginBottom: 8 }}>Request a sales follow-up</div>
          <p className="small" style={{ marginBottom: 12 }}>
            Share your contact details and preferred time window. A Base sales specialist will reach out to qualify your home and confirm the next step.
          </p>

          <div style={{ marginBottom: 12 }}>
            <button className="btn btn--ghost btn--block" onClick={() => setContactExpanded(v => !v)}>
              {contactExpanded ? 'Hide contact details' : 'Add contact details'}
            </button>
          </div>

          {contactExpanded && (
            <div className="stack" style={{ marginBottom: 12 }}>
              <label className="small" htmlFor="customer-name">
                Full name
                <input
                  id="customer-name"
                  className="input"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </label>
              <label className="small" htmlFor="phone-number">
                Phone number
                <input
                  id="phone-number"
                  className="input"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </label>
              <label className="small" htmlFor="email-address">
                Email address
                <input
                  id="email-address"
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </label>
            </div>
          )}

          <div className="small" style={{ marginBottom: 8, color: 'var(--grey-60)' }}>
            Pick your preferred install window
          </div>
          <div className="options">
            {slots.slice(0, 4).map(slot => (
              <button
                key={`${slot.date}-${slot.window}`}
                className="option"
                onClick={() => requestInstall(slot.date, slot.window)}
                disabled={requesting || !leadId || !canRequestWindow}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>
                  <strong>{slot.weekday}</strong>, {new Date(`${slot.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  <span className="option__hint">{slot.window_label}</span>
                </span>
                <span className="small">{slot.spots_remaining} open</span>
              </button>
            ))}
          </div>
          {requestError && <p className="small" style={{ marginTop: 8, color: 'var(--grid-off)' }}>{requestError}</p>}
          {!leadId && <p className="small" style={{ marginTop: 8 }}>Save your lead first to request an install window.</p>}
          {!canRequestWindow && leadId && (
            <p className="small" style={{ marginTop: 8, color: 'var(--grey-60)' }}>
              Add your contact details to send your preferred install window to the team.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
