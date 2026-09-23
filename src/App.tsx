import { ErrorBoundary } from 'react-error-boundary';
import { EmptyState } from './components/EmptyState';
import { config } from './config';
import { Dashboard } from './containers/Dashboard';
import { LiveStreamProvider } from './hooks/LiveStreamProvider';

function AppCrash() {
  return (
    <div className="app">
      <EmptyState
        tone="error"
        title="Something went wrong."
        hint="Reload the page to reconnect to the live feed."
        action={
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        }
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={AppCrash}>
      <LiveStreamProvider config={config}>
        <Dashboard />
      </LiveStreamProvider>
    </ErrorBoundary>
  );
}
