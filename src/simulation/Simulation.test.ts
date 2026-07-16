import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import { distance } from "./math";
import { cloneScenario, SCENARIOS } from "./scenarios";

const scenario = () => cloneScenario(SCENARIOS[0]!);

describe("Simulation", () => {
  it("creates the default Nestor, ten blue ships, and twenty ships per hostile fleet", () => {
    const simulation = new Simulation(scenario());
    expect(simulation.world.player.type).toBe("Nestor");
    expect(simulation.world.modules).toHaveLength(7);
    expect(
      simulation.world.ships.filter((ship) => ship.fleetId === "blue"),
    ).toHaveLength(10);
    expect(
      simulation.world.ships.filter((ship) => ship.fleetId === "red-1"),
    ).toHaveLength(20);
    expect(simulation.world.fleets[0]!.engagementRange).toBe(55_000);
    expect(simulation.world.scenario.bluePropulsion).toBe("afterburner");
  });

  it("starts anchored fleets moving and fires a full volley every 11 seconds", () => {
    const simulation = new Simulation(scenario());
    const initialBlue = { ...simulation.world.ships[0]!.position };
    const initialHostile = {
      ...simulation.world.ships.find((ship) => ship.id === "red-1-fc")!
        .position,
    };
    simulation.start();

    simulation.advance(1000);
    expect(simulation.world.stats.missilesLaunched).toBe(20);
    simulation.advance(3000);
    expect(
      distance(simulation.world.ships[0]!.position, initialBlue),
    ).toBeGreaterThan(0);
    expect(
      distance(
        simulation.world.ships.find((ship) => ship.id === "red-1-fc")!.position,
        initialHostile,
      ),
    ).toBeGreaterThan(0);

    for (let tick = 0; tick < 8; tick += 1) simulation.advance(1000);
    expect(simulation.world.tick).toBe(12);
    expect(simulation.world.stats.missilesLaunched).toBe(40);
    expect(simulation.world.fleets[0]!.volleyInterval).toBe(11);
  });

  it("keeps anchored members in a short trailing formation", () => {
    const simulation = new Simulation(scenario());
    const blueFc = simulation.world.ships.find(
      (ship) => ship.id === "blue-fc",
    )!;
    const member = simulation.world.ships.find((ship) => ship.id === "blue-1")!;
    expect(member.formationOffset.z).toBeLessThan(0);
    expect(distance(member.position, blueFc.position)).toBeLessThan(7000);

    simulation.start();
    for (let tick = 0; tick < 20; tick += 1) simulation.advance(1000);
    expect(member.command).toMatch(/Anchored|Recovering/);
    expect(distance(member.position, blueFc.position)).toBeLessThan(10_000);
  });

  it("warps a hostile fleet to a new bearing at its configured range", () => {
    const simulation = new Simulation(scenario());
    const fleet = simulation.world.fleets[0]!;
    const fc = simulation.world.ships.find((ship) => ship.id === fleet.fcId)!;
    const blue = simulation.world.ships.find((ship) => ship.id === "blue-fc")!;
    const initial = { ...fc.position };
    simulation.start();

    expect(simulation.repositionFleet(fleet.id)).toBe(true);
    expect(fc.visible).toBe(false);
    simulation.advance(1000);
    expect(fc.visible).toBe(false);
    simulation.advance(1000);
    expect(fc.visible).toBe(true);
    expect(distance(fc.position, initial)).toBeGreaterThan(10_000);
    expect(distance(fc.position, blue.position)).toBeCloseTo(55_000, -3);
  });

  it("can stagger each volley over four authoritative seconds", () => {
    const config = scenario();
    config.staggeredMissiles = true;
    const simulation = new Simulation(config);
    simulation.start();

    simulation.advance(1000);
    expect(simulation.world.stats.missilesLaunched).toBe(5);
    for (let tick = 0; tick < 3; tick += 1) simulation.advance(1000);
    expect(simulation.world.stats.missilesLaunched).toBe(20);
    for (let tick = 0; tick < 8; tick += 1) simulation.advance(1000);
    expect(simulation.world.tick).toBe(12);
    expect(simulation.world.stats.missilesLaunched).toBe(25);
  });

  it("resolves commands only on authoritative tick boundaries", () => {
    const simulation = new Simulation(scenario());
    simulation.start();
    simulation.queueCommand({ type: "propulsion", mode: "afterburner" });
    simulation.advance(999);
    expect(simulation.world.player.propulsion).toBe("none");
    simulation.advance(1);
    expect(simulation.world.player.propulsion).toBe("afterburner");
  });

  it("uses sampled smartbomb range and attributes missile destruction", () => {
    const simulation = new Simulation(scenario());
    simulation.world.fleets.forEach((fleet) => {
      fleet.nextVolleyTick = 100;
    });
    const player = simulation.world.player;
    simulation.world.missiles.push({
      id: "test-missile",
      fleetId: "red-1",
      sourceShipId: "red-1-fc",
      targetShipId: "blue-fc",
      position: {
        x: player.position.x + 5000,
        y: player.position.y,
        z: player.position.z,
      },
      previousPosition: {
        x: player.position.x + 5000,
        y: player.position.y,
        z: player.position.z,
      },
      velocity: { x: 0, y: 0, z: 4500 },
      previousVelocity: { x: 0, y: 0, z: 4500 },
      maxVelocity: 4500,
      turningRate: 0.2,
      remainingFlightTicks: 20,
      hitPoints: 100,
      damage: 90,
      launchTick: 0,
      estimatedImpactTick: 10,
      status: "in-flight",
    });
    simulation.queueCommand({ type: "smartbomb", slot: 1 });
    simulation.step();
    expect(simulation.world.stats.missilesIntercepted).toBe(1);
    expect(simulation.world.modules[0]!.missilesDestroyed).toBe(1);
    expect(simulation.world.missiles).toHaveLength(0);
  });

  it("auto-repeats smartbombs until deactivation completes", () => {
    const simulation = new Simulation(scenario());
    simulation.world.fleets.forEach((fleet) => {
      fleet.nextVolleyTick = 100;
    });
    simulation.start();
    simulation.queueCommand({ type: "smartbomb", slot: 1 });
    simulation.advance(1000);
    expect(simulation.world.modules[0]!.active).toBe(true);
    expect(simulation.world.stats.smartbombPulses).toBe(1);

    for (let tick = 0; tick < 10; tick += 1) simulation.advance(1000);
    expect(simulation.world.stats.smartbombPulses).toBe(2);
    simulation.queueCommand({ type: "smartbomb", slot: 1 });
    simulation.advance(1000);
    expect(simulation.world.modules[0]!.deactivating).toBe(true);
    for (let tick = 0; tick < 9; tick += 1) simulation.advance(1000);
    expect(simulation.world.modules[0]!.active).toBe(false);
    expect(simulation.world.stats.smartbombPulses).toBe(2);
  });

  it("is deterministic for the same seed and command sequence", () => {
    const first = new Simulation(scenario());
    const second = new Simulation(scenario());
    first.start();
    second.start();
    first.queueCommand({ type: "move", vector: { x: 1, y: 0.25, z: 0.4 } });
    second.queueCommand({ type: "move", vector: { x: 1, y: 0.25, z: 0.4 } });
    for (let tick = 0; tick < 12; tick += 1) {
      first.advance(1000);
      second.advance(1000);
    }
    expect(first.world.player.position).toEqual(second.world.player.position);
    expect(first.world.missiles.map((missile) => missile.position)).toEqual(
      second.world.missiles.map((missile) => missile.position),
    );
    expect(first.exportReplay()).toEqual(second.exportReplay());
  });

  it("keeps training capacitor available during sustained normal use", () => {
    const simulation = new Simulation(scenario());
    simulation.start();
    simulation.queueCommand({ type: "propulsion", mode: "afterburner" });
    for (let tick = 0; tick < 30; tick += 1) simulation.advance(1000);
    expect(simulation.world.capacitor).toBeGreaterThanOrEqual(0.8);
  });

  it("switches AB and MWD at cycle boundaries and auto-repeats until stopped", () => {
    const simulation = new Simulation(scenario());
    simulation.start();

    simulation.queueCommand({ type: "propulsion", mode: "afterburner" });
    simulation.advance(1000);
    expect(simulation.world.player.propulsion).toBe("afterburner");

    simulation.queueCommand({
      type: "propulsion",
      mode: "microwarpdrive",
    });
    simulation.advance(1000);
    expect(simulation.world.player.propulsion).toBe("afterburner");
    expect(simulation.world.player.propulsionTarget).toBe("microwarpdrive");
    for (let tick = 0; tick < 9; tick += 1) simulation.advance(1000);
    expect(simulation.world.player.propulsion).toBe("microwarpdrive");

    simulation.queueCommand({
      type: "propulsion",
      mode: "microwarpdrive",
    });
    simulation.advance(1000);
    expect(simulation.world.player.propulsion).toBe("microwarpdrive");
    expect(simulation.world.player.propulsionTarget).toBe("none");
    for (let tick = 0; tick < 9; tick += 1) simulation.advance(1000);
    expect(simulation.world.player.propulsion).toBe("none");
  });

  it("uses the plated Nestor response profile and gains speed under propulsion", () => {
    const noProp = new Simulation(scenario());
    const afterburner = new Simulation(scenario());
    noProp.start();
    afterburner.start();
    noProp.queueCommand({ type: "speed", value: 1 });
    afterburner.queueCommand({ type: "speed", value: 1 });
    afterburner.queueCommand({ type: "propulsion", mode: "afterburner" });

    for (let tick = 0; tick < 20; tick += 1) {
      noProp.advance(1000);
      afterburner.advance(1000);
    }

    expect(noProp.world.player.massKg).toBe(27_500_000);
    expect(noProp.world.player.inertiaSeconds).toBeCloseTo(9.625);
    expect(afterburner.world.player.velocity.x).toBeGreaterThan(
      noProp.world.player.velocity.x,
    );
  });
});
