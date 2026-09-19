"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  CAMPUS_VIEW,
  statusFromDensity,
  type LocationDef,
  type ReadingState,
} from "@/lib/crowd";

type Props = {
  location: LocationDef;
  state: Record<string, ReadingState>;
  selectedId: string | null;
  bestId: string | null;
  demoMode: boolean;
  onSelect: (id: string) => void;
};

type PinScreen = { id: string; x: number; y: number };

const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Next/Turbopack breaks MapLibre's bundled worker → blank basemap, pins still work.
// Serve worker + shared sibling from /public (both required; worker imports the sibling).
let workerConfigured = false;
function ensureMapLibreWorker() {
  if (workerConfigured || typeof window === "undefined") return;
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  workerConfigured = true;
}

export default function CampusMap({
  location,
  state,
  selectedId,
  bestId,
  demoMode,
  onSelect,
}: Props) {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const [mapEpoch, setMapEpoch] = useState(0);
  const [pins, setPins] = useState<PinScreen[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Imperative MapLibre — style URL (OpenFreeMap). Sync create avoids Strict Mode async races.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setStatus("loading");
    setErrorMsg(null);
    ensureMapLibreWorker();

    let cancelled = false;
    const map = new MapLibreMap({
      container: el,
      style: OPENFREEMAP_STYLE_URL,
      center: [location.coords.lng, location.coords.lat],
      zoom: CAMPUS_VIEW.zoom,
      attributionControl: { compact: true },
    });

    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-left");

    const resize = () => {
      if (!cancelled) map.resize();
    };

    const markReady = () => {
      if (cancelled) return;
      resize();
      setStatus("ready");
      setMapEpoch((n) => n + 1);
    };

    map.on("error", (e) => {
      console.error("[CampusMap] map error", e.error);
      const msg = e.error?.message ?? "Unknown map error";
      // Tile blips are noisy; only surface hard style failures.
      if (/style|fetch|ajax|network/i.test(msg)) {
        setStatus("error");
        setErrorMsg(msg);
      }
    });

    let readyFired = false;
    const markReadyOnce = () => {
      if (readyFired || cancelled) return;
      readyFired = true;
      markReady();
    };

    map.once("load", markReadyOnce);

    // Pins even if style paint is slow
    const fallback = window.setTimeout(() => {
      if (cancelled || readyFired) return;
      console.warn("[CampusMap] load timeout — showing pins anyway");
      markReadyOnce();
    }, 3500);

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    window.addEventListener("resize", resize);
    requestAnimationFrame(resize);

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      window.removeEventListener("resize", resize);
      ro.disconnect();
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, []);

  // Project building coords → screen pixels (pins sit above vignette, outside MapLibre DOM).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapEpoch === 0) return;

    const project = () => {
      const next: PinScreen[] = [];
      const p = map.project([location.coords.lng, location.coords.lat]);
      next.push({ id: location.id, x: p.x, y: p.y });
      setPins(next);
    };

    project();
    map.on("move", project);
    map.on("zoom", project);
    map.on("resize", project);

    return () => {
      map.off("move", project);
      map.off("zoom", project);
      map.off("resize", project);
    };
  }, [mapEpoch, location.coords.lat, location.coords.lng, location.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapEpoch === 0) return;
    map.flyTo({
      center: [location.coords.lng, location.coords.lat],
      duration: 450,
    });
  }, [mapEpoch, location.coords.lat, location.coords.lng]);

  return (
    <div className="map-canvas">
      <div ref={containerRef} className="map-container" />

      <div className="map-pins" aria-label="Sensor location">
        {pins.map((pin) => {
          const loc = pin.id === location.id ? location : null;
          if (!loc) return null;
          const reading = state[loc.id];
          const crowd = statusFromDensity(reading?.density ?? null);
          const selected = loc.id === selectedId;
          const best = loc.id === bestId;
          const pulse = !demoMode && loc.liveSensor && !reduceMotion;

          return (
            <button
              key={loc.id}
              type="button"
              className={`geo-pin status-${crowd.key}${selected ? " is-selected" : ""}${best ? " is-best" : ""}${pulse ? " is-live" : ""}`}
              style={{
                left: pin.x,
                top: pin.y,
              }}
              aria-label={`${loc.label}, ${crowd.label}`}
              onClick={() => onSelect(loc.id)}
            >
              <span className="geo-pin-dot" />
              <span className="geo-pin-label">{loc.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {status === "loading" ? (
        <div className="map-status-banner">Loading OpenFreeMap…</div>
      ) : null}

      {status === "error" ? (
        <div className="map-error" role="alert">
          OpenFreeMap failed: {errorMsg}
        </div>
      ) : null}

      <div className="map-vignette" aria-hidden />
      <div className="map-texture" aria-hidden />
      <div className="map-fade map-fade-left" aria-hidden />
      <div className="map-fade map-fade-right" aria-hidden />
      <div className="map-fade map-fade-top" aria-hidden />
      <div className="map-fade map-fade-bottom" aria-hidden />
    </div>
  );
}
