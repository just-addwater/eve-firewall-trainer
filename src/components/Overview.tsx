import { useMemo, useState } from "react";
import {
  distance,
  formatDistance,
  formatSpeed,
  length,
} from "../simulation/math";
import type { Ship, WorldState } from "../simulation/types";

interface OverviewProps {
  world: WorldState;
  onSelect: (id: string) => void;
}

type Tab = "All" | "Friendly" | "Hostile" | "FCs" | "Missiles";

export function Overview({ world, onSelect }: OverviewProps) {
  const [tab, setTab] = useState<Tab>("All");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const ships = world.ships
      .filter((ship) => ship.hp > 0 && ship.visible)
      .filter((ship) => {
        if (tab === "Friendly") return ship.alignment === "friendly";
        if (tab === "Hostile") return ship.alignment === "hostile";
        if (tab === "FCs") return ship.role === "fc";
        if (tab === "Missiles") return false;
        return true;
      })
      .filter((ship) => ship.name.toLowerCase().includes(search.toLowerCase()))
      .sort(
        (first, second) =>
          distance(first.position, world.player.position) -
          distance(second.position, world.player.position),
      );
    return ships.slice(0, 40);
  }, [search, tab, world]);

  return (
    <aside className="overview panel-glass" aria-label="Tactical overview">
      <header className="panel-header">
        <div>
          <span className="eyebrow">TACTICAL</span>
          <strong>Overview</strong>
        </div>
        <span className="entity-count">
          {world.ships.length + world.missiles.length}
        </span>
      </header>
      <div className="overview-tabs" role="tablist">
        {(["All", "Friendly", "Hostile", "FCs", "Missiles"] as Tab[]).map(
          (name) => (
            <button
              className={tab === name ? "active" : ""}
              key={name}
              type="button"
              onClick={() => setTab(name)}
              role="tab"
              aria-selected={tab === name}
            >
              {name}
            </button>
          ),
        )}
      </div>
      <label className="overview-search">
        <span>⌕</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter overview"
          aria-label="Filter overview"
        />
      </label>
      <div className="overview-columns" aria-hidden="true">
        <span>NAME / TYPE</span>
        <span>DIST</span>
        <span>VEL</span>
      </div>
      <div className="overview-list">
        {tab === "Missiles" ? (
          <MissileRows world={world} />
        ) : (
          rows.map((ship) => (
            <ShipRow
              key={ship.id}
              ship={ship}
              world={world}
              selected={world.selectedId === ship.id}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function ShipRow({
  ship,
  world,
  selected,
  onSelect,
}: {
  ship: Ship;
  world: WorldState;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const fleetColor =
    ship.alignment === "friendly"
      ? "#54d6ff"
      : (world.fleets.find((fleet) => fleet.id === ship.fleetId)?.color ??
        "#ff6b5f");
  const incoming = world.missiles.filter(
    (missile) => missile.targetShipId === ship.id,
  ).length;
  return (
    <button
      type="button"
      className={`overview-row ${selected ? "selected" : ""}`}
      onClick={() => onSelect(ship.id)}
      onDoubleClick={() => onSelect(ship.id)}
    >
      <span className="standing-mark" style={{ color: fleetColor }}>
        ◇
      </span>
      <span className="overview-name">
        <strong>{ship.name}</strong>
        <small>
          {ship.role === "fc" ? "FC · " : ""}
          {ship.type} {incoming > 0 ? `· ${incoming} IN` : ""}
        </small>
      </span>
      <span>
        {formatDistance(distance(ship.position, world.player.position))}
      </span>
      <span>{formatSpeed(length(ship.velocity))}</span>
    </button>
  );
}

function MissileRows({ world }: { world: WorldState }) {
  return (
    <>
      {world.fleets.map((fleet) => {
        const missiles = world.missiles.filter(
          (missile) => missile.fleetId === fleet.id,
        );
        const nextImpact = missiles.length
          ? Math.max(
              0,
              Math.min(
                ...missiles.map(
                  (missile) => missile.estimatedImpactTick - world.tick,
                ),
              ),
            )
          : null;
        return (
          <div className="missile-summary" key={fleet.id}>
            <i style={{ backgroundColor: fleet.color }} />
            <span>
              <strong>{fleet.name}</strong>
              <small>{Math.round(fleet.missileSpeed / 1000)} km/s</small>
            </span>
            <b>{missiles.length}</b>
            <em>{nextImpact === null ? "—" : `${nextImpact}s`}</em>
          </div>
        );
      })}
    </>
  );
}
