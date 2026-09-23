import { memo } from 'react';
import { formatNumber, type ServiceStats } from '../utils/helpers';
import { ServiceStatusLabel } from './StatusBadge';

/** Top list: services ranked by average latency, with an inline bar scaled to the worst one. */
export const ServiceTopList = memo(function ServiceTopList({
  rows,
}: {
  rows: readonly ServiceStats[];
}) {
  const max = rows[0]?.avgLatencyMs ?? 1;
  return (
    <table className="toplist">
      <thead>
        <tr>
          <th scope="col">Service</th>
          <th scope="col">Status</th>
          <th scope="col" className="num">
            Errors
          </th>
          <th scope="col" className="toplist__barcol">
            Avg latency
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.source}>
            <td className="toplist__name">{r.source}</td>
            <td>
              <ServiceStatusLabel status={r.status} />
            </td>
            <td className="num">{formatNumber(r.errorCount)}</td>
            <td className="toplist__barcol">
              <span className="toplist__bar">
                <span
                  className="toplist__fill"
                  style={{ width: `${Math.max(2, (r.avgLatencyMs / max) * 100)}%` }}
                />
              </span>
              <span className="toplist__value">{formatNumber(Math.round(r.avgLatencyMs))} ms</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
