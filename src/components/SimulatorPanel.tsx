import { memo } from 'react';
import { formatNumber } from '../utils/helpers';

export const SIMULATOR_RATES = [5, 25, 250, 2_000, 10_000] as const;

interface SimulatorPanelProps {
  readonly rate: number;
  readonly onRateChange: (rate: number) => void;
  readonly onDrop: () => void;
  readonly onStall: () => void;
}

/** Demo-only controls for load and failure injection (shown only with the simulated stream). */
export const SimulatorPanel = memo(function SimulatorPanel({
  rate,
  onRateChange,
  onDrop,
  onStall,
}: SimulatorPanelProps) {
  return (
    <div className="sim" role="group" aria-label="Stream simulator">
      <span className="sim__tag">Simulator</span>
      <div className="segmented" role="group" aria-label="Message rate">
        {SIMULATOR_RATES.map((r) => (
          <button
            key={r}
            type="button"
            className="segmented__item"
            aria-pressed={rate === r}
            onClick={() => onRateChange(r)}
          >
            {formatNumber(r)}/s
          </button>
        ))}
      </div>
      <button type="button" className="btn btn--small" onClick={onDrop}>
        Drop connection
      </button>
      <button type="button" className="btn btn--small" onClick={onStall}>
        Stall feed
      </button>
    </div>
  );
});
