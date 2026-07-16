# Movement model

All positions are metres in three dimensions. Velocity is metres per authoritative second.

For every ship, the movement system computes a desired velocity from normalized direction, throttle, base maximum velocity, and propulsion multiplier. Current velocity approaches desired velocity exponentially. Position uses the exact integral of that response over the one-second authority step:

`response = 1 - exp(-1 / (inertiaSeconds × propulsionInertia))`

`velocityNext = velocityDesired + (velocityCurrent - velocityDesired) × exp(-1 / responseSeconds)`

`positionNext = positionCurrent + integratedVelocityOverOneSecond`

The Nestor profile represents a 20,000,000 kg hull with two 3,750,000 kg 1600 mm plate additions: 27,500,000 kg fitted mass, 0.35 inertia modifier, and a 9.625 second unpropelled response constant. A battleship-sized AB or MWD contributes 50,000,000 kg while active, producing a 27.125 second fitted response constant. Deactivating propulsion changes the desired maximum and removes the module mass at the cycle boundary, but it does not clear velocity.

Rendering uses cubic velocity-aware interpolation between authoritative samples followed by a short display-only position and heading damper. This keeps the one-hertz simulation unchanged while turns, acceleration, missiles, brackets, and camera tracking remain visually continuous.

## Predictions

The HUD estimates:

- stopping time from current speed and Nestor inertia;
- stopping distance from the same response calibration;
- relative velocity to Blue FC;
- overshoot when the estimated stopping distance exceeds distance to the useful region.

Predictions use the same calibration family as movement. They are intentionally conservative rather than exact dogma claims.

## Formation movement

Every non-FC ship owns a compact row-and-column offset behind its FC. The offset rotates with the FC's actual velocity, and the member combines the FC's velocity with a limited correction toward that moving slot. Members therefore follow rather than orbiting a static point: turns stretch the outside of a formation, less agile ships trail, vertical turns distort depth, and the fleet recovers gradually. MWD expands hostile target offsets while active.

## Calibration targets

Edit the `baseMaxVelocity`, `inertiaSeconds`, and propulsion multipliers in `Simulation.ts` while using `CALIBRATION.md` procedures. Current values aim for readable 120-second training exercises:

- Nestor base speed: 92 m/s.
- Player AB top speed: 571 m/s with default skirmish links (about 454 m/s unlinked).
- Player MWD top speed: 1,612 m/s with default skirmish links (about 1,241 m/s unlinked).
- Rapid Deployment: +32.34% to the AB/MWD bonus portion when enabled.
- Fleet AB target speed: 550 m/s at full throttle.
- Fleet MWD target speed: 1.3 km/s at full throttle.
- Two-plate Nestor response time: 9.625 seconds before propulsion modifiers.
- Hostile FC base speed: roughly 260–310 m/s.

These are simulator-calibrated defaults, not asserted live-game fitting results.
