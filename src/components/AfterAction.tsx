import { useEffect, useRef, useState } from "react";
import { formatDistance, formatSpeed } from "../simulation/math";
import type { AfterActionReport, ReplayData } from "../simulation/types";

interface AfterActionProps {
  open: boolean;
  report: AfterActionReport;
  replay: ReplayData;
  onClose: () => void;
  onRestart: () => void;
}

export function AfterAction({
  open,
  report,
  replay,
  onClose,
  onRestart,
}: AfterActionProps) {
  const [frameIndex, setFrameIndex] = useState(
    Math.max(0, replay.frames.length - 1),
  );
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!playing || replay.frames.length === 0) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) =>
        current + 1 >= replay.frames.length ? 0 : current + 1,
      );
    }, 180);
    return () => window.clearInterval(timer);
  }, [playing, replay.frames.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio, 2);
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(110, 182, 199, 0.17)";
    context.lineWidth = 1;
    for (let row = 1; row < 4; row += 1) {
      const y = (height / 4) * row;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    const plot = (values: number[], color: string, maximum: number) => {
      if (values.length < 2) return;
      context.beginPath();
      values.forEach((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - (value / maximum) * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.stroke();
    };
    plot(
      replay.frames.map((frame) => frame.positioningScore),
      "#74f5c5",
      100,
    );
    plot(
      replay.frames.map((frame) => frame.interceptionRate * 100),
      "#6bd8ff",
      100,
    );
    if (replay.frames.length > 1) {
      const markerX = (frameIndex / (replay.frames.length - 1)) * width;
      context.strokeStyle = "rgba(255,255,255,.8)";
      context.beginPath();
      context.moveTo(markerX, 0);
      context.lineTo(markerX, height);
      context.stroke();
    }
  }, [frameIndex, replay.frames]);

  if (!open) return null;
  const frame = replay.frames[frameIndex];

  const exportReplay = () => {
    const blob = new Blob([JSON.stringify(replay, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${replay.scenario.id}-replay.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="review-backdrop">
      <section
        className="after-action panel-solid"
        role="dialog"
        aria-modal="true"
        aria-label="After-action review"
      >
        <header className="review-header">
          <div>
            <span className="eyebrow">
              AUTHORITATIVE REPLAY · {replay.scenario.name}
            </span>
            <h2>After-action review</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close after-action review"
          >
            ×
          </button>
        </header>
        <div className="review-scoreline">
          <div className="final-score">
            <strong>{report.finalScore}</strong>
            <span>FINAL SCORE</span>
            <b>{report.rank}</b>
          </div>
          {[
            ["Interception", report.interceptionRate],
            ["Positioning", report.positioningGrade],
            ["Separation", report.safetyGrade],
            ["Response", report.responseGrade],
            ["Pulse efficiency", report.efficiencyGrade],
          ].map(([label, value]) => (
            <div className="grade" key={label as string}>
              <span>{label}</span>
              <i>
                <b style={{ width: `${Math.min(100, Number(value))}%` }} />
              </i>
              <strong>{Math.round(Number(value))}</strong>
            </div>
          ))}
        </div>
        <div className="review-body">
          <section className="review-graph-panel">
            <header>
              <h3>Position and interception over time</h3>
              <div className="graph-legend">
                <span className="green">Position</span>
                <span className="blue">Interception</span>
              </div>
            </header>
            <canvas ref={canvasRef} />
            <div className="replay-controls">
              <button
                type="button"
                onClick={() => setFrameIndex(Math.max(0, frameIndex - 1))}
              >
                ‹ SECOND
              </button>
              <button
                type="button"
                className={playing ? "active" : ""}
                onClick={() => setPlaying(!playing)}
              >
                {playing ? "PAUSE" : "PLAY"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setFrameIndex(
                    Math.min(replay.frames.length - 1, frameIndex + 1),
                  )
                }
              >
                SECOND ›
              </button>
              <input
                aria-label="Replay time"
                type="range"
                min="0"
                max={Math.max(0, replay.frames.length - 1)}
                value={frameIndex}
                onChange={(event) => setFrameIndex(Number(event.target.value))}
              />
              <strong>{frame?.tick ?? 0}s</strong>
            </div>
            {frame && (
              <div className="replay-frame-metrics">
                <span>POSITION {frame.positioningScore}</span>
                <span>ACTIVE MISSILES {frame.activeMissiles}</span>
                <span>
                  NEAREST BLUE {formatDistance(frame.nearestFriendly)}
                </span>
                <span>VELOCITY {formatSpeed(frame.playerSpeed)}</span>
              </div>
            )}
          </section>
          <section className="feedback-panel">
            <h3>Flight analysis</h3>
            <ol>
              {report.feedback.map((feedback, index) => (
                <li key={feedback}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{feedback}</p>
                </li>
              ))}
            </ol>
            <dl>
              <div>
                <dt>Missiles launched</dt>
                <dd>{replay.stats.missilesLaunched}</dd>
              </div>
              <div>
                <dt>Intercepted</dt>
                <dd>{replay.stats.missilesIntercepted}</dd>
              </div>
              <div>
                <dt>Impacted</dt>
                <dd>{replay.stats.missilesImpacted}</dd>
              </div>
              <div>
                <dt>Smartbomb pulses</dt>
                <dd>{replay.stats.smartbombPulses}</dd>
              </div>
            </dl>
          </section>
        </div>
        <footer className="review-footer">
          <button type="button" onClick={exportReplay}>
            Export replay JSON
          </button>
          <button type="button" onClick={onRestart}>
            Fly again
          </button>
        </footer>
      </section>
    </div>
  );
}
