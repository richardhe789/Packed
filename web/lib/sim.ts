export type FakeReading = {
  density: number;
  packet_count: number;
  avg_rssi: number;
};

export type HistoryPoint = {
  created_at: string;
  density: number;
  avg_rssi: number | null;
  packet_count: number | null;
};

export type MovementModel = {
  peakAt: string | null;
  peakDensity: number | null;
  troughAt: string | null;
  troughDensity: number | null;
  phase: "arriving" | "packed" | "leaving" | "quiet" | "unknown";
  summary: string;
};

/** Quiet-room RF floor from the real dining_hall_main windows (not the smoke-test rows). */
export const RF_FLOOR = {
  packets: 4400,
  rssi: -72.5,
} as const;

/**
 * Relative occupancy 0–1 for a pass-through-the-space day:
 * quiet → people arrive → packed → people leave → quiet.
 */
export function occupancyAt(progress01: number): number {
  const t = Math.min(1, Math.max(0, progress01));
  if (t < 0.2) return 0.08 + t * 0.2;
  if (t < 0.35) {
    const u = (t - 0.2) / 0.15;
    return 0.12 + u * u * 0.78;
  }
  if (t < 0.55) return 0.86 + Math.sin((t - 0.35) * 20) * 0.04;
  if (t < 0.8) {
    const u = (t - 0.55) / 0.25;
    return 0.9 * (1 - u) * (1 - u) + 0.08;
  }
  return 0.08;
}

/** One simulated pass through the space (quiet → packed → quiet). */
export function simHistory(
  samples = 24,
  startMs = Date.UTC(2020, 0, 1, 8),
): HistoryPoint[] {
  const n = Math.max(2, samples);
  return Array.from({ length: n }, (_, i) => {
    const r = fakeReadingAt(i / (n - 1));
    return {
      created_at: new Date(startMs + i * 30 * 1000).toISOString(),
      density: r.density,
      packet_count: r.packet_count,
      avg_rssi: r.avg_rssi,
    };
  });
}

export function fakeReadingAt(progress01: number, noise = 0): FakeReading {
  const occ = occupancyAt(progress01);
  const density = Math.min(100, Math.max(0, Math.round(occ * 100 + noise)));
  const packet_count = Math.max(
    0,
    Math.round(RF_FLOOR.packets + occ * 1800 + noise * 20),
  );
  const avg_rssi = RF_FLOOR.rssi + occ * 14 + noise * 0.15;
  return { density, packet_count, avg_rssi };
}

export function modelFromReadings(rows: HistoryPoint[]): MovementModel {
  if (rows.length === 0) {
    return {
      peakAt: null,
      peakDensity: null,
      troughAt: null,
      troughDensity: null,
      phase: "unknown",
      summary: "No readings yet.",
    };
  }

  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  let peak = sorted[0];
  let trough = sorted[0];
  for (const r of sorted) {
    if (r.density > peak.density) peak = r;
    if (r.density < trough.density) trough = r;
  }

  const last = sorted[sorted.length - 1];
  const prev =
    sorted.length >= 6 ? sorted[sorted.length - 6] : sorted[0];
  const slope = last.density - prev.density;

  let phase: MovementModel["phase"];
  if (last.density <= 20 && slope <= 2) phase = "quiet";
  else if (slope >= 8) phase = "arriving";
  else if (slope <= -8) phase = "leaving";
  else if (last.density >= 67) phase = "packed";
  else phase = last.density <= 33 ? "quiet" : "packed";

  const summaries: Record<MovementModel["phase"], string> = {
    arriving: "People are moving into the space (density rising).",
    packed: "The space is holding a crowd.",
    leaving: "People are moving out (density falling).",
    quiet: "Little movement — the space is quiet.",
    unknown: "No readings yet.",
  };

  return {
    peakAt: peak.created_at,
    peakDensity: peak.density,
    troughAt: trough.created_at,
    troughDensity: trough.density,
    phase,
    summary: summaries[phase],
  };
}
