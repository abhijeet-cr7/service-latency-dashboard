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
import { ServiceTopList } from '../components/ServiceTopList';
import { useLiveSelector, useLiveStreamContext } from '../hooks/useLiveStream';
import {
  bucketSeries,
  computeKpis,
  computeServiceStats,
  filterEvents,
  formatNumber,
  pickBucketMs,
  type EventFilters,
} from '../utils/helpers';

/**
 * The only part of the page that re-renders on data flushes (at most once per
 * flush interval, never per message). Filtering, KPIs, chart series and the
 * service rollup are all derived with useMemo from one immutable snapshot, so
 * every widget agrees, whether live, paused or filtered.
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
  const services = useMemo(() => computeServiceStats(filtered), [filtered]);
  const bucketMs = pickBucketMs(
    deferredFilters.windowMs ?? asOf - (events[0]?.ts ?? asOf),
  );
  const series = useMemo(() => {
    const from =
      deferredFilters.windowMs !== null ? asOf - deferredFilters.windowMs : (events[0]?.ts ?? asOf);
    return bucketSeries(filtered, bucketMs, from, asOf);
  }, [filtered, events, deferredFilters.windowMs, asOf, bucketMs]);

  const activeWindow = TIME_WINDOWS.find((w) => w.ms === deferredFilters.windowMs);
  const windowText = activeWindow?.longLabel ?? 'Custom window';

  // At high rates a bounded buffer can hold less history than the window asks for. Say so.
  const bufferSpanMs = events.length > 0 ? asOf - (events[0]?.ts ?? asOf) : 0;
  const truncated =
    events.length >= capacity &&
    deferredFilters.windowMs !== null &&
    bufferSpanMs < deferredFilters.windowMs;

  if (!hasData) {
    if (status === 'error') {
      return (
        <div className="widget">
          <EmptyState
            tone="error"
            title="Can't reach the live feed"
            hint="No data has been received yet, and automatic retries have stopped."
            action={
              <button type="button" className="btn btn--primary" onClick={controls.retry}>
                Retry connection
              </button>
            }
          />
        </div>
      );
    }
    return (
      <div className="grid">
        <div className="qvs">
          {Array.from({ length: 6 }, (_, i) => (
            <Loading key={i} skeletonHeight={92} />
          ))}
        </div>
        <Panel title="Latency (avg / max)" className="grid__chart">
          <Loading
            label={status === 'live' ? 'Waiting for the first events…' : 'Connecting to the live feed…'}
          />
        </Panel>
        <Panel title="Services by avg latency" className="grid__side">
          <Loading skeletonHeight={220} />
        </Panel>
        <Panel title="Event stream" className="grid__logs">
          <Loading skeletonHeight={360} />
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
          windowLabel={windowText.toLowerCase()}
          bufferUsed={events.length}
          capacity={capacity}
        />
      </ErrorBoundary>

      <Panel
        title="Latency (avg / max)"
        meta={`${bucketMs / 1000}s rollup`}
        className="grid__chart"
      >
        {truncated && (
          <p className="notice" role="note">
            At this rate the buffer only holds the last {formatNumber(bufferSpanMs / 1000)}s of the
            window. Raise <strong>buffer</strong> to see more.
          </p>
        )}
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {noMatches ? (
            <EmptyState title="No data in this window" hint="Widen the time window or clear filters." />
          ) : (
            <LiveChart data={series} label={`Latency over time, ${windowText.toLowerCase()}`} />
          )}
        </ErrorBoundary>
      </Panel>

      <Panel title="Services by avg latency" meta={windowText} className="grid__side">
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {services.length === 0 ? (
            <EmptyState title="No services in view" />
          ) : (
            <ServiceTopList rows={services} />
          )}
        </ErrorBoundary>
      </Panel>

      <Panel
        title="Event stream"
        meta={`${formatNumber(filtered.length)} of ${formatNumber(events.length)} buffered`}
        className="grid__logs"
      >
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {noMatches ? (
            <EmptyState title="No events match" hint="Try another status, search term or window." />
          ) : (
            <EventsList events={filtered} />
          )}
        </ErrorBoundary>
      </Panel>
    </div>
  );
}
