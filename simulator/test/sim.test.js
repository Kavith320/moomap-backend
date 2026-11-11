const test = require("node:test");
const assert = require("node:assert/strict");
const lora = require("../src/lora");
const { createRandom } = require("../src/random");
const { makePasture, pointInPolygon, toLatLon, toXY } = require("../src/geo");
const { Cow, Herd, randomPointInside } = require("../src/herd");

const RADIO = {
  freqMhz: 868, sf: 9, bwKhz: 125, txPowerDbm: 14, pathLossExponent: 3.3,
  bodyLossDb: 10, shadowingDb: 4, randomLoss: 0.02, dutyCycle: 0.01,
};

test("time on air matches Semtech calculator values", () => {
  // SF7/125kHz, 20 B: (12.25 + 43 symbols) × 1.024 ms   = 56.6 ms
  // SF12/125kHz, 20 B, LDRO on: (12.25 + 28) × 32.768 ms = 1318.9 ms
  assert.ok(Math.abs(lora.timeOnAirMs(20, 7, 125) - 56.6) < 0.5);
  assert.ok(Math.abs(lora.timeOnAirMs(20, 12, 125) - 1318.9) < 1);
});

test("higher spreading factor = better sensitivity and longer range", () => {
  assert.ok(lora.sensitivityDbm(12, 125) < lora.sensitivityDbm(7, 125));
  assert.ok(lora.nominalRangeM({ ...RADIO, sf: 12 }) > lora.nominalRangeM({ ...RADIO, sf: 7 }));
});

test("packets close by almost always arrive; far beyond range never do", () => {
  const rnd = createRandom(1);
  const range = lora.nominalRangeM(RADIO);
  let near = 0;
  let far = 0;
  for (let i = 0; i < 1000; i++) {
    if (lora.transmit(range * 0.1, RADIO, rnd).received) near++;
    if (lora.transmit(range * 4, RADIO, rnd).received) far++;
  }
  assert.ok(near > 950, `near ${near}`);
  assert.equal(far, 0);
});

test("geo round trip lat/lon <-> metres", () => {
  const o = { lat: 7.29, lon: 80.63 };
  const ll = toLatLon(o, 300, -150);
  const xy = toXY(o, ll.lat, ll.lon);
  assert.ok(Math.abs(xy.x - 300) < 0.01 && Math.abs(xy.y + 150) < 0.01);
});

test("cows in normal mode stay inside the fence for a simulated day", () => {
  const rnd = createRandom(7);
  const pasture = makePasture(200, rnd);
  const cows = Array.from({ length: 10 }, (_, i) => {
    const p = randomPointInside(pasture, rnd);
    return new Cow({ cattleId: `C${i}`, name: `c${i}`, collarId: `X${i}`, role: "slave", x: p.x, y: p.y }, rnd);
  });
  const herd = new Herd(cows, pasture);
  for (let t = 0; t < 24 * 3600; t += 30) herd.step(30);
  for (const c of cows) assert.ok(pointInPolygon(c.pos, pasture), `${c.name} escaped`);
});

test("a wandering cow leaves the fence and comes back when sent home", () => {
  const rnd = createRandom(3);
  const pasture = makePasture(200, rnd);
  const p = randomPointInside(pasture, rnd);
  const cow = new Cow({ cattleId: "C", name: "w", collarId: "X", role: "slave", x: p.x, y: p.y }, rnd);
  const herd = new Herd([cow], pasture);
  cow.wander(pasture);
  for (let t = 0; t < 1800; t += 10) herd.step(10);
  assert.equal(cow.insideFence(pasture), false);
  assert.ok(cow.fenceDistance(pasture) < -50);
  cow.goHome(pasture);
  for (let t = 0; t < 1800; t += 10) herd.step(10);
  assert.equal(cow.insideFence(pasture), true);
  assert.equal(cow.mode, "normal");
});
