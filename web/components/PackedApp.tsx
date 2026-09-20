"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LOCATIONS,
  PLACE_STORAGE_KEY,
  POLL_MS,
  SENSOR_LOCATION,
  allLocations,
  buildRecommendation,
  emptyState,
  liveSourceKind,
  parsePlaceFields,
  placeFromSensor,
  quietestLocationId,
  type PlaceFields,
  type ReadingState,
} from "@/lib/crowd";
import { fetchLatestReadings } from "@/lib/supabase";
import DetailPanel from "@/components/DetailPanel";
import LocationSearch from "@/components/LocationSearch";
import TopBar from "@/components/TopBar";

const CampusMap = dynamic(() => import("@/components/CampusMap"), {
  ssr: false,
  loading: () => <div className="map-canvas map-loading">Loading campus map…</div>,
});

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

export default function PackedApp() {
  const [place, setPlace] = useState<PlaceFields>(placeFromSensor);
  const [selectedId, setSelectedId] = useState<string | null>(
    SENSOR_LOCATION.id,
  );
  const locations = useMemo(() => allLocations(place), [place]);
  const selectedLoc = useMemo(
    () => locations.find((l) => l.id === selectedId) ?? locations[0],
    [locations, selectedId],
  );
  const [state, setState] = useState<Record<string, ReadingState>>(emptyState);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [revealSeq, setRevealSeq] = useState(0);

  const liveGenerationRef = useRef(0);
  const liveAbortRef = useRef<AbortController | null>(null);

  const [placeReady, setPlaceReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PLACE_STORAGE_KEY);
      if (raw) {
        const parsed = parsePlaceFields(JSON.parse(raw) as unknown);
        if (parsed) setPlace(parsed);
      }
    } catch {
      // Ignore bad localStorage; location.config.json remains the default.
    }
    setPlaceReady(true);
  }, []);

  useEffect(() => {
    if (!placeReady) return;
    window.localStorage.setItem(PLACE_STORAGE_KEY, JSON.stringify(place));
  }, [place, placeReady]);

  useEffect(() => {
    const runPoll = async () => {
      liveAbortRef.current?.abort();
      const controller = new AbortController();
      liveAbortRef.current = controller;
      const signal = controller.signal;
      const gen = ++liveGenerationRef.current;

      try {
        const liveIds = LOCATIONS.filter((l) => l.liveSensor).map((l) => l.id);
        const results = await Promise.all(
          liveIds.map(async (id) => {
            const { latest, previous } = await fetchLatestReadings(id, {
              signal,
            });
            return { id, latest, previous };
          }),
        );

        if (gen !== liveGenerationRef.current || signal.aborted) return;

        setState(() => {
          const next = emptyState();
          for (const { id, latest, previous } of results) {
            next[id] = {
              density: latest ? latest.density : null,
              created_at: latest ? latest.created_at : null,
              prevDensity: previous ? previous.density : null,
              avgRssi: latest ? latest.avg_rssi : null,
              packetCount: latest ? latest.packet_count : null,
              src: latest ? latest.src : null,
            };
          }
          return next;
        });
      } catch (err) {
        if (isAbortError(err) || signal.aborted) return;
        if (gen !== liveGenerationRef.current) return;
        console.error(err);
      }
    };

    let intervalId: number | null = null;

    function stopInterval() {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    }

    function startInterval() {
      stopInterval();
      intervalId = window.setInterval(() => {
        void runPoll();
      }, POLL_MS);
    }

    function onVisible() {
      void runPoll();
      startInterval();
    }

    function onHidden() {
      stopInterval();
      liveAbortRef.current?.abort();
      liveAbortRef.current = null;
    }

    function onVisibility() {
      if (document.visibilityState === "visible") onVisible();
      else onHidden();
    }

    if (document.visibilityState === "visible") onVisible();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopInterval();
      liveAbortRef.current?.abort();
      liveAbortRef.current = null;
    };
  }, []);

  const recommendation = useMemo(() => buildRecommendation(state), [state]);

  const bestId = useMemo(() => {
    if (recommendation.tone !== "go") return null;
    return quietestLocationId(state);
  }, [recommendation.tone, state]);

  return (
    <div className="map-shell">
      <aside className="app-sidebar">
        <TopBar
          espKind={liveSourceKind(
            state[SENSOR_LOCATION.id]?.src,
            state[SENSOR_LOCATION.id]?.created_at ?? null,
            Date.now(),
          )}
        />

        <DetailPanel
          location={selectedLoc}
          selectedId={selectedId}
          state={state}
          bestId={bestId}
          sheetExpanded={sheetExpanded}
          onExpand={() => setSheetExpanded(true)}
          revealSeq={revealSeq}
        />
      </aside>

      <div className="map-stage">
        <LocationSearch
          locations={locations}
          onPick={(id) => {
            setSelectedId(id);
            setSheetExpanded(true);
            setRevealSeq((n) => n + 1);
          }}
        />
        <CampusMap
          locations={locations}
          location={selectedLoc}
          state={state}
          selectedId={selectedId}
          bestId={bestId}
          onSelect={(id) => {
            setSelectedId(id);
            setSheetExpanded(true);
            setRevealSeq((n) => n + 1);
          }}
        />
      </div>
    </div>
  );
}
