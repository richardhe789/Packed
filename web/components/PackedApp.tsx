"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LOCATIONS,
  PLACE_STORAGE_KEY,
  POLL_MS,
  SENSOR_LOCATION,
  buildRecommendation,
  emptyState,
  liveSourceKind,
  locationFromPlace,
  parsePlaceFields,
  placeFromSensor,
  quietestLocationId,
  seedDemoState,
  wantsDemoFromSearch,
  type PlaceFields,
  type ReadingState,
} from "@/lib/crowd";
import { fetchLatestReadings } from "@/lib/supabase";
import DetailPanel from "@/components/DetailPanel";
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const initialDemo = wantsDemoFromSearch(search);
  const [place, setPlace] = useState<PlaceFields>(placeFromSensor);
  const liveLoc = useMemo(() => locationFromPlace(place), [place]);
  const [demoMode, setDemoMode] = useState(initialDemo);
  const [state, setState] = useState<Record<string, ReadingState>>(() =>
    initialDemo ? seedDemoState() : emptyState(),
  );
  const [meta, setMeta] = useState(() =>
    initialDemo
      ? "Demo · one sensor pin · scrub density in the panel"
      : "Live · fetching…",
  );
  const [liveLoading, setLiveLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    SENSOR_LOCATION.id,
  );
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const liveGenerationRef = useRef(0);
  const liveAbortRef = useRef<AbortController | null>(null);

  const syncUrl = useCallback(
    (demo: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (demo) {
        params.set("demo", "1");
        params.delete("live");
      } else {
        params.set("live", "1");
        params.delete("demo");
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const enterDemo = useCallback(() => {
    const seeded = seedDemoState(new Date().toISOString());
    setDemoMode(true);
    setLiveLoading(false);
    setState(seeded);
    setMeta("Demo · one sensor pin · scrub density in the panel");
    setSelectedId(SENSOR_LOCATION.id);
    syncUrl(true);
  }, [syncUrl]);

  const enterLive = useCallback(() => {
    setDemoMode(false);
    setState(emptyState());
    setMeta("Live · fetching…");
    setLiveLoading(true);
    setSelectedId(SENSOR_LOCATION.id);
    syncUrl(false);
  }, [syncUrl]);

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
    if (!demoMode) return;
    setState((prev) => {
      const needsStamp = Object.values(prev).some(
        (s) => s.density != null && s.created_at == null,
      );
      if (!needsStamp) return prev;
      const now = new Date().toISOString();
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id].density != null && next[id].created_at == null) {
          next[id] = { ...next[id], created_at: now };
        }
      }
      return next;
    });
  }, [demoMode]);

  useEffect(() => {
    if (demoMode) return;

    const runPoll = async () => {
      liveAbortRef.current?.abort();
      const controller = new AbortController();
      liveAbortRef.current = controller;
      const signal = controller.signal;
      const gen = ++liveGenerationRef.current;

      setLiveLoading(true);
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
        const latestRow = results[0]?.latest ?? null;
        const kind = liveSourceKind(
          latestRow?.src,
          latestRow?.created_at ?? null,
          Date.now(),
        );
        if (kind === "sim") {
          setMeta("Simulated · sim_readings / src=sim · not a plugged-in ESP32");
        } else if (kind === "stale") {
          setMeta(
            "Last ESP32 row in readings · sensor not posting · dashboard still polls",
          );
        } else if (kind === "none") {
          setMeta(`No ESP32 rows in readings yet · polling every ${POLL_MS / 1000}s`);
        } else {
          setMeta(`ESP32 posting · dashboard poll every ${POLL_MS / 1000}s`);
        }
      } catch (err) {
        if (isAbortError(err) || signal.aborted) return;
        if (gen !== liveGenerationRef.current) return;
        console.error(err);
        setMeta(
          `Live error: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        if (gen === liveGenerationRef.current) {
          setLiveLoading(false);
        }
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
  }, [demoMode]);

  const recommendation = useMemo(
    () => buildRecommendation(state, demoMode),
    [state, demoMode],
  );

  const bestId = useMemo(() => {
    if (recommendation.tone !== "go") return null;
    return quietestLocationId(state);
  }, [recommendation.tone, state]);

  function onSlider(id: string, value: number) {
    setState((prev) => ({
      ...prev,
      [id]: {
        prevDensity: prev[id].density,
        density: value,
        created_at: new Date().toISOString(),
        avgRssi: prev[id].avgRssi,
        packetCount: prev[id].packetCount,
        src: prev[id].src,
      },
    }));
  }

  return (
    <div
      className="map-shell"
      data-sheet-expanded={sheetExpanded ? "true" : "false"}
      data-demo={demoMode ? "true" : "false"}
    >
      <TopBar
        demoMode={demoMode}
        onDemo={enterDemo}
        onLive={enterLive}
      />

      <div className="map-stage">
        <CampusMap
          location={liveLoc}
          state={state}
          selectedId={selectedId}
          bestId={bestId}
          demoMode={demoMode}
          sheetExpanded={sheetExpanded}
          onSelect={(id) => {
            setSelectedId(id);
            setSheetExpanded(true);
          }}
        />

        <DetailPanel
          location={liveLoc}
          selectedId={selectedId}
          state={state}
          bestId={bestId}
          demoMode={demoMode}
          sheetExpanded={sheetExpanded}
          meta={meta}
          liveLoading={liveLoading}
          onClose={() => setSelectedId(null)}
          onCollapse={() => setSheetExpanded(false)}
          onExpand={() => setSheetExpanded(true)}
          onSlider={onSlider}
        />
      </div>
    </div>
  );
}
