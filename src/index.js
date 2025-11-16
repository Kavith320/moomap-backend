require("dotenv").config();
const express = require("express");
const connectDatabase = require("./config/database");
const startMqtt = require("./mqtt/mqttClient");

const app = express();

// connect to MongoDB
connectDatabase();

// start MQTT client
startMqtt();

// middleware
app.use(express.json());

// health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "MooMap IoT backend is running 🐄",
    time: new Date().toISOString(),
  });
});

// port
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 MooMap IoT backend listening on port ${PORT}`);
});
