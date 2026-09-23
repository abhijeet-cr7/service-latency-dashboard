import { RingBuffer } from './ringBuffer';

describe('RingBuffer', () => {
  it('keeps items in insertion order until full', () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    expect(rb.toArray()).toEqual([1, 2]);
    expect(rb.size).toBe(2);
  });

  it('evicts the oldest item and returns it when full', () => {
    const rb = new RingBuffer<number>(3);
    [1, 2, 3].forEach((n) => rb.push(n));
    expect(rb.push(4)).toBe(1);
    expect(rb.toArray()).toEqual([2, 3, 4]);
  });

  it('never grows past capacity under a flood', () => {
    const rb = new RingBuffer<number>(100);
    for (let i = 0; i < 100_000; i += 1) rb.push(i);
    expect(rb.size).toBe(100);
    expect(rb.toArray()[0]).toBe(99_900);
  });

  it('resizes, keeping the newest items and returning the discarded ones', () => {
    const rb = new RingBuffer<number>(5);
    [1, 2, 3, 4, 5, 6].forEach((n) => rb.push(n));
    expect(rb.resize(2)).toEqual([2, 3, 4]);
    expect(rb.toArray()).toEqual([5, 6]);
    rb.resize(4);
    rb.push(7);
    expect(rb.toArray()).toEqual([5, 6, 7]);
  });

  it('rejects invalid capacities', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
    expect(() => new RingBuffer(1.5)).toThrow(RangeError);
  });
});
