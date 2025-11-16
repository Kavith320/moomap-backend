// src/mqtt/mqttClient.js
require("dotenv").config();
const mqtt = require("mqtt");
const mongoose = require("mongoose");

const Device = require("../models/Device");

// tolerant JSON parsing for weird escaping from A9G
function parsePayload(rawStr) {
  // 1) try normal JSON
  try {
    return JSON.parse(rawStr);
  } catch (e1) {
    // continue
  }

  let s = rawStr.trim();

  // 2) if wrapped in quotes: "\"{...}\""
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
    try {
      return JSON.parse(s);
    } catch (e2) {
      // continue
    }
  }

  // 3) unescape \" -> "
  const unescaped = s.replace(/\\\"/g, '"');
  try {
    return JSON.parse(unescaped);
  } catch (e3) {
    console.error("❌ Failed to parse MQTT JSON payload");
    console.error("   raw     :", rawStr);
    console.error("   cleaned :", unescaped);
    throw e3;
  }
}

function startMqtt() {
  const url = process.env.MQTT_URL;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;

  console.log("🔌 Connecting to MQTT broker:", url);

  const client = mqtt.connect(url, {
    username,
    password,
    reconnectPeriod: 2000,
  });

  client.on("connect", () => {
    console.log("✔️ Connected to MQTT");

    // your topic pattern: cc/<chip_id>/payload
    client.subscribe("cc/+/payload", (err) => {
      if (err) console.error("MQTT subscribe error:", err);
      else console.log("📡 Subscribed to: cc/+/payload");
    });
  });

  client.on("error", (err) => {
    console.error("❌ MQTT error:", err);
  });

  client.on("message", async (topic, message) => {
    const payloadStr = message.toString();
    console.log("📩 MQTT message:", topic, payloadStr);

    try {
      // parse JSON (handling escaped style)
      const payload = parsePayload(payloadStr);

      // topic format: cc/<chip_id>/payload
      const parts = topic.split("/");
      const chipIdFromTopic = parts[1];

      // get device_id from payload if present, else from topic
      const deviceId = payload.device_id || chipIdFromTopic;

      // === 1) Telemetry insert: per-device collection, raw payload ===
      const collectionName = `dev_${deviceId}`;
      const coll = mongoose.connection.collection(collectionName);

      await coll.insertOne(payload); // store EXACT payload from device

      console.log(`💾 Stored telemetry in collection ${collectionName}`);

      // === 2) Device metadata update (separate 'devices' collection) ===
      // (it's okay if metadata is extra; this is server-side, not telemetry)
      const now = new Date();
      const gps = payload.gps || null;

      const update = {
        _id: deviceId,
        lastSeen: now,
      };

      if (gps && typeof gps.lat === "number" && typeof gps.lon === "number") {
        update.lastLocation = {
          lat: gps.lat,
          lon: gps.lon,
          timestamp: now,
        };
      }

      await Device.findByIdAndUpdate(
        deviceId,
        update,
        { upsert: true, new: true }
      );

      console.log(`📘 Updated metadata for device ${deviceId}`);
    } catch (err) {
      console.error("❌ Error handling MQTT message:", err);
    }
  });

  return client;
}

module.exports = startMqtt;
