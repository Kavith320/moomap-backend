// src/mqtt/mqttClient.js
require("dotenv").config();
const mqtt = require("mqtt");
const EventEmitter = require("events");
const telemetryEmitter = new EventEmitter();

const Device = require("../models/Device");
const Telemetry = require("../models/Telemetry");
const MqttConfig = require("../models/MqttConfig");

// Robust JSON parser for payloads like: {\"type\":\"slave\",\"device_id\":\"...\"}
function parsePayload(rawStr) {
  try {
    return JSON.parse(rawStr);
  } catch (e1) {
    // continue
  }

  try {
    const once = JSON.parse(rawStr);
    if (typeof once === "string") {
      return JSON.parse(once);
    }
  } catch (e2) {
    // continue
  }

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
let currentConfig = null;

function buildBrokerUrl(config) {
  const { protocol, host, port, path } = config;
  if (protocol === "ws" || protocol === "wss") {
    const wsPath = path ? (path.startsWith("/") ? path : `/${path}`) : "/mqtt";
    return `${protocol}://${host}:${port}${wsPath}`;
  }
  return `${protocol}://${host}:${port}`;
}

async function startMqtt(customConfig = null) {
  // Disconnect existing client if active
  if (clientInstance) {
    console.log("🔄 Disconnecting active MQTT client...");
    clientInstance.end(true);
    clientInstance = null;
  }

  let config = customConfig;
  if (!config) {
    try {
      const dbConfig = await MqttConfig.findOne().sort({ updatedAt: -1 });
      if (dbConfig) {
        config = dbConfig.toObject ? dbConfig.toObject() : dbConfig;
      }
    } catch (e) {
      console.warn("⚠️ Could not load MqttConfig from DB, using fallback env variables.");
    }
  }

  // Fallback defaults if no DB config
  if (!config) {
    const envUrl = process.env.MQTT_URL || "mqtt://localhost:1883";
    let proto = "mqtt";
    let host = "localhost";
    let port = 1883;
    let path = "/mqtt";

    try {
      const parsedUrl = new URL(envUrl);
      proto = parsedUrl.protocol.replace(":", "") || "mqtt";
      host = parsedUrl.hostname || "localhost";
      port = parsedUrl.port ? parseInt(parsedUrl.port) : (proto === "mqtts" ? 8883 : 1883);
      path = parsedUrl.pathname || "/mqtt";
    } catch (e) {
      // Keep defaults
    }

    config = {
      protocol: proto,
      host,
      port,
      path,
      topic: process.env.MQTT_TOPIC || "cc/+/payload",
      username: process.env.MQTT_USERNAME || "",
      password: process.env.MQTT_PASSWORD || "",
      rejectUnauthorized: true,
    };
  }

  currentConfig = config;
  const mqttUrl = buildBrokerUrl(config);

  const options = {
    clientId:
      process.env.MQTT_CLIENT_ID ||
      "moomap-backend-" + Math.random().toString(16).slice(2, 10),
    clean: true,
    connectTimeout: 10000,
    rejectUnauthorized: config.rejectUnauthorized !== false,
    reconnectPeriod: 10000,
  };

  if (config.username) {
    options.username = config.username;
  }
  if (config.password) {
    options.password = config.password;
  }

  console.log(`🔌 Connecting to MQTT broker (${(config.protocol || "mqtt").toUpperCase()}):`, mqttUrl);
  const client = mqtt.connect(mqttUrl, options);
  clientInstance = client;

  client.on("connect", () => {
    console.log(`✔️ Connected to MQTT broker [${mqttUrl}]`);

    const topic = config.topic || process.env.MQTT_TOPIC || "cc/+/payload";

    client.subscribe(topic, (err) => {
      if (err) {
        console.error("❌ MQTT subscribe error:", err);
      } else {
        console.log("📡 Subscribed to topic:", topic);
      }
    });
  });

  client.on("error", (err) => {
    console.error("❌ MQTT error:", err.message);
  });

  client.on("message", async (topic, message) => {
    const payloadStr = message.toString();
    console.log("md MQTT message:", topic, payloadStr);

    let payload;
    try {
      payload = parsePayload(payloadStr);
    } catch (err) {
      console.error("❌ Ignoring message: invalid JSON");
      return;
    }

    const parts = topic.split("/");
    const group = parts[0] || "unknown";
    const chipFromTopic = parts[1];

    const deviceId =
      payload.device_id ||
      payload.chipId ||
      payload.deviceId ||
      chipFromTopic ||
      "unknown";

    const now = new Date();
    const gps = payload.gps || {};
    const battery = payload.battery || {};

    const telemetryDoc = {
      deviceId,
      timestamp: now,
      topic,
      gpsLat: typeof gps.lat === "number" ? gps.lat : undefined,
      gpsLon: typeof gps.lon === "number" ? gps.lon : undefined,
      gpsValid: typeof gps.valid === "boolean" ? gps.valid : undefined,
      batteryPercent: typeof battery.percent === "number" ? battery.percent : undefined,
      batteryVoltage: typeof battery.voltage === "number" ? battery.voltage : undefined,
      raw: payload,
    };

    try {
      await Telemetry.create(telemetryDoc);
      console.log(`📝 Saved telemetry for device ${deviceId}`);
    } catch (err) {
      console.error("❌ Error saving telemetry:", err);
      return;
    }

    try {
      const update = {
        type: payload.type || payload.device_type || "unknown",
        group,
        lastSeen: now,
        meta: { ...payload },
      };

      if (typeof gps.lat === "number" && typeof gps.lon === "number") {
        update.lastLocation = {
          lat: gps.lat,
          lon: gps.lon,
          timestamp: now,
        };
      }

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

      telemetryEmitter.emit("message", {
        topic,
        payloadStr,
        timestamp: now,
        deviceId,
        parsed: payload,
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

startMqtt.getStatus = () => {
  return {
    connected: clientInstance ? clientInstance.connected : false,
    config: currentConfig,
  };
};

startMqtt.telemetryEmitter = telemetryEmitter;

module.exports = startMqtt;
