import { DeterministicRandom } from "./DeterministicRandom";
import { SimulationClock } from "./SimulationClock";
import {
  add,
  clamp,
  clone,
  distance,
  distanceToSegment,
  length,
  lerp,
  normalize,
  scale,
  sub,
  vec,
} from "./math";
import {
  maximumVelocity,
  NESTOR_TWO_PLATE_PROFILE,
  PROPULSION_CAPACITOR_COST,
  PROPULSION_CYCLE_SECONDS,
  PROPULSION_INERTIA_MULTIPLIER,
} from "./movement";
import type {
  AfterActionReport,
  Corridor,
  FleetRuntime,
  Missile,
  PositioningAnalysis,
  QueuedCommand,
  ReplayData,
  ReplayFrame,
  ScenarioConfig,
  Ship,
  SimulationStats,
  SmartbombModule,
  Vec3,
  VisualEffect,
  WorldState,
} from "./types";

const PLAYER_SMARTBOMB_RADIUS = 7000;
const PLAYER_SAFETY_MARGIN = 2500;
const MAX_ACTIVE_MISSILES = 2200;

const emptyStats = (): SimulationStats => ({
  missilesLaunched: 0,
  missilesIntercepted: 0,
  missilesImpacted: 0,
  missilesExpired: 0,
  smartbombPulses: 0,
  missilesHit: 0,
  wastedPulses: 0,
  friendlyDamage: 0,
  friendlyShipsLost: 0,
  proximityViolations: 0,
  positioningTotal: 0,
  positioningSamples: 0,
  bestPositioningStreak: 0,
  currentPositioningStreak: 0,
});

const emptyAnalysis = (): PositioningAnalysis => ({
  score: 50,
  rollingScore: 50,
  averageScore: 50,
  idealPosition: vec(0, 0, -16000),
  distanceToIdeal: 0,
  distanceToBlueFc: 16000,
  nearestFriendlyDistance: 12000,
  stoppingDistance: 0,
  stoppingTime: 0,
  fleetsCovered: 1,
  safeToPulse: true,
  safetyState: "SAFE",
  urgency: "STABLE",
  warning: "HOLD THE MISSILE CORRIDOR",
});

function makeShip(
  id: string,
  name: string,
  fleetId: string,
  alignment: Ship["alignment"],
  role: Ship["role"],
  position: Vec3,
  options: Partial<Ship> = {},
): Ship {
  const hitPoints =
    role === "player"
      ? 10_000
      : alignment === "friendly"
        ? role === "fc"
          ? 60_000
          : 25_000
        : 1_500;
  return {
    id,
    name,
    fleetId,
    alignment,
    role,
    type:
      role === "player"
        ? "Nestor"
        : role === "fc"
          ? "Fleet Command"
          : "Battleship",
    position: clone(position),
    previousPosition: clone(position),
    velocity: vec(),
    previousVelocity: vec(),
    visible: true,
    desiredDirection: vec(0, 0, 1),
    throttle: 0,
    baseMaxVelocity:
      role === "player"
        ? NESTOR_TWO_PLATE_PROFILE.baseMaxVelocity
        : role === "fc"
          ? 240
          : 215,
    massKg:
      role === "player"
        ? NESTOR_TWO_PLATE_PROFILE.fittedMassKg
        : role === "fc"
          ? 12_000_000
          : 10_000_000,
    inertiaModifier:
      role === "player"
        ? NESTOR_TWO_PLATE_PROFILE.inertiaModifier
        : role === "fc"
          ? 0.458
          : 0.7,
    inertiaSeconds:
      role === "player"
        ? NESTOR_TWO_PLATE_PROFILE.inertiaSeconds
        : role === "fc"
          ? 5.5
          : 7,
    collisionRadius: role === "player" ? 230 : 180,
    formationOffset: vec(),
    propulsion: "none",
    propulsionTarget: "none",
    propulsionEndsTick: 0,
    hp: hitPoints,
    maxHp: hitPoints,
    command: "Holding",
    ...options,
  };
}

function formationOffset(
  index: number,
  total: number,
  radius: number,
  verticalScale = 0.55,
): Vec3 {
  if (index === 0) return vec();
  const columns = 5;
  const row = Math.floor((index - 1) / columns);
  const column = (index - 1) % columns;
  const rows = Math.max(1, Math.ceil((total - 1) / columns));
  const lateralSpacing = radius / 5;
  const rowDepth = radius / rows;
  return vec(
    (column - 2) * lateralSpacing,
    ((index % 3) - 1) * lateralSpacing * verticalScale * 0.42,
    -(1200 + (row + 0.5) * rowDepth),
  );
}

function pointAtRange(
  center: Vec3,
  range: number,
  angle: number,
  verticalOffset: number,
): Vec3 {
  const y = clamp(verticalOffset, -range * 0.65, range * 0.65);
  const horizontal = Math.sqrt(Math.max(0, range ** 2 - y ** 2));
  return add(
    center,
    vec(Math.cos(angle) * horizontal, y, Math.sin(angle) * horizontal),
  );
}

function rotateOffset(offset: Vec3, direction: Vec3, scaleAmount = 1): Vec3 {
  const yaw = Math.atan2(direction.x, direction.z);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return vec(
    (offset.x * cos + offset.z * sin) * scaleAmount,
    offset.y * scaleAmount,
    (-offset.x * sin + offset.z * cos) * scaleAmount,
  );
}

export class Simulation {
  readonly clock = new SimulationClock();
  readonly replayFrames: ReplayFrame[] = [];
  readonly replayCommands: QueuedCommand[] = [];
  world: WorldState;

  private rng: DeterministicRandom;
  private commandId = 0;
  private missileId = 0;
  private effectId = 0;

  constructor(scenario: ScenarioConfig) {
    this.rng = new DeterministicRandom(scenario.seed);
    this.world = this.createWorld(scenario);
    this.recalculateAnalysis();
  }

  private createWorld(scenario: ScenarioConfig): WorldState {
    const player = makeShip(
      "player",
      "Nestor · Firewall One",
      "player",
      "player",
      "player",
      vec(0, 0, -15500),
      { desiredDirection: vec(1, 0, 0) },
    );
    const ships: Ship[] = [];
    const blueFc = makeShip(
      "blue-fc",
      "Blue Actual",
      "blue",
      "friendly",
      "fc",
      vec(),
    );
    ships.push(blueFc);
    for (let index = 1; index < 10; index += 1) {
      const offset = formationOffset(index, 10, 4600, 0.38);
      ships.push(
        makeShip(
          `blue-${index}`,
          `Aegis ${String(index).padStart(2, "0")}`,
          "blue",
          "friendly",
          "member",
          add(blueFc.position, offset),
          {
            formationOffset: offset,
            baseMaxVelocity: 190 + this.rng.range(-15, 18),
            inertiaSeconds: 6.5 + this.rng.range(-0.8, 1.2),
          },
        ),
      );
    }

    const hostileAngles = [-Math.PI / 2, -0.7, -2.44];
    const fleets: FleetRuntime[] = [];
    scenario.hostiles.forEach((config, fleetIndex) => {
      const start = pointAtRange(
        blueFc.position,
        config.engagementRange,
        hostileAngles[fleetIndex]!,
        config.verticalOffset,
      );
      const fcId = `${config.id}-fc`;
      const fc = makeShip(
        fcId,
        `${config.name} FC`,
        config.id,
        "hostile",
        "fc",
        start,
        {
          baseMaxVelocity: 260 + fleetIndex * 25,
          desiredDirection: normalize(sub(blueFc.position, start)),
        },
      );
      ships.push(fc);
      const memberIds: string[] = [];
      for (let index = 1; index < 20; index += 1) {
        const offset = formationOffset(index, 20, config.formationRadius, 0.8);
        const id = `${config.id}-${index}`;
        memberIds.push(id);
        ships.push(
          makeShip(
            id,
            `${config.name.split(" ")[0]} ${String(index).padStart(2, "0")}`,
            config.id,
            "hostile",
            "member",
            add(start, offset),
            {
              formationOffset: offset,
              baseMaxVelocity: 235 + this.rng.range(-24, 22),
              inertiaSeconds: 6.8 + this.rng.range(-1, 1.6),
            },
          ),
        );
      }
      fleets.push({
        ...config,
        fcId,
        memberIds,
        targetId: "blue-fc",
        nextVolleyTick: config.launchDelay,
        staggerSourceIndex: -1,
        staggerTargetId: "",
        warpInTick: 0,
        warpDestination: null,
        cohesion: 1,
        activeMissiles: 0,
        threat: 0,
      });
    });

    const modules: SmartbombModule[] = Array.from(
      { length: 7 },
      (_, index) => ({
        slot: index + 1,
        name: "Large EMP Smartbomb",
        radius: PLAYER_SMARTBOMB_RADIUS,
        damage: 125,
        cycleSeconds: 10,
        capacitorCost: 0.025,
        readyTick: 0,
        lastPulseTick: -100,
        active: false,
        deactivating: false,
        missilesHit: 0,
        missilesDestroyed: 0,
        friendliesHit: 0,
      }),
    );

    return {
      tick: 0,
      status: "briefing",
      scenario,
      player,
      ships,
      missiles: [],
      fleets,
      modules,
      capacitor: 1,
      selectedId: fleets[0]?.fcId ?? "blue-fc",
      corridors: [],
      analysis: emptyAnalysis(),
      stats: emptyStats(),
      effects: [],
      commandQueue: [],
      lastTickProcessingMs: 0,
    };
  }

  start(): void {
    if (this.world.status === "complete") return;
    this.world.status = "running";
    this.clock.paused = false;
  }

  pause(): void {
    if (this.world.status !== "running") return;
    this.world.status = "paused";
    this.clock.paused = true;
  }

  resume(): void {
    if (this.world.status !== "paused") return;
    this.world.status = "running";
    this.clock.paused = false;
  }

  togglePause(): void {
    if (this.world.status === "running") this.pause();
    else if (this.world.status === "paused" || this.world.status === "briefing")
      this.start();
  }

  setTimeScale(speed: number): void {
    this.clock.speed = clamp(speed, 0.25, 4);
  }

  advance(deltaMs: number): number {
    const ticks = this.clock.advance(deltaMs);
    for (let index = 0; index < ticks; index += 1) this.authoritativeTick();
    return ticks;
  }

  step(): void {
    if (this.world.status === "complete") return;
    this.clock.step();
    this.authoritativeTick();
    this.clock.paused = true;
    this.world.status = "paused";
  }

  queueCommand(
    command: Omit<QueuedCommand, "id" | "executeTick">,
  ): QueuedCommand {
    const queued: QueuedCommand = {
      ...command,
      id: ++this.commandId,
      executeTick: this.world.tick + 1,
    };
    this.world.commandQueue.push(queued);
    this.replayCommands.push(structuredClone(queued));
    return queued;
  }

  setSelected(id: string): void {
    if (id === "player" || this.world.ships.some((ship) => ship.id === id)) {
      this.world.selectedId = id;
    }
  }

  repositionFleet(fleetId: string): boolean {
    const fleet = this.world.fleets.find((item) => item.id === fleetId);
    const blue = this.getShip("blue-fc");
    if (!fleet || !blue || fleet.warpInTick > 0) return false;

    const angle = this.rng.range(0, Math.PI * 2);
    const vertical = this.rng.range(-0.32, 0.32) * fleet.engagementRange;
    fleet.warpDestination = pointAtRange(
      blue.position,
      fleet.engagementRange,
      angle,
      vertical,
    );
    fleet.warpInTick = this.world.tick + 2;
    fleet.staggerSourceIndex = -1;
    fleet.staggerTargetId = "";
    for (const id of [fleet.fcId, ...fleet.memberIds]) {
      const ship = this.getShip(id);
      if (!ship) continue;
      ship.visible = false;
      ship.velocity = vec();
      ship.previousVelocity = vec();
      ship.command = "In warp · changing bearing";
    }
    return true;
  }

  private authoritativeTick(): void {
    const started = performance.now();
    this.world.tick += 1;
    this.executeCommands();
    this.updatePropulsionCycles();
    this.updateSmartbombCycles();
    this.resolveFleetWarps();
    this.updateFleetCommands();
    this.advanceShips();
    this.launchMissiles();
    this.advanceMissiles();
    this.updateCapacitor();
    this.recalculateAnalysis();
    this.recordReplayFrame();
    this.world.effects = this.world.effects.filter(
      (effect) => this.world.tick - effect.tick <= 2,
    );
    if (this.world.tick >= this.world.scenario.durationTicks) {
      this.world.status = "complete";
      this.clock.paused = true;
    }
    this.world.lastTickProcessingMs = performance.now() - started;
  }

  private executeCommands(): void {
    const ready = this.world.commandQueue.filter(
      (command) => command.executeTick <= this.world.tick,
    );
    this.world.commandQueue = this.world.commandQueue.filter(
      (command) => command.executeTick > this.world.tick,
    );
    for (const command of ready) {
      switch (command.type) {
        case "move":
          if (command.vector) {
            this.world.player.desiredDirection = normalize(command.vector);
            this.world.player.throttle = 1;
            this.world.player.command = "Aligning to vector";
          }
          break;
        case "stop":
          this.world.player.throttle = 0;
          this.world.player.command = "Stopping ship";
          break;
        case "speed":
          this.world.player.throttle = clamp(command.value ?? 0, 0, 1);
          this.world.player.command = `${Math.round(this.world.player.throttle * 100)}% velocity`;
          break;
        case "propulsion":
          this.activatePropulsion(command.mode ?? "none");
          break;
        case "smartbomb":
          this.toggleSmartbomb(command.slot ?? 1);
          break;
        case "match-blue": {
          const blue = this.getShip("blue-fc");
          if (blue) {
            this.world.player.desiredDirection = normalize(blue.velocity);
            this.world.player.throttle = clamp(
              length(blue.velocity) /
                this.currentMaxVelocity(this.world.player),
              0,
              1,
            );
            this.world.player.command = "Matching Blue FC velocity";
          }
          break;
        }
        case "warp-fleet":
          if (command.fleetId) this.repositionFleet(command.fleetId);
          break;
      }
    }
  }

  private activatePropulsion(mode: Ship["propulsion"]): void {
    const player = this.world.player;
    if (player.propulsion === mode && player.propulsionTarget === mode) {
      player.propulsionTarget = "none";
      player.command = `${mode === "afterburner" ? "Afterburner" : "Microwarpdrive"} deactivating at cycle end`;
      return;
    }
    if (player.propulsion !== mode && player.propulsionTarget === mode) {
      player.propulsionTarget = player.propulsion;
      player.command = "Propulsion switch cancelled";
      return;
    }

    player.propulsionTarget = mode;
    if (player.propulsion === "none") this.startPropulsionCycle(mode);
    else
      player.command = `${mode === "afterburner" ? "Afterburner" : "Microwarpdrive"} queued for next cycle`;
  }

  private updatePropulsionCycles(): void {
    const player = this.world.player;
    if (player.propulsion === "none") {
      if (player.propulsionTarget !== "none")
        this.startPropulsionCycle(player.propulsionTarget);
      return;
    }
    if (player.propulsionEndsTick > this.world.tick) return;

    const nextMode = player.propulsionTarget;
    player.propulsion = "none";
    player.propulsionEndsTick = this.world.tick;
    if (nextMode === "none") {
      player.command = "Propulsion off · coasting";
      return;
    }
    this.startPropulsionCycle(nextMode);
  }

  private startPropulsionCycle(mode: Ship["propulsion"]): void {
    if (mode === "none") return;
    const player = this.world.player;
    const cost = PROPULSION_CAPACITOR_COST[mode];
    if (this.world.capacitor < cost) {
      player.propulsion = "none";
      player.propulsionTarget = "none";
      player.command = "Propulsion shut down · insufficient capacitor";
      return;
    }
    this.world.capacitor -= cost;
    player.propulsion = mode;
    player.propulsionTarget = mode;
    player.propulsionEndsTick =
      this.world.tick + PROPULSION_CYCLE_SECONDS[mode];
    player.command =
      mode === "afterburner"
        ? "Afterburner active · auto-repeat"
        : "Microwarpdrive active · auto-repeat";
  }

  private toggleSmartbomb(slot: number): void {
    const module = this.world.modules[slot - 1];
    if (!module) return;
    if (module.active) {
      module.deactivating = !module.deactivating;
      return;
    }
    if (
      module.readyTick > this.world.tick ||
      this.world.capacitor < module.capacitorCost
    )
      return;
    module.active = true;
    module.deactivating = false;
    this.pulseSmartbomb(module);
  }

  private updateSmartbombCycles(): void {
    for (const module of this.world.modules) {
      if (!module.active || module.readyTick > this.world.tick) continue;
      if (module.deactivating) {
        module.active = false;
        module.deactivating = false;
        continue;
      }
      if (this.world.capacitor < module.capacitorCost) {
        module.active = false;
        continue;
      }
      this.pulseSmartbomb(module);
    }
  }

  private pulseSmartbomb(module: SmartbombModule): void {
    module.readyTick = this.world.tick + module.cycleSeconds;
    module.lastPulseTick = this.world.tick;
    this.world.capacitor -= module.capacitorCost;
    this.world.stats.smartbombPulses += 1;
    let hits = 0;
    let destroyed = 0;

    for (const missile of this.world.missiles) {
      if (missile.status !== "in-flight") continue;
      if (
        distance(missile.position, this.world.player.position) > module.radius
      )
        continue;
      hits += 1;
      missile.hitPoints -= module.damage;
      if (missile.hitPoints <= 0) {
        missile.status = "intercepted";
        destroyed += 1;
        this.world.stats.missilesIntercepted += 1;
        this.addEffect(
          "intercept",
          missile.position,
          this.fleetColor(missile.fleetId),
          1100,
        );
      }
    }

    const friendlies = this.world.ships.filter(
      (ship) =>
        ship.alignment === "friendly" &&
        ship.visible &&
        ship.hp > 0 &&
        distance(ship.position, this.world.player.position) <= module.radius,
    );
    if (friendlies.length > 0) {
      module.friendliesHit += friendlies.length;
      const damage = friendlies.length * 125;
      this.world.stats.friendlyDamage += damage;
      if (this.world.scenario.friendlyFire) {
        for (const friendly of friendlies)
          friendly.hp = Math.max(0, friendly.hp - 125);
      }
    }

    module.missilesHit += hits;
    module.missilesDestroyed += destroyed;
    this.world.stats.missilesHit += hits;
    if (hits === 0) this.world.stats.wastedPulses += 1;
    this.addEffect(
      "smartbomb",
      this.world.player.position,
      "#7ff6ff",
      module.radius,
    );
  }

  private resolveFleetWarps(): void {
    const blue = this.getShip("blue-fc");
    if (!blue) return;
    for (const fleet of this.world.fleets) {
      if (
        fleet.warpInTick === 0 ||
        fleet.warpInTick > this.world.tick ||
        !fleet.warpDestination
      )
        continue;

      const destination = clone(fleet.warpDestination);
      const relative = sub(destination, blue.position);
      const direction = normalize(vec(-relative.z, 0, relative.x));
      const fc = this.getShip(fleet.fcId)!;
      fc.position = destination;
      fc.previousPosition = clone(destination);
      fc.velocity = vec();
      fc.previousVelocity = vec();
      fc.desiredDirection = direction;
      fc.visible = true;
      fc.command = "Warp complete · establishing orbit";

      for (const id of fleet.memberIds) {
        const member = this.getShip(id)!;
        const position = add(
          destination,
          rotateOffset(member.formationOffset, direction),
        );
        member.position = position;
        member.previousPosition = clone(position);
        member.velocity = vec();
        member.previousVelocity = vec();
        member.desiredDirection = direction;
        member.visible = true;
        member.command = "Landing behind FC";
      }

      fleet.warpInTick = 0;
      fleet.warpDestination = null;
      fleet.nextVolleyTick = Math.max(
        fleet.nextVolleyTick,
        this.world.tick + 1,
      );
    }
  }

  private updateFleetCommands(): void {
    const blue = this.getShip("blue-fc")!;
    const tick = this.world.tick;
    const movement = this.world.scenario.blueMovement;
    blue.propulsion = this.world.scenario.bluePropulsion;
    blue.propulsionTarget = this.world.scenario.bluePropulsion;
    if (movement === "hold") {
      blue.throttle = 0;
      blue.command = "Holding anchor";
    } else {
      let direction = vec(1, 0, 0);
      if (movement === "turn" || movement === "expand") {
        const angle = tick * 0.035;
        direction = vec(
          Math.cos(angle),
          Math.sin(tick * 0.021) * 0.12,
          Math.sin(angle),
        );
      } else if (movement === "climb") {
        direction = normalize(vec(1, 0.42, Math.sin(tick * 0.04) * 0.35));
      } else if (movement === "helix") {
        direction = normalize(
          vec(
            Math.cos(tick * 0.04),
            Math.sin(tick * 0.031) * 0.65,
            Math.sin(tick * 0.04),
          ),
        );
      }
      blue.desiredDirection = normalize(direction);
      blue.throttle = clamp(this.world.scenario.blueThrottle, 0, 1);
      blue.command =
        movement === "turn" ? "Wide anchor turn" : "Fleet manoeuvre";
    }

    for (const fleet of this.world.fleets) {
      const fc = this.getShip(fleet.fcId)!;
      if (!fc.visible) continue;
      const relative = sub(fc.position, blue.position);
      const radialDistance = Math.max(1, length(relative));
      const towardBlue = normalize(scale(relative, -1));
      const tangentSign = fleet.id === "red-2" ? -1 : 1;
      const tangent = normalize(
        vec(-relative.z * tangentSign, 0, relative.x * tangentSign),
      );
      const preferredRange = fleet.engagementRange;
      const rangeCorrection = clamp(
        (radialDistance - preferredRange) / 22000,
        -0.7,
        0.7,
      );
      let desired = normalize(
        add(scale(tangent, 0.85), scale(towardBlue, rangeCorrection)),
      );
      if (fleet.movement === "hold") desired = vec();
      if (fleet.movement === "vertical") {
        desired = normalize(
          add(desired, vec(0, Math.sin(tick * 0.055) * 0.72, 0)),
        );
      }
      if (fleet.movement === "pincer") {
        desired = normalize(
          add(desired, scale(towardBlue, Math.sin(tick * 0.045) * 0.55)),
        );
      }
      if (fleet.movement === "reactive") {
        const awayFromPlayer = normalize(
          sub(fc.position, this.world.player.position),
        );
        desired = normalize(add(desired, scale(awayFromPlayer, 0.55)));
        if (tick % 17 === 0) {
          const candidates = this.world.ships.filter(
            (ship) => ship.fleetId === "blue" && ship.hp > 0 && ship.visible,
          );
          fleet.targetId = this.rng.pick(candidates).id;
        }
      }
      fc.desiredDirection = desired;
      fc.throttle = fleet.movement === "hold" ? 0 : clamp(fleet.throttle, 0, 1);
      fc.propulsion = fleet.propulsion;
      fc.propulsionTarget = fleet.propulsion;
      fc.command =
        fleet.movement === "hold"
          ? "Holding firing line"
          : `${fleet.movement} manoeuvre`;
    }
  }

  private advanceShips(): void {
    const blue = this.getShip("blue-fc")!;
    this.advanceShip(blue);

    const blueScale =
      this.world.scenario.blueMovement === "expand"
        ? 0.85 + (Math.sin(this.world.tick * 0.09) + 1) * 0.4
        : 1;
    const blueMembers = this.world.ships.filter(
      (ship) => ship.fleetId === "blue" && ship.role === "member",
    );
    for (const member of blueMembers) {
      if (!member.visible) continue;
      this.followFormation(member, blue, blueScale);
      this.advanceShip(member);
    }

    for (const fleet of this.world.fleets) {
      const fc = this.getShip(fleet.fcId)!;
      if (!fc.visible) continue;
      this.advanceShip(fc);
      let formationError = 0;
      for (const id of fleet.memberIds) {
        const member = this.getShip(id)!;
        if (!member.visible) continue;
        const scaleAmount = fc.propulsion === "microwarpdrive" ? 1.08 : 1;
        formationError += this.followFormation(member, fc, scaleAmount);
        this.advanceShip(member);
      }
      const averageError = formationError / Math.max(1, fleet.memberIds.length);
      fleet.cohesion =
        1 - clamp(averageError / (fleet.formationRadius * 1.8), 0, 1);
    }

    this.advanceShip(this.world.player);
  }

  private followFormation(member: Ship, fc: Ship, scaleAmount: number): number {
    const anchorDirection =
      length(fc.velocity) > 1
        ? normalize(fc.velocity)
        : normalize(fc.desiredDirection);
    const offset = rotateOffset(
      member.formationOffset,
      anchorDirection,
      scaleAmount,
    );
    const target = add(fc.position, offset);
    const correction = sub(target, member.position);
    const error = length(correction);
    const correctionVelocity =
      error > 30
        ? scale(
            normalize(correction),
            Math.min(error / 5, member.baseMaxVelocity),
          )
        : vec();
    const anchoredVelocity = add(fc.velocity, correctionVelocity);
    member.propulsion = fc.propulsion;
    member.propulsionTarget = fc.propulsion;
    member.desiredDirection = normalize(anchoredVelocity);
    member.throttle = clamp(
      length(anchoredVelocity) / Math.max(1, this.currentMaxVelocity(member)),
      0.08,
      1,
    );
    member.command = error > 3000 ? "Recovering formation" : "Anchored on FC";
    return error;
  }

  private advanceShip(ship: Ship): void {
    ship.previousPosition = clone(ship.position);
    ship.previousVelocity = clone(ship.velocity);
    const maximum = this.currentMaxVelocity(ship);
    const desiredVelocity = scale(
      normalize(ship.desiredDirection),
      maximum * ship.throttle,
    );
    const responseSeconds =
      ship.inertiaSeconds * PROPULSION_INERTIA_MULTIPLIER[ship.propulsion];
    const decay = Math.exp(-1 / responseSeconds);
    const response = 1 - decay;

    // Exact one-second integration of EVE-style exponential acceleration.
    // Velocity remains authoritative at one hertz; rendering interpolates it.
    const velocityDelta = sub(ship.velocity, desiredVelocity);
    const displacement = add(
      desiredVelocity,
      scale(velocityDelta, responseSeconds * response),
    );
    ship.velocity = add(desiredVelocity, scale(velocityDelta, decay));
    ship.position = add(ship.position, displacement);
  }

  private currentMaxVelocity(ship: Ship): number {
    return maximumVelocity(ship.baseMaxVelocity, ship.propulsion);
  }

  private launchMissiles(): void {
    if (this.world.missiles.length >= MAX_ACTIVE_MISSILES) return;
    for (const fleet of this.world.fleets) {
      const fc = this.getShip(fleet.fcId);
      if (!fc?.visible) continue;
      const sourceIds = [fleet.fcId, ...fleet.memberIds].slice(
        0,
        fleet.volleySize,
      );

      if (this.world.scenario.staggeredMissiles) {
        if (fleet.staggerSourceIndex < 0) {
          if (this.world.tick < fleet.nextVolleyTick) continue;
          const target = this.acquireFleetTarget(fleet);
          fleet.nextVolleyTick += fleet.volleyInterval;
          if (!target) continue;
          fleet.staggerTargetId = target.id;
          fleet.staggerSourceIndex = 0;
        }
        const target =
          this.getShip(fleet.staggerTargetId) ?? this.acquireFleetTarget(fleet);
        if (!target || target.hp <= 0) {
          fleet.staggerSourceIndex = -1;
          continue;
        }
        fleet.staggerTargetId = target.id;
        const groupSize = Math.max(1, Math.ceil(sourceIds.length / 4));
        const group = sourceIds.slice(
          fleet.staggerSourceIndex,
          fleet.staggerSourceIndex + groupSize,
        );
        this.launchMissileGroup(fleet, target, group);
        fleet.staggerSourceIndex += groupSize;
        if (fleet.staggerSourceIndex >= sourceIds.length) {
          fleet.staggerSourceIndex = -1;
          fleet.staggerTargetId = "";
        }
      } else {
        if (this.world.tick < fleet.nextVolleyTick) continue;
        const target = this.acquireFleetTarget(fleet);
        fleet.nextVolleyTick += fleet.volleyInterval;
        if (target) this.launchMissileGroup(fleet, target, sourceIds);
      }
    }
  }

  private acquireFleetTarget(fleet: FleetRuntime): Ship | null {
    let target = this.getShip(fleet.targetId);
    if (target && target.hp > 0 && target.visible) return target;
    const livingFriendlies = this.world.ships.filter(
      (ship) => ship.alignment === "friendly" && ship.hp > 0 && ship.visible,
    );
    if (livingFriendlies.length === 0) return null;
    target = this.rng.pick(livingFriendlies);
    fleet.targetId = target.id;
    return target;
  }

  private launchMissileGroup(
    fleet: FleetRuntime,
    target: Ship,
    sourceIds: string[],
  ): void {
    for (const sourceId of sourceIds) {
      if (this.world.missiles.length >= MAX_ACTIVE_MISSILES) break;
      const source = this.getShip(sourceId);
      if (!source || source.hp <= 0 || !source.visible) continue;
      const variation =
        1 + this.rng.range(-fleet.speedVariation, fleet.speedVariation);
      const speed = fleet.missileSpeed * variation;
      const direction = normalize(sub(target.position, source.position));
      this.world.missiles.push({
        id: `missile-${++this.missileId}`,
        fleetId: fleet.id,
        sourceShipId: source.id,
        targetShipId: target.id,
        position: clone(source.position),
        previousPosition: clone(source.position),
        velocity: scale(direction, speed),
        previousVelocity: scale(direction, speed),
        maxVelocity: speed,
        turningRate: 0.24,
        remainingFlightTicks: 36,
        hitPoints: 100,
        damage: 90,
        launchTick: this.world.tick,
        estimatedImpactTick:
          this.world.tick +
          Math.ceil(distance(source.position, target.position) / speed),
        status: "in-flight",
      });
      this.world.stats.missilesLaunched += 1;
    }
  }

  private advanceMissiles(): void {
    const active: Missile[] = [];
    for (const missile of this.world.missiles) {
      if (missile.status === "intercepted") continue;
      const target = this.getShip(missile.targetShipId);
      if (!target || target.hp <= 0) {
        missile.status = "expired";
        this.world.stats.missilesExpired += 1;
        continue;
      }
      const desired = normalize(sub(target.position, missile.position));
      const current = normalize(missile.velocity);
      const direction = normalize(lerp(current, desired, missile.turningRate));
      missile.previousPosition = clone(missile.position);
      missile.previousVelocity = clone(missile.velocity);
      missile.velocity = scale(direction, missile.maxVelocity);
      missile.position = add(missile.position, missile.velocity);
      missile.remainingFlightTicks -= 1;

      const impacted =
        distanceToSegment(
          target.position,
          missile.previousPosition,
          missile.position,
        ) <=
        target.collisionRadius + 450;
      if (impacted) {
        missile.status = "impacted";
        const aliveBefore = target.hp > 0;
        target.hp = Math.max(0, target.hp - missile.damage);
        if (aliveBefore && target.hp === 0)
          this.world.stats.friendlyShipsLost += 1;
        this.world.stats.missilesImpacted += 1;
        this.addEffect(
          "impact",
          target.position,
          this.fleetColor(missile.fleetId),
          1500,
        );
      } else if (missile.remainingFlightTicks <= 0) {
        missile.status = "expired";
        this.world.stats.missilesExpired += 1;
      } else {
        active.push(missile);
      }
    }
    this.world.missiles = active;
    for (const fleet of this.world.fleets) {
      fleet.activeMissiles = active.filter(
        (missile) => missile.fleetId === fleet.id,
      ).length;
    }
  }

  private updateCapacitor(): void {
    this.world.capacitor = clamp(this.world.capacitor + 0.018, 0, 1);
  }

  private recalculateAnalysis(): void {
    const blue = this.getShip("blue-fc")!;
    const player = this.world.player;
    const previousScore = this.world.analysis.score;
    const corridors: Corridor[] = [];
    let threatDirection = vec();
    let threatTotal = 0;

    for (const fleet of this.world.fleets) {
      const fc = this.getShip(fleet.fcId)!;
      if (!fc.visible) continue;
      const target = this.getShip(fleet.targetId) ?? blue;
      const distanceToTarget = distance(fc.position, target.position);
      const ticksToImpact = Math.max(
        1,
        Math.ceil(distanceToTarget / fleet.missileSpeed),
      );
      const threat =
        (fleet.missileSpeed / 4500) *
        (1 + fleet.activeMissiles / 30) *
        (fc.propulsion === "microwarpdrive" ? 1.25 : 1);
      const coverage =
        distanceToSegment(player.position, fc.position, target.position) <=
        9500;
      fleet.threat = threat;
      threatDirection = add(
        threatDirection,
        scale(normalize(sub(fc.position, blue.position)), threat),
      );
      threatTotal += threat;
      corridors.push({
        fleetId: fleet.id,
        color: fleet.color,
        from: clone(fc.position),
        to: clone(target.position),
        width: 7500 + (1 - fleet.cohesion) * 7500,
        coverage,
        ticksToImpact,
        threat,
      });
    }
    this.world.corridors = corridors;

    const idealDirection =
      threatTotal > 0 ? normalize(threatDirection) : vec(0, 0, -1);
    const idealDistance = 15500 + Math.min(4500, corridors.length * 1200);
    const idealPosition = add(
      blue.position,
      scale(idealDirection, idealDistance),
    );
    const distanceToIdeal = distance(player.position, idealPosition);
    const friendlies = this.world.ships.filter(
      (ship) => ship.alignment === "friendly" && ship.hp > 0 && ship.visible,
    );
    const nearestFriendlyDistance = Math.min(
      ...friendlies.map((ship) => distance(player.position, ship.position)),
    );
    const distanceToBlueFc = distance(player.position, blue.position);
    const speed = length(player.velocity);
    const propulsionInertia = PROPULSION_INERTIA_MULTIPLIER[player.propulsion];
    const responseSeconds = player.inertiaSeconds * propulsionInertia;
    const stoppingTime = speed > 1 ? responseSeconds * Math.log(10) : 0;
    const stoppingDistance = speed * responseSeconds * 0.9;
    const covered = corridors.filter((corridor) => corridor.coverage).length;
    const safetyState =
      nearestFriendlyDistance < PLAYER_SMARTBOMB_RADIUS
        ? "VIOLATION"
        : nearestFriendlyDistance <
            PLAYER_SMARTBOMB_RADIUS + PLAYER_SAFETY_MARGIN
          ? "DANGER"
          : nearestFriendlyDistance <
              PLAYER_SMARTBOMB_RADIUS + PLAYER_SAFETY_MARGIN + 2500
            ? "CAUTION"
            : "SAFE";
    const safeToPulse = safetyState === "SAFE" || safetyState === "CAUTION";
    if (safetyState === "VIOLATION") this.world.stats.proximityViolations += 1;

    const geometry = 52 * (1 - clamp(distanceToIdeal / 32000, 0, 1));
    const coverageScore =
      corridors.length === 0 ? 0 : 27 * (covered / corridors.length);
    const safetyScore =
      safetyState === "SAFE"
        ? 16
        : safetyState === "CAUTION"
          ? 10
          : safetyState === "DANGER"
            ? 3
            : 0;
    const relativeSpeed = length(sub(player.velocity, blue.velocity));
    const velocityScore = 5 * (1 - clamp(relativeSpeed / 800, 0, 1));
    const score = clamp(
      Math.round(geometry + coverageScore + safetyScore + velocityScore),
      0,
      100,
    );
    const samples = this.world.stats.positioningSamples;
    this.world.stats.positioningTotal += score;
    this.world.stats.positioningSamples += 1;
    if (score >= 80) {
      this.world.stats.currentPositioningStreak += 1;
      this.world.stats.bestPositioningStreak = Math.max(
        this.world.stats.bestPositioningStreak,
        this.world.stats.currentPositioningStreak,
      );
    } else {
      this.world.stats.currentPositioningStreak = 0;
    }

    const urgency =
      safetyState === "VIOLATION"
        ? "EMERGENCY"
        : safetyState === "DANGER" || distanceToIdeal > 25000
          ? "IMMEDIATE"
          : distanceToIdeal > 15000 || covered === 0
            ? "REPOSITION"
            : distanceToIdeal > 7500
              ? "MINOR CORRECTION"
              : "STABLE";
    const warning =
      safetyState === "VIOLATION"
        ? "TOO CLOSE TO BLUE FLEET"
        : !safeToPulse
          ? "UNSAFE TO PULSE"
          : player.propulsion === "microwarpdrive" &&
              stoppingDistance > distanceToIdeal
            ? "HIGH OVERSHOOT RISK · BEGIN BRAKING"
            : covered === 0
              ? "NO MISSILE CORRIDOR COVERAGE"
              : corridors.some((corridor) => corridor.ticksToImpact <= 2)
                ? "ONE-SECOND FIREWALL WINDOW"
                : covered > 1
                  ? "MULTI-FLEET CORRIDOR OVERLAP"
                  : "SAFE TO PULSE";

    this.world.analysis = {
      score,
      rollingScore: Math.round(previousScore * 0.72 + score * 0.28),
      averageScore: Math.round(
        (this.world.stats.positioningTotal || score) / Math.max(1, samples + 1),
      ),
      idealPosition,
      distanceToIdeal,
      distanceToBlueFc,
      nearestFriendlyDistance,
      stoppingDistance,
      stoppingTime,
      fleetsCovered: covered,
      safeToPulse,
      safetyState,
      urgency,
      warning,
    };
  }

  private recordReplayFrame(): void {
    const blue = this.getShip("blue-fc")!;
    const rate =
      this.world.stats.missilesLaunched > 0
        ? this.world.stats.missilesIntercepted /
          this.world.stats.missilesLaunched
        : 0;
    this.replayFrames.push({
      tick: this.world.tick,
      player: clone(this.world.player.position),
      blueFc: clone(blue.position),
      hostileFcs: this.world.fleets.map((fleet) =>
        clone(this.getShip(fleet.fcId)!.position),
      ),
      activeMissiles: this.world.missiles.length,
      positioningScore: this.world.analysis.score,
      interceptionRate: rate,
      nearestFriendly: this.world.analysis.nearestFriendlyDistance,
      playerSpeed: length(this.world.player.velocity),
    });
  }

  private addEffect(
    type: VisualEffect["type"],
    position: Vec3,
    color: string,
    radius: number,
  ): void {
    this.world.effects.push({
      id: `effect-${++this.effectId}`,
      type,
      position: clone(position),
      color,
      tick: this.world.tick,
      radius,
    });
  }

  private getShip(id: string): Ship | undefined {
    if (id === "player") return this.world.player;
    return this.world.ships.find((ship) => ship.id === id);
  }

  private fleetColor(fleetId: string): string {
    return (
      this.world.fleets.find((fleet) => fleet.id === fleetId)?.color ??
      "#ff6b5f"
    );
  }

  getSelected(): Ship {
    return this.getShip(this.world.selectedId) ?? this.world.player;
  }

  getViewState(): WorldState {
    return structuredClone(this.world);
  }

  exportReplay(): ReplayData {
    return {
      version: 1,
      seed: this.world.scenario.seed,
      scenario: structuredClone(this.world.scenario),
      frames: structuredClone(this.replayFrames),
      commands: structuredClone(this.replayCommands),
      stats: structuredClone(this.world.stats),
    };
  }

  getAfterActionReport(): AfterActionReport {
    const stats = this.world.stats;
    const interceptionRate =
      stats.missilesLaunched > 0
        ? (stats.missilesIntercepted / stats.missilesLaunched) * 100
        : 0;
    const positioningGrade = this.world.analysis.averageScore;
    const safetyGrade = clamp(
      100 - stats.proximityViolations * 2 - stats.friendlyDamage / 40,
      0,
      100,
    );
    const responseGrade = clamp(55 + stats.bestPositioningStreak * 2.2, 0, 100);
    const efficiencyGrade =
      stats.smartbombPulses > 0
        ? clamp(
            100 - (stats.wastedPulses / stats.smartbombPulses) * 100,
            0,
            100,
          )
        : 0;
    const finalScore = Math.round(
      interceptionRate * 0.35 +
        positioningGrade * 0.3 +
        safetyGrade * 0.2 +
        responseGrade * 0.1 +
        efficiencyGrade * 0.05,
    );
    const rank =
      finalScore >= 96
        ? "Perfect Screen"
        : finalScore >= 86
          ? "Fleet Guardian"
          : finalScore >= 74
            ? "Firewall Specialist"
            : finalScore >= 60
              ? "Firewall Pilot"
              : finalScore >= 40
                ? "Trainee"
                : "Unqualified";
    const feedback: string[] = [];
    if (stats.proximityViolations > 0) {
      feedback.push(
        `You entered the hard friendly exclusion region for ${stats.proximityViolations} authoritative ticks.`,
      );
    } else {
      feedback.push(
        "You maintained disciplined separation from the blue formation.",
      );
    }
    if (this.world.analysis.stoppingDistance > 6000) {
      feedback.push(
        `Your final stopping estimate was ${(this.world.analysis.stoppingDistance / 1000).toFixed(1)} km; begin braking earlier after MWD cycles.`,
      );
    }
    if (this.world.analysis.averageScore < 60) {
      feedback.push(
        "You followed the fight more than the missile corridor. Move to the hostile-facing side before volleys launch.",
      );
    } else {
      feedback.push(
        `Average positioning was ${this.world.analysis.averageScore}/100, with a best strong-position streak of ${stats.bestPositioningStreak} ticks.`,
      );
    }
    if (efficiencyGrade < 65) {
      feedback.push(
        "Several smartbomb pulses had no sampled missile in range. Stagger modules around authoritative tick boundaries.",
      );
    }
    if (this.world.fleets.length > 1 && this.world.analysis.fleetsCovered < 2) {
      feedback.push(
        "At least one hostile corridor remained uncovered at the finish. Favor overlap geometry over chasing the nearest fleet.",
      );
    }
    return {
      finalScore,
      rank,
      interceptionRate,
      positioningGrade,
      safetyGrade,
      responseGrade,
      efficiencyGrade,
      feedback,
    };
  }
}
