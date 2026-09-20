import { describe, expect, it } from "vitest";
import {
  LOCATIONS,
  SENSOR_LOCATION,
  buildRecommendation,
  emptyState,
  formatReadingAge,
  liveSourceKind,
  locationFromPlace,
  parsePlaceFields,
  placeFromSensor,
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

describe("LOCATIONS", () => {
  it("includes the live ESP pin plus upcoming dining halls", () => {
    expect(LOCATIONS[0]).toEqual(locationFromPlace(placeFromSensor()));
    expect(LOCATIONS[0].id).toBe(SENSOR_LOCATION.id);
    expect(LOCATIONS[0].liveSensor).toBe(true);
    expect(LOCATIONS.length).toBeGreaterThan(1);
    expect(LOCATIONS.slice(1).every((l) => !l.liveSensor)).toBe(true);
  });
});

describe("parsePlaceFields", () => {
  it("accepts a labeled lat/lng for the current sensor id and rejects junk", () => {
    expect(
      parsePlaceFields({
        id: SENSOR_LOCATION.id,
        label: "Goodwin Hall",
        latitude: 37.2323,
        longitude: -80.426,
      }),
    ).toEqual({
      id: SENSOR_LOCATION.id,
      label: "Goodwin Hall",
      latitude: 37.2323,
      longitude: -80.426,
    });
    expect(
      parsePlaceFields({
        label: "Goodwin Hall",
        latitude: 37.2323,
        longitude: -80.426,
      }),
    ).toBeNull();
    expect(parsePlaceFields({ label: "x", latitude: 200, longitude: 0 })).toBeNull();
    expect(parsePlaceFields(null)).toBeNull();
  });
});

describe("formatReadingAge", () => {
  const now = Date.parse("2020-01-01T00:01:00.000Z");

  it("returns seconds, minutes, or hours ago", () => {
    expect(formatReadingAge("2020-01-01T00:00:45.000Z", now)).toBe("15s ago");
    expect(formatReadingAge("2020-01-01T00:00:00.000Z", now)).toBe("1m ago");
    expect(formatReadingAge("2019-12-31T22:01:00.000Z", now)).toBe("2h ago");
  });

  it("returns null when timestamp is missing", () => {
    expect(formatReadingAge(null, now)).toBeNull();
  });
});

describe("liveSourceKind", () => {
  const now = Date.parse("2020-01-01T00:10:00.000Z");

  it("calls sim rows simulated even if recent", () => {
    expect(liveSourceKind("sim", "2020-01-01T00:09:50.000Z", now)).toBe("sim");
  });

  it("calls a fresh esp32 row live and an old one stale", () => {
    expect(liveSourceKind("esp32", "2020-01-01T00:09:50.000Z", now)).toBe("live");
    expect(liveSourceKind("esp32", "2019-12-31T23:50:00.000Z", now)).toBe("stale");
    expect(liveSourceKind(null, null, now)).toBe("none");
  });
});

describe("seedDemoState", () => {
  it("fills the one sensor location with density 62", () => {
    const state = seedDemoState("2020-01-01T00:00:00.000Z");
    expect(state[SENSOR_LOCATION.id].density).toBe(62);
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

  it("returns single-sensor status copy when the live pin has density", () => {
    const state = emptyState();
    state[SENSOR_LOCATION.id] = {
      density: 78,
      created_at: null,
      prevDensity: null,
      avgRssi: null,
      packetCount: null,
    };
    const rec = buildRecommendation(state, false);
    expect(rec.text).toBe(`${LOCATIONS[0].shortLabel} is Busy`);
    expect(rec.detail).toBe(
      "Only one live sensor is online — can’t compare across campus yet.",
    );
    expect(rec.tone).toBe("neutral");
  });
});
