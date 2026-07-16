import {
  distance,
  formatDistance,
  formatSpeed,
  length,
  sub,
} from "../simulation/math";
import type { Ship, Vec3, WorldState } from "../simulation/types";

interface SelectedPanelProps {
  world: WorldState;
  selected: Ship;
  onMove: (direction: Vec3) => void;
  onStop: () => void;
  onMatchBlue: () => void;
  onWarpFleet: (fleetId: string) => void;
}

export function SelectedPanel({
  world,
  selected,
  onMove,
  onStop,
  onMatchBlue,
  onWarpFleet,
}: SelectedPanelProps) {
  const isPlayer = selected.id === "player";
  const toSelected = sub(selected.position, world.player.position);
  const fleet = world.fleets.find((item) => item.id === selected.fleetId);
  const incoming = world.missiles.filter(
    (missile) => missile.targetShipId === selected.id,
  ).length;
  const warpQueued = fleet
    ? world.commandQueue.some(
        (command) =>
          command.type === "warp-fleet" && command.fleetId === fleet.id,
      )
    : false;

  return (
    <aside className="selected-panel panel-glass">
      <header className="panel-header compact">
        <div>
          <span className="eyebrow">SELECTED ITEM</span>
          <strong>{selected.name}</strong>
        </div>
        <span className={`alignment-dot ${selected.alignment}`} />
      </header>
      <dl className="selected-metrics">
        <div>
          <dt>Type</dt>
          <dd>{selected.type}</dd>
        </div>
        <div>
          <dt>Fleet</dt>
          <dd>{selected.fleetId}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>
            {formatDistance(distance(selected.position, world.player.position))}
          </dd>
        </div>
        <div>
          <dt>Velocity</dt>
          <dd>{formatSpeed(length(selected.velocity))}</dd>
        </div>
        <div>
          <dt>Propulsion</dt>
          <dd>{selected.propulsion}</dd>
        </div>
        <div>
          <dt>Missile pressure</dt>
          <dd>{incoming}</dd>
        </div>
      </dl>
      {fleet && (
        <div className="cohesion-line">
          <span>FORMATION COHESION</span>
          <i>
            <b
              style={{
                width: `${fleet.cohesion * 100}%`,
                background: fleet.color,
              }}
            />
          </i>
          <strong>{Math.round(fleet.cohesion * 100)}%</strong>
        </div>
      )}
      <p className="selected-command">{selected.command}</p>
      {!isPlayer && (
        <div className="selected-actions">
          {fleet && (
            <button
              type="button"
              className="warp-action"
              onClick={() => onWarpFleet(fleet.id)}
              disabled={fleet.warpInTick > 0 || warpQueued}
            >
              {fleet.warpInTick > 0
                ? "In warp"
                : warpQueued
                  ? "Warp queued"
                  : "Warp fleet"}
            </button>
          )}
          <button type="button" onClick={() => onMove(toSelected)}>
            Approach
          </button>
          <button
            type="button"
            onClick={() =>
              onMove({
                x: -toSelected.z,
                y: toSelected.y * 0.2,
                z: toSelected.x,
              })
            }
          >
            Orbit
          </button>
          <button type="button" onClick={onStop}>
            Hold range
          </button>
          <button type="button" onClick={onMatchBlue}>
            Match blue
          </button>
        </div>
      )}
    </aside>
  );
}
