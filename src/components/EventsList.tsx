import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { LiveEvent } from '../types/event';
import { formatNumber, formatTime } from '../utils/helpers';
import { SeverityLabel } from './StatusBadge';

const EVENT_ROW_HEIGHT = 30;

const formatTimestamp = (ts: number) => `${formatTime(ts)}.${String(ts % 1000).padStart(3, '0')}`;

interface EventsListProps {
  /** Events oldest → newest (buffer order). Rendered newest first without copying. */
  readonly events: readonly LiveEvent[];
  readonly height?: number;
}

/**
 * Virtualised event log: only the visible rows (plus overscan) are in the DOM,
 * so 25k buffered events cost the same to render as 20.
 *
 * Every stream-supplied string is rendered as a React text child (auto-escaped)
 * and never as HTML.
 */
export const EventsList = memo(function EventsList({ events, height = 360 }: EventsListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = events.length;
  const at = useCallback((i: number) => events[count - 1 - i] as LiveEvent, [events, count]);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => EVENT_ROW_HEIGHT,
    overscan: 8,
    getItemKey: (i) => at(i).id,
    // jsdom (tests) has no layout; give the virtualizer a sensible viewport.
    initialRect: { width: 800, height },
  });

  // Newest id seen when the user scrolled away from the top (null = following live).
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const prevNewestRef = useRef<string | null>(null);

  // Scroll anchoring: when reading older rows, keep them still as new rows arrive on top.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prevNewest = prevNewestRef.current;
    prevNewestRef.current = count > 0 ? at(0).id : null;
    if (!el || prevNewest === null || el.scrollTop < EVENT_ROW_HEIGHT / 2) return;
    let added = 0;
    while (added < count && at(added).id !== prevNewest) added += 1;
    if (added > 0 && added < count) el.scrollTop += added * EVENT_ROW_HEIGHT;
  }, [at, count]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const following = el.scrollTop < EVENT_ROW_HEIGHT / 2;
    setAnchorId((prev) => (following ? null : (prev ?? (count > 0 ? at(0).id : null))));
  }, [at, count]);

  const jumpToLatest = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setAnchorId(null);
  }, []);

  let unseen = 0;
  if (anchorId !== null) {
    while (unseen < count && at(unseen).id !== anchorId) unseen += 1;
    if (unseen === count) unseen = 0; // anchor evicted or filtered out
  }

  return (
    <div className="logs">
      <div className="logs__head" aria-hidden="true">
        <span>Date</span>
        <span>Status</span>
        <span>Service</span>
        <span className="num">Latency</span>
        <span>Message</span>
      </div>
      {anchorId !== null && (
        <button type="button" className="logs__jump" onClick={jumpToLatest}>
          {unseen > 0 ? `Show ${formatNumber(unseen)} new events` : 'Back to latest'}
        </button>
      )}
      <div
        ref={scrollRef}
        className="logs__scroll"
        style={{ height }}
        onScroll={onScroll}
        role="list"
        aria-label="Recent events, newest first"
        tabIndex={0}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => (
            <EventRow
              key={item.key}
              event={at(item.index)}
              top={item.start}
              position={item.index + 1}
              total={count}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

interface EventRowProps {
  readonly event: LiveEvent;
  readonly top: number;
  readonly position: number;
  readonly total: number;
}

const EventRow = memo(function EventRow({ event, top, position, total }: EventRowProps) {
  return (
    <div
      className={`log log--${event.severity}`}
      style={{ transform: `translateY(${top}px)`, height: EVENT_ROW_HEIGHT }}
      role="listitem"
      aria-posinset={position}
      aria-setsize={total}
    >
      <time className="log__time" dateTime={new Date(event.ts).toISOString()}>
        {formatTimestamp(event.ts)}
      </time>
      <SeverityLabel severity={event.severity} />
      <span className="log__service">{event.source}</span>
      <span className="log__latency num">{event.latencyMs.toFixed(1)} ms</span>
      <span className="log__message" title={event.message}>
        {event.message || '(no message)'}
      </span>
    </div>
  );
});
