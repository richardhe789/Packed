export type LocationDef = {
  id: string;
  label: string;
  shortLabel: string;
  liveSensor: boolean;
  /** WGS84 — Virginia Tech Blacksburg campus */
  coords: { lat: number; lng: number };
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

/** Temporary focus: Virginia Tech, Blacksburg (approx building centers). */
export const CAMPUS_VIEW = {
  longitude: -80.422,
  latitude: 37.2278,
  zoom: 15.35,
} as const;

export const LOCATIONS: LocationDef[] = [
  {
    id: SENSOR_LOCATION.id,
    label: SENSOR_LOCATION.label,
    shortLabel: SENSOR_LOCATION.label,
    liveSensor: true,
    // Manual Google Maps coordinate from the shared location configuration.
    coords: { lat: SENSOR_LOCATION.latitude, lng: SENSOR_LOCATION.longitude },
  },
  {
    id: "dining_hall_west",
    label: "West End Market",
    shortLabel: "West End",
    liveSensor: false,
    coords: { lat: 37.2219, lng: -80.4243 },
  },
  {
    id: "library_lobby",
    label: "Newman Library",
    shortLabel: "Newman",
    liveSensor: false,
    coords: { lat: 37.22905, lng: -80.41935 },
  },
  {
    id: "student_union",
    label: "Squires Student Center",
    shortLabel: "Squires",
    liveSensor: false,
    coords: { lat: 37.22955, lng: -80.41795 },
  },
  {
    id: "rec_center",
    label: "McComas Hall",
    shortLabel: "McComas",
    liveSensor: false,
    coords: { lat: 37.2214, lng: -80.41875 },
  },
  {
    id: "science_quad",
    label: "Derring Hall",
    shortLabel: "Derring",
    liveSensor: false,
    coords: { lat: 37.23015, lng: -80.4254 },
  },
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
    [SENSOR_LOCATION.id]: 78,
    dining_hall_west: 22,
    library_lobby: 45,
    student_union: 62,
    rec_center: 35,
    science_quad: 18,
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

export function trendDirection(
  current: number | null,
  previous: number | null,
): "up" | "down" | "flat" | "none" {
  if (current == null || previous == null) return "none";
  if (current > previous + 2) return "up";
  if (current < previous - 2) return "down";
  return "flat";
}

export function quietestLocationId(
  state: Record<string, ReadingState>,
): string | null {
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
        ? "Tap a building or scrub density in the panel."
        : "ESP32 has not posted a reading yet.",
      tone: "neutral",
    };
  }

  if (scored.length === 1) {
    const only = scored[0];
    const status = statusFromDensity(only.density).label;
    return {
      text: `${only.loc.shortLabel} is ${status}`,
      detail: demoMode
        ? "Scrub another building in the panel to compare."
        : "Only one live sensor is online — can’t compare across campus yet.",
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
        "Crowd levels are close across campus — pick what’s convenient.",
      tone: "neutral",
    };
  }

  const qStatus = statusFromDensity(quietest.density).label;
  return {
    text: `Go to ${quietest.loc.shortLabel}`,
    detail: `Quieter right now (${qStatus}) — skip the busier spot at ${busiest.loc.shortLabel}.`,
    tone: "go",
  };
}

export function wantsDemoFromSearch(search: string): boolean {
  const q = new URLSearchParams(search);
  if (q.get("demo") === "1" || q.get("demo") === "true") return true;
  if (q.get("live") === "1" || q.get("live") === "true") return false;
  return true;
}

export function getLocation(id: string): LocationDef | undefined {
  return LOCATIONS.find((l) => l.id === id);
}
export { SENSOR_LOCATION } from "@/lib/location.generated";
import { SENSOR_LOCATION } from "@/lib/location.generated";
