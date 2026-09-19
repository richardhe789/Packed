import { describe, expect, it } from "vitest";
import {
  LOCATIONS,
  buildRecommendation,
  emptyState,
  seedDemoState,
  statusFromDensity,
  trendDirection,
} from "@/lib/crowd";

describe("statusFromDensity", () => {
  it("returns unknown when density is null", () => {
    expect(statusFromDensity(null)).toEqual({
      key: "unknown",
      label: "No data",
    });
  });

  it("maps density bands to Quiet, Moderate, and Busy", () => {
    expect(statusFromDensity(0).key).toBe("quiet");
    expect(statusFromDensity(33).key).toBe("quiet");
    expect(statusFromDensity(34).key).toBe("moderate");
    expect(statusFromDensity(66).key).toBe("moderate");
    expect(statusFromDensity(67).key).toBe("busy");
    expect(statusFromDensity(100).key).toBe("busy");
  });
});

describe("trendDirection", () => {
  it("detects up, down, flat, and none", () => {
    expect(trendDirection(50, 40)).toBe("up");
    expect(trendDirection(40, 50)).toBe("down");
    expect(trendDirection(50, 49)).toBe("flat");
    expect(trendDirection(null, 40)).toBe("none");
    expect(trendDirection(50, null)).toBe("none");
  });
});

describe("seedDemoState", () => {
  it("fills every location with density; dining_hall_main is 78", () => {
    const state = seedDemoState("2020-01-01T00:00:00.000Z");
    for (const loc of LOCATIONS) {
      expect(state[loc.id].density).not.toBeNull();
    }
    expect(state.dining_hall_main.density).toBe(78);
  });
});

describe("buildRecommendation", () => {
  it("returns waiting copy when all densities are empty", () => {
    const state = emptyState();
    const demo = buildRecommendation(state, true);
    const live = buildRecommendation(state, false);

    expect(demo.text).toBe("Waiting for crowd data…");
    expect(live.text).toBe("Waiting for crowd data…");
    expect(demo.detail).toBe("Tap a building or scrub density in the panel.");
    expect(live.detail).toBe("ESP32 has not posted a reading yet.");
    expect(demo.tone).toBe("neutral");
  });

  it("returns single-sensor status copy when only one location has density (Live)", () => {
    const state = emptyState();
    state.dining_hall_main = {
      density: 78,
      created_at: null,
      prevDensity: null,
    };
    const rec = buildRecommendation(state, false);
    expect(rec.text).toBe("Dietrick is Busy");
    expect(rec.detail).toBe(
      "Only one live sensor is online — can’t compare across campus yet.",
    );
    expect(rec.tone).toBe("neutral");
  });

  it("returns similar copy when two locations differ by less than REC_GAP", () => {
    const state = emptyState();
    state.science_quad = {
      density: 40,
      created_at: null,
      prevDensity: null,
    };
    state.dining_hall_main = {
      density: 50,
      created_at: null,
      prevDensity: null,
    };
    const rec = buildRecommendation(state, false);
    expect(rec.text).toBe("Anywhere looks similar right now");
    expect(rec.tone).toBe("neutral");
  });

  it("recommends the quietest spot when gap is at least REC_GAP", () => {
    const state = emptyState();
    state.science_quad = {
      density: 10,
      created_at: null,
      prevDensity: null,
    };
    state.dining_hall_main = {
      density: 78,
      created_at: null,
      prevDensity: null,
    };
    const rec = buildRecommendation(state, false);
    expect(rec.tone).toBe("go");
    expect(rec.text).toBe("Go to Derring");
  });
});
