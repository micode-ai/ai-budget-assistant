/** Global in-flight byte budget: raw DATA bytes held in memory across every session. */
export class ByteBudget {
  private used = 0;
  constructor(private readonly limit: number) {}

  /** Reserves `n` bytes; false (and no change) when it would exceed the limit. */
  tryReserve(n: number): boolean {
    if (this.used + n > this.limit) return false;
    this.used += n;
    return true;
  }

  release(n: number): void {
    this.used = Math.max(0, this.used - n);
  }

  get inUse(): number {
    return this.used;
  }
}
