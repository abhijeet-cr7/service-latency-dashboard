/**
 * Fixed-capacity circular buffer. `push` is O(1) and never allocates, so a
 * flood of messages cannot grow memory. The oldest item is overwritten.
 */
export class RingBuffer<T> {
  private items: (T | undefined)[];
  private head = 0; // index of the oldest item
  private count = 0;
  private cap: number;

  constructor(capacity: number) {
    const cap = capacity;
    if (!Number.isInteger(cap) || cap <= 0) throw new RangeError('capacity must be a positive integer');
    this.cap = cap;
    this.items = new Array<T | undefined>(cap);
  }

  get size(): number {
    return this.count;
  }

  get capacity(): number {
    return this.cap;
  }

  /** Adds an item. Returns true if an older item was evicted to make room. */
  push(item: T): boolean {
    const tail = (this.head + this.count) % this.cap;
    this.items[tail] = item;
    if (this.count < this.cap) {
      this.count += 1;
      return false;
    }
    this.head = (this.head + 1) % this.cap;
    return true;
  }

  /** Copies the contents oldest → newest. O(size). */
  toArray(): T[] {
    const out = new Array<T>(this.count);
    for (let i = 0; i < this.count; i += 1) {
      out[i] = this.items[(this.head + i) % this.cap] as T;
    }
    return out;
  }

  /** Changes capacity and keeps the newest items that fit. */
  resize(nextCapacity: number): void {
    if (!Number.isInteger(nextCapacity) || nextCapacity <= 0) {
      throw new RangeError('capacity must be a positive integer');
    }
    const kept = this.toArray().slice(-nextCapacity);
    this.cap = nextCapacity;
    this.items = new Array<T | undefined>(nextCapacity);
    kept.forEach((item, i) => {
      this.items[i] = item;
    });
    this.head = 0;
    this.count = kept.length;
  }

  clear(): void {
    this.items = new Array<T | undefined>(this.cap);
    this.head = 0;
    this.count = 0;
  }
}
