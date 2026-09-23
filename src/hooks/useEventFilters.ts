import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_WINDOW_MS } from '../config';
import type { Severity } from '../types/event';
import type { EventFilters } from '../utils/helpers';

export interface EventFiltersApi {
  readonly filters: EventFilters;
  toggleSeverity(severity: Severity): void;
  setWindowMs(ms: number | null): void;
  setQuery(query: string): void;
}

/** Filter state for the dashboard. Setters are stable, so memoised controls don't re-render. */
export function useEventFilters(): EventFiltersApi {
  const [severities, setSeverities] = useState<ReadonlySet<Severity>>(() => new Set());
  const [windowMs, setWindowMs] = useState<number | null>(DEFAULT_WINDOW_MS);
  const [query, setQuery] = useState('');

  const toggleSeverity = useCallback((severity: Severity) => {
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  }, []);

  const filters = useMemo(() => ({ severities, windowMs, query }), [severities, windowMs, query]);
  return { filters, toggleSeverity, setWindowMs, setQuery };
}
