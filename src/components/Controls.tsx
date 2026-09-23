import { memo, useId } from 'react';
import { BUFFER_SIZE_OPTIONS, FLUSH_INTERVAL_OPTIONS, TIME_WINDOWS } from '../config';
import { SEVERITIES, type Severity } from '../types/event';
import { formatNumber } from '../utils/helpers';

interface ControlsProps {
  readonly paused: boolean;
  readonly onTogglePause: () => void;
  readonly severities: ReadonlySet<Severity>;
  readonly onToggleSeverity: (severity: Severity) => void;
  readonly windowMs: number | null;
  readonly onWindowChange: (ms: number | null) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly bufferSize: number;
  readonly onBufferSizeChange: (size: number) => void;
  readonly flushIntervalMs: number;
  readonly onFlushIntervalChange: (ms: number) => void;
}

const MAX_QUERY_LENGTH = 80;

/** Toolbar: pause/resume, filters, time window, and performance tuning. Stateless. */
export const Controls = memo(function Controls(props: ControlsProps) {
  const searchId = useId();
  const bufferId = useId();
  const flushId = useId();
  const {
    paused,
    onTogglePause,
    severities,
    onToggleSeverity,
    windowMs,
    onWindowChange,
    query,
    onQueryChange,
    bufferSize,
    onBufferSizeChange,
    flushIntervalMs,
    onFlushIntervalChange,
  } = props;

  return (
    <div className="controls" role="toolbar" aria-label="Dashboard controls">
      <button
        type="button"
        className={`btn ${paused ? 'btn--primary' : ''}`}
        onClick={onTogglePause}
        aria-pressed={paused}
      >
        <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span> {paused ? 'Resume' : 'Pause'}
      </button>

      <div className="control-group" role="group" aria-label="Time window">
        <span className="control-group__label">Window</span>
        <div className="segmented">
          {TIME_WINDOWS.map((w) => (
            <button
              key={w.label}
              type="button"
              className="segmented__item"
              aria-pressed={windowMs === w.ms}
              onClick={() => onWindowChange(w.ms)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group" role="group" aria-label="Severity filter">
        <span className="control-group__label">Severity</span>
        <div className="chips">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip chip--${s}`}
              aria-pressed={severities.has(s)}
              onClick={() => onToggleSeverity(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group control-group--grow">
        <label className="control-group__label" htmlFor={searchId}>
          Search
        </label>
        <input
          id={searchId}
          className="input"
          type="search"
          placeholder="Source or message…"
          value={query}
          maxLength={MAX_QUERY_LENGTH}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onQueryChange(e.target.value.slice(0, MAX_QUERY_LENGTH))}
        />
      </div>

      <div className="control-group">
        <label className="control-group__label" htmlFor={bufferId}>
          Buffer
        </label>
        <select
          id={bufferId}
          className="input"
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

      <div className="control-group">
        <label className="control-group__label" htmlFor={flushId}>
          UI update
        </label>
        <select
          id={flushId}
          className="input"
          value={flushIntervalMs}
          onChange={(e) => onFlushIntervalChange(Number(e.target.value))}
        >
          {withCurrent(FLUSH_INTERVAL_OPTIONS, flushIntervalMs).map((n) => (
            <option key={n} value={n}>
              every {n} ms
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
