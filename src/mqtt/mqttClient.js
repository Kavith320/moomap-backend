// src/mqtt/mqttClient.js
require("dotenv").config();
const mqtt = require("mqtt");
const EventEmitter = require("events");
const telemetryEmitter = new EventEmitter();

const Device = require("../models/Device");
const Telemetry = require("../models/Telemetry");

// Robust JSON parser for payloads like:
// {\"type\":\"slave\",\"device_id\":\"...\"}
function parsePayload(rawStr) {
  // 1) normal JSON
  try {
    return JSON.parse(rawStr);
  } catch (e1) {
    // continue
  }

  // 2) double-encoded JSON string
  try {
    const once = JSON.parse(rawStr);
    if (typeof once === "string") {
      return JSON.parse(once);
    }
  } catch (e2) {
    // continue
  }

  // 3) manually unescape
  try {
    let cleaned = rawStr.trim();

    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }

    cleaned = cleaned.replace(/\\"/g, '"');

    return JSON.parse(cleaned);
  } catch (e3) {
    console.error("❌ Failed to parse MQTT payload as JSON:", rawStr);
    throw e3;
  }
}

let clientInstance = null;

function startMqtt() {
  const mqttUrl = process.env.MQTT_URL || "mqtt://localhost:1883";

  const options = {
    clientId:
      process.env.MQTT_CLIENT_ID ||
      "moomap-backend-" + Math.random().toString(16).slice(2, 10),
    clean: true,
  };

  if (process.env.MQTT_USERNAME) {
    options.username = process.env.MQTT_USERNAME;
  }
  if (process.env.MQTT_PASSWORD) {
    options.password = process.env.MQTT_PASSWORD;
  }

  console.log("🔌 Connecting to MQTT broker:", mqttUrl);
  const client = mqtt.connect(mqttUrl, options);
  clientInstance = client;

  client.on("connect", () => {
    console.log("✔️ Connected to MQTT broker");

    const topic = process.env.MQTT_TOPIC || "cc/+/payload";

    client.subscribe(topic, (err) => {
      if (err) {
        console.error("❌ MQTT subscribe error:", err);
      } else {
        console.log("📡 Subscribed to topic:", topic);
      }
    });
  });

  client.on("error", (err) => {
    console.error("❌ MQTT error:", err);
  });

  client.on("message", async (topic, message) => {
    const payloadStr = message.toString();
    console.log("📩 MQTT message:", topic, payloadStr);

    let payload;
    try {
      payload = parsePayload(payloadStr);
    } catch (err) {
      console.error("❌ Ignoring message: invalid JSON");
      return;
    }

    // topic: cc/7454927D7850/payload
    const parts = topic.split("/");
    const group = parts[0] || "unknown";
    const chipFromTopic = parts[1];

    // prefer device_id from payload, then chipFromTopic
    const deviceId =
      payload.device_id ||
      payload.chipId ||
      payload.deviceId ||
      chipFromTopic ||
      "unknown";

    // always use real current time for DB timestamps
    const now = new Date();

    const gps = payload.gps || {};
    const battery = payload.battery || {};

    // 1️⃣ Save telemetry history
    const telemetryDoc = {
      deviceId,
      timestamp: now,
      topic,
      gpsLat: typeof gps.lat === "number" ? gps.lat : undefined,
      gpsLon: typeof gps.lon === "number" ? gps.lon : undefined,
      gpsValid:
        typeof gps.valid === "boolean" ? gps.valid : undefined,
      batteryPercent:
        typeof battery.percent === "number" ? battery.percent : undefined,
      batteryVoltage:
        typeof battery.voltage === "number" ? battery.voltage : undefined,
      raw: payload,
    };

    try {
      await Telemetry.create(telemetryDoc);
      console.log(`📝 Saved telemetry for device ${deviceId}`);
    } catch (err) {
      console.error("❌ Error saving telemetry:", err);
      return;
    }

    // 2️⃣ Update device snapshot (latest state)
    try {
      const update = {
        type: payload.type || payload.device_type || "unknown",
        group,
        lastSeen: now,

        // full last payload
        meta: {
          ...payload,
        },
      };

      // last location
      if (typeof gps.lat === "number" && typeof gps.lon === "number") {
        update.lastLocation = {
          lat: gps.lat,
          lon: gps.lon,
          timestamp: now,
        };
      }

      // last battery
      if (typeof battery.percent === "number") {
        update.lastBatteryPercent = battery.percent;
      }
      if (typeof battery.voltage === "number") {
        update.lastBatteryVoltage = battery.voltage;
      }

      await Device.findByIdAndUpdate(deviceId, { $set: update }, {
        upsert: true,
        new: true,
      });

      console.log(`📘 Updated device snapshot for ${deviceId}`);
      
      // Emit event for real-time streaming
      telemetryEmitter.emit("message", {
        topic,
        payloadStr,
        timestamp: now,
        deviceId,
        parsed: payload
      });
    } catch (err) {
      console.error("❌ Error updating device:", err);
    }
  });

  return client;
}

startMqtt.isMqttConnected = () => {
  return clientInstance ? clientInstance.connected : false;
};

startMqtt.telemetryEmitter = telemetryEmitter;

module.exports = startMqtt;
