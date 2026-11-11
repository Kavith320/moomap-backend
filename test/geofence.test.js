const test = require("node:test");
const assert = require("node:assert/strict");
const { pointInPolygon, validatePolygon } = require("../src/services/geo");
const { evaluateFence } = require("../src/services/geofenceEngine");

// ~1km square near Colombo
const square = [
  { lat: 6.92, lon: 79.86 },
  { lat: 6.92, lon: 79.87 },
  { lat: 6.93, lon: 79.87 },
  { lat: 6.93, lon: 79.86 },
];
// L-shaped (concave) polygon
const lShape = [
  { lat: 0, lon: 0 },
  { lat: 0, lon: 2 },
  { lat: 1, lon: 2 },
  { lat: 1, lon: 1 },
  { lat: 2, lon: 1 },
  { lat: 2, lon: 0 },
];

test("pointInPolygon: inside / outside a square", () => {
  assert.equal(pointInPolygon({ lat: 6.925, lon: 79.865 }, square), true);
  assert.equal(pointInPolygon({ lat: 6.935, lon: 79.865 }, square), false);
  assert.equal(pointInPolygon({ lat: 6.925, lon: 79.875 }, square), false);
});

test("pointInPolygon: concave polygon notch is outside", () => {
  assert.equal(pointInPolygon({ lat: 0.5, lon: 1.5 }, lShape), true);
  assert.equal(pointInPolygon({ lat: 1.5, lon: 0.5 }, lShape), true);
  assert.equal(pointInPolygon({ lat: 1.5, lon: 1.5 }, lShape), false);
});

test("validatePolygon", () => {
  assert.equal(validatePolygon(square), null);
  assert.match(validatePolygon(square.slice(0, 2)), /at least 3/);
  assert.match(validatePolygon([...square.slice(0, 2), { lat: 95, lon: 0 }]), /polygon\[2\]/);
  assert.match(validatePolygon([...square.slice(0, 2), { lat: "6.9", lon: 79 }]), /polygon\[2\]/);
  assert.match(validatePolygon("nope"), /array/);
});

// Feed a sequence of inside/outside readings and collect transitions.
function run(readings, confirm = 2) {
  let state;
  const transitions = [];
  for (const inside of readings) {
    const r = evaluateFence(state, inside, confirm);
    state = r.state;
    if (r.transition) transitions.push(r.transition);
  }
  return { state, transitions };
}

test("engine: first reading inside is silent", () => {
  assert.deepEqual(run([true]).transitions, []);
  assert.equal(run([true]).state.status, "inside");
});

test("engine: exit needs 2 consecutive outside readings", () => {
  assert.deepEqual(run([true, false]).transitions, []);
  assert.deepEqual(run([true, false, false]).transitions, ["exit"]);
});

test("engine: single-reading jitter does not alert", () => {
  assert.deepEqual(run([true, false, true, false, true]).transitions, []);
});

test("engine: exit then re-enter", () => {
  assert.deepEqual(run([true, false, false, false, true, true]).transitions, ["exit", "enter"]);
});

test("engine: starting outside raises exit after confirmation", () => {
  assert.deepEqual(run([false]).transitions, []);
  assert.deepEqual(run([false, false]).transitions, ["exit"]);
});

test("engine: no repeated alerts while staying outside", () => {
  assert.deepEqual(run([true, false, false, false, false, false]).transitions, ["exit"]);
});

test("engine: confirmCount=1 alerts immediately", () => {
  assert.deepEqual(run([true, false, true], 1).transitions, ["exit", "enter"]);
});
