"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Minus,
  Radio,
  Wifi,
  X,
} from "lucide-react";
import {
  getLocation,
  statusFromDensity,
  trendDirection,
  type LocationDef,
  type ReadingState,
  type Recommendation,
} from "@/lib/crowd";

type Props = {
  selectedId: string | null;
  state: Record<string, ReadingState>;
  recommendation: Recommendation;
  bestId: string | null;
  demoMode: boolean;
  meta: string;
  liveLoading: boolean;
  onClose: () => void;
  onSlider: (id: string, value: number) => void;
};

function TrendGlyph({
  dir,
}: {
  dir: "up" | "down" | "flat" | "none";
}) {
  if (dir === "up") return <ArrowUpRight size={16} aria-label="trending up" />;
  if (dir === "down")
    return <ArrowDownRight size={16} aria-label="trending down" />;
  if (dir === "flat") return <ArrowRight size={16} aria-label="stable" />;
  return <Minus size={16} aria-hidden />;
}

export default function DetailPanel({
  selectedId,
  state,
  recommendation,
  bestId,
  demoMode,
  meta,
  liveLoading,
  onClose,
  onSlider,
}: Props) {
  const reduceMotion = useReducedMotion();
  const loc = selectedId ? getLocation(selectedId) : undefined;
  const reading = selectedId ? state[selectedId] : undefined;

  return (
    <AnimatePresence mode="wait">
      {loc && reading ? (
        <motion.aside
          key={loc.id}
          className="detail-panel"
          initial={reduceMotion ? false : { x: 28, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reduceMotion ? undefined : { x: 20, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          aria-label={`${loc.label} details`}
        >
          <div className="detail-panel-inner">
            <div className="detail-header">
              <div>
                <p className="detail-kicker">Location</p>
                <h2>{loc.label}</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={onClose}
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
            </div>

            <div className="detail-chips">
              {loc.liveSensor ? (
                <span className="sensor-chip live">
                  <Radio size={12} aria-hidden /> Sensor
                </span>
              ) : (
                <span className="sensor-chip">
                  <Wifi size={12} aria-hidden /> Preview
                </span>
              )}
              {bestId === loc.id ? (
                <span className="sensor-chip best">Best pick</span>
              ) : null}
            </div>

            <DensityBlock loc={loc} reading={reading} />

            <section
              className={`recommendation compact tone-${recommendation.tone}`}
              aria-live="polite"
            >
              <p className="rec-label">Campus tip</p>
              <p className="rec-text">{recommendation.text}</p>
              <p className="rec-detail">{recommendation.detail}</p>
            </section>

            <p
              className={`meta-row${!demoMode && liveLoading ? " is-loading" : ""}`}
              role="status"
            >
              {!demoMode && liveLoading ? (
                <span className="spinner" aria-hidden />
              ) : (
                <Activity size={14} aria-hidden />
              )}
              <span>{meta}</span>
            </p>

            {demoMode ? (
              <div className="dev-panel embedded">
                <h3>Simulate density</h3>
                <p className="dev-hint">
                  Drag to change how busy this spot feels. Pins update live.
                </p>
                <label className="dev-slider-row">
                  <span className="dev-slider-label">
                    {loc.shortLabel}
                    <span className="dev-slider-val">
                      {reading.density ?? 0} ·{" "}
                      {statusFromDensity(reading.density).label}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={reading.density ?? 0}
                    className="dev-range"
                    onChange={(e) =>
                      onSlider(loc.id, Number(e.target.value))
                    }
                  />
                </label>
              </div>
            ) : null}

            <p className="privacy-note">
              Ambient WiFi activity only — no device tracking, no headcount.
            </p>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

function DensityBlock({
  loc,
  reading,
}: {
  loc: LocationDef;
  reading: ReadingState;
}) {
  const status = statusFromDensity(reading.density);
  const trend = trendDirection(reading.density, reading.prevDensity);
  const hasData = reading.density != null;
  const dens = reading.density ?? 0;
  const when = reading.created_at
    ? new Date(reading.created_at).toLocaleTimeString()
    : "";

  return (
    <div className="density-block">
      <div className="density-block-top">
        <span
          className={`density-readout${!hasData ? " unknown" : ""}`}
          aria-label={
            hasData ? `Density ${reading.density} of 100` : "No density data"
          }
        >
          {hasData ? reading.density : "—"}
        </span>
        <div className="trend-status">
          <TrendGlyph dir={trend} />
          <span className={`status-pill ${status.key}`}>{status.label}</span>
        </div>
      </div>
      <p className="sub">
        {hasData ? `${dens}/100` : loc.liveSensor ? "awaiting sensor" : "no data"}
        {when ? ` · ${when}` : ""}
      </p>
      <div className="density-bar" aria-hidden="true">
        <div
          className={`density-fill ${status.key}`}
          style={{ width: `${hasData ? dens : 0}%` }}
        />
      </div>
    </div>
  );
}
