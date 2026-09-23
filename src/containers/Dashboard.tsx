import { MarkIcon } from '../components/Icons';
import { useEventFilters } from '../hooks/useEventFilters';
import { LiveConnectionBanner, LiveConnectionBar } from './LiveConnectionBar';
import { LiveControls, LiveTimeControls } from './LiveControls';
import { LivePanels } from './LivePanels';
import { LiveSimulator } from './LiveSimulator';

/**
 * Page shell. It owns filter state only, so it re-renders on filter changes
 * and never on stream data. Each child subscribes to its own store slice.
 */
export function Dashboard() {
  const filtersApi = useEventFilters();
  return (
    <div className="shell">
      <div className="page">
        <header className="topbar">
          <div className="crumbs">
            <span className="brand" aria-hidden="true">
              <MarkIcon />
            </span>
            <span className="crumbs__parent">Dashboards</span>
            <span className="crumbs__sep" aria-hidden="true">
              /
            </span>
            <h1 className="crumbs__title">Service Latency · Live</h1>
          </div>
          <div className="topbar__right">
            <LiveConnectionBar />
            <LiveTimeControls filtersApi={filtersApi} />
          </div>
        </header>

        <LiveConnectionBanner />

        <div className="tvbar">
          <LiveControls filtersApi={filtersApi} />
          <LiveSimulator />
        </div>

        <main className="board">
          <LivePanels filters={filtersApi.filters} />
        </main>
      </div>
    </div>
  );
}
