import type { PropulsionMode } from "./types";

/**
 * Calibrated Nestor profile: hull mass plus two 1600 mm plates.
 * The mass/inertia product is the one-second exponential response constant.
 */
export const NESTOR_TWO_PLATE_PROFILE = {
  baseMassKg: 20_000_000,
  plateMassKg: 3_750_000,
  plateCount: 2,
  fittedMassKg: 27_500_000,
  inertiaModifier: 0.35,
  inertiaSeconds: 9.625,
  baseMaxVelocity: 92,
} as const;

export const PROPULSION_SPEED_MULTIPLIER: Record<PropulsionMode, number> = {
  none: 1,
  afterburner: 2.35,
  microwarpdrive: 6,
};

export const PROPULSION_INERTIA_MULTIPLIER: Record<PropulsionMode, number> = {
  none: 1,
  afterburner: 1.4,
  microwarpdrive: 1.8,
};

export const PROPULSION_CYCLE_SECONDS: Record<PropulsionMode, number> = {
  none: 0,
  afterburner: 10,
  microwarpdrive: 10,
};

export const PROPULSION_CAPACITOR_COST: Record<PropulsionMode, number> = {
  none: 0,
  afterburner: 0.1,
  microwarpdrive: 0.22,
};

export const maximumVelocity = (
  baseMaxVelocity: number,
  propulsion: PropulsionMode,
): number => baseMaxVelocity * PROPULSION_SPEED_MULTIPLIER[propulsion];
