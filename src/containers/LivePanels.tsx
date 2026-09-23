import { useDeferredValue, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { TIME_WINDOWS } from '../config';
import { EmptyState } from '../components/EmptyState';
import { ErrorFallback } from '../components/ErrorFallback';
import { EventsList } from '../components/EventsList';
import { KpiCards } from '../components/KpiCards';
import { LiveChart } from '../components/LiveChart';
import { Loading } from '../components/Loading';
import { Panel } from '../components/Panel';
import { useLiveSelector, useLiveStreamContext } from '../hooks/useLiveStream';
import {
  bucketSeries,
  computeKpis,
  filterEvents,
  formatNumber,
  type EventFilters,
} from '../utils/helpers';

const BUCKET_STEPS_MS = [1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000];
const MAX_CHART_POINTS = 300;

/** Picks a bucket size so the chart never draws more than ~300 points. */
export function pickBucketMs(spanMs: number): number {
  return BUCKET_STEPS_MS.find((b) => spanMs / b <= MAX_CHART_POINTS) ?? 60_000;
}

/**
 * The only part of the page that re-renders on data flushes (at most once per
 * flush interval, never per message). Filtering, KPIs and chart series are all
 * derived with useMemo from one immutable snapshot, so the three widgets always
 * agree, whether live, paused or filtered.
 */
export function LivePanels({ filters }: { filters: EventFilters }) {
  const { controls } = useLiveStreamContext();
  const events = useLiveSelector((s) => s.events);
  const asOf = useLiveSelector((s) => s.asOf);
  const stats = useLiveSelector((s) => s.stats);
  const capacity = useLiveSelector((s) => s.capacity);
  const hasData = useLiveSelector((s) => s.hasReceivedData);
  const status = useLiveSelector((s) => s.connection.status);

  // Typing in search stays responsive: heavy re-filtering is deferred to a low-priority render.
  const deferredFilters = useDeferredValue(filters);

  const filtered = useMemo(
    () => filterEvents(events, deferredFilters, asOf),
    [events, deferredFilters, asOf],
  );
  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const series = useMemo(() => {
    const from =
      deferredFilters.windowMs !== null ? asOf - deferredFilters.windowMs : (events[0]?.ts ?? asOf);
    return bucketSeries(filtered, pickBucketMs(asOf - from), from, asOf);
  }, [filtered, events, deferredFilters.windowMs, asOf]);

  const windowLabel =
    TIME_WINDOWS.find((w) => w.ms === deferredFilters.windowMs)?.label ?? 'custom';
  const windowText = deferredFilters.windowMs === null ? 'Whole buffer' : `Last ${windowLabel}`;

  // At high rates a bounded buffer can hold less history than the window asks for. Say so.
  const bufferSpanMs = events.length > 0 ? asOf - (events[0]?.ts ?? asOf) : 0;
  const bufferFull = events.length >= capacity;
  const truncated =
    bufferFull && deferredFilters.windowMs !== null && bufferSpanMs < deferredFilters.windowMs;
  const chartSubtitle = truncated
    ? `${windowText} · buffer holds only the last ${formatNumber(bufferSpanMs / 1000)}s at this rate. Raise the buffer size for more`
    : `${windowText} · avg & max per interval`;

  if (!hasData) {
    if (status === 'error') {
      return (
        <EmptyState
          tone="error"
          title="Can't reach the live feed"
          hint="No data has been received yet. We stopped retrying automatically."
          action={
            <button type="button" className="btn btn--primary" onClick={controls.retry}>
              Retry connection
            </button>
          }
        />
      );
    }
    return (
      <div className="grid">
        <div className="kpis">
          {Array.from({ length: 6 }, (_, i) => (
            <Loading key={i} skeletonHeight={96} label="Loading metric" />
          ))}
        </div>
        <Panel title="Latency" className="grid__chart">
          <Loading
            label={status === 'live' ? 'Waiting for the first events…' : 'Connecting to the live feed…'}
          />
        </Panel>
        <Panel title="Recent events" className="grid__events">
          <Loading skeletonHeight={420} label="Loading events" />
        </Panel>
      </div>
    );
  }

  const noMatches = filtered.length === 0;
  return (
    <div className="grid">
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <KpiCards
          kpis={kpis}
          stats={stats}
          windowLabel={windowText}
          bufferUsed={events.length}
          capacity={capacity}
        />
      </ErrorBoundary>

      <Panel title="Latency" subtitle={chartSubtitle} className="grid__chart">
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {noMatches ? (
            <EmptyState title="No data in this window" hint="Widen the time window or clear filters." />
          ) : (
            <LiveChart data={series} label={`Latency over time, ${windowText.toLowerCase()}`} />
          )}
        </ErrorBoundary>
      </Panel>

      <Panel
        title="Recent events"
        subtitle={`${formatNumber(filtered.length)} shown · ${formatNumber(events.length)} buffered`}
        className="grid__events"
      >
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {noMatches ? (
            <EmptyState title="No events match" hint="Try another severity, search term or window." />
          ) : (
            <EventsList events={filtered} />
          )}
        </ErrorBoundary>
      </Panel>
    </div>
  );
}
