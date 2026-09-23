import { useCallback } from 'react';
import { Controls } from '../components/Controls';
import { useLiveSelector, useLiveStreamContext } from '../hooks/useLiveStream';
import type { EventFiltersApi } from '../hooks/useEventFilters';

export function LiveControls({ filtersApi }: { filtersApi: EventFiltersApi }) {
  const { controls } = useLiveStreamContext();
  const paused = useLiveSelector((s) => s.paused);
  const capacity = useLiveSelector((s) => s.capacity);
  const flushIntervalMs = useLiveSelector((s) => s.flushIntervalMs);

  const togglePause = useCallback(
    () => (paused ? controls.resume() : controls.pause()),
    [paused, controls],
  );

  const { filters, toggleSeverity, setWindowMs, setQuery } = filtersApi;
  return (
    <Controls
      paused={paused}
      onTogglePause={togglePause}
      severities={filters.severities}
      onToggleSeverity={toggleSeverity}
      windowMs={filters.windowMs}
      onWindowChange={setWindowMs}
      query={filters.query}
      onQueryChange={setQuery}
      bufferSize={capacity}
      onBufferSizeChange={controls.setBufferSize}
      flushIntervalMs={flushIntervalMs}
      onFlushIntervalChange={controls.setFlushInterval}
    />
  );
}
