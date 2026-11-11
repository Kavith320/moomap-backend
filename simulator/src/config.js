// Simulator settings, read from simulator/.env (see .env.example).
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const num = (k, d) => {
  const v = Number(env(k, d));
  if (!Number.isFinite(v)) throw new Error(`${k} must be a number`);
  return v;
};

const config = {
  backendUrl: env("BACKEND_URL", "http://localhost:3000").replace(/\/$/, ""),

  mqtt: {
    url: env("MQTT_URL", "mqtt://localhost:1883"),
    username: env("MQTT_USERNAME", ""),
    password: env("MQTT_PASSWORD", ""),
    topicPrefix: env("MQTT_TOPIC_PREFIX", "cc"),
    // "slave": master relays each slave on cc/<slaveId>/payload
    // "master": master relays on its own topic cc/<masterId>/payload (device_id inside identifies the slave)
    relayTopic: env("RELAY_TOPIC", "slave"),
  },

  user: {
    firstName: env("SIM_USER_FIRST_NAME", "Sim"),
    lastName: env("SIM_USER_LAST_NAME", "Farmer"),
    mobile: env("SIM_USER_MOBILE", "0700000001"),
    password: env("SIM_USER_PASSWORD", "simfarmer123"),
  },

  herd: {
    size: num("HERD_SIZE", 8),
    masters: num("MASTERS", 1),
    centerLat: num("CENTER_LAT", 7.2906),
    centerLon: num("CENTER_LON", 80.6337),
    pastureRadiusM: num("PASTURE_RADIUS_M", 250),
    idPrefix: env("ID_PREFIX", "SIM"),
    fenceName: env("FENCE_NAME", "Sim pasture"),
  },

  timing: {
    slaveIntervalS: num("SLAVE_INTERVAL_S", 30),
    masterIntervalS: num("MASTER_INTERVAL_S", 30),
    timeScale: num("TIME_SCALE", 1), // >1 makes cows move faster than real time
  },

  gps: {
    noiseM: num("GPS_NOISE_M", 3),
    invalidFixRate: num("GPS_INVALID_RATE", 0.02),
  },

  battery: {
    start: num("BATTERY_START", 95),
    drainPerTx: num("BATTERY_DRAIN_PER_TX", 0.01),
  },

  lora: {
    freqMhz: num("LORA_FREQ_MHZ", 868),
    sf: num("LORA_SF", 9),
    bwKhz: num("LORA_BW_KHZ", 125),
    txPowerDbm: num("LORA_TX_DBM", 14),
    pathLossExponent: num("LORA_PATHLOSS_EXP", 3.3),
    bodyLossDb: num("LORA_BODY_LOSS_DB", 10),
    shadowingDb: num("LORA_SHADOWING_DB", 4),
    randomLoss: num("LORA_RANDOM_LOSS", 0.02),
    dutyCycle: num("LORA_DUTY_CYCLE", 0.01),
    frameBytes: num("LORA_FRAME_BYTES", 18),
  },

  seed: num("SIM_SEED", 42),
  stateFile: path.join(__dirname, "..", "herd.json"),
};

if (![7, 8, 9, 10, 11, 12].includes(config.lora.sf)) throw new Error("LORA_SF must be 7-12");
if (config.herd.masters < 1 || config.herd.masters > config.herd.size) throw new Error("MASTERS must be 1..HERD_SIZE");

module.exports = config;
