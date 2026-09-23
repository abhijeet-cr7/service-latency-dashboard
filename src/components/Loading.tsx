import { memo } from 'react';

interface LoadingProps {
  readonly label?: string;
  /** Renders a skeleton block of this height instead of a spinner row. */
  readonly skeletonHeight?: number;
}

/** Loading indicator: a skeleton placeholder or an inline spinner with a label. */
export const Loading = memo(function Loading({ label = 'Loading…', skeletonHeight }: LoadingProps) {
  if (skeletonHeight !== undefined) {
    return (
      // Decorative placeholder: the panel's spinner (role=status) announces loading once.
      <div className="skeleton" style={{ height: skeletonHeight }} aria-hidden="true" data-label={label} />
    );
  }
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
});
