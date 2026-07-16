# EVE Fleet Firewall Trainer

A local-first, browser-based positioning simulator for practicing Nestor smartbomb firewall work in moving EVE-style fleet geometry. It models a deterministic one-hertz combat authority, heavy battleship movement, independently moving fleet commanders, deforming formations, individually guided missiles, sampled smartbomb pulses, friendly exclusion, live positioning analysis, and compact replays.

The application has no backend, accounts, audio, or runtime EVE data dependency. Settings, local presets, accessibility preference, and high scores stay in the browser.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed in the terminal. A production check is:

```bash
npm run test:unit
npm run lint
npm run build
npm run preview
```

Browser tests require Playwright's Chromium once:

```bash
npx playwright install chromium
npm run test:e2e
```

## Controls

| Input                    | Action                                  |
| ------------------------ | --------------------------------------- |
| Left drag                | Orbit tactical camera                   |
| Mouse wheel              | Zoom                                    |
| Double-click empty space | Align and move toward that direction    |
| W / S                    | Full or half speed                      |
| A / D                    | Turn the desired movement vector        |
| R / F                    | Climb or descend                        |
| Space                    | Stop ship and begin braking             |
| M                        | Match Blue FC velocity                  |
| T                        | Toggle tactical geometry                |
| L                        | Toggle enhanced missile trails          |
| F1–F7                    | Toggle the seven independent smartbombs |
| F8                       | Toggle afterburner                      |
| F9                       | Toggle microwarpdrive                   |
| Escape                   | Pause or resume                         |

Commands enter a queue and resolve only at the next authoritative one-second boundary. A missile crossing the visual sphere between ticks does not receive a smartbomb hit.

## Training content

The 18 built-in presets cover a basic firing line, moving anchor, anchor turn, expanding friendly formation, orbiting AB fleet, MWD formation stretch, horizontal and vertical crossfire, pincer movement, three independent FCs, fast missile pressure, mixed arrival times, overtaking waves, formation traffic, momentum traps, reactive flanks, synchronized three-fleet arrivals, and an expert screen.

The scenario editor changes duration, seed, assistance, Blue FC movement, Blue propulsion and anchor speed, player skirmish links, hostile FC count, each hostile fleet's engagement range, propulsion, anchor speed, missile speed, and full-volley or staggered firing pattern. Exercises default to 10 minutes, the Blue fleet defaults to AB at 550 m/s, the hostile fleet defaults to MWD at 1.3 km/s, and hostile engagement range defaults to 55 km. Scenarios can be saved locally, exported/imported as JSON, or encoded in a shareable URL. Replays can be exported and imported separately.

## Simulation notes

- One player Nestor rendered from the included local `public/models/Nestor.stl`, with seven smartbombs, AB, MWD, training capacitor, and full 3D movement.
- Ten blue ships by default, following short-range trailing slots behind a moving Blue FC.
- One to three hostile fleets with 20 ships each following an independent moving FC. Every hostile fleet begins firing immediately and reloads every 11 seconds.
- A selected hostile fleet can warp off and return after a short delay at a new bearing and its configured engagement range.
- Propulsion and smartbomb modules auto-repeat. A second press requests deactivation at the end of the active cycle; AB and MWD are mutually exclusive and switches occur at cycle boundaries.
- Perfectly guided missiles with seeded speed variation: they impact a living target unless intercepted by a sampled smartbomb pulse.
- EVE-inspired overview, selected-item panel, circular capacitor HUD, module rack, tactical camera, warnings, corridor overlays, and stopping predictions.
- Positioning score weights ideal-region distance, corridor coverage, friendly separation, and relative velocity.
- Replay frames store authoritative state rather than rendered frames. The after-action review graphs positioning/interception and generates targeted feedback.

See [ARCHITECTURE.md](ARCHITECTURE.md), [MOVEMENT.md](MOVEMENT.md), [MECHANICS.md](MECHANICS.md), [DATA_SOURCES.md](DATA_SOURCES.md), and [CALIBRATION.md](CALIBRATION.md) for the implementation boundaries and approximations.

## GitHub Pages

1. Create a GitHub repository and upload this project.
2. Keep the default branch named `main` (or update the workflow trigger).
3. In **Settings → Pages**, select **GitHub Actions** as the source.
4. Push to `main`.

`.github/workflows/deploy-pages.yml` pins Node, installs from the lockfile, checks formatting and lint, runs unit and browser tests, selects `/` for a `<username>.github.io` repository or `/<repository-name>/` for a project repository, and deploys `dist/` to Pages. The app uses a single static route and hash-encoded scenario links, so refreshes work from either location.

## Data update

The shipped calibration is deliberately self-contained. To extract relevant records from a locally downloaded JSON-form EVE Static Data Export:

```bash
npm run data:update -- C:/path/to/extracted-sde
```

The script scans deterministically, keeps only relevant Nestor/module/missile records, normalizes dogma attributes, records source metadata, and warns about missing fields. A normal build never downloads or bundles the full SDE.

## Performance and browser support

The tactical renderer batches friendly and hostile ships in instanced meshes, missiles in one point buffer, and trails in one line buffer. Simulation authority remains one hertz while display timing, velocity-aware interpolation, tactical envelopes, and camera damping update at the display refresh rate. Standard trails are short and subtle; enhanced mode draws longer, brighter trails for training visibility. The missile ceiling is 2,200 active entities. Current evergreen Chrome, Edge, Firefox, and Safari releases with WebGL2 are supported. Desktop is the primary target; the app remains usable below 1,000 px but displays a density warning.

## Screenshots

Run the application locally and capture the briefing, live crossfire, and after-action views for this section before publishing the repository.

## Known approximations

- Ship acceleration uses a configurable exponential response rather than exact Tranquility dogma formulas.
- Smartbomb and missile numbers are simulator-specific defaults unless regenerated from a local SDE.
- Corridor/ideal-region calculations use cached FC-to-target volumes rather than exhaustive future trajectories.
- Collision avoidance is represented through formation targets and spacing; it is not a full rigid-body solver.
- The replay review is authoritative and scrub-able, but does not yet reconstruct a second interactive 3D world.
- Hostile damage and target policy are training abstractions, not a general EVE combat simulator.

EVE Online and related marks belong to CCP Games. This fan-made training tool uses simplified procedural visuals and does not include CCP game assets.
