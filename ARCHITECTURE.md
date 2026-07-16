# Architecture

## Runtime boundaries

The application has three deliberate layers:

1. `src/simulation/` owns all authoritative outcomes. It has no DOM, React, or Three.js dependencies.
2. `src/rendering/TacticalScene.tsx` consumes authoritative positions and interpolates them for display. It never writes combat results.
3. React components consume a one-hertz view snapshot for controls, overview data, warnings, settings, and review screens.

`Simulation` owns `WorldState`, the deterministic RNG, command queue, fleet hierarchy, missile entities, analysis, scoring inputs, and replay recording. `SimulationClock` converts real elapsed milliseconds into exact one-second ticks. Render frame rate cannot create extra simulation work.

## Authoritative tick order

Every tick uses the same centralized order:

1. Read and resolve queued player commands.
2. Advance or finish repeating propulsion and smartbomb cycles.
3. Resolve hostile fleet warp-ins and update Blue/hostile FC decisions.
4. Advance player, FC, and formation-member movement.
5. Launch due full or staggered hostile missile groups from actual member positions.
6. Guide and advance every active missile, then resolve impact/expiration.
7. Recharge training capacitor.
8. Recalculate corridors, threat, friendly safety, stopping prediction, and score.
9. Record one compact replay frame and publish the mutated world for the UI.

Smartbomb commands resolve in step 1 at the player's sampled authoritative position, before movement and missile advancement. This makes tick preparation meaningful.

## Commands and determinism

UI actions become `QueuedCommand` records with a stable ID and `executeTick = currentTick + 1`. The xorshift-based `DeterministicRandom` is the only source of simulation randomness. A scenario seed plus the same command sequence produces the same formation variation, missile speeds, movement, and replay. Processing-time telemetry is not used by game logic.

## Entity model

Ships and missiles are plain TypeScript records. Fleet members contain a formation offset and resolve a moving desired point from FC position and orientation. They accelerate toward that point using their own speed and inertia, so turns and propulsion cycles deform the formation naturally. Missiles store source, target, previous/current position, guided velocity, HP, flight time, launch tick, and expected impact tick.

## Rendering and interpolation

The simulator keeps previous and current authoritative positions. Each animation frame interpolates with `SimulationClock.phase`. Ships are instanced, missiles share dynamic position/color buffers, trail samples share one line buffer, and corridor volumes are reused meshes. Camera orbit, zoom, fog, starfield, pulse spheres, and bracket motion are visual only.

## Corridor and positioning analysis

Each hostile fleet publishes a current FC-to-target corridor whose width expands as formation cohesion falls. Threat combines missile speed, active pressure, and FC MWD state. The recommended region sits on the threat-weighted hostile-facing side of Blue FC. Live score combines region distance, corridor coverage, friendly safety, and relative speed. This intentionally favors continued positioning over one lucky pulse.

## Replay format

Replay JSON contains version, seed, complete scenario settings, player commands, final statistics, and compact authoritative frames. Each frame records key ship positions, active missile count, positioning score, interception rate, nearest-friendly distance, and player speed. It does not contain rasterized frames or Three.js state.

## Persistence

Browser storage is limited to local presets, high scores, and the high-contrast preference. Scenario and replay JSON are portable files. There is no backend, database, authentication, telemetry, or runtime network requirement.
