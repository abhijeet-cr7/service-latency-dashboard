import { memo, type ReactNode } from 'react';

interface PanelProps {
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

/** Card container with a header. Presentation only. */
export const Panel = memo(function Panel({ title, subtitle, actions, className, children }: PanelProps) {
  return (
    <section className={`panel ${className ?? ''}`} aria-label={title}>
      <header className="panel__header">
        <div>
          <h2 className="panel__title">{title}</h2>
          {subtitle && <p className="panel__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="panel__actions">{actions}</div>}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
});
