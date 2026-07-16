# Mechanics

## One-hertz authority

Combat outcomes happen only once per simulated second. The smooth scene is an interpolation of the two most recent authoritative ship/missile positions. Pausing freezes authority. Time scaling changes how quickly one-second ticks are emitted; it does not change the equations inside a tick.

## Smartbomb pulses

F1–F7 are independent auto-repeat modules with a 7 km radius, 125 simulator damage, 10-second cycle, and training capacitor cost. A queued activation resolves instantaneously at the next second boundary using current authoritative positions, then pulses again at each completed cycle. Pressing an active module requests deactivation at the cycle boundary; pressing it again cancels that request. Missiles at or inside the radius lose HP; 100-HP defaults are destroyed by one pulse. The visual expansion is feedback only.

Fast missiles can appear to cross the sphere between ticks and remain unharmed. That behavior is intentional and is the main training pressure.

## Missiles

Every missile has its own launch point, source fleet, moving target, velocity, turn blend, HP, remaining flight, and damage. Each fleet keeps an independent configured speed. Fleets can launch a complete 20-ship volley or stagger it into five-ship groups across four consecutive seconds, followed by the same 11-second reload. Seeded variation preserves deterministic mixed-speed waves. Impact uses the authoritative one-second missile segment against target radius so a fast missile cannot skip through its target.

## Propulsion modules

AB and MWD are mutually exclusive auto-repeat modules. Capacitor is charged at the beginning of each 10-second cycle. Pressing the running module requests shutdown at the cycle boundary; selecting the other module queues a boundary switch. Speed, mass/inertia response, and retained momentum are modeled for the two-plate Nestor training fit. Scram effects, signature bloom, skills, overheating, and exact server Dogma calculations remain outside this trainer's scope.

## Anchors and warp-ins

Blue and hostile fleet members continuously follow compact short-range slots behind their FC, inheriting its velocity while correcting formation error. Each hostile fleet has its own rough engagement range, propulsion mode, and anchor throttle. The warp control hides that fleet for two authority steps, then places its FC at a new seeded bearing around Blue FC at the configured range and rebuilds its trailing formation.

## Friendly exclusion

The safety display derives from the nearest living blue ship:

- Safe: beyond smartbomb radius plus safety and prediction margins.
- Caution: approaching the future danger envelope.
- Danger: inside the margin where a pulse is unsafe.
- Violation: inside the 7 km hard sphere.

Violations reduce the safety grade each tick. Actual friendly smartbomb damage adds a stronger penalty. One mistake does not immediately end an exercise.

## Corridor coverage

A corridor is the current FC-to-target volume. Formation stretch widens it. The player covers a corridor when the authoritative Nestor position lies within the calibrated corridor distance. Multiple covered volumes receive a score benefit. The threat-weighted recommended point is not a perfect autopilot: it reports geometry and the player must account for inertia.

## Scoring

Final weighting follows the training brief:

- 35% missile interception.
- 30% average positioning.
- 20% friendly separation and discipline.
- 10% response represented by sustained strong-position streaks.
- 5% useful smartbomb pulses.
- 0% capacitor usage.

Ranks progress from Unqualified through Trainee, Firewall Pilot, Firewall Specialist, Fleet Guardian, and Perfect Screen.

## Assistance

Full assistance shows the ideal region and an align command. Partial retains corridor and safety geometry. Minimal removes the ideal point. Expert hides recommendation geometry but continues internal scoring. The current implementation does not alter the final score multiplier by assistance level.
