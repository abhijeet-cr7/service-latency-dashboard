import { render, screen } from '@testing-library/react';
import type { LiveEvent } from '../types/event';
import { EventsList } from './EventsList';

const ev = (i: number, message = 'ok'): LiveEvent => ({
  id: `e${i}`,
  ts: 1_700_000_000_000 + i * 1000,
  source: 'payments',
  severity: 'error',
  status: 'degraded',
  latencyMs: 12.5,
  message,
});

describe('EventsList', () => {
  it('renders hostile stream text as inert text (XSS-safe)', () => {
    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    const { container } = render(<EventsList events={[ev(1, payload)]} />);

    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('renders newest first', () => {
    render(<EventsList events={[ev(1, 'first'), ev(2, 'second')]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('second');
    expect(items[1]).toHaveTextContent('first');
  });

  it('virtualises: 10,000 events produce only a viewport of DOM rows', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ev(i));
    render(<EventsList events={many} height={420} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(40);
    expect(rows[0]).toHaveAttribute('aria-setsize', '10000');
  });
});
