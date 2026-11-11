// src/models/Alert.js
const mongoose = require("mongoose");

const AlertSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true }, // recipient (cattle owner)
    cattleId: { type: String },
    cattleName: { type: String },
    deviceId: { type: String },

    type: {
      type: String,
      required: true,
      enum: [
        "geofence_exit",
        "geofence_enter",
        "low_battery",
        "device_offline",
        "device_online",
      ],
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },
    title: { type: String, required: true },
    message: { type: String },

    fenceId: { type: String },
    fenceName: { type: String },
    location: {
      lat: { type: Number },
      lon: { type: Number },
    },
    data: { type: Object }, // extra context (battery %, lastSeen, ...)

    read: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.alertId = String(ret._id);
        return ret;
      },
    },
  }
);

AlertSchema.index({ userId: 1, createdAt: -1 });
AlertSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model("Alert", AlertSchema);
