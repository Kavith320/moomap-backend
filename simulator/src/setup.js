#!/usr/bin/env node
// Creates (or updates) the simulated farm in the backend:
//   1 user  ·  HERD_SIZE cattle  ·  collars (MASTERS master + rest slave)  ·  1 geofence
// and writes herd.json, which `npm start` uses. Safe to run again.
//
//   npm run setup            reuse herd.json if present
//   npm run setup -- --fresh generate a new herd layout
const fs = require("fs");
const cfg = require("./config");
const { createRandom } = require("./random");
const { makePasture, toLatLon } = require("./geo");
const { randomPointInside } = require("./herd");
const { createApi, ensureUser } = require("./backendApi");
const { connectMqtt } = require("./mqttLink");
const { fetchPhotoSet, downloadAsDataUrl } = require("./photos");

const NAMES = ["Kiri", "Raththi", "Sudu", "Kalu", "Manel", "Nilu", "Rani", "Lakshmi", "Podi", "Menike", "Tikiri", "Chuti",
  "Somi", "Bindu", "Hema", "Gaya", "Neela", "Pinki", "Thara", "Wasana"];
const BREEDS = ["Sahiwal", "Jersey", "Friesian", "Local", "Sindhi"];
const pad = (n) => String(n).padStart(2, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function generateLayout(origin) {
  const rnd = createRandom(cfg.seed);
  const pasture = makePasture(cfg.herd.pastureRadiusM, rnd);
  const p = cfg.herd.idPrefix;
  const cows = [];
  // masters spread through the herd so slaves have one nearby
  const masterEvery = Math.floor(cfg.herd.size / cfg.herd.masters);
  let m = 0;
  let s = 0;
  for (let i = 0; i < cfg.herd.size; i++) {
    const isMaster = i % masterEvery === 0 && m < cfg.herd.masters;
    const role = isMaster ? "master" : "slave";
    const collarId = isMaster ? `${p}-M${pad(++m)}` : `${p}-S${pad(++s)}`;
    const home = randomPointInside(pasture, rnd);
    cows.push({
      cattleId: `${p}-COW-${pad(i + 1)}`,
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""),
      breed: rnd.pick(BREEDS),
      gender: rnd.chance(0.85) ? "Female" : "Male",
      age: rnd.int(1, 9),
      collarId,
      role,
      home,
    });
  }
  return { origin, pasture, cows };
}

async function attachPhotos(api, state, reroll) {
  const existing = new Map(((await api.get("/api/cattles")).data || []).map((c) => [c._id || c.cattleId, c]));
  for (const c of state.cows) {
    const e = existing.get(c.cattleId);
    if (e && e.Image) Object.assign(c, { image: e.Image, imageCredit: e.imageCredit });
  }
  const todo = state.cows.filter((c) => reroll || !(existing.get(c.cattleId) || {}).Image);
  if (!todo.length) {
    console.log("✔ Every cow already has a photo (use --photos to pick new ones)");
    return;
  }
  let set;
  try {
    set = await fetchPhotoSet();
  } catch (err) {
    console.log(`⚠ Skipping photos: could not reach Wikimedia Commons (${err.message})`);
    return;
  }
  // shuffle (seeded by time so --photos gives a new mix), then deal one photo per cow
  const rnd = createRandom(Date.now());
  const deck = [...set].sort(() => rnd.next() - 0.5);
  let done = 0;
  for (let i = 0; i < todo.length; i++) {
    const cow = todo[i];
    const photo = deck[i % deck.length];
    try {
      const image = await downloadAsDataUrl(photo.url);
      const r = await api.post(`/api/cattles/${encodeURIComponent(cow.cattleId)}/image`, {
        image,
        credit: photo.credit,
        sourceUrl: photo.sourceUrl,
      });
      if (!r.ok) throw new Error(r.error);
      cow.image = r.data.Image;
      cow.imageCredit = r.data.imageCredit;
      done++;
    } catch (err) {
      console.log(`⚠ Photo for ${cow.name} failed: ${err.message}`);
    }
  }
  console.log(`✔ Added photos to ${done} cattle (Wikimedia Commons, Category: Cattle in Sri Lanka)`);
}

async function main() {
  const fresh = process.argv.includes("--fresh");
  console.log(`→ Backend ${cfg.backendUrl}`);
  const health = await fetch(cfg.backendUrl + "/health").catch(() => null);
  if (!health || !health.ok) throw new Error(`Backend not reachable at ${cfg.backendUrl}`);

  const api = createApi(cfg.backendUrl);
  const { userId } = await ensureUser(api, cfg.user);
  console.log(`✔ Logged in as sim user ${userId}`);

  let state = !fresh && fs.existsSync(cfg.stateFile) ? JSON.parse(fs.readFileSync(cfg.stateFile, "utf8")) : null;
  if (!state) {
    // Pasture goes around the farmer's home location (portal → Profile) if one is set
    const me = await api.get("/api/users/me");
    const home = me.ok && me.data.homeLocation;
    const origin = home ? { lat: home.lat, lon: home.lon } : { lat: cfg.herd.centerLat, lon: cfg.herd.centerLon };
    console.log(
      home
        ? `✔ Using the farmer's home location "${home.name || "Farm home"}" (${home.lat}, ${home.lon})`
        : `ℹ No home location on the farmer's profile; using CENTER_LAT/CENTER_LON (${origin.lat}, ${origin.lon})`
    );
    state = generateLayout(origin);
  } else {
    console.log(`↺ Reusing layout from herd.json (${state.cows.length} cattle). Use --fresh for a new one.`);
  }

  // 1. Announce every collar over MQTT so the backend registers it as a device
  const link = connectMqtt(cfg);
  await link.ready;
  for (const c of state.cows) {
    const ll = toLatLon(state.origin, c.home.x, c.home.y);
    await link.publish(c.collarId, {
      device_id: c.collarId,
      type: c.role,
      gps: { lat: +ll.lat.toFixed(6), lon: +ll.lon.toFixed(6), valid: true },
      battery: { percent: cfg.battery.start, voltage: 4.1 },
      seq: 0,
      ts: new Date().toISOString(),
      sim: true,
      boot: true,
    });
  }
  console.log(`✔ Announced ${state.cows.length} collars on ${cfg.mqtt.url}`);

  // 2. Cattle (retry while the backend ingests the first MQTT messages)
  for (const c of state.cows) {
    const body = { cattleId: c.cattleId, name: c.name, breed: c.breed, gender: c.gender, age: c.age, collarId: c.collarId, farmName: "Simulated farm" };
    let done = false;
    for (let attempt = 0; attempt < 20 && !done; attempt++) {
      const r = await api.post("/api/cattles", body);
      if (r.ok) {
        done = true;
      } else if (r.status === 409 && /cattleId/.test(r.error || "")) {
        const mine = await api.get(`/api/cattles/${encodeURIComponent(c.cattleId)}`);
        if (!mine.ok) throw new Error(`${c.cattleId} exists but belongs to another user. Change ID_PREFIX.`);
        await api.put(`/api/cattles/${encodeURIComponent(c.cattleId)}`, { name: c.name, collarId: c.collarId });
        done = true;
      } else if (r.status === 400 && /collarId/.test(r.error || "")) {
        await sleep(1000); // device not ingested yet
      } else if (r.status === 409 && /collarId/.test(r.error || "")) {
        throw new Error(`Collar ${c.collarId} is attached to someone else's cattle. Change ID_PREFIX.`);
      } else {
        throw new Error(`Creating ${c.cattleId} failed: ${r.status} ${r.error}`);
      }
    }
    if (!done) {
      throw new Error(
        `Backend never registered collar ${c.collarId}. Is the backend subscribed to the same broker (${cfg.mqtt.url})?`
      );
    }
  }
  console.log(`✔ ${state.cows.length} cattle ready (${state.cows.filter((c) => c.role === "master").length} master collar(s))`);

  // 3. Geofence around the pasture, monitoring the whole herd
  const polygon = state.pasture.map((p) => {
    const ll = toLatLon(state.origin, p.x, p.y);
    return { lat: +ll.lat.toFixed(6), lon: +ll.lon.toFixed(6) };
  });
  const fenceBody = { name: cfg.herd.fenceName, enabled: true, polygon, cattleIds: state.cows.map((c) => c.cattleId) };
  const fences = await api.get("/api/geofences");
  const existing = (fences.data || []).find((f) => f.name === cfg.herd.fenceName);
  const fr = existing
    ? await api.put(`/api/geofences/${existing._id}`, fenceBody)
    : await api.post("/api/geofences", fenceBody);
  if (!fr.ok) throw new Error(`Geofence: ${fr.error}`);
  state.fenceId = String(fr.data._id);
  console.log(`✔ Geofence "${cfg.herd.fenceName}" ${existing ? "updated" : "created"}`);

  // 4. Photos: a random real photo of Sri Lankan cattle for every cow that has none
  //    (--photos re-rolls all of them, --no-photos skips this step)
  if (!process.argv.includes("--no-photos")) {
    await attachPhotos(api, state, process.argv.includes("--photos"));
  }

  state.user = { userId, mobile: cfg.user.mobile };
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(cfg.stateFile, JSON.stringify(state, null, 2));
  await link.close();

  console.log(`\nDone. State saved to herd.json.`);
  console.log(`Portal login: ${cfg.user.mobile} / ${cfg.user.password}`);
  console.log(`Start the herd: npm start   (or: npm start -- --scenario=demo)`);
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
