// Collar network: slave collars send LoRa frames to master collars; masters have the
// uplink and publish to MQTT (their own position as type "master", each received slave
// frame as type "slave" with LoRa metadata).
//
//   slave ──LoRa──► master ──MQTT──► broker ──► backend
//
// If several masters hear a frame, only the strongest one relays it (no duplicates).
const lora = require("./lora");
const { toLatLon } = require("./geo");

class Collar {
  constructor(cow, cfg, rnd) {
    this.cow = cow;
    this.id = cow.collarId;
    this.role = cow.role; // "master" | "slave"
    this.alive = true;
    this.battery = cfg.battery.start - rnd.range(0, 10);
    this.seq = 0;
    this.nextTxAt = 0;
    this.stats = { sent: 0, delivered: 0, lostWeak: 0, lostInterference: 0, lostNoMaster: 0 };
    this.last = null; // { rssi, snr, via, at }
  }
}

class Network {
  constructor({ herd, origin, cfg, rnd, publish, log }) {
    Object.assign(this, { herd, origin, cfg, rnd, publish, log });
    this.collars = herd.cows.map((cow) => new Collar(cow, cfg, rnd));
    this.byId = new Map(this.collars.map((c) => [c.id, c]));
    // spread the first transmissions so collars don't all fire in the same second
    const now = Date.now();
    for (const c of this.collars) {
      const interval = this.intervalS(c);
      c.nextTxAt = now + rnd.range(0, interval * 1000);
    }
  }

  get masters() {
    return this.collars.filter((c) => c.role === "master");
  }

  intervalS(collar) {
    return collar.role === "master" ? this.cfg.timing.masterIntervalS : this.cfg.timing.slaveIntervalS;
  }

  // Called every tick (real time).
  async tick(now = Date.now()) {
    for (const c of this.collars) {
      if (now < c.nextTxAt) continue;
      c.nextTxAt = now + this.intervalS(c) * 1000 * this.rnd.range(0.9, 1.1);
      if (!c.alive || c.battery <= 0) continue;
      if (c.role === "master") await this.masterReport(c);
      else await this.slaveTransmit(c);
    }
  }

  gpsFix(collar) {
    const { noiseM, invalidFixRate } = this.cfg.gps;
    if (this.rnd.chance(invalidFixRate)) return { lat: 0, lon: 0, valid: false };
    const ll = toLatLon(
      this.origin,
      collar.cow.x + this.rnd.gauss(0, noiseM),
      collar.cow.y + this.rnd.gauss(0, noiseM)
    );
    return { lat: round(ll.lat, 6), lon: round(ll.lon, 6), valid: true };
  }

  drain(collar) {
    collar.battery = Math.max(0, collar.battery - this.cfg.battery.drainPerTx * this.rnd.range(0.5, 1.5));
  }

  payload(collar, type, gps, extra = {}) {
    return {
      device_id: collar.id,
      type,
      gps,
      battery: {
        percent: Math.round(collar.battery),
        voltage: round(3.3 + (collar.battery / 100) * 0.9, 2),
      },
      seq: collar.seq,
      ts: new Date().toISOString(),
      sim: true,
      ...extra,
    };
  }

  async masterReport(master) {
    master.seq++;
    master.stats.sent++;
    this.drain(master);
    const ok = await this.publish(master.id, this.payload(master, "master", this.gpsFix(master)));
    if (ok) {
      master.stats.delivered++;
      master.last = { rssi: null, snr: null, via: "uplink", at: Date.now() };
    }
  }

  async slaveTransmit(slave) {
    slave.seq++;
    slave.stats.sent++;
    this.drain(slave);
    const gps = this.gpsFix(slave);

    // every powered master with a live uplink is a potential receiver
    let best = null;
    let lastFail = null;
    for (const m of this.masters) {
      if (!m.alive || m.battery <= 0) continue;
      const d = Math.hypot(m.cow.x - slave.cow.x, m.cow.y - slave.cow.y);
      const r = lora.transmit(d, this.cfg.lora, this.rnd);
      if (r.received && (!best || r.rssi > best.rssi)) best = { ...r, master: m, distance: d };
      if (!r.received) lastFail = r;
    }

    if (!best) {
      if (!this.masters.some((m) => m.alive && m.battery > 0)) slave.stats.lostNoMaster++;
      else if (lastFail && lastFail.reason === "interference") slave.stats.lostInterference++;
      else slave.stats.lostWeak++;
      slave.last = { rssi: lastFail ? lastFail.rssi : null, snr: lastFail ? lastFail.snr : null, via: null, at: Date.now() };
      return;
    }

    const loraMeta = {
      lora: {
        via: best.master.id,
        rssi: best.rssi,
        snr: best.snr,
        sf: this.cfg.lora.sf,
        bw: this.cfg.lora.bwKhz,
        freq: this.cfg.lora.freqMhz,
        distance_m: Math.round(best.distance),
      },
    };
    const topicId = this.cfg.mqtt.relayTopic === "master" ? best.master.id : slave.id;
    const ok = await this.publish(topicId, this.payload(slave, "slave", gps, loraMeta));
    if (ok) slave.stats.delivered++;
    slave.last = { rssi: best.rssi, snr: best.snr, via: best.master.id, at: Date.now() };
  }

  summary() {
    const t = { sent: 0, delivered: 0, lostWeak: 0, lostInterference: 0, lostNoMaster: 0 };
    for (const c of this.collars) for (const k of Object.keys(t)) t[k] += c.stats[k];
    return t;
  }
}

function round(v, d) {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

// Info line about the radio settings, printed at start-up.
function radioSummary(cfg) {
  const toa = lora.timeOnAirMs(cfg.lora.frameBytes, cfg.lora.sf, cfg.lora.bwKhz);
  const minInt = lora.minIntervalS(cfg.lora.frameBytes, cfg.lora);
  return {
    timeOnAirMs: Math.round(toa),
    minIntervalS: Math.ceil(minInt),
    nominalRangeM: Math.round(lora.nominalRangeM(cfg.lora)),
    sensitivityDbm: Math.round(lora.sensitivityDbm(cfg.lora.sf, cfg.lora.bwKhz) * 10) / 10,
    dutyCycleOk: cfg.timing.slaveIntervalS >= minInt,
  };
}

module.exports = { Network, Collar, radioSummary };
