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
    // use device_id as _id so it's unique per device
    _id: {
      type: String, // device_id like "7454927D7850"
      required: true,
    },

    name: { type: String }, // e.g. "Cow 01"
    farmer: { type: String }, // owner / farmer name
    status: {
      type: String,
      enum: ["online", "offline", "error", "unknown"],
      default: "unknown",
    },

    lastSeen: { type: Date },
    lastLocation: LastLocationSchema,

    notes: { type: String },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = mongoose.model("Device", DeviceSchema);
