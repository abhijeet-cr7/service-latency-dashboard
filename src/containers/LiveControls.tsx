import { useCallback } from 'react';
import { FilterBar, TimeControls } from '../components/Controls';
import type { EventFiltersApi } from '../hooks/useEventFilters';
import { useLiveSelector, useLiveStreamContext } from '../hooks/useLiveStream';

export function LiveTimeControls({ filtersApi }: { filtersApi: EventFiltersApi }) {
  const { controls } = useLiveStreamContext();
  const paused = useLiveSelector((s) => s.paused);
  const togglePause = useCallback(
    () => (paused ? controls.resume() : controls.pause()),
    [paused, controls],
  );
  return (
    <TimeControls
      windowMs={filtersApi.filters.windowMs}
      onWindowChange={filtersApi.setWindowMs}
      paused={paused}
      onTogglePause={togglePause}
    />
  );
}

export function LiveControls({ filtersApi }: { filtersApi: EventFiltersApi }) {
  const { controls } = useLiveStreamContext();
  const capacity = useLiveSelector((s) => s.capacity);
  const flushIntervalMs = useLiveSelector((s) => s.flushIntervalMs);
  const { filters, toggleSeverity, setQuery } = filtersApi;
  return (
    <FilterBar
      severities={filters.severities}
      onToggleSeverity={toggleSeverity}
      query={filters.query}
      onQueryChange={setQuery}
      bufferSize={capacity}
      onBufferSizeChange={controls.setBufferSize}
      flushIntervalMs={flushIntervalMs}
      onFlushIntervalChange={controls.setFlushInterval}
    />
  );
}
