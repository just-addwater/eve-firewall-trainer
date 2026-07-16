import type { HostileFleetConfig, ScenarioConfig } from "./types";

const COLORS = ["#ff6b5f", "#b981ff", "#ffb547"];

const hostile = (
  index: number,
  overrides: Partial<HostileFleetConfig> = {},
): HostileFleetConfig => ({
  id: `red-${index + 1}`,
  name: ["Crimson Spear", "Violet Wing", "Amber Lance"][index]!,
  color: COLORS[index]!,
  missileSpeed: [4500, 7500, 11000][index]!,
  volleyInterval: 11,
  volleySize: 20,
  launchDelay: 1,
  propulsion: index === 2 ? "microwarpdrive" : "afterburner",
  throttle: 0.55,
  engagementRange: 55_000,
  movement: index === 0 ? "orbit" : index === 1 ? "flank" : "vertical",
  verticalOffset: [3000, 12000, -15000][index]!,
  formationRadius: 6500,
  speedVariation: 0.05,
  ...overrides,
});

const scenario = (
  id: string,
  name: string,
  description: string,
  difficulty: string,
  overrides: Partial<ScenarioConfig> = {},
): ScenarioConfig => ({
  id,
  name,
  description,
  difficulty,
  seed: 117_204,
  durationTicks: 120,
  assistance: "full",
  blueMovement: "turn",
  blueSpeed: 125,
  bluePropulsion: "afterburner",
  blueThrottle: 0.58,
  staggeredMissiles: false,
  friendlyFire: true,
  hostiles: [hostile(0)],
  tutorial: false,
  ...overrides,
});

export const SCENARIOS: ScenarioConfig[] = [
  scenario(
    "basic-firewall",
    "Basic Firewall",
    "Moving anchored fleets and generous telemetry introduce pulse timing.",
    "I · Introductory",
    { blueMovement: "turn", blueSpeed: 110, tutorial: true },
  ),
  scenario(
    "moving-line",
    "Moving Line",
    "Match the Blue FC while holding the hostile-facing side.",
    "II · Developing",
    {
      hostiles: [hostile(0, { propulsion: "afterburner", missileSpeed: 6000 })],
    },
  ),
  scenario(
    "anchor-turn",
    "Anchor Turn",
    "Wide Blue FC turns make braking and relative velocity decisive.",
    "III · Skilled",
    { blueMovement: "turn", assistance: "partial" },
  ),
  scenario(
    "expanding-formation",
    "Expanding Formation",
    "The friendly exclusion envelope repeatedly expands toward the firewall.",
    "III · Skilled",
    { blueMovement: "expand", assistance: "partial" },
  ),
  scenario(
    "orbiting-ab",
    "Orbiting AB Fleet",
    "An AB anchor rotates the active corridor around the blue formation.",
    "III · Skilled",
    {
      hostiles: [hostile(0, { propulsion: "afterburner", movement: "orbit" })],
    },
  ),
  scenario(
    "mwd-stretch",
    "MWD Formation Stretch",
    "A cycling hostile MWD stretches launch positions into a missile stream.",
    "IV · Advanced",
    {
      hostiles: [
        hostile(0, {
          propulsion: "microwarpdrive",
          movement: "flank",
          speedVariation: 0.18,
        }),
      ],
    },
  ),
  scenario(
    "crossfire",
    "Crossfire",
    "Two bearings and different missile speeds create shifting overlap windows.",
    "IV · Advanced",
    { hostiles: [hostile(0), hostile(1)] },
  ),
  scenario(
    "vertical-crossfire",
    "Vertical Crossfire",
    "One threat above, one below, and a climbing blue formation force 3D movement.",
    "IV · Advanced",
    {
      blueMovement: "climb",
      hostiles: [
        hostile(0, { verticalOffset: 18000 }),
        hostile(1, { verticalOffset: -18000 }),
      ],
    },
  ),
  scenario(
    "pincer",
    "Pincer",
    "An AB flank and MWD flank change sides around the blue fleet.",
    "V · Expert",
    {
      hostiles: [
        hostile(0, { movement: "pincer", propulsion: "afterburner" }),
        hostile(1, { movement: "pincer", propulsion: "microwarpdrive" }),
      ],
    },
  ),
  scenario(
    "three-fc-rotation",
    "Three FC Rotation",
    "Three independent anchors rotate across different inclinations and speeds.",
    "V · Expert",
    {
      blueMovement: "helix",
      assistance: "partial",
      hostiles: [hostile(0), hostile(1), hostile(2)],
    },
  ),
  scenario(
    "fast-pressure",
    "Fast Missile Pressure",
    "Very fast missiles allow one practical pulse opportunity. Position before launch.",
    "V · Expert",
    {
      assistance: "minimal",
      hostiles: [hostile(0, { missileSpeed: 11000 })],
    },
  ),
  scenario(
    "mixed-velocity",
    "Mixed Velocity Trap",
    "A later fast wave overtakes the obvious slow pressure.",
    "V · Expert",
    {
      hostiles: [
        hostile(0, { missileSpeed: 4200 }),
        hostile(1, { missileSpeed: 10500, launchDelay: 13 }),
      ],
    },
  ),
  scenario(
    "overtaking-wave",
    "Overtaking Wave",
    "Wide seeded speed variation compresses two waves near the firewall.",
    "V · Expert",
    {
      hostiles: [
        hostile(0, {
          missileSpeed: 7200,
          speedVariation: 0.45,
          volleyInterval: 11,
        }),
      ],
    },
  ),
  scenario(
    "formation-traffic",
    "Formation Traffic",
    "Blue ships cross the firing envelope and force disciplined aborted pulses.",
    "IV · Advanced",
    { blueMovement: "expand", friendlyFire: true },
  ),
  scenario(
    "momentum-trap",
    "Momentum Trap",
    "The Blue FC changes course after an inviting MWD reposition.",
    "V · Expert",
    {
      blueMovement: "turn",
      assistance: "partial",
      hostiles: [hostile(0, { missileSpeed: 8500 })],
    },
  ),
  scenario(
    "uncovered-flank",
    "Uncovered Flank",
    "Reactive flanks pressure the target farthest from your current coverage.",
    "V · Expert",
    {
      assistance: "minimal",
      hostiles: [
        hostile(0, { movement: "reactive" }),
        hostile(1, { movement: "reactive" }),
      ],
    },
  ),
  scenario(
    "three-arrivals",
    "Three Arrival Times",
    "Fast far, moderate mid, and slow close volleys converge on the same ticks.",
    "VI · Master",
    {
      assistance: "minimal",
      hostiles: [
        hostile(0, { missileSpeed: 11000 }),
        hostile(1, { missileSpeed: 7500 }),
        hostile(2, { missileSpeed: 4500 }),
      ],
    },
  ),
  scenario(
    "expert-screen",
    "Expert Fleet Screen",
    "Hidden timing, strict separation, vertical motion, and three reactive FCs.",
    "VI · Master",
    {
      assistance: "expert",
      blueMovement: "helix",
      hostiles: [
        hostile(0, { movement: "reactive" }),
        hostile(1, { movement: "reactive" }),
        hostile(2, { movement: "reactive" }),
      ],
    },
  ),
];

export const cloneScenario = (source: ScenarioConfig): ScenarioConfig => {
  const cloned = JSON.parse(JSON.stringify(source)) as ScenarioConfig;
  return {
    ...cloned,
    bluePropulsion: cloned.bluePropulsion ?? "afterburner",
    blueThrottle: cloned.blueThrottle ?? 0.58,
    staggeredMissiles: cloned.staggeredMissiles ?? false,
    hostiles: cloned.hostiles.map((fleet) => ({
      ...fleet,
      engagementRange: fleet.engagementRange ?? 55_000,
      throttle: fleet.throttle ?? 0.55,
      volleyInterval: fleet.volleyInterval ?? 11,
    })),
  };
};

export const dailyScenario = (): ScenarioConfig => {
  const now = new Date();
  const seed =
    now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const base = cloneScenario(SCENARIOS[seed % SCENARIOS.length]!);
  return {
    ...base,
    id: "daily-seed",
    name: "Daily Deterministic Screen",
    description: `The shared ${now.toLocaleDateString()} geometry seed.`,
    seed,
  };
};
