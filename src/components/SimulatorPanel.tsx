import { memo, useId } from 'react';
import { formatNumber } from '../utils/helpers';

const SIMULATOR_RATES = [5, 25, 250, 2_000, 10_000] as const;

interface SimulatorPanelProps {
  readonly rate: number;
  readonly onRateChange: (rate: number) => void;
  readonly onDrop: () => void;
  readonly onStall: () => void;
}

/** Demo-only load and failure injection (shown only with the simulated stream). */
export const SimulatorPanel = memo(function SimulatorPanel({
  rate,
  onRateChange,
  onDrop,
  onStall,
}: SimulatorPanelProps) {
  const id = useId();
  return (
    <div className="sim" role="group" aria-label="Stream simulator">
      <div className="tv">
        <label className="tv__key" htmlFor={id}>
          simulator rate
        </label>
        <select
          id={id}
          className="tv__select"
          value={rate}
          onChange={(e) => onRateChange(Number(e.target.value))}
        >
          {SIMULATOR_RATES.map((r) => (
            <option key={r} value={r}>
              {formatNumber(r)} evt/s
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn btn--sm" onClick={onDrop}>
        Drop connection
      </button>
      <button type="button" className="btn btn--sm" onClick={onStall}>
        Stall feed
      </button>
    </div>
  );
});
