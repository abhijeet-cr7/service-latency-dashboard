import { memo } from 'react';
import type { ServiceStatus, Severity } from '../types/event';

const SEVERITY_TEXT: Record<Severity, string> = {
  info: 'Info',
  warning: 'Warn',
  error: 'Error',
  critical: 'Critical',
};

const STATUS_TEXT: Record<ServiceStatus, string> = { ok: 'OK', degraded: 'Degraded', down: 'Down' };

/** Severity as coloured text. The word carries the meaning; colour only reinforces it. */
export const SeverityLabel = memo(function SeverityLabel({ severity }: { severity: Severity }) {
  return <span className={`sev sev--${severity}`}>{SEVERITY_TEXT[severity]}</span>;
});

export const ServiceStatusLabel = memo(function ServiceStatusLabel({
  status,
}: {
  status: ServiceStatus;
}) {
  return (
    <span className={`svc svc--${status}`}>
      <span className="svc__dot" aria-hidden="true" />
      {STATUS_TEXT[status]}
    </span>
  );
});
