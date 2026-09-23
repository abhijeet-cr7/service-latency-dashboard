import { memo } from 'react';
import type { ServiceStatus, Severity } from '../types/event';

// Colour never carries meaning alone: each badge pairs an icon glyph with a text label.
const SEVERITY_ICON: Record<Severity, string> = {
  info: 'ℹ',
  warning: '▲',
  error: '✕',
  critical: '⬣',
};

const STATUS_ICON: Record<ServiceStatus, string> = { ok: '●', degraded: '◐', down: '○' };

export const SeverityBadge = memo(function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge badge--${severity}`}>
      <span aria-hidden="true">{SEVERITY_ICON[severity]}</span>
      {severity}
    </span>
  );
});

export const ServiceStatusLabel = memo(function ServiceStatusLabel({
  status,
}: {
  status: ServiceStatus;
}) {
  return (
    <span className={`svc svc--${status}`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span>
      {status}
    </span>
  );
});
