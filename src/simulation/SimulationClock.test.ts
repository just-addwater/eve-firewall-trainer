import { describe, expect, it } from "vitest";
import { SimulationClock } from "./SimulationClock";

describe("SimulationClock", () => {
  it("produces exactly one authoritative tick per simulated second", () => {
    const clock = new SimulationClock();
    clock.paused = false;
    expect(clock.advance(999)).toBe(0);
    expect(clock.tick).toBe(0);
    expect(clock.advance(1)).toBe(1);
    expect(clock.tick).toBe(1);
  });

  it("does not advance while paused and resumes without losing phase", () => {
    const clock = new SimulationClock();
    clock.paused = false;
    clock.advance(400);
    clock.paused = true;
    expect(clock.advance(5000)).toBe(0);
    expect(clock.phase).toBeCloseTo(0.4);
    clock.paused = false;
    expect(clock.advance(600)).toBe(1);
  });

  it("supports deterministic time scaling and single-tick stepping", () => {
    const clock = new SimulationClock();
    clock.paused = false;
    clock.speed = 2;
    expect(clock.advance(500)).toBe(1);
    clock.paused = true;
    clock.step();
    expect(clock.tick).toBe(2);
  });
});
