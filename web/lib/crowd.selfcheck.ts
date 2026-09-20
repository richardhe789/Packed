/**
 * Tiny assert check for single-ESP32 recommendation behavior.
 * Run from web/: npx --yes tsx lib/crowd.selfcheck.ts
 */
import {
  SENSOR_LOCATION,
  buildRecommendation,
  emptyState,
  locationFromPlace,
  placeFromSensor,
  seedDemoState,
  type ReadingState,
} from "./crowd";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const liveOne: Record<string, ReadingState> = emptyState();
liveOne[SENSOR_LOCATION.id] = {
  density: 80,
  created_at: "2020-01-01T00:00:00.000Z",
  prevDensity: 70,
  avgRssi: null,
  packetCount: null,
};

const liveRec = buildRecommendation(liveOne);
const pin = locationFromPlace(placeFromSensor());
assert(liveRec.tone === "neutral", "single live sensor ? neutral");
assert(
  liveRec.text === `${pin.shortLabel} is Busy`,
  `expected ${pin.shortLabel} is Busy, got ${liveRec.text}`,
);
assert(
  !liveRec.text.includes("Anywhere looks similar"),
  "must not claim campus-wide similarity with one sensor",
);

const demo = seedDemoState("2020-01-01T00:00:00.000Z");
const demoRec = buildRecommendation(demo);
assert(demoRec.tone === "neutral", "one seeded pin ? single-sensor copy");
assert(
  demoRec.text === `${pin.shortLabel} is Moderate`,
  `expected ${pin.shortLabel} is Moderate, got ${demoRec.text}`,
);

console.log("crowd.selfcheck: ok");
