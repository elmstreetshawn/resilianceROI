import { useEffect, useState } from 'react';
import { AFTER_SCREENS, NewFunnel, type AfterScreen } from './after/NewFunnel';
import { BEFORE_SCREENS, CurrentFunnel, type BeforeScreen } from './before/CurrentFunnel';
import { Compare } from './compare/Compare';

// Hash routes so the app deploys as static files anywhere:
//   #/compare            side-by-side demo (default)
//   #/before/<screen>    re-creation of Base's live funnel
//   #/after/<screen>     our funnel
// Query string mirrors Base's funnel: ?postal_code=78660&utility=ONCOR (&embed=1 hides the top bar)

const DEFAULT_ZIP = '78660';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const parts = hash.replace(/^#\/?/, '').split('/');
  const navigate = (path: string) => {
    window.location.hash = `/${path}`;
    window.scrollTo(0, 0);
  };
  return { section: parts[0] || 'compare', screen: parts[1], navigate };
}

export default function App() {
  const { section, screen, navigate } = useHashRoute();
  const params = new URLSearchParams(window.location.search);
  const embedded = params.has('embed');
  const zip = /^\d{5}$/.test(params.get('postal_code') ?? '') ? params.get('postal_code')! : DEFAULT_ZIP;
  const search = window.location.search.replace(/[?&]embed=1/, '').replace(/^&/, '?');

  let body;
  if (section === 'before') {
    const s = (BEFORE_SCREENS as readonly string[]).includes(screen) ? (screen as BeforeScreen) : 'utility';
    body = (
      <div className="page page--narrow">
        {!embedded && (
          <p className="small" style={{ color: 'var(--grey-60)', marginBottom: 12 }}>
            This reproduces 5 specific screens from Base's real funnel - the homepage utility question for a split
            ZIP, then funnel steps 2, 4, 7 &amp; 10 - the ones our redesign changes. It's not the full funnel.
          </p>
        )}
        <CurrentFunnel screen={s} go={next => navigate(`before/${next}`)} zip={zip} />
      </div>
    );
  } else if (section === 'after') {
    const s = (AFTER_SCREENS as readonly string[]).includes(screen) ? (screen as AfterScreen) : 'zip';
    body = (
      <div className="page page--narrow" style={{ maxWidth: s === 'compare' || s === 'plan' ? 820 : undefined }}>
        <NewFunnel
          screen={s}
          go={next => navigate(`after/${next}`)}
          initialZip={zip}
          utilityParam={params.get('utility')}
          leadId={params.get('lead')}
        />
      </div>
    );
  } else {
    body = <Compare search={search} />;
  }

  return (
    <div className={embedded ? 'embedded' : ''}>
      <header className="topbar" style={section === 'compare' ? { maxWidth: 1400 } : undefined}>
        <a className="logo" href="#/compare">
          base <span style={{ fontWeight: 400, color: 'var(--grey-60)' }}>· ResilienceROI</span>
        </a>
        <nav>
          <a href="#/compare" className={section === 'compare' ? 'on' : ''}>
            Before / after
          </a>
          <a href="#/before/utility" className={section === 'before' ? 'on' : ''}>
            Current funnel
          </a>
          <a href="#/after/zip" className={section === 'after' ? 'on' : ''}>
            New funnel
          </a>
        </nav>
      </header>
      {body}
    </div>
  );
}
