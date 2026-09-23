import { memo } from 'react';
import type { StreamStats } from '../types/stream';
import { formatCompact, formatNumber, type KpiSummary } from '../utils/helpers';

type Tone = 'neutral' | 'ok' | 'warn' | 'bad';

interface KpiCardsProps {
  readonly kpis: KpiSummary;
  readonly stats: StreamStats;
  readonly windowLabel: string;
  readonly bufferUsed: number;
  readonly capacity: number;
}

interface QueryValueProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string | undefined;
  readonly foot?: string | undefined;
  readonly tone?: Tone;
}

/** A single-number widget. The background changes with the threshold (tone). */
const QueryValue = memo(function QueryValue({ label, value, unit, foot, tone = 'neutral' }: QueryValueProps) {
  return (
    <div className={`qv qv--${tone}`}>
      <p className="qv__title">{label}</p>
      <p className="qv__value">
        {value}
        {unit && <span className="qv__unit">{unit}</span>}
      </p>
      {foot && <p className="qv__foot">{foot}</p>}
    </div>
  );
});

const dash = '—';

function threshold(value: number | null, warnAt: number, badAt: number): Tone {
  if (value === null) return 'neutral';
  return value >= badAt ? 'bad' : value >= warnAt ? 'warn' : 'ok';
}

const oneDecimal = (n: number) => formatNumber(Math.round(n * 10) / 10);

/** Row of query-value widgets derived from live data. Unchanged widgets skip re-rendering. */
export const KpiCards = memo(function KpiCards({
  kpis,
  stats,
  windowLabel,
  bufferUsed,
  capacity,
}: KpiCardsProps) {
  const rejected = stats.malformed + stats.dropped + stats.duplicates;
  return (
    <div className="qvs">
      <QueryValue
        label="Throughput"
        value={formatNumber(stats.ratePerSec)}
        unit="evt/s"
        foot={`${formatCompact(stats.received)} received`}
      />
      <QueryValue label="Events in view" value={formatNumber(kpis.count)} foot={windowLabel} />
      <QueryValue
        label="Avg latency"
        value={kpis.avgLatencyMs === null ? dash : oneDecimal(kpis.avgLatencyMs)}
        unit={kpis.avgLatencyMs === null ? undefined : 'ms'}
        foot={windowLabel}
      />
      <QueryValue
        label="p95 latency"
        value={kpis.p95LatencyMs === null ? dash : oneDecimal(kpis.p95LatencyMs)}
        unit={kpis.p95LatencyMs === null ? undefined : 'ms'}
        foot="warn ≥ 200 · crit ≥ 400"
        tone={threshold(kpis.p95LatencyMs, 200, 400)}
      />
      <QueryValue
        label="Error rate"
        value={kpis.errorRatePct === null ? dash : oneDecimal(kpis.errorRatePct)}
        unit={kpis.errorRatePct === null ? undefined : '%'}
        foot={`${formatNumber(kpis.errorCount)} error/critical`}
        tone={threshold(kpis.errorRatePct, 3, 10)}
      />
      <QueryValue
        label="Rejected frames"
        value={formatNumber(rejected)}
        foot={`buffer ${formatCompact(bufferUsed)} / ${formatCompact(capacity)}`}
      />
    </div>
  );
});
