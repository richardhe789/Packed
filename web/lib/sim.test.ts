import { describe, expect, it } from "vitest";
import {
  RF_FLOOR,
  fakeReadingAt,
  modelFromReadings,
  occupancyAt,
  simHistory,
} from "@/lib/sim";

describe("occupancyAt", () => {
  it("starts quiet, peaks mid-window, then drains", () => {
    const start = occupancyAt(0);
    const peak = occupancyAt(0.45);
    const end = occupancyAt(1);
    expect(start).toBeLessThan(0.2);
    expect(peak).toBeGreaterThan(0.75);
    expect(end).toBeLessThan(0.2);
  });
});

describe("simHistory", () => {
  it("rises from quiet toward packed mid-window", () => {
    const rows = simHistory(24);
    const mid = rows[Math.floor(rows.length * 0.45)];
    expect(rows[0].density).toBeLessThan(mid.density);
    expect(mid.density).toBeGreaterThan(70);
  });
});

describe("fakeReadingAt", () => {
  it("stays in firmware bounds", () => {
    const r = fakeReadingAt(0.45);
    expect(r.density).toBeGreaterThanOrEqual(0);
    expect(r.density).toBeLessThanOrEqual(100);
    expect(r.packet_count).toBeGreaterThan(RF_FLOOR.packets);
  });
});

describe("modelFromReadings", () => {
  it("labels a rising series as arriving", () => {
    const rows = [10, 20, 30, 40, 55, 70].map((density, i) => ({
      created_at: new Date(Date.UTC(2020, 0, 1, 12, i)).toISOString(),
      density,
      avg_rssi: -70,
      packet_count: 4000,
    }));
    const model = modelFromReadings(rows);
    expect(model.phase).toBe("arriving");
    expect(model.peakDensity).toBe(70);
  });
});
