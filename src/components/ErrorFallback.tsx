import type { FallbackProps } from 'react-error-boundary';
import { EmptyState } from './EmptyState';

/**
 * Shown when a widget throws while rendering. It gives a generic message only:
 * the error text could contain data from the stream or internal details.
 */
export function ErrorFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <EmptyState
      tone="error"
      title="This panel failed to render."
      hint="The rest of the dashboard is unaffected."
      action={
        <button type="button" className="btn btn--small" onClick={resetErrorBoundary}>
          Try again
        </button>
      }
    />
  );
}
