import { memo, type ReactNode } from 'react';
import type { StreamStats } from '../types/stream';
import { formatCompact, formatMs, formatNumber, type KpiSummary } from '../utils/helpers';
import { ServiceStatusLabel } from './StatusBadge';

interface KpiCardsProps {
  readonly kpis: KpiSummary;
  readonly stats: StreamStats;
  readonly windowLabel: string;
  readonly bufferUsed: number;
  readonly capacity: number;
}

interface KpiCardProps {
  readonly label: string;
  readonly value: string;
  readonly detail?: ReactNode;
  readonly tone?: 'default' | 'warn' | 'bad';
}

const KpiCard = memo(function KpiCard({ label, value, detail, tone = 'default' }: KpiCardProps) {
  return (
    <div className={`kpi kpi--${tone}`}>
      <p className="kpi__label">{label}</p>
      <p className="kpi__value">{value}</p>
      {detail && <p className="kpi__detail">{detail}</p>}
    </div>
  );
});

const dash = '—';

/** KPI row derived from live data. Each card is memoised, so unchanged cards skip re-rendering. */
export const KpiCards = memo(function KpiCards({
  kpis,
  stats,
  windowLabel,
  bufferUsed,
  capacity,
}: KpiCardsProps) {
  const errorTone =
    kpis.errorRatePct === null ? 'default' : kpis.errorRatePct >= 10 ? 'bad' : kpis.errorRatePct >= 3 ? 'warn' : 'default';
  const rejected = stats.malformed + stats.dropped + stats.duplicates;

  return (
    <div className="kpis">
      <KpiCard
        label="Throughput"
        value={`${formatNumber(stats.ratePerSec)}/s`}
        detail={`${formatCompact(stats.received)} received total`}
      />
      <KpiCard label="Events in view" value={formatNumber(kpis.count)} detail={windowLabel} />
      <KpiCard
        label="Avg latency"
        value={kpis.avgLatencyMs === null ? dash : formatMs(kpis.avgLatencyMs)}
        detail={kpis.p95LatencyMs === null ? 'p95 —' : `p95 ${formatMs(kpis.p95LatencyMs)}`}
      />
      <KpiCard
        label="Error rate"
        value={kpis.errorRatePct === null ? dash : `${formatNumber(kpis.errorRatePct)}%`}
        detail={`${formatNumber(kpis.errorCount)} error/critical`}
        tone={errorTone}
      />
      <KpiCard
        label="Services"
        value={`${kpis.statusCounts.ok}/${kpis.statusCounts.ok + kpis.statusCounts.degraded + kpis.statusCounts.down} healthy`}
        detail={
          <span className="kpi__statuses">
            <ServiceStatusLabel status="ok" /> {kpis.statusCounts.ok}
            <ServiceStatusLabel status="degraded" /> {kpis.statusCounts.degraded}
            <ServiceStatusLabel status="down" /> {kpis.statusCounts.down}
          </span>
        }
        tone={kpis.statusCounts.down > 0 ? 'bad' : kpis.statusCounts.degraded > 0 ? 'warn' : 'default'}
      />
      <KpiCard
        label="Rejected frames"
        value={formatNumber(rejected)}
        detail={`Buffer ${formatCompact(bufferUsed)}/${formatCompact(capacity)}`}
        tone={rejected > 0 ? 'warn' : 'default'}
      />
    </div>
  );
});
