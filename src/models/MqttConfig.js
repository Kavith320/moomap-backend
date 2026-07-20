const mongoose = require("mongoose");

const MqttConfigSchema = new mongoose.Schema(
  {
    protocol: {
      type: String,
      enum: ["mqtt", "mqtts", "ws", "wss"],
      default: "mqtt",
    },
    host: {
      type: String,
      required: true,
      default: "localhost",
    },
    port: {
      type: Number,
      required: true,
      default: 1883,
    },
    path: {
      type: String,
      default: "/mqtt",
    },
    topic: {
      type: String,
      default: "cc/+/payload",
    },
    username: {
      type: String,
      default: "",
    },
    password: {
      type: String,
      default: "",
    },
    rejectUnauthorized: {
      type: Boolean,
      default: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MqttConfig", MqttConfigSchema);
