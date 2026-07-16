export class SimulationClock {
  readonly tickDurationMs = 1000;
  tick = 0;
  accumulatorMs = 0;
  speed = 1;
  paused = true;

  advance(deltaMs: number): number {
    if (this.paused || deltaMs <= 0) return 0;
    this.accumulatorMs += Math.min(deltaMs, 5000) * this.speed;
    let ticks = 0;
    while (this.accumulatorMs >= this.tickDurationMs && ticks < 10) {
      this.accumulatorMs -= this.tickDurationMs;
      this.tick += 1;
      ticks += 1;
    }
    return ticks;
  }

  step(): void {
    this.tick += 1;
  }

  reset(): void {
    this.tick = 0;
    this.accumulatorMs = 0;
    this.speed = 1;
    this.paused = true;
  }

  get phase(): number {
    return this.accumulatorMs / this.tickDurationMs;
  }

  get millisecondsUntilTick(): number {
    return (this.tickDurationMs - this.accumulatorMs) / this.speed;
  }
}
