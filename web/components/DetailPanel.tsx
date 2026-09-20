"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Minus,
  Radio,
  Wifi,
} from "lucide-react";
import {
  formatReadingAge,
  liveSourceKind,
  statusFromDensity,
  trendDirection,
  type LocationDef,
  type ReadingState,
} from "@/lib/crowd";
import SimGraphs from "@/components/SimGraphs";

type Props = {
  location: LocationDef;
  selectedId: string | null;
  state: Record<string, ReadingState>;
  bestId: string | null;
  demoMode: boolean;
  sheetExpanded: boolean;
  meta: string;
  liveLoading: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onSlider: (id: string, value: number) => void;
  revealSeq: number;
};

function TrendGlyph({ dir }: { dir: "up" | "down" | "flat" | "none" }) {
  if (dir === "up") return <ArrowUpRight size={16} aria-label="trending up" />;
  if (dir === "down")
    return <ArrowDownRight size={16} aria-label="trending down" />;
  if (dir === "flat") return <ArrowRight size={16} aria-label="stable" />;
  return <Minus size={16} aria-hidden />;
}

function Dock({
  retracted,
  label,
  onToggle,
  front,
  onBringFront,
  children,
}: {
  retracted: boolean;
  label: string;
  onToggle: () => void;
  front: boolean;
  onBringFront: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`detail-dock${retracted ? " is-retracted" : ""}${front ? " is-front" : " is-back"}`}
      onClick={front ? undefined : onBringFront}
    >
      <button
        type="button"
        className="dock-toggle"
        aria-expanded={!retracted}
        aria-label={retracted ? `Show ${label}` : `Hide ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {retracted ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
      {children}
    </div>
  );
}

export default function DetailPanel({
  location: loc,
  selectedId,
  state,
  bestId,
  demoMode,
  sheetExpanded,
  meta,
  liveLoading,
  onCollapse,
  onExpand,
  onSlider,
  revealSeq,
}: Props) {
  const reduceMotion = useReducedMotion();
  const reading = selectedId === loc.id ? state[loc.id] : undefined;
  const dragStartY = useRef<number | null>(null);
  const [locRetracted, setLocRetracted] = useState(false);
  const [graphsRetracted, setGraphsRetracted] = useState(false);
  const [front, setFront] = useState<"location" | "graphs">("location");

  useEffect(() => {
    setLocRetracted(false);
    setGraphsRetracted(false);
    setFront("location");
  }, [revealSeq, loc.id]);

  function onHandlePointerDown(e: React.PointerEvent) {
    dragStartY.current = e.clientY;
  }

  function onHandlePointerUp(e: React.PointerEvent) {
    const start = dragStartY.current;
    dragStartY.current = null;
    if (start == null) return;
    const dy = e.clientY - start;
    if (dy < -40) onExpand();
  }

  return (
    <AnimatePresence mode="wait">
      {loc && reading ? (
        <motion.aside
          key={loc.id}
          className={`detail-panel${sheetExpanded ? " is-expanded" : " is-peek"}`}
          data-front={front}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          aria-label={`${loc.label} details`}
        >
            <Dock
              retracted={locRetracted}
              label="location"
              front={front === "location"}
              onBringFront={() => setFront("location")}
              onToggle={() => setLocRetracted((v) => !v)}
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
            </div>

            <DensityBlock
              loc={loc}
              reading={reading}
              demoMode={demoMode}
              onPeekClick={sheetExpanded ? undefined : onExpand}
            />

            <div className="detail-expanded">
              <div className="detail-chips">
                {demoMode ? (
                  loc.liveSensor ? (
                    <span className="sensor-chip live">
                      <Radio size={12} aria-hidden /> Sensor
                    </span>
                  ) : (
                    <span className="sensor-chip">
                      <Wifi size={12} aria-hidden /> Preview
                    </span>
                  )
                ) : loc.liveSensor ? (
                  <LiveSourceChip
                    src={reading.src}
                    createdAt={reading.created_at}
                  />
                ) : (
                  <span className="sensor-chip">
                    <Wifi size={12} aria-hidden /> Coming soon
                  </span>
                )}
                {bestId === loc.id ? (
                  <span className="sensor-chip best">Best pick</span>
                ) : null}
              </div>

              {demoMode ? (
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
              ) : null}

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

              {demoMode ? (
              <p className="privacy-note">
                Ambient WiFi activity only — no device tracking, no headcount.
              </p>
              ) : null}
            </div>
            </div>
            </Dock>
            {loc.liveSensor ? (
            <Dock
              retracted={graphsRetracted}
              label="people over time"
              front={front === "graphs"}
              onBringFront={() => {
                setFront("graphs");
                onExpand();
              }}
              onToggle={() => setGraphsRetracted((v) => !v)}
            >
            <SimGraphs
              locationId={loc.id}
              live={!demoMode}
              leading={
                <button
                  type="button"
                  className="sheet-handle"
                  aria-label={sheetExpanded ? "Collapse details" : "Expand details"}
                  aria-expanded={sheetExpanded}
                  onPointerDown={onHandlePointerDown}
                  onPointerUp={onHandlePointerUp}
                />
              }
            />
            </Dock>
            ) : null}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

function LiveSourceChip({
  src,
  createdAt,
}: {
  src: string | null | undefined;
  createdAt: string | null;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const kind = liveSourceKind(src, createdAt, nowMs);
  if (kind === "sim") {
    return (
      <span className="sensor-chip sim">
        <Wifi size={12} aria-hidden /> Simulated
      </span>
    );
  }
  if (kind === "live") {
    return (
      <span className="sensor-chip live">
        <Radio size={12} aria-hidden /> Live ESP32
      </span>
    );
  }
  if (kind === "stale") {
    return (
      <span className="sensor-chip">
        <Radio size={12} aria-hidden /> Last ESP32 reading
      </span>
    );
  }
  return (
    <span className="sensor-chip">
      <Wifi size={12} aria-hidden /> No ESP32 row
    </span>
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
