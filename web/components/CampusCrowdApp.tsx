"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LOCATIONS,
  POLL_MS,
  buildRecommendation,
  emptyState,
  seedDemoState,
  statusFromDensity,
  trendDirection,
  wantsDemoFromSearch,
  type ReadingState,
} from "@/lib/crowd";
import { fetchLatestReadings } from "@/lib/supabase";

function TrendIcon({
  dir,
}: {
  dir: "up" | "down" | "flat" | "none";
}) {
  if (dir === "none") {
    return (
      <span className="trend-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M4 8h8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (dir === "up") {
    return (
      <span className="trend-icon" aria-label="trending up">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M3 11L7 6l3 3 3-5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11 4h2v2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (dir === "down") {
    return (
      <span className="trend-icon" aria-label="trending down">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M3 5l4 5 3-3 3 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11 12h2v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="trend-icon" aria-label="stable">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M3 8h10" strokeLinecap="round" />
        <path d="M11 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function CampusCrowdApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const [demoMode, setDemoMode] = useState(() => wantsDemoFromSearch(search));
  const [state, setState] = useState<Record<string, ReadingState>>(() =>
    wantsDemoFromSearch(search) ? seedDemoState() : emptyState(),
  );
  const [meta, setMeta] = useState(() =>
    wantsDemoFromSearch(search)
      ? "Demo · scrub densities below · not connected to ESP32"
      : "Live · fetching…",
  );
  const [liveLoading, setLiveLoading] = useState(false);

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
    setDemoMode(true);
    setLiveLoading(false);
    setState(seedDemoState(new Date().toISOString()));
    setMeta("Demo · scrub densities below · not connected to ESP32");
    syncUrl(true);
  }, [syncUrl]);

  const enterLive = useCallback(() => {
    setDemoMode(false);
    setState(emptyState());
    setMeta("Live · fetching…");
    setLiveLoading(true);
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
    let best: string | null = null;
    let bestD = Infinity;
    for (const loc of LOCATIONS) {
      const d = state[loc.id].density;
      if (d != null && d < bestD) {
        bestD = d;
        best = loc.id;
      }
    }
    return best;
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

  const showSkeleton =
    !demoMode && liveLoading && LOCATIONS.every((l) => state[l.id].density == null);

  return (
    <div className="page">
      <header className="site-header">
        <div className="header-top">
          <div className="brand-lockup">
            <span
              className={`live-dot${!demoMode ? " on" : ""}`}
              aria-hidden="true"
            />
            <p className="brand">Campus Crowd</p>
          </div>
          <div className="mode-toggle" role="group" aria-label="Data mode">
            <button
              type="button"
              className={`mode-btn${demoMode ? " active" : ""}`}
              aria-pressed={demoMode}
              onClick={enterDemo}
            >
              Demo
            </button>
            <button
              type="button"
              className={`mode-btn${!demoMode ? " active" : ""}`}
              aria-pressed={!demoMode}
              onClick={enterLive}
            >
              Live
            </button>
          </div>
        </div>
        <h1 className="headline">Should I go now?</h1>
        <p className="tagline">
          Ambient WiFi density near dining halls — pick the quieter line.
        </p>
      </header>

      <main>
        <section
          className={`recommendation tone-${recommendation.tone}`}
          aria-live="polite"
        >
          <p className="rec-label">Recommendation</p>
          <p className="rec-text">{recommendation.text}</p>
          <p className="rec-detail">{recommendation.detail}</p>
        </section>

        <p className="section-label">Locations</p>
        <section aria-label="Locations" className="locations">
          {LOCATIONS.map((loc) => {
            const s = state[loc.id];
            const status = statusFromDensity(s.density);
            const trend = trendDirection(s.density, s.prevDensity);
            const hasData = s.density != null;
            const dens = s.density ?? 0;
            const densityText = hasData
              ? `${s.density}/100`
              : loc.liveSensor && !demoMode
                ? "awaiting sensor"
                : "no data";
            const when = s.created_at
              ? new Date(s.created_at).toLocaleTimeString()
              : "";
            const isBest = bestId === loc.id;

            return (
              <article
                key={loc.id}
                className={`location-row${isBest ? " is-best" : ""}${showSkeleton ? " is-skeleton" : ""}`}
                data-location={loc.id}
              >
                <div className="location-main">
                  <div className="location-title-row">
                    <h2>{loc.label}</h2>
                    {loc.liveSensor ? (
                      <span className="sensor-chip live">Sensor</span>
                    ) : (
                      <span className="sensor-chip">Preview</span>
                    )}
                  </div>
                  <p className="sub">
                    {densityText}
                    {when ? ` · ${when}` : ""}
                  </p>
                  <div className="density-bar" aria-hidden="true">
                    <div
                      className={`density-fill ${status.key}`}
                      style={{ width: `${hasData ? dens : 0}%` }}
                    />
                  </div>
                </div>
                <div className="location-aside">
                  <span
                    className={`density-readout${!hasData ? " unknown" : ""}`}
                    aria-label={
                      hasData ? `Density ${s.density} of 100` : "No density data"
                    }
                  >
                    {hasData ? s.density : "—"}
                  </span>
                  <div className="trend-status">
                    <TrendIcon dir={trend} />
                    <span className={`status-pill ${status.key}`}>
                      {status.label}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <p
          className={`meta-row${!demoMode && liveLoading ? " is-loading" : ""}`}
          role="status"
        >
          {!demoMode && liveLoading ? <span className="spinner" aria-hidden /> : null}
          <span>{meta}</span>
        </p>

        {demoMode ? (
          <aside className="dev-panel">
            <h2>Dev preview</h2>
            <p className="dev-hint">
              Drag sliders to simulate crowd levels. Watch status and the
              recommendation update. Open with <code>?demo=1</code> anytime.
            </p>
            <div className="dev-sliders">
              {LOCATIONS.map((loc) => {
                const d = state[loc.id].density ?? 50;
                const status = statusFromDensity(d).label;
                return (
                  <label key={loc.id} className="dev-slider-row">
                    <span className="dev-slider-label">
                      {loc.label}
                      <span className="dev-slider-val">
                        {d} · {status}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={d}
                      className="dev-range"
                      onChange={(e) =>
                        onSlider(loc.id, Number(e.target.value))
                      }
                    />
                  </label>
                );
              })}
            </div>
          </aside>
        ) : null}
      </main>

      <footer>
        <p>
          Density is relative ambient WiFi activity — not a headcount, and never
          tracks individual devices.
        </p>
      </footer>
    </div>
  );
}
