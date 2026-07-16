import type { CSSProperties } from "react";
import { formatDistance, formatSpeed, length } from "../simulation/math";
import { maximumVelocity } from "../simulation/movement";
import type { PropulsionMode, WorldState } from "../simulation/types";

interface HudProps {
  world: WorldState;
  onSmartbomb: (slot: number) => void;
  onPropulsion: (mode: PropulsionMode) => void;
  onSpeed: (amount: number) => void;
  onStop: () => void;
  onMatchBlue: () => void;
}

export function Hud({
  world,
  onSmartbomb,
  onPropulsion,
  onSpeed,
  onStop,
  onMatchBlue,
}: HudProps) {
  const speed = length(world.player.velocity);
  const maximum = maximumVelocity(
    world.player.baseMaxVelocity,
    world.player.propulsion,
    world.scenario.skirmishLinks,
  );
  const speedRatio = Math.min(1, speed / Math.max(1, maximum));
  const queuedSlots = new Set(
    world.commandQueue
      .filter((command) => command.type === "smartbomb")
      .map((command) => command.slot),
  );
  const queuedPropulsion = world.commandQueue
    .filter((command) => command.type === "propulsion")
    .at(-1)?.mode;
  const propulsionState = (mode: PropulsionMode) => {
    const remaining = Math.max(0, world.player.propulsionEndsTick - world.tick);
    if (
      world.player.propulsion === mode &&
      world.player.propulsionTarget === "none"
    )
      return `STOPPING ${remaining}s`;
    if (world.player.propulsion === mode) {
      if (world.player.propulsionTarget !== mode) return `SWITCH ${remaining}s`;
      return `ACTIVE ${remaining}s`;
    }
    if (queuedPropulsion === mode || world.player.propulsionTarget === mode)
      return world.player.propulsion === "none"
        ? "QUEUED"
        : `QUEUED ${remaining}s`;
    return "OFF";
  };
  const propulsionClass = (mode: PropulsionMode) =>
    [
      "module",
      "propulsion",
      mode === "afterburner" ? "ab" : "mwd",
      world.player.propulsion === mode ? "active" : "",
      world.player.propulsion === mode && world.player.propulsionTarget !== mode
        ? "deactivating"
        : "",
      (queuedPropulsion === mode || world.player.propulsionTarget === mode) &&
      world.player.propulsion !== mode
        ? "queued"
        : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <section className="ship-hud" aria-label="Nestor ship controls">
      <div className="speed-controls panel-glass">
        <button type="button" onClick={onStop} title="Stop ship (Space)">
          ■
        </button>
        <button type="button" onClick={() => onSpeed(0.25)}>
          ¼
        </button>
        <button type="button" onClick={() => onSpeed(0.5)}>
          ½
        </button>
        <button type="button" onClick={() => onSpeed(1)} title="Full speed (W)">
          ▲
        </button>
        <button
          type="button"
          onClick={onMatchBlue}
          title="Match Blue FC velocity"
        >
          ≋
        </button>
      </div>

      <div className="hud-core">
        <div
          className="capacitor-ring"
          style={
            {
              "--capacitor-angle": `${world.capacitor * 360}deg`,
              "--speed-angle": `${speedRatio * 300}deg`,
            } as CSSProperties
          }
        >
          <div className="health-arcs" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="capacitor-center">
            <strong>{Math.round(world.capacitor * 100)}%</strong>
            <span>{formatSpeed(speed)}</span>
            <small>{formatSpeed(maximum)} MAX</small>
          </div>
        </div>
        <div className="hud-status-row">
          <span
            className={`safety safety-${world.analysis.safetyState.toLowerCase()}`}
          >
            {world.analysis.safetyState}
          </span>
          <span>STOP {formatDistance(world.analysis.stoppingDistance)}</span>
          <span>{world.player.propulsion.toUpperCase()}</span>
        </div>
      </div>

      <div className="module-rack">
        {world.modules.map((module) => {
          const remaining = Math.max(0, module.readyTick - world.tick);
          const cycleProgress =
            remaining > 0 ? 1 - remaining / module.cycleSeconds : 1;
          return (
            <button
              className={`module smartbomb ${module.active ? "active cycling" : ""} ${module.deactivating ? "deactivating" : ""} ${queuedSlots.has(module.slot) ? "queued" : ""}`}
              key={module.slot}
              type="button"
              onClick={() => onSmartbomb(module.slot)}
              aria-label={`Toggle smartbomb ${module.slot}`}
              aria-pressed={module.active}
              style={
                { "--cycle": `${cycleProgress * 360}deg` } as CSSProperties
              }
            >
              <span className="module-key">F{module.slot}</span>
              <span className="module-icon">✹</span>
              <small>
                {module.deactivating
                  ? `STOP ${remaining}s`
                  : module.active
                    ? `${remaining}s`
                    : module.missilesDestroyed}
              </small>
            </button>
          );
        })}
        <button
          className={propulsionClass("afterburner")}
          type="button"
          onClick={() => onPropulsion("afterburner")}
          aria-label={`Afterburner ${propulsionState("afterburner").toLowerCase()}. Toggle afterburner`}
          aria-pressed={world.player.propulsion === "afterburner"}
          title="Toggle 100MN afterburner (F8)"
        >
          <span className="module-key">F8</span>
          <strong className="propulsion-label">AB</strong>
          <small>{propulsionState("afterburner")}</small>
        </button>
        <button
          className={propulsionClass("microwarpdrive")}
          type="button"
          onClick={() => onPropulsion("microwarpdrive")}
          aria-label={`Microwarpdrive ${propulsionState("microwarpdrive").toLowerCase()}. Toggle microwarpdrive`}
          aria-pressed={world.player.propulsion === "microwarpdrive"}
          title="Toggle 500MN microwarpdrive (F9)"
        >
          <span className="module-key">F9</span>
          <strong className="propulsion-label">MWD</strong>
          <small>{propulsionState("microwarpdrive")}</small>
        </button>
      </div>
    </section>
  );
}
