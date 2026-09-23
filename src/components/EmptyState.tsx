import { memo, type ReactNode } from 'react';

interface EmptyStateProps {
  readonly title: string;
  readonly hint?: string;
  readonly tone?: 'neutral' | 'error';
  readonly action?: ReactNode;
}

export const EmptyState = memo(function EmptyState({
  title,
  hint,
  tone = 'neutral',
  action,
}: EmptyStateProps) {
  return (
    <div className={`empty empty--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
      {action}
    </div>
  );
});
