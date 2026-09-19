"use client";

import { useEffect, useRef, useState } from "react";
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
  formatReadingAge,
  statusFromDensity,
  trendDirection,
  type LocationDef,
  type PlaceFields,
  type ReadingState,
  type Recommendation,
} from "@/lib/crowd";
import HistoryChart from "@/components/HistoryChart";
import type { HistoryPoint } from "@/lib/sim";

type Props = {
  location: LocationDef;
  selectedId: string | null;
  state: Record<string, ReadingState>;
  recommendation: Recommendation;
  bestId: string | null;
  demoMode: boolean;
  editPin: boolean;
  sheetExpanded: boolean;
  meta: string;
  liveLoading: boolean;
  history: HistoryPoint[];
  onClose: () => void;
  onCollapse: () => void;
  onExpand: () => void;
  onSlider: (id: string, value: number) => void;
  onPlaceChange: (place: PlaceFields) => void;
};

function TrendGlyph({ dir }: { dir: "up" | "down" | "flat" | "none" }) {
  if (dir === "up") return <ArrowUpRight size={16} aria-label="trending up" />;
  if (dir === "down")
    return <ArrowDownRight size={16} aria-label="trending down" />;
  if (dir === "flat") return <ArrowRight size={16} aria-label="stable" />;
  return <Minus size={16} aria-hidden />;
}

export default function DetailPanel({
  location: loc,
  selectedId,
  state,
  recommendation,
  bestId,
  demoMode,
  editPin,
  sheetExpanded,
  meta,
  liveLoading,
  history,
  onClose,
  onCollapse,
  onExpand,
  onSlider,
  onPlaceChange,
}: Props) {
  const reduceMotion = useReducedMotion();
  const reading = selectedId === loc.id ? state[loc.id] : undefined;
  const dragStartY = useRef<number | null>(null);

  function onHandlePointerDown(e: React.PointerEvent) {
    dragStartY.current = e.clientY;
  }

  function onHandlePointerUp(e: React.PointerEvent) {
    const start = dragStartY.current;
    dragStartY.current = null;
    if (start == null) return;
    const dy = e.clientY - start;
    if (dy < -40) onExpand();
    else if (dy > 40) onCollapse();
    else if (Math.abs(dy) < 8) {
      if (sheetExpanded) onCollapse();
      else onExpand();
    }
  }

  return (
    <AnimatePresence mode="wait">
      {loc && reading ? (
        <motion.aside
          key={loc.id}
          className={`detail-panel${sheetExpanded ? " is-expanded" : " is-peek"}`}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          aria-label={`${loc.label} details`}
        >
          <div className="detail-panel-inner">
            <button
              type="button"
              className="sheet-handle"
              aria-label={sheetExpanded ? "Collapse details" : "Expand details"}
              aria-expanded={sheetExpanded}
              onPointerDown={onHandlePointerDown}
              onPointerUp={onHandlePointerUp}
            />

            <div
              className="detail-header"
              onClick={
                sheetExpanded
                  ? undefined
                  : (e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      onExpand();
                    }
              }
            >
              <div>
                <p className="detail-kicker">Location</p>
                <h2>{loc.label}</h2>
              </div>
              <button
                type="button"
                className="icon-btn sheet-close-desktop"
                onClick={onClose}
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
              <button
                type="button"
                className="icon-btn sheet-collapse-mobile"
                onClick={onCollapse}
                aria-label="Collapse panel"
              >
                <X size={18} />
              </button>
            </div>

            <DensityBlock
              loc={loc}
              reading={reading}
              demoMode={demoMode}
              onPeekClick={sheetExpanded ? undefined : onExpand}
            />

            <p
              className="rec-text peek-tip"
              onClick={sheetExpanded ? undefined : onExpand}
            >
              {recommendation.text}
            </p>

            <div className="detail-expanded">
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

              {!demoMode ? <HistoryChart rows={history} /> : null}

              <section
                className={`recommendation compact tone-${recommendation.tone}`}
                aria-live="polite"
              >
                <p className="rec-label">Packed tip</p>
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
                      onChange={(e) => onSlider(loc.id, Number(e.target.value))}
                    />
                  </label>
                </div>
              ) : null}

              <div
                className={`dev-panel embedded pin-editor${editPin ? " is-open" : ""}`}
              >
                <h3>Pin location</h3>
                <p className="dev-hint">
                  Place name and Google Maps coordinates. The ESP32 still posts
                  under the id in location.config.json.
                </p>
                <label className="place-field">
                  <span>Place name</span>
                  <input
                    type="text"
                    value={loc.label}
                    autoComplete="off"
                    onChange={(e) =>
                      onPlaceChange({
                        id: loc.id,
                        label: e.target.value,
                        latitude: loc.coords.lat,
                        longitude: loc.coords.lng,
                      })
                    }
                  />
                </label>
                <label className="place-field">
                  <span>Latitude</span>
                  <input
                    type="number"
                    step="0.00001"
                    min={-90}
                    max={90}
                    value={loc.coords.lat}
                    onChange={(e) => {
                      const latitude = Number(e.target.value);
                      if (
                        !Number.isFinite(latitude) ||
                        latitude < -90 ||
                        latitude > 90
                      )
                        return;
                      onPlaceChange({
                        id: loc.id,
                        label: loc.label,
                        latitude,
                        longitude: loc.coords.lng,
                      });
                    }}
                  />
                </label>
                <label className="place-field">
                  <span>Longitude</span>
                  <input
                    type="number"
                    step="0.00001"
                    min={-180}
                    max={180}
                    value={loc.coords.lng}
                    onChange={(e) => {
                      const longitude = Number(e.target.value);
                      if (
                        !Number.isFinite(longitude) ||
                        longitude < -180 ||
                        longitude > 180
                      )
                        return;
                      onPlaceChange({
                        id: loc.id,
                        label: loc.label,
                        latitude: loc.coords.lat,
                        longitude,
                      });
                    }}
                  />
                </label>
              </div>

              <p className="privacy-note">
                Ambient WiFi activity only — no device tracking, no headcount.
              </p>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

function DensityBlock({
  loc,
  reading,
  demoMode,
  onPeekClick,
}: {
  loc: LocationDef;
  reading: ReadingState;
  demoMode: boolean;
  onPeekClick?: () => void;
}) {
  const status = statusFromDensity(reading.density);
  const trend = trendDirection(reading.density, reading.prevDensity);
  const hasData = reading.density != null;
  const dens = reading.density ?? 0;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (demoMode || !reading.created_at) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [demoMode, reading.created_at]);

  const age = !demoMode ? formatReadingAge(reading.created_at, nowMs) : null;
  const clock = reading.created_at
    ? new Date(reading.created_at).toLocaleTimeString()
    : "";
  const when = age ?? (clock ? clock : "");
  const showTelemetry =
    !demoMode &&
    loc.liveSensor &&
    (reading.avgRssi != null || reading.packetCount != null);

  return (
    <div
      className="density-block"
      onClick={onPeekClick}
      role={onPeekClick ? "button" : undefined}
      tabIndex={onPeekClick ? 0 : undefined}
      onKeyDown={
        onPeekClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPeekClick();
              }
            }
          : undefined
      }
    >
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
      <p className="sub density-meta">
        {hasData
          ? `${dens}/100`
          : loc.liveSensor
            ? "awaiting sensor"
            : "no data"}
        {when ? ` · ${when}` : ""}
      </p>
      {showTelemetry ? (
        <p className="sub telemetry">
          {reading.avgRssi != null
            ? `RSSI ${reading.avgRssi.toFixed(1)} dBm`
            : "RSSI —"}
          {" · "}
          {reading.packetCount != null
            ? `${reading.packetCount} packets`
            : "no packets"}
        </p>
      ) : null}
      <div className="density-bar" aria-hidden="true">
        <div
          className={`density-fill ${status.key}`}
          style={{ width: `${hasData ? dens : 0}%` }}
        />
      </div>
    </div>
  );
}
