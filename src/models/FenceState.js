// src/models/FenceState.js
// Last known inside/outside status of each cattle for each geofence that applies to it.
// One document per cattle; `fences` is keyed by fenceId.
const mongoose = require("mongoose");

const FenceStateSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // cattleId
    userId: { type: String, required: true, index: true },
    deviceId: { type: String },
    // { [fenceId]: { status: "inside"|"outside"|null, pendingStatus, pendingCount } }
    fences: { type: Object, default: {} },
    lastLocation: {
      lat: { type: Number },
      lon: { type: Number },
      timestamp: { type: Date },
    },
  },
  { timestamps: true, minimize: false, versionKey: false, collection: "fence_states" }
);

module.exports = mongoose.model("FenceState", FenceStateSchema);
