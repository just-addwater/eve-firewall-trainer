import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AfterAction } from "./components/AfterAction";
import { Hud } from "./components/Hud";
import { Overview } from "./components/Overview";
import { ScenarioDrawer } from "./components/ScenarioDrawer";
import { SelectedPanel } from "./components/SelectedPanel";
import { TacticalScene } from "./rendering/TacticalScene";
import { Simulation } from "./simulation/Simulation";
import {
  cloneScenario,
  dailyScenario,
  SCENARIOS,
} from "./simulation/scenarios";
import {
  distance,
  formatDistance,
  formatSpeed,
  length,
  normalize,
  sub,
} from "./simulation/math";
import type {
  AfterActionReport,
  MissileTrailMode,
  PropulsionMode,
  QueuedCommand,
  ReplayData,
  ScenarioConfig,
  Vec3,
  WorldState,
} from "./simulation/types";

const initialScenario = (): ScenarioConfig => {
  try {
    if (window.location.hash.startsWith("#scenario=")) {
      const parsed = JSON.parse(
        decodeURIComponent(window.location.hash.slice(10)),
      ) as ScenarioConfig;
      if (parsed.name && Array.isArray(parsed.hostiles))
        return cloneScenario(parsed);
    }
  } catch {
    // A malformed shared link simply falls back to the first training exercise.
  }
  return cloneScenario(SCENARIOS[0]!);
};

const reportFromReplay = (replay: ReplayData): AfterActionReport => {
  const launched = Math.max(1, replay.stats.missilesLaunched);
  const interceptionRate = (replay.stats.missilesIntercepted / launched) * 100;
  const positioningGrade = replay.frames.length
    ? replay.frames.reduce(
        (total, frame) => total + frame.positioningScore,
        0,
      ) / replay.frames.length
    : 0;
  const safetyGrade = Math.max(
    0,
    100 -
      replay.stats.proximityViolations * 2 -
      replay.stats.friendlyDamage / 40,
  );
  const efficiencyGrade = replay.stats.smartbombPulses
    ? Math.max(
        0,
        100 - (replay.stats.wastedPulses / replay.stats.smartbombPulses) * 100,
      )
    : 0;
  const responseGrade = Math.min(
    100,
    55 + replay.stats.bestPositioningStreak * 2.2,
  );
  const finalScore = Math.round(
    interceptionRate * 0.35 +
      positioningGrade * 0.3 +
      safetyGrade * 0.2 +
      responseGrade * 0.1 +
      efficiencyGrade * 0.05,
  );
  return {
    finalScore,
    rank:
      finalScore >= 86
        ? "Fleet Guardian"
        : finalScore >= 60
          ? "Firewall Pilot"
          : "Trainee",
    interceptionRate,
    positioningGrade,
    safetyGrade,
    responseGrade,
    efficiencyGrade,
    feedback: [
      "Imported authoritative replay loaded successfully.",
      `Average positioning measured ${Math.round(positioningGrade)}/100 across ${replay.frames.length} recorded ticks.`,
      replay.stats.proximityViolations
        ? `Friendly exclusion was violated for ${replay.stats.proximityViolations} sampled ticks.`
        : "Friendly separation discipline remained intact.",
    ],
  };
};

export function App() {
  const [simulation, setSimulation] = useState(
    () => new Simulation(initialScenario()),
  );
  const simulationRef = useRef(simulation);
  const [world, setWorld] = useState<WorldState>(() =>
    simulation.getViewState(),
  );
  const [tacticalOverlay, setTacticalOverlay] = useState(true);
  const [missileTrailMode, setMissileTrailMode] = useState<MissileTrailMode>(
    () =>
      localStorage.getItem("efft-missile-trails") === "enhanced"
        ? "enhanced"
        : "standard",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [importedReplay, setImportedReplay] = useState<ReplayData | null>(null);
  const [highContrast, setHighContrast] = useState(
    () => localStorage.getItem("efft-high-contrast") === "true",
  );
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const completedRef = useRef("");

  const toggleMissileTrails = useCallback(() => {
    setMissileTrailMode((current) => {
      const next = current === "standard" ? "enhanced" : "standard";
      localStorage.setItem("efft-missile-trails", next);
      return next;
    });
  }, []);

  useEffect(() => {
    simulationRef.current = simulation;
    setWorld(simulation.getViewState());
  }, [simulation]);

  useEffect(() => {
    let last = performance.now();
    let frameHandle = 0;
    const frame = (now: number) => {
      const current = simulationRef.current;
      const ticks = current.advance(now - last);
      last = now;
      if (ticks > 0) setWorld(current.getViewState());
      frameHandle = window.requestAnimationFrame(frame);
    };
    frameHandle = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(frameHandle);
  }, []);

  useEffect(() => {
    if (world.status !== "complete") return;
    const runKey = `${world.scenario.id}-${world.scenario.seed}-${world.tick}`;
    if (completedRef.current === runKey) return;
    completedRef.current = runKey;
    const report = simulationRef.current.getAfterActionReport();
    const scores = JSON.parse(
      localStorage.getItem("efft-high-scores") ?? "{}",
    ) as Record<string, number>;
    scores[world.scenario.id] = Math.max(
      scores[world.scenario.id] ?? 0,
      report.finalScore,
    );
    localStorage.setItem("efft-high-scores", JSON.stringify(scores));
    setImportedReplay(null);
    setReviewOpen(true);
  }, [world.status, world.scenario.id, world.scenario.seed, world.tick]);

  const refresh = useCallback(
    () => setWorld(simulationRef.current.getViewState()),
    [],
  );
  const issue = useCallback(
    (command: Omit<QueuedCommand, "id" | "executeTick">) => {
      const current = simulationRef.current;
      if (current.world.status === "briefing") current.start();
      current.queueCommand(command);
      refresh();
    },
    [refresh],
  );
  const move = useCallback(
    (direction: Vec3) => issue({ type: "move", vector: direction }),
    [issue],
  );
  const stop = useCallback(() => issue({ type: "stop" }), [issue]);
  const matchBlue = useCallback(() => issue({ type: "match-blue" }), [issue]);
  const warpFleet = useCallback(
    (fleetId: string) => {
      issue({ type: "warp-fleet", fleetId });
    },
    [issue],
  );

  const replaceScenario = useCallback(
    (scenario: ScenarioConfig, start = false) => {
      const next = new Simulation(cloneScenario(scenario));
      if (start) next.start();
      simulationRef.current = next;
      setSimulation(next);
      setWorld(next.getViewState());
      setBriefingDismissed(false);
      setImportedReplay(null);
      setReviewOpen(false);
      completedRef.current = "";
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea")) return;
      const current = simulationRef.current;
      if (/^F[1-7]$/.test(event.key)) {
        event.preventDefault();
        issue({ type: "smartbomb", slot: Number(event.key.slice(1)) });
        return;
      }
      if (event.key === "F8") {
        event.preventDefault();
        issue({ type: "propulsion", mode: "afterburner" });
      } else if (event.key === "F9") {
        event.preventDefault();
        issue({ type: "propulsion", mode: "microwarpdrive" });
      } else if (event.code === "Space") {
        event.preventDefault();
        stop();
      } else if (event.key.toLowerCase() === "t") {
        setTacticalOverlay((value) => !value);
      } else if (event.key.toLowerCase() === "l") {
        toggleMissileTrails();
      } else if (event.key.toLowerCase() === "m") {
        matchBlue();
      } else if (event.key.toLowerCase() === "w") {
        issue({ type: "speed", value: 1 });
      } else if (event.key.toLowerCase() === "s") {
        issue({ type: "speed", value: 0.5 });
      } else if (["a", "d", "r", "f"].includes(event.key.toLowerCase())) {
        const key = event.key.toLowerCase();
        const direction = normalize(current.world.player.desiredDirection);
        if (key === "a" || key === "d") {
          const angle = key === "a" ? -0.38 : 0.38;
          move({
            x: direction.x * Math.cos(angle) - direction.z * Math.sin(angle),
            y: direction.y,
            z: direction.x * Math.sin(angle) + direction.z * Math.cos(angle),
          });
        } else {
          move({ ...direction, y: direction.y + (key === "r" ? 0.55 : -0.55) });
        }
      } else if (event.key === "Escape") {
        if (drawerOpen) setDrawerOpen(false);
        else {
          current.togglePause();
          refresh();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, issue, matchBlue, move, refresh, stop, toggleMissileTrails]);

  const selected = useMemo(
    () =>
      world.selectedId === "player"
        ? world.player
        : (world.ships.find((ship) => ship.id === world.selectedId) ??
          world.player),
    [world],
  );
  const blueFc = world.ships.find((ship) => ship.id === "blue-fc")!;
  const interceptionRate = world.stats.missilesLaunched
    ? (world.stats.missilesIntercepted / world.stats.missilesLaunched) * 100
    : 0;
  const currentReplay = importedReplay ?? simulation.exportReplay();
  const currentReport = importedReplay
    ? reportFromReplay(importedReplay)
    : simulation.getAfterActionReport();
  const highScores = JSON.parse(
    localStorage.getItem("efft-high-scores") ?? "{}",
  ) as Record<string, number>;

  const openEditor = () => {
    if (simulationRef.current.world.status === "running")
      simulationRef.current.pause();
    refresh();
    setDrawerOpen(true);
  };

  return (
    <main className={`app-shell ${highContrast ? "high-contrast" : ""}`}>
      <div className="desktop-recommendation">
        Tactical density is optimized for displays wider than 1,000 px. All
        controls remain available.
      </div>

      <TacticalScene
        simulation={simulation}
        tacticalOverlay={tacticalOverlay}
        missileTrailMode={missileTrailMode}
        onMoveDirection={move}
      />

      <header className="top-command-bar panel-glass">
        <div className="top-actions">
          <button
            type="button"
            aria-label="TACTICAL"
            className={tacticalOverlay ? "active utility-cyan" : "utility-cyan"}
            onClick={() => setTacticalOverlay(!tacticalOverlay)}
          >
            <span>◎</span>
            <small>T</small>
          </button>
          <button
            type="button"
            aria-label="MISSILE TRAILS"
            className={
              missileTrailMode === "enhanced"
                ? "active utility-cyan"
                : "utility-cyan"
            }
            onClick={toggleMissileTrails}
            title={
              missileTrailMode === "enhanced"
                ? "Use subtle EVE-style missile trails (L)"
                : "Enhance missile trail visibility (L)"
            }
          >
            <span>≋</span>
            <small>
              {missileTrailMode === "enhanced" ? "TRAIL+" : "TRAIL"}
            </small>
          </button>
          <button
            type="button"
            aria-label="SCENARIO"
            className="utility-amber"
            onClick={openEditor}
          >
            <span>⌁</span>
            <small>CFG</small>
          </button>
          <button
            type="button"
            aria-label="CONTRAST"
            className={highContrast ? "active utility-red" : "utility-red"}
            onClick={() => {
              const next = !highContrast;
              setHighContrast(next);
              localStorage.setItem("efft-high-contrast", String(next));
            }}
          >
            <span>◉</span>
            <small>VIS</small>
          </button>
          <button
            type="button"
            aria-label={world.status === "running" ? "PAUSE" : "RESUME"}
            className="pause-button utility-red"
            onClick={() => {
              simulationRef.current.togglePause();
              refresh();
            }}
          >
            <span>{world.status === "running" ? "Ⅱ" : "▶"}</span>
            <small>{world.status === "running" ? "PAUSE" : "RUN"}</small>
          </button>
        </div>
        <div className="brand-lockup">
          <span className="brand-mark">⌾</span>
          <div>
            <strong>FLEET FIREWALL // NESTOR</strong>
            <small>1 HZ AUTHORITY · {world.scenario.difficulty}</small>
          </div>
        </div>
        <label className="scenario-select">
          <span>EXERCISE</span>
          <select
            value={
              SCENARIOS.some((item) => item.id === world.scenario.id)
                ? world.scenario.id
                : "custom"
            }
            onChange={(event) => {
              if (event.target.value === "daily")
                replaceScenario(dailyScenario());
              else {
                const next = SCENARIOS.find(
                  (item) => item.id === event.target.value,
                );
                if (next) replaceScenario(next);
              }
            }}
          >
            {SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value="daily">Daily deterministic seed</option>
            {!SCENARIOS.some((item) => item.id === world.scenario.id) && (
              <option value="custom">Custom scenario</option>
            )}
          </select>
        </label>
        <div className="scenario-progress">
          <span>LIVE</span>
          <i>
            <b
              style={{
                width: `${Math.min(100, (world.tick / world.scenario.durationTicks) * 100)}%`,
              }}
            />
          </i>
          <span>{world.scenario.durationTicks}s</span>
        </div>
      </header>

      <div
        className={`warning-banner warning-${world.analysis.safetyState.toLowerCase()}`}
      >
        <span>{world.analysis.warning}</span>
        <small>
          {world.analysis.fleetsCovered}/{world.fleets.length} CORRIDORS ·{" "}
          {world.analysis.urgency}
        </small>
      </div>

      <SelectedPanel
        world={world}
        selected={selected}
        onMove={move}
        onStop={stop}
        onMatchBlue={matchBlue}
        onWarpFleet={warpFleet}
      />
      <Overview
        world={world}
        onSelect={(id) => {
          simulationRef.current.setSelected(id);
          refresh();
        }}
      />

      <aside className="position-panel panel-glass">
        <header className="panel-header compact">
          <div>
            <span className="eyebrow">FIREWALL SOLUTION</span>
            <strong>Positioning</strong>
          </div>
          <div
            className={`position-score score-${Math.floor(world.analysis.score / 20)}`}
          >
            {world.analysis.score}
          </div>
        </header>
        <div className="position-score-track">
          <i style={{ width: `${world.analysis.score}%` }} />
        </div>
        <dl className="position-grid">
          <div>
            <dt>Ideal region</dt>
            <dd>{formatDistance(world.analysis.distanceToIdeal)}</dd>
          </div>
          <div>
            <dt>Nearest blue</dt>
            <dd>{formatDistance(world.analysis.nearestFriendlyDistance)}</dd>
          </div>
          <div>
            <dt>Blue FC</dt>
            <dd>{formatDistance(world.analysis.distanceToBlueFc)}</dd>
          </div>
          <div>
            <dt>Stopping point</dt>
            <dd>{formatDistance(world.analysis.stoppingDistance)}</dd>
          </div>
          <div>
            <dt>Relative velocity</dt>
            <dd>
              {formatSpeed(length(sub(world.player.velocity, blueFc.velocity)))}
            </dd>
          </div>
          <div>
            <dt>Safe to pulse</dt>
            <dd
              className={world.analysis.safeToPulse ? "positive" : "negative"}
            >
              {world.analysis.safeToPulse ? "YES" : "NO"}
            </dd>
          </div>
        </dl>
        {world.scenario.assistance === "full" && (
          <button
            className="align-solution"
            type="button"
            onClick={() =>
              move(sub(world.analysis.idealPosition, world.player.position))
            }
          >
            ALIGN TO PREDICTED CORRIDOR
            <span>{formatDistance(world.analysis.distanceToIdeal)}</span>
          </button>
        )}
      </aside>

      <aside className="stats-panel panel-glass">
        <span>
          <b>{world.stats.missilesIntercepted}</b>
          INTERCEPTED
        </span>
        <span>
          <b>{world.stats.missilesImpacted}</b>
          IMPACTED
        </span>
        <span>
          <b>{Math.round(interceptionRate)}%</b>
          RATE
        </span>
        <span>
          <b>{world.missiles.length}</b>
          IN FLIGHT
        </span>
      </aside>

      <div className="target-rail" aria-label="Hostile fleet target cards">
        {world.fleets.map((fleet) => {
          const fc = world.ships.find((ship) => ship.id === fleet.fcId)!;
          return (
            <button
              type="button"
              key={fleet.id}
              className={world.selectedId === fleet.fcId ? "selected" : ""}
              onClick={() => {
                simulationRef.current.setSelected(fleet.fcId);
                refresh();
              }}
              style={{ borderTopColor: fleet.color }}
            >
              <span>{fleet.name}</span>
              <strong>
                {fc.visible
                  ? formatDistance(distance(fc.position, world.player.position))
                  : "IN WARP"}
              </strong>
              <small>
                {Math.round(fleet.engagementRange / 1000)} km ·{" "}
                {fleet.propulsion === "microwarpdrive"
                  ? "MWD"
                  : fleet.propulsion === "afterburner"
                    ? "AB"
                    : "BASE"}{" "}
                {Math.round(fleet.throttle * 100)}% · {fleet.activeMissiles}{" "}
                missiles
              </small>
              <i>
                <b
                  style={{
                    width: `${fleet.cohesion * 100}%`,
                    backgroundColor: fleet.color,
                  }}
                />
              </i>
            </button>
          );
        })}
      </div>

      <div
        className="vertical-controls panel-glass"
        aria-label="Vertical movement controls"
      >
        <button
          type="button"
          onClick={() =>
            move({
              ...world.player.desiredDirection,
              y: world.player.desiredDirection.y + 0.6,
            })
          }
        >
          R · CLIMB
        </button>
        <span>Y {Math.round(world.player.position.y / 1000)} KM</span>
        <button
          type="button"
          onClick={() =>
            move({
              ...world.player.desiredDirection,
              y: world.player.desiredDirection.y - 0.6,
            })
          }
        >
          F · DESCEND
        </button>
      </div>

      <Hud
        world={world}
        onSmartbomb={(slot) => issue({ type: "smartbomb", slot })}
        onPropulsion={(mode: PropulsionMode) =>
          issue({ type: "propulsion", mode })
        }
        onSpeed={(value) => issue({ type: "speed", value })}
        onStop={stop}
        onMatchBlue={matchBlue}
      />

      {world.status === "briefing" && !briefingDismissed && (
        <section className="briefing-card panel-solid">
          <span className="eyebrow">
            SCENARIO READY · {world.scenario.difficulty}
          </span>
          <h1>{world.scenario.name}</h1>
          <p>{world.scenario.description}</p>
          <div className="briefing-facts">
            <span>
              {world.fleets.length} HOSTILE FC
              {world.fleets.length > 1 ? "S" : ""}
            </span>
            <span>
              {
                world.ships.filter((ship) => ship.alignment === "friendly")
                  .length
              }{" "}
              BLUE SHIPS
            </span>
            <span>1 HZ AUTHORITY</span>
            <span>HIGH SCORE {highScores[world.scenario.id] ?? "—"}</span>
          </div>
          <div className="briefing-actions">
            <button type="button" onClick={openEditor}>
              Configure
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                simulationRef.current.start();
                setBriefingDismissed(true);
                refresh();
              }}
            >
              Begin exercise
            </button>
          </div>
        </section>
      )}

      {world.scenario.tutorial &&
        world.status === "running" &&
        world.tick < 24 && (
          <section className="tutorial-callout panel-solid">
            <span>
              TRAINING STEP {Math.min(4, Math.floor(world.tick / 6) + 1)} / 4
            </span>
            <strong>
              {world.tick < 6
                ? "Orbit the camera and read the right-side overview."
                : world.tick < 12
                  ? "Double-click space ahead of the missile corridor to align."
                  : world.tick < 18
                    ? "Use AB for controlled correction; watch your stopping estimate."
                    : "Pulse F1 only when a missile is sampled inside 7 km."}
            </strong>
          </section>
        )}

      <ScenarioDrawer
        open={drawerOpen}
        scenario={world.scenario}
        onClose={() => setDrawerOpen(false)}
        onApply={(scenario) => {
          setDrawerOpen(false);
          replaceScenario(scenario);
        }}
        onImportReplay={(replay) => {
          setImportedReplay(replay);
          setDrawerOpen(false);
          setReviewOpen(true);
        }}
      />

      <AfterAction
        open={reviewOpen}
        report={currentReport}
        replay={currentReplay}
        onClose={() => setReviewOpen(false)}
        onRestart={() => replaceScenario(world.scenario, true)}
      />
    </main>
  );
}
