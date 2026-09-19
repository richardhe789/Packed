import { SENSOR_LOCATION } from "@/lib/location.generated";

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
  avgRssi: number | null;
  packetCount: number | null;
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

/** Map camera follows the one configured sensor pin. */
export const CAMPUS_VIEW = {
  longitude: SENSOR_LOCATION.longitude,
  latitude: SENSOR_LOCATION.latitude,
  zoom: 16.6,
} as const;

export type PlaceFields = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

export function placeFromSensor(): PlaceFields {
  return {
    id: SENSOR_LOCATION.id,
    label: SENSOR_LOCATION.label,
    latitude: SENSOR_LOCATION.latitude,
    longitude: SENSOR_LOCATION.longitude,
  };
}

export function locationFromPlace(place: PlaceFields): LocationDef {
  const label = place.label.trim() || SENSOR_LOCATION.label;
  return {
    id: SENSOR_LOCATION.id,
    label,
    shortLabel: label,
    liveSensor: true,
    coords: { lat: place.latitude, lng: place.longitude },
  };
}

/** One pin. Name + coordinates come from location.config.json (or the in-app editor). */
export const LOCATIONS: LocationDef[] = [locationFromPlace(placeFromSensor())];

export const POLL_MS = 30_000;
export const REC_GAP = 20;

export function emptyState(): Record<string, ReadingState> {
  const state: Record<string, ReadingState> = {};
  for (const loc of LOCATIONS) {
    state[loc.id] = {
      density: null,
      created_at: null,
      prevDensity: null,
      avgRssi: null,
      packetCount: null,
    };
  }
  return state;
}

/** Pass `at` only from client code. Omit on SSR so server/client HTML matches. */
export function seedDemoState(at: string | null = null): Record<string, ReadingState> {
  const state: Record<string, ReadingState> = {};
  for (const loc of LOCATIONS) {
    const d = 62;
    state[loc.id] = {
      density: d,
      prevDensity: Math.max(0, d - 8),
      created_at: at,
      avgRssi: null,
      packetCount: null,
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
        ? "Scrub density in the panel to try Quiet / Moderate / Busy."
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

/** Relative age of a reading timestamp for Live “it’s real” copy. */
export function formatReadingAge(
  createdAt: string | null,
  nowMs: number,
): string | null {
  if (!createdAt) return null;
  const then = Date.parse(createdAt);
  if (Number.isNaN(then)) return null;
  const sec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export function wantsDemoFromSearch(search: string): boolean {
  const q = new URLSearchParams(search);
  if (q.get("demo") === "1" || q.get("demo") === "true") return true;
  if (q.get("live") === "1" || q.get("live") === "true") return false;
  return true;
}

export function parsePlaceFields(raw: unknown): PlaceFields | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id !== SENSOR_LOCATION.id) return null;
  if (typeof o.label !== "string") return null;
  if (typeof o.latitude !== "number" || !Number.isFinite(o.latitude)) return null;
  if (typeof o.longitude !== "number" || !Number.isFinite(o.longitude)) return null;
  if (o.latitude < -90 || o.latitude > 90) return null;
  if (o.longitude < -180 || o.longitude > 180) return null;
  return {
    id: o.id,
    label: o.label,
    latitude: o.latitude,
    longitude: o.longitude,
  };
}

export const PLACE_STORAGE_KEY = "packed-place";

export function getLocation(id: string): LocationDef | undefined {
  return LOCATIONS.find((l) => l.id === id);
}

export { SENSOR_LOCATION };
