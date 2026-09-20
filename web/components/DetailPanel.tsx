"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
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
  sheetExpanded: boolean;
  onExpand: () => void;
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
  front,
  onBringFront,
  children,
}: {
  front: boolean;
  onBringFront: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`detail-dock${front ? " is-front" : " is-back"}`}
      onClick={front ? undefined : onBringFront}
    >
      {children}
    </div>
  );
}

export default function DetailPanel({
  location: loc,
  selectedId,
  state,
  bestId,
  sheetExpanded,
  onExpand,
  revealSeq,
}: Props) {
  const reduceMotion = useReducedMotion();
  const reading = selectedId === loc.id ? state[loc.id] : undefined;
  const [front, setFront] = useState<"location" | "graphs">("location");

  useEffect(() => {
    setFront("location");
  }, [revealSeq, loc.id]);

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
              front={front === "location"}
              onBringFront={() => setFront("location")}
            >
            <div className="detail-panel-inner">
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
              onPeekClick={sheetExpanded ? undefined : onExpand}
            />

            <div className="detail-expanded">
              <div className="detail-chips">
                {loc.liveSensor ? (
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
            </div>
            </div>
            </Dock>
            {loc.liveSensor ? (
            <Dock
              front={front === "graphs"}
              onBringFront={() => {
                setFront("graphs");
                onExpand();
              }}
            >
            <SimGraphs locationId={loc.id} />
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
  onPeekClick,
}: {
  loc: LocationDef;
  reading: ReadingState;
  onPeekClick?: () => void;
}) {
  const status = statusFromDensity(reading.density);
  const trend = trendDirection(reading.density, reading.prevDensity);
  const hasData = reading.density != null;
  const dens = reading.density ?? 0;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!reading.created_at) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [reading.created_at]);

  const age = formatReadingAge(reading.created_at, nowMs);
  const clock = reading.created_at
    ? new Date(reading.created_at).toLocaleTimeString()
    : "";
  const when = age ?? (clock ? clock : "");
  const showTelemetry =
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
