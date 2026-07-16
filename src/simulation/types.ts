export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Alignment = "player" | "friendly" | "hostile";
export type ShipRole = "player" | "fc" | "member";
export type PropulsionMode = "none" | "afterburner" | "microwarpdrive";
export type MissileTrailMode = "standard" | "enhanced";
export type SimulationStatus = "briefing" | "running" | "paused" | "complete";
export type AssistanceLevel = "full" | "partial" | "minimal" | "expert";

export interface Ship {
  id: string;
  name: string;
  fleetId: string;
  alignment: Alignment;
  role: ShipRole;
  type: string;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  previousVelocity: Vec3;
  visible: boolean;
  desiredDirection: Vec3;
  throttle: number;
  baseMaxVelocity: number;
  massKg: number;
  inertiaModifier: number;
  inertiaSeconds: number;
  collisionRadius: number;
  formationOffset: Vec3;
  propulsion: PropulsionMode;
  propulsionTarget: PropulsionMode;
  propulsionEndsTick: number;
  hp: number;
  maxHp: number;
  command: string;
}

export interface Missile {
  id: string;
  fleetId: string;
  sourceShipId: string;
  targetShipId: string;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  previousVelocity: Vec3;
  maxVelocity: number;
  turningRate: number;
  remainingFlightTicks: number;
  hitPoints: number;
  damage: number;
  launchTick: number;
  estimatedImpactTick: number;
  status: "in-flight" | "intercepted" | "impacted" | "expired";
}

export interface SmartbombModule {
  slot: number;
  name: string;
  radius: number;
  damage: number;
  cycleSeconds: number;
  capacitorCost: number;
  readyTick: number;
  lastPulseTick: number;
  active: boolean;
  deactivating: boolean;
  missilesHit: number;
  missilesDestroyed: number;
  friendliesHit: number;
}

export interface HostileFleetConfig {
  id: string;
  name: string;
  color: string;
  missileSpeed: number;
  volleyInterval: number;
  volleySize: number;
  launchDelay: number;
  propulsion: PropulsionMode;
  throttle: number;
  engagementRange: number;
  movement: "hold" | "orbit" | "flank" | "pincer" | "vertical" | "reactive";
  verticalOffset: number;
  formationRadius: number;
  speedVariation: number;
}

export interface ScenarioConfig {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  seed: number;
  durationTicks: number;
  assistance: AssistanceLevel;
  blueMovement: "hold" | "line" | "turn" | "expand" | "climb" | "helix";
  blueSpeed: number;
  bluePropulsion: PropulsionMode;
  blueThrottle: number;
  skirmishLinks: boolean;
  staggeredMissiles: boolean;
  friendlyFire: boolean;
  hostiles: HostileFleetConfig[];
  tutorial: boolean;
}

export interface FleetRuntime extends HostileFleetConfig {
  fcId: string;
  memberIds: string[];
  targetId: string;
  nextVolleyTick: number;
  staggerSourceIndex: number;
  staggerTargetId: string;
  warpInTick: number;
  warpDestination: Vec3 | null;
  cohesion: number;
  activeMissiles: number;
  threat: number;
}

export interface Corridor {
  fleetId: string;
  color: string;
  from: Vec3;
  to: Vec3;
  width: number;
  coverage: boolean;
  ticksToImpact: number;
  threat: number;
}

export interface PositioningAnalysis {
  score: number;
  rollingScore: number;
  averageScore: number;
  idealPosition: Vec3;
  distanceToIdeal: number;
  distanceToBlueFc: number;
  nearestFriendlyDistance: number;
  stoppingDistance: number;
  stoppingTime: number;
  fleetsCovered: number;
  safeToPulse: boolean;
  safetyState: "SAFE" | "CAUTION" | "DANGER" | "VIOLATION";
  urgency:
    | "STABLE"
    | "MINOR CORRECTION"
    | "REPOSITION"
    | "IMMEDIATE"
    | "EMERGENCY";
  warning: string;
}

export interface SimulationStats {
  missilesLaunched: number;
  missilesIntercepted: number;
  missilesImpacted: number;
  missilesExpired: number;
  smartbombPulses: number;
  missilesHit: number;
  wastedPulses: number;
  friendlyDamage: number;
  friendlyShipsLost: number;
  proximityViolations: number;
  positioningTotal: number;
  positioningSamples: number;
  bestPositioningStreak: number;
  currentPositioningStreak: number;
}

export interface VisualEffect {
  id: string;
  type: "smartbomb" | "intercept" | "impact";
  position: Vec3;
  color: string;
  tick: number;
  radius: number;
}

export interface QueuedCommand {
  id: number;
  executeTick: number;
  type:
    | "move"
    | "stop"
    | "speed"
    | "propulsion"
    | "smartbomb"
    | "match-blue"
    | "warp-fleet";
  vector?: Vec3;
  value?: number;
  mode?: PropulsionMode;
  slot?: number;
  fleetId?: string;
}

export interface ReplayFrame {
  tick: number;
  player: Vec3;
  blueFc: Vec3;
  hostileFcs: Vec3[];
  activeMissiles: number;
  positioningScore: number;
  interceptionRate: number;
  nearestFriendly: number;
  playerSpeed: number;
}

export interface ReplayData {
  version: 1;
  seed: number;
  scenario: ScenarioConfig;
  frames: ReplayFrame[];
  commands: QueuedCommand[];
  stats: SimulationStats;
}

export interface WorldState {
  tick: number;
  status: SimulationStatus;
  scenario: ScenarioConfig;
  player: Ship;
  ships: Ship[];
  missiles: Missile[];
  fleets: FleetRuntime[];
  modules: SmartbombModule[];
  capacitor: number;
  selectedId: string;
  corridors: Corridor[];
  analysis: PositioningAnalysis;
  stats: SimulationStats;
  effects: VisualEffect[];
  commandQueue: QueuedCommand[];
  lastTickProcessingMs: number;
}

export interface AfterActionReport {
  finalScore: number;
  rank: string;
  interceptionRate: number;
  positioningGrade: number;
  safetyGrade: number;
  responseGrade: number;
  efficiencyGrade: number;
  feedback: string[];
}
