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
  // Unlinked multipliers are reverse-calibrated so the default-on Rapid
  // Deployment link produces exactly 571 m/s AB and 1,612 m/s MWD.
  afterburner: 4.93420110256191,
  microwarpdrive: 13.4843124757706,
};

export const PROPULSION_INERTIA_MULTIPLIER: Record<PropulsionMode, number> = {
  none: 1,
  afterburner: 1.4,
  microwarpdrive: 1.8,
};

/** Standard battleship-sized AB/MWD added mass used by the player Nestor. */
export const PROPULSION_MASS_ADDITION_KG: Record<PropulsionMode, number> = {
  none: 0,
  afterburner: 50_000_000,
  microwarpdrive: 50_000_000,
};

export const FLEET_MAX_VELOCITY: Record<PropulsionMode, number> = {
  none: 240,
  afterburner: 550,
  microwarpdrive: 1300,
};

/** Rapid Deployment strength applied to the prop-module bonus portion. */
export const SKIRMISH_RAPID_DEPLOYMENT_BONUS = 0.3234;

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
  skirmishLinks = false,
): number => {
  const moduleBonus = PROPULSION_SPEED_MULTIPLIER[propulsion] - 1;
  const boostedBonus =
    moduleBonus * (skirmishLinks ? 1 + SKIRMISH_RAPID_DEPLOYMENT_BONUS : 1);
  return baseMaxVelocity * (1 + boostedBonus);
};

export const fleetMaximumVelocity = (propulsion: PropulsionMode): number =>
  FLEET_MAX_VELOCITY[propulsion];

export const platedNestorResponseSeconds = (
  fittedMassKg: number,
  inertiaModifier: number,
  propulsion: PropulsionMode,
): number =>
  ((fittedMassKg + PROPULSION_MASS_ADDITION_KG[propulsion]) * inertiaModifier) /
  1_000_000;
