import type { SVGProps } from 'react';

/** Small stroke icons (16px grid). Decorative: callers provide accessible text. */
type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  ...props,
});

export const PauseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth={2} />
  </svg>
);

export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor" />
  </svg>
);

export const ClockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 5v3.25l2 1.25" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.25 10.25L13.5 13.5" />
  </svg>
);

/** Neutral product mark (a pulse line). */
export const MarkIcon = (p: IconProps) => (
  <svg {...base({ width: 22, height: 22, viewBox: '0 0 22 22', ...p })}>
    <path d="M2 12h4l2.5-6 4 11 2.5-5h5" strokeWidth={2} />
  </svg>
);
