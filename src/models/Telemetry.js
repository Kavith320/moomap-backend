// src/models/Telemetry.js
const mongoose = require("mongoose");

const TelemetrySchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      index: true,
    },

    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    type: {
      type: String, // e.g. "status", "alert", "boot"
      default: "status",
    },

    gps: {
      lat: Number,
      lon: Number,
      fix: Boolean,
      satellites: Number,
      speed_kmh: Number,
      heading_deg: Number,
    },

    signal: {
      csq: Number,
      rssi_dbm: Number,
      network: String,
      rat: String, // LTE / 3G / etc
    },

    battery: {
      percent: Number,
      voltage: Number,
    },

    // raw payload if we want to keep everything exactly as sent
    raw: {
      type: Object,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt for the DB record
  }
);

// compound index for fast queries per device over time
TelemetrySchema.index({ deviceId: 1, timestamp: -1 });

module.exports = mongoose.model("Telemetry", TelemetrySchema);
