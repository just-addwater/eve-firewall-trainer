import { useEffect, useRef, useState } from "react";
import { SCENARIOS, cloneScenario } from "../simulation/scenarios";
import { fleetMaximumVelocity } from "../simulation/movement";
import type {
  AssistanceLevel,
  HostileFleetConfig,
  PropulsionMode,
  ReplayData,
  ScenarioConfig,
} from "../simulation/types";

interface ScenarioDrawerProps {
  open: boolean;
  scenario: ScenarioConfig;
  onClose: () => void;
  onApply: (scenario: ScenarioConfig) => void;
  onImportReplay: (replay: ReplayData) => void;
}

const ASSISTANCE: AssistanceLevel[] = ["full", "partial", "minimal", "expert"];
const PROPULSION: PropulsionMode[] = ["none", "afterburner", "microwarpdrive"];
const formatDuration = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const formatFleetSpeed = (mode: PropulsionMode, throttle: number): string => {
  const speed = fleetMaximumVelocity(mode) * throttle;
  return speed >= 1000
    ? `${(speed / 1000).toFixed(2)} km/s`
    : `${Math.round(speed)} m/s`;
};

export function ScenarioDrawer({
  open,
  scenario,
  onClose,
  onApply,
  onImportReplay,
}: ScenarioDrawerProps) {
  const [draft, setDraft] = useState<ScenarioConfig>(() =>
    cloneScenario(scenario),
  );
  const [savedNotice, setSavedNotice] = useState("");
  const scenarioImportRef = useRef<HTMLInputElement>(null);
  const replayImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setDraft(cloneScenario(scenario));
  }, [open, scenario]);

  if (!open) return null;

  const update = <K extends keyof ScenarioConfig>(
    key: K,
    value: ScenarioConfig[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setFleetCount = (count: number) => {
    const source = SCENARIOS.find(
      (item) => item.id === "three-fc-rotation",
    )!.hostiles;
    setDraft((current) => ({
      ...current,
      hostiles: Array.from(
        { length: count },
        (_, index) =>
          cloneScenario({
            ...current,
            hostiles: [current.hostiles[index] ?? source[index]!],
          }).hostiles[0]!,
      ),
    }));
  };

  const updateFleet = (index: number, values: Partial<HostileFleetConfig>) => {
    setDraft((current) => ({
      ...current,
      hostiles: current.hostiles.map((fleet, fleetIndex) =>
        fleetIndex === index ? { ...fleet, ...values } : fleet,
      ),
    }));
  };

  const download = (name: string, value: unknown) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyLink = async () => {
    const hash = `#scenario=${encodeURIComponent(JSON.stringify(draft))}`;
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    await navigator.clipboard.writeText(url);
    setSavedNotice("Scenario link copied");
  };

  const savePreset = () => {
    const presets = JSON.parse(
      localStorage.getItem("efft-presets") ?? "[]",
    ) as ScenarioConfig[];
    const saved = {
      ...draft,
      id: `local-${Date.now()}`,
      name: `${draft.name} · Local`,
    };
    localStorage.setItem(
      "efft-presets",
      JSON.stringify([...presets.slice(-7), saved]),
    );
    setSavedNotice("Saved in this browser");
  };

  const readJson = async (file: File, type: "scenario" | "replay") => {
    const value = JSON.parse(await file.text()) as ScenarioConfig | ReplayData;
    if (type === "replay") {
      if (
        (value as ReplayData).version !== 1 ||
        !Array.isArray((value as ReplayData).frames)
      ) {
        throw new Error("Unsupported replay file");
      }
      onImportReplay(value as ReplayData);
      return;
    }
    const imported = value as ScenarioConfig;
    if (!imported.name || !Array.isArray(imported.hostiles))
      throw new Error("Invalid scenario file");
    setDraft(cloneScenario(imported));
    setSavedNotice("Scenario imported");
  };

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="scenario-drawer panel-solid"
        role="dialog"
        aria-modal="true"
        aria-label="Scenario editor"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <span className="eyebrow">TRAINING CONFIGURATION</span>
            <h2>Scenario editor</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scenario editor"
          >
            ×
          </button>
        </header>

        <div className="drawer-scroll">
          <section className="editor-section">
            <header>
              <span>01</span>
              <h3>Exercise</h3>
            </header>
            <label>
              Preset
              <select
                value={
                  SCENARIOS.some((item) => item.id === draft.id)
                    ? draft.id
                    : "custom"
                }
                onChange={(event) => {
                  const selected = SCENARIOS.find(
                    (item) => item.id === event.target.value,
                  );
                  if (selected) setDraft(cloneScenario(selected));
                }}
              >
                {SCENARIOS.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
                <option value="custom">Custom configuration</option>
              </select>
            </label>
            <div className="field-pair">
              <label>
                Duration
                <input
                  type="range"
                  min="60"
                  max="600"
                  step="30"
                  value={draft.durationTicks}
                  onChange={(event) =>
                    update("durationTicks", Number(event.target.value))
                  }
                />
                <output>{formatDuration(draft.durationTicks)}</output>
              </label>
              <label>
                Random seed
                <input
                  type="number"
                  value={draft.seed}
                  onChange={(event) =>
                    update("seed", Number(event.target.value))
                  }
                />
              </label>
            </div>
            <label>
              Assistance
              <div className="segmented-control">
                {ASSISTANCE.map((level) => (
                  <button
                    className={draft.assistance === level ? "active" : ""}
                    type="button"
                    key={level}
                    onClick={() => update("assistance", level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </label>
          </section>

          <section className="editor-section">
            <header>
              <span>02</span>
              <h3>Fleet geometry</h3>
            </header>
            <label>
              Hostile FC count
              <div className="segmented-control large">
                {[1, 2, 3].map((count) => (
                  <button
                    className={draft.hostiles.length === count ? "active" : ""}
                    type="button"
                    key={count}
                    onClick={() => setFleetCount(count)}
                  >
                    {count} FLEET{count > 1 ? "S" : ""}
                  </button>
                ))}
              </div>
            </label>
            <label>
              Blue movement
              <select
                value={draft.blueMovement}
                onChange={(event) =>
                  update(
                    "blueMovement",
                    event.target.value as ScenarioConfig["blueMovement"],
                  )
                }
              >
                <option value="hold">Hold position</option>
                <option value="line">Straight line</option>
                <option value="turn">Wide anchor turn</option>
                <option value="expand">Expanding formation</option>
                <option value="climb">Climb / descend</option>
                <option value="helix">Helical manoeuvre</option>
              </select>
            </label>
            <label>
              Blue propulsion
              <div className="segmented-control">
                {PROPULSION.map((mode) => (
                  <button
                    className={draft.bluePropulsion === mode ? "active" : ""}
                    type="button"
                    key={mode}
                    onClick={() => update("bluePropulsion", mode)}
                  >
                    {mode === "none"
                      ? "BASE"
                      : mode === "afterburner"
                        ? "AB"
                        : "MWD"}
                  </button>
                ))}
              </div>
            </label>
            <label>
              Blue anchor speed
              <input
                type="range"
                min="20"
                max="100"
                step="5"
                value={Math.round(draft.blueThrottle * 100)}
                onChange={(event) =>
                  update("blueThrottle", Number(event.target.value) / 100)
                }
              />
              <output>
                {formatFleetSpeed(draft.bluePropulsion, draft.blueThrottle)} ·{" "}
                {Math.round(draft.blueThrottle * 100)}%
              </output>
            </label>
            <label>
              Player skirmish links
              <div className="segmented-control">
                <button
                  className={draft.skirmishLinks ? "active" : ""}
                  type="button"
                  onClick={() => update("skirmishLinks", true)}
                >
                  ON
                </button>
                <button
                  className={!draft.skirmishLinks ? "active" : ""}
                  type="button"
                  onClick={() => update("skirmishLinks", false)}
                >
                  OFF
                </button>
              </div>
              <small>Rapid Deployment boosts the Nestor's AB/MWD bonus.</small>
            </label>
          </section>

          <section className="editor-section">
            <header>
              <span>03</span>
              <h3>Hostile fleet controls</h3>
            </header>
            <label>
              Missile firing pattern
              <div className="segmented-control">
                <button
                  className={!draft.staggeredMissiles ? "active" : ""}
                  type="button"
                  onClick={() => update("staggeredMissiles", false)}
                >
                  FULL VOLLEY
                </button>
                <button
                  className={draft.staggeredMissiles ? "active" : ""}
                  type="button"
                  onClick={() => update("staggeredMissiles", true)}
                >
                  STAGGERED
                </button>
              </div>
            </label>
            <div className="fleet-config-grid">
              {draft.hostiles.map((fleet, index) => (
                <article
                  className="fleet-config-card"
                  key={fleet.id}
                  style={{ borderLeftColor: fleet.color }}
                >
                  <header>
                    <i style={{ backgroundColor: fleet.color }} />
                    <strong>{fleet.name}</strong>
                    <small>11s launcher reload</small>
                  </header>
                  <label>
                    Engagement range
                    <input
                      type="range"
                      min="20"
                      max="100"
                      step="5"
                      value={fleet.engagementRange / 1000}
                      onChange={(event) =>
                        updateFleet(index, {
                          engagementRange: Number(event.target.value) * 1000,
                        })
                      }
                    />
                    <output>
                      {Math.round(fleet.engagementRange / 1000)} km
                    </output>
                  </label>
                  <label>
                    Propulsion
                    <select
                      value={fleet.propulsion}
                      onChange={(event) =>
                        updateFleet(index, {
                          propulsion: event.target.value as PropulsionMode,
                        })
                      }
                    >
                      <option value="none">Base speed</option>
                      <option value="afterburner">Afterburner</option>
                      <option value="microwarpdrive">Microwarpdrive</option>
                    </select>
                  </label>
                  <label>
                    Anchor speed
                    <input
                      type="range"
                      min="20"
                      max="100"
                      step="5"
                      value={Math.round(fleet.throttle * 100)}
                      onChange={(event) =>
                        updateFleet(index, {
                          throttle: Number(event.target.value) / 100,
                        })
                      }
                    />
                    <output>
                      {formatFleetSpeed(fleet.propulsion, fleet.throttle)} ·{" "}
                      {Math.round(fleet.throttle * 100)}%
                    </output>
                  </label>
                  <label>
                    Missile speed
                    <input
                      type="range"
                      min="2500"
                      max="13000"
                      step="250"
                      value={fleet.missileSpeed}
                      onChange={(event) =>
                        updateFleet(index, {
                          missileSpeed: Number(event.target.value),
                        })
                      }
                    />
                    <output>
                      {(fleet.missileSpeed / 1000).toFixed(2)} km/s
                    </output>
                  </label>
                </article>
              ))}
            </div>
          </section>

          <section className="editor-section compact-actions">
            <header>
              <span>04</span>
              <h3>Local files</h3>
            </header>
            <div className="file-actions">
              <button type="button" onClick={savePreset}>
                Save preset
              </button>
              <button
                type="button"
                onClick={() => download("firewall-scenario.json", draft)}
              >
                Export scenario
              </button>
              <button
                type="button"
                onClick={() => scenarioImportRef.current?.click()}
              >
                Import scenario
              </button>
              <button
                type="button"
                onClick={() => replayImportRef.current?.click()}
              >
                Import replay
              </button>
              <button type="button" onClick={copyLink}>
                Copy scenario link
              </button>
            </div>
            <input
              ref={scenarioImportRef}
              hidden
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void readJson(file, "scenario").catch(() =>
                    setSavedNotice("Invalid scenario file"),
                  );
              }}
            />
            <input
              ref={replayImportRef}
              hidden
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void readJson(file, "replay").catch(() =>
                    setSavedNotice("Invalid replay file"),
                  );
              }}
            />
            {savedNotice && <p className="save-notice">{savedNotice}</p>}
          </section>
        </div>

        <footer className="drawer-footer">
          <button
            type="button"
            className="secondary"
            onClick={() => setDraft(cloneScenario(SCENARIOS[0]!))}
          >
            Reset defaults
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onApply({ ...draft, id: draft.id || "custom" })}
          >
            Load scenario
          </button>
        </footer>
      </aside>
    </div>
  );
}
