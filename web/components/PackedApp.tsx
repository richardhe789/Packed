"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LOCATIONS,
  POLL_MS,
  SENSOR_LOCATION,
  buildRecommendation,
  emptyState,
  quietestLocationId,
  seedDemoState,
  wantsDemoFromSearch,
  type ReadingState,
} from "@/lib/crowd";
import { fetchLatestReadings } from "@/lib/supabase";
import DetailPanel from "@/components/DetailPanel";
import TopBar from "@/components/TopBar";

const CampusMap = dynamic(() => import("@/components/CampusMap"), {
  ssr: false,
  loading: () => <div className="map-canvas map-loading">Loading campus map…</div>,
});

export default function PackedApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const initialDemo = wantsDemoFromSearch(search);
  const [demoMode, setDemoMode] = useState(initialDemo);
  const [state, setState] = useState<Record<string, ReadingState>>(() =>
    initialDemo ? seedDemoState() : emptyState(),
  );
  const [meta, setMeta] = useState(() =>
    initialDemo
      ? "Demo · tap a building on the VT map · scrub density in the panel"
      : "Live · fetching…",
  );
  const [liveLoading, setLiveLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialDemo ? "dining_hall_west" : SENSOR_LOCATION.id,
  );

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

  const refreshLive = useCallback(async () => {
    setLiveLoading(true);
    try {
      const liveIds = LOCATIONS.filter((l) => l.liveSensor).map((l) => l.id);
      const results = await Promise.all(
        liveIds.map(async (id) => {
          const { latest, previous } = await fetchLatestReadings(id);
          return { id, latest, previous };
        }),
      );

      setState(() => {
        const next = emptyState();
        for (const { id, latest, previous } of results) {
          next[id] = {
            density: latest ? latest.density : null,
            created_at: latest ? latest.created_at : null,
            prevDensity: previous ? previous.density : null,
          };
        }
        return next;
      });
      setMeta(
        `Live · updated ${new Date().toLocaleTimeString()} · every ${POLL_MS / 1000}s`,
      );
    } catch (err) {
      console.error(err);
      setMeta(
        `Live error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLiveLoading(false);
    }
  }, []);

  const enterDemo = useCallback(() => {
    const seeded = seedDemoState(new Date().toISOString());
    setDemoMode(true);
    setLiveLoading(false);
    setState(seeded);
    setMeta("Demo · tap a building · scrub density in the panel");
    setSelectedId(quietestLocationId(seeded) ?? "dining_hall_west");
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
    void refreshLive();
    const id = window.setInterval(() => {
      void refreshLive();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [demoMode, refreshLive]);

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
      },
    }));
  }

  return (
    <div className="map-shell">
      <TopBar
        demoMode={demoMode}
        recommendation={recommendation}
        onDemo={enterDemo}
        onLive={enterLive}
      />

      <div className="map-stage">
        <CampusMap
          state={state}
          selectedId={selectedId}
          bestId={bestId}
          demoMode={demoMode}
          onSelect={setSelectedId}
        />

        <DetailPanel
          selectedId={selectedId}
          state={state}
          recommendation={recommendation}
          bestId={bestId}
          demoMode={demoMode}
          meta={meta}
          liveLoading={liveLoading}
          onClose={() => setSelectedId(null)}
          onSlider={onSlider}
        />
      </div>
    </div>
  );
}
