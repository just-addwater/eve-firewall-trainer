# Contributing

## Development

Use Node.js 22.13 or newer. Before submitting changes, run:

```bash
npm run format
npm run lint
npm run test:unit
npm run build
```

If Playwright Chromium is installed, also run `npm run test:e2e`.

## Conventions

- Keep authoritative systems in `src/simulation/` free of DOM, React, Three.js, frame time, and display resolution.
- Queue player actions for a future authoritative tick.
- Route every random choice through `DeterministicRandom`.
- Store positions and speeds in metres and seconds.
- Keep visual interpolation and effects in `src/rendering/`.
- Avoid allocating React elements for missiles; aggregate or batch them.
- Add a unit test for ordering, determinism, or calibration-sensitive behavior.
- Label new values as data-derived, observed, calibrated, approximated, or simulator-specific.

## Adding content

Scenarios live in `src/simulation/scenarios.ts`. Give every hostile fleet a stable ID, distinct color, explicit missile speed, volley interval, propulsion, movement behavior, and vertical offset. Profiles/formations should remain plain data where possible. New formations must continue to launch missiles from actual deformed member positions.

For a new missile or ship profile, document units and provenance in `DATA_SOURCES.md`, add a fallback, and extend tests. Performance-sensitive changes should be checked with three hostile fleets and the 2,200-missile ceiling.
