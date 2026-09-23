import { memo, useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { formatTime, type SeriesData } from '../utils/helpers';

interface LiveChartProps {
  readonly data: SeriesData;
  readonly height?: number;
  readonly label: string;
}

function cssVar(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

function buildOptions(el: HTMLElement, width: number, height: number): uPlot.Options {
  const ink = cssVar(el, '--text-muted', '#8a8a99');
  const grid = cssVar(el, '--chart-grid', '#ececf1');
  const s1 = cssVar(el, '--series-1', '#7b4fc6');
  const s2 = cssVar(el, '--series-2', '#e07a2f');
  const font = `11px ${cssVar(el, '--font-sans', 'system-ui, sans-serif')}`;
  const axis: uPlot.Axis = {
    stroke: ink,
    grid: { stroke: grid, width: 1, dash: [2, 3] },
    ticks: { show: false },
    font,
    gap: 4,
  };
  const fmt = (_u: uPlot, v: number | null) => (v == null ? '—' : `${v.toFixed(1)} ms`);
  // Lines only, joined across empty buckets. A marker appears only when a series has a
  // single point, which would otherwise be invisible.
  const points: uPlot.Series.Points = {
    show: (u, sidx) => (u.data[sidx] ?? []).filter((v) => v != null).length <= 1,
  };
  return {
    width,
    height,
    padding: [8, 8, 0, 0],
    cursor: { drag: { x: false, y: false }, points: { size: 8 } },
    scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, Math.max(50, max * 1.1)] } },
    axes: [
      // Single-line HH:MM:SS ticks (uPlot's default adds a second date line).
      { ...axis, size: 26, values: (_u, vals) => vals.map((v) => formatTime(v * 1000)) },
      { ...axis, size: 52, values: (_u, vals) => vals.map((v) => `${v} ms`) },
    ],
    series: [
      {},
      { label: 'avg latency', stroke: s1, width: 1.5, value: fmt, spanGaps: true, points },
      { label: 'max latency', stroke: s2, width: 1, dash: [3, 2], value: fmt, spanGaps: true, points },
    ],
    legend: { live: true },
  };
}

/**
 * Canvas chart via uPlot. React owns only the container. Updates go through
 * `setData`, which redraws one canvas and never reconciles DOM nodes per
 * point, so the chart stays smooth at any message rate.
 */
export const LiveChart = memo(function LiveChart({ data, height = 260, label }: LiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  // Create once. Rebuild only on colour-scheme change (theme colours are baked into the canvas).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const create = () => {
      // Carry existing points across a rebuild. On first mount the data effect below fills it.
      const existing: uPlot.AlignedData = plotRef.current?.data ?? [[], [], []];
      plotRef.current?.destroy();
      plotRef.current = new uPlot(buildOptions(el, el.clientWidth || 600, height), existing, el);
    };
    create();

    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (w > 0 && plotRef.current && plotRef.current.width !== w) {
        plotRef.current.setSize({ width: w, height });
      }
    });
    ro.observe(el);

    // Theme colours are baked into the canvas: rebuild when the OS scheme or the
    // `data-theme` override changes.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', create);
    const themeObserver = new MutationObserver(create);
    themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] });

    return () => {
      ro.disconnect();
      themeObserver.disconnect();
      mq.removeEventListener('change', create);
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    plotRef.current?.setData([data.x, data.avg, data.max]);
  }, [data]);

  let lastAvg: number | null = null;
  for (let i = data.avg.length - 1; i >= 0 && lastAvg === null; i -= 1) lastAvg = data.avg[i] ?? null;
  return (
    <div
      ref={containerRef}
      className="chart"
      role="img"
      aria-label={`${label}. Latest average latency ${lastAvg == null ? 'not available' : `${lastAvg} milliseconds`}.`}
    />
  );
});
