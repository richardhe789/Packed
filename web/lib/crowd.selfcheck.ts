/**
 * Tiny assert check for single-ESP32 recommendation behavior.
 * Run from web/: npx --yes tsx lib/crowd.selfcheck.ts
 */
import {
  buildRecommendation,
  emptyState,
  seedDemoState,
  type ReadingState,
} from "./crowd";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const liveOne: Record<string, ReadingState> = emptyState();
liveOne.dining_hall_main = {
  density: 80,
  created_at: "2020-01-01T00:00:00.000Z",
  prevDensity: 70,
};

const liveRec = buildRecommendation(liveOne, false);
assert(liveRec.tone === "neutral", "single live sensor ? neutral");
assert(
  liveRec.text === "Dietrick is Busy",
  `expected Dietrick is Busy, got ${liveRec.text}`,
);
assert(
  !liveRec.text.includes("Anywhere looks similar"),
  "must not claim campus-wide similarity with one sensor",
);

const demo = seedDemoState("2020-01-01T00:00:00.000Z");
const demoRec = buildRecommendation(demo, true);
assert(demoRec.tone === "go", "seeded demo with gap ? go");
assert(demoRec.text.startsWith("Go to "), `expected Go to…, got ${demoRec.text}`);

console.log("crowd.selfcheck: ok");
