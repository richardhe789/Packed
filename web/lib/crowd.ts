export type LocationDef = {
  id: string;
  label: string;
  liveSensor: boolean;
};

export type ReadingState = {
  density: number | null;
  created_at: string | null;
  prevDensity: number | null;
};

export type CrowdStatus = {
  key: "quiet" | "moderate" | "busy" | "unknown";
  label: string;
};

export type Recommendation = {
  text: string;
  detail: string;
  tone: "go" | "neutral";
};

export const LOCATIONS: LocationDef[] = [
  { id: "dining_hall_main", label: "Dining Hall (Main)", liveSensor: true },
  { id: "dining_hall_west", label: "Dining Hall (West)", liveSensor: false },
  { id: "library_lobby", label: "Library Lobby", liveSensor: false },
];

export const POLL_MS = 30_000;
export const REC_GAP = 20;

export function emptyState(): Record<string, ReadingState> {
  const state: Record<string, ReadingState> = {};
  for (const loc of LOCATIONS) {
    state[loc.id] = { density: null, created_at: null, prevDensity: null };
  }
  return state;
}

/** Pass `at` only from client code. Omit on SSR so server/client HTML matches. */
export function seedDemoState(at: string | null = null): Record<string, ReadingState> {
  const samples: Record<string, number> = {
    dining_hall_main: 78,
    dining_hall_west: 22,
    library_lobby: 45,
  };
  const state: Record<string, ReadingState> = {};
  for (const loc of LOCATIONS) {
    const d = samples[loc.id] ?? 40;
    state[loc.id] = {
      density: d,
      prevDensity: Math.max(0, d - 8),
      created_at: at,
    };
  }
  return state;
}

export function statusFromDensity(density: number | null): CrowdStatus {
  if (density == null || Number.isNaN(density)) {
    return { key: "unknown", label: "No data" };
  }
  if (density <= 33) return { key: "quiet", label: "Quiet" };
  if (density <= 66) return { key: "moderate", label: "Moderate" };
  return { key: "busy", label: "Busy" };
}

export function trendArrow(
  current: number | null,
  previous: number | null,
): string {
  if (current == null || previous == null) return "–";
  if (current > previous + 2) return "↑";
  if (current < previous - 2) return "↓";
  return "→";
}

export function buildRecommendation(
  state: Record<string, ReadingState>,
  demoMode: boolean,
): Recommendation {
  const scored = LOCATIONS.map((loc) => ({
    loc,
    density: state[loc.id].density,
  })).filter(
    (x): x is { loc: LocationDef; density: number } => x.density != null,
  );

  if (scored.length === 0) {
    return {
      text: "Waiting for crowd data…",
      detail: demoMode
        ? "Use the sliders below to simulate busyness."
        : "ESP32 has not posted a reading yet.",
      tone: "neutral",
    };
  }

  let quietest = scored[0];
  let busiest = scored[0];
  for (const s of scored) {
    if (s.density < quietest.density) quietest = s;
    if (s.density > busiest.density) busiest = s;
  }

  if (busiest.density - quietest.density < REC_GAP) {
    return {
      text: "Anywhere looks similar right now",
      detail:
        "Crowd levels are close across locations — pick what’s convenient.",
      tone: "neutral",
    };
  }

  const qStatus = statusFromDensity(quietest.density).label;
  return {
    text: `Go to ${quietest.loc.label}`,
    detail: `Quieter right now (${qStatus}) — skip the busier line at ${busiest.loc.label}.`,
    tone: "go",
  };
}

export function wantsDemoFromSearch(search: string): boolean {
  const q = new URLSearchParams(search);
  if (q.get("demo") === "1" || q.get("demo") === "true") return true;
  if (q.get("live") === "1" || q.get("live") === "true") return false;
  return true;
}
