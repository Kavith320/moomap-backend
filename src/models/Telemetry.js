// src/models/Telemetry.js
const mongoose = require("mongoose");

const TelemetrySchema = new mongoose.Schema(
  {
    // which device this record belongs to
    deviceId: {
      type: String,
      required: true,
      index: true,
    },

    // main timestamp for this telemetry
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    // MQTT topic
    topic: {
      type: String,
      index: true,
    },

    // parsed GPS fields (optional)
    gpsLat: { type: Number },
    gpsLon: { type: Number },
    gpsValid: { type: Boolean },

    // parsed battery fields (optional)
    batteryPercent: { type: Number },
    batteryVoltage: { type: Number },

    // full raw payload exactly as sent by device
    raw: {
      type: Object,
      required: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

TelemetrySchema.index({ deviceId: 1, timestamp: -1 });

module.exports = mongoose.model("Telemetry", TelemetrySchema);
