// src/index.js
require("dotenv").config();
const express = require("express");
const connectDatabase = require("./config/database");
const startMqtt = require("./mqtt/mqttClient");

const usersRouter = require("./routes/users");
const cattlesRouter = require("./routes/cattles");
const geofencesRouter = require("./routes/geofences");
const collarDataRouter = require("./routes/collarData");
const adminRouter = require("./routes/admin");

const app = express();

console.log("🚀 Starting IoT backend...");

// connect to MongoDB, then start MQTT
(async () => {
  try {
    console.log("📡 Connecting to MongoDB...");
    await connectDatabase();
    console.log("✔️ MongoDB connection initialized");

    // Seed default admin user if none exists
    const User = require("./models/User");
    const bcrypt = require("bcryptjs");
    const adminMobile = process.env.ADMIN_MOBILE || "0771234567";
    const existingAdmin = await User.findOne({ role: "admin" });
    if (!existingAdmin) {
      const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD || "admin1234", 10);
      await User.create({
        _id: "00000",
        firstName: "System",
        lastName: "Administrator",
        mobile: adminMobile,
        nicNo: "999999999V",
        address: "MooMap Server",
        password: hashed,
        role: "admin",
      });
      console.log(`⚡ Seeded default admin account: ${adminMobile} / admin1234`);
    }

    console.log("🔌 Starting MQTT client...");
    startMqtt();
  } catch (err) {
    console.error("❌ Fatal startup error:", err);
    process.exit(1);
  }
})();

// CORS middleware (manual implementation - no extra dependencies)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

app.use("/api/users", usersRouter);
app.use("/api/cattles", cattlesRouter);
app.use("/api/geofences", geofencesRouter);
app.use("/api/collar-data", collarDataRouter);
app.use("/api/admin", adminRouter);

app.get("/", (req, res) => res.send("OK"));

// simple health-check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "MooMap IoT backend is running 🐄",
    time: new Date().toISOString(),
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🟢 HTTP server listening on port ${PORT}`);
});

