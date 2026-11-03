import { describe, expect, it } from "vitest";
import { acceleratedDecay, FULL_DECAY_HOURS } from "@/services/cat/decay";

describe("acceleratedDecay (one-week full depletion)", () => {
  it("does not decay at all when no time has passed", () => {
    expect(acceleratedDecay(0)).toBe(0);
    expect(acceleratedDecay(-5)).toBe(0);
  });

  it("fully depletes at one week and clamps beyond it", () => {
    expect(FULL_DECAY_HOURS).toBe(168);
    expect(acceleratedDecay(168)).toBe(100);
    expect(acceleratedDecay(500)).toBe(100);
  });

  it("follows the quadratic curve", () => {
    expect(acceleratedDecay(24)).toBe(2);
    expect(acceleratedDecay(84)).toBe(25);
    expect(acceleratedDecay(120)).toBe(51);
  });
});
