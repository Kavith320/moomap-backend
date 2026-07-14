// src/models/Device.js
const mongoose = require("mongoose");

const LastLocationSchema = new mongoose.Schema(
  {
    lat: { type: Number },
    lon: { type: Number },
    timestamp: { type: Date },
  },
  { _id: false }
);

const DeviceSchema = new mongoose.Schema(
  {
    // device_id / chipId is used as primary key
    _id: {
      type: String,
      required: true, // e.g. "2C7A927D7850"
    },

    // type from payload ("master", "slave", "status", etc.)
    type: {
      type: String,
      default: "unknown",
    },

    // MQTT group/prefix, e.g. "cc" from cc/<id>/payload
    group: {
      type: String,
      default: "unknown",
    },

    // last time we got a message from this device
    lastSeen: {
      type: Date,
    },

    // last known GPS location
    lastLocation: LastLocationSchema,

    // last known battery snapshot
    lastBatteryPercent: { type: Number },
    lastBatteryVoltage: { type: Number },

    // latest full payload for this device
    // (we overwrite this on every new MQTT message)
    meta: {
      type: Object,
      default: {},
    },

    // optional notes
    notes: {
      type: String,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = mongoose.model("Device", DeviceSchema);
