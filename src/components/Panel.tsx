import { memo, type ReactNode } from 'react';

interface PanelProps {
  readonly title: string;
  /** Short right-aligned context, e.g. "34 of 5,000". */
  readonly meta?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

/** Dashboard widget frame: a small title bar and a body. Presentation only. */
export const Panel = memo(function Panel({ title, meta, className, children }: PanelProps) {
  return (
    <section className={`widget ${className ?? ''}`} aria-label={title}>
      <header className="widget__head">
        <h2 className="widget__title">{title}</h2>
        {meta && <span className="widget__meta">{meta}</span>}
      </header>
      <div className="widget__body">{children}</div>
    </section>
  );
});
