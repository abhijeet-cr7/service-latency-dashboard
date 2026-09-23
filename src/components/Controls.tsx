import { memo, useId } from 'react';
import { BUFFER_SIZE_OPTIONS, FLUSH_INTERVAL_OPTIONS, TIME_WINDOWS } from '../config';
import { SEVERITIES, type Severity } from '../types/event';
import { formatNumber } from '../utils/helpers';
import { ClockIcon, PauseIcon, PlayIcon, SearchIcon } from './Icons';

const MAX_QUERY_LENGTH = 80;
const ALL = 'all';

interface TimeControlsProps {
  readonly windowMs: number | null;
  readonly onWindowChange: (ms: number | null) => void;
  readonly paused: boolean;
  readonly onTogglePause: () => void;
}

/** Top-right time picker and the live Pause/Resume toggle. */
export const TimeControls = memo(function TimeControls({
  windowMs,
  onWindowChange,
  paused,
  onTogglePause,
}: TimeControlsProps) {
  const id = useId();
  return (
    <div className="timectl">
      <div className="timepicker">
        <ClockIcon className="timepicker__icon" />
        <label htmlFor={id} className="sr-only">
          Time window
        </label>
        <select
          id={id}
          className="timepicker__select"
          value={windowMs ?? ALL}
          onChange={(e) => onWindowChange(e.target.value === ALL ? null : Number(e.target.value))}
        >
          {TIME_WINDOWS.map((w) => (
            <option key={w.label} value={w.ms ?? ALL}>
              {w.longLabel}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className={`btn btn--live ${paused ? 'is-paused' : ''}`}
        onClick={onTogglePause}
        aria-pressed={paused}
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  );
});

interface FilterBarProps {
  readonly severities: ReadonlySet<Severity>;
  readonly onToggleSeverity: (severity: Severity) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly bufferSize: number;
  readonly onBufferSizeChange: (size: number) => void;
  readonly flushIntervalMs: number;
  readonly onFlushIntervalChange: (ms: number) => void;
}

/** Template-variable style filter bar: status facet, search, and performance tuning. Stateless. */
export const FilterBar = memo(function FilterBar({
  severities,
  onToggleSeverity,
  query,
  onQueryChange,
  bufferSize,
  onBufferSizeChange,
  flushIntervalMs,
  onFlushIntervalChange,
}: FilterBarProps) {
  const searchId = useId();
  const bufferId = useId();
  const flushId = useId();
  return (
    <div className="filters" role="toolbar" aria-label="Dashboard filters">
      <div className="tv" role="group" aria-label="Severity filter">
        <span className="tv__key">status</span>
        <span className="tv__value tv__value--toggles">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              className={`toggle toggle--${s}`}
              aria-pressed={severities.has(s)}
              onClick={() => onToggleSeverity(s)}
            >
              {s}
            </button>
          ))}
        </span>
      </div>

      <div className="search">
        <SearchIcon className="search__icon" />
        <label htmlFor={searchId} className="sr-only">
          Search events
        </label>
        <input
          id={searchId}
          className="search__input"
          type="search"
          placeholder="Filter by service or message"
          value={query}
          maxLength={MAX_QUERY_LENGTH}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onQueryChange(e.target.value.slice(0, MAX_QUERY_LENGTH))}
        />
      </div>

      <div className="tv">
        <label className="tv__key" htmlFor={bufferId}>
          buffer
        </label>
        <select
          id={bufferId}
          className="tv__select"
          value={bufferSize}
          onChange={(e) => onBufferSizeChange(Number(e.target.value))}
        >
          {withCurrent(BUFFER_SIZE_OPTIONS, bufferSize).map((n) => (
            <option key={n} value={n}>
              {formatNumber(n)} events
            </option>
          ))}
        </select>
      </div>

      <div className="tv">
        <label className="tv__key" htmlFor={flushId}>
          refresh
        </label>
        <select
          id={flushId}
          className="tv__select"
          value={flushIntervalMs}
          onChange={(e) => onFlushIntervalChange(Number(e.target.value))}
        >
          {withCurrent(FLUSH_INTERVAL_OPTIONS, flushIntervalMs).map((n) => (
            <option key={n} value={n}>
              {n} ms
            </option>
          ))}
        </select>
      </div>
    </div>
  );
});

/** Ensures an env-configured value that isn't a preset still shows in the select. */
function withCurrent(options: readonly number[], current: number): number[] {
  return options.includes(current) ? [...options] : [...options, current].sort((a, b) => a - b);
}
