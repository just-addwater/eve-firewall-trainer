# Calibration guide

Use a fixed scenario seed and replay export for every comparison. Change one coefficient at a time, rerun the same command sequence, and compare authoritative frames rather than visual interpolation.

## Player movement

1. Select Basic Firewall and hold the Blue FC stationary.
2. Issue full speed from rest and record ticks to 25%, 50%, 75%, and 95% base speed.
3. Stop from steady speed and record stopping time/distance.
4. Repeat with AB and MWD.
5. After MWD deactivation, verify coasting decays smoothly rather than snapping.

For turning, export starting direction, issue A/D turns at a known tick, and measure authoritative direction/position at 90° and 180°. Repeat while MWD is active.

## Fleet movement and formation lag

Use Anchor Turn and MWD Formation Stretch. Record FC velocity, outer-member formation error, average cohesion, and missile launch positions. A useful result has visible outer-turn lag, no teleportation, greater MWD stretch than AB stretch, and gradual recovery after propulsion ends.

## Missiles and pulse timing

For a stationary 63 km corridor:

1. Configure 4.5, 7.5, and 11 km/s fleets.
2. Verify distance per tick exactly matches the configured speed before guidance curvature.
3. Count launch-to-impact ticks.
4. Place the Nestor near the corridor and count sampled positions inside 7 km.
5. Confirm a visually interpolated crossing does not create a hit without a pulse at that authoritative sample.

## Orbit and keep-range behavior

Overview actions use player direction commands rather than a perfect orbit controller. For FC AI orbit calibration, compare radius error over 60 ticks, radial oscillation after propulsion changes, and vertical drift. Tighten the radial correction only if it does not erase battleship overshoot.

## Acceptance checks

- The same seed and commands export byte-equivalent replay objects aside from file formatting.
- No ship teleports to formation.
- MWD produces materially longer stopping distance than AB.
- Faster missile settings reduce practical pulse windows.
- Position score rewards sustained safe overlap and penalizes the blue formation center.
- Tick processing remains well below one second with 2,000 active missiles.
