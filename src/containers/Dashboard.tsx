import { useEventFilters } from '../hooks/useEventFilters';
import { LiveConnectionBar } from './LiveConnectionBar';
import { LiveControls } from './LiveControls';
import { LivePanels } from './LivePanels';
import { LiveSimulator } from './LiveSimulator';

/**
 * Page layout. It owns filter state only, so it re-renders on filter changes
 * and never on stream data. Each child subscribes to its own store slice.
 */
export function Dashboard() {
  const filtersApi = useEventFilters();
  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">Live Monitoring</h1>
          <p className="app__subtitle">Service latency and events, updated in real time</p>
        </div>
        <LiveConnectionBar />
      </header>
      <LiveSimulator />
      <LiveControls filtersApi={filtersApi} />
      <main>
        <LivePanels filters={filtersApi.filters} />
      </main>
    </div>
  );
}
