const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const auth = require("../middleware/auth");

// Global middleware for all admin routes: must be authenticated and have administrative privileges
router.use(auth.verifyToken);
router.use(auth.isAdmin);

// Statistics Endpoint
router.get("/stats", adminController.getStats);

// User Management Routes
router.get("/users", adminController.getAllUsers);
router.post("/users", adminController.createUser);
router.put("/users/:userId", adminController.updateUser);
router.delete("/users/:userId", adminController.deleteUser);

// Cattle Management Routes
router.get("/cattles", adminController.getAllCattles);
router.post("/cattles", adminController.createCattle);
router.put("/cattles/:cattleId", adminController.updateCattle);
router.delete("/cattles/:cattleId", adminController.deleteCattle);

// Device/Collar Management Routes
router.get("/devices", adminController.getAllDevices);
router.post("/devices", adminController.createDevice);
router.put("/devices/:deviceId", adminController.updateDevice);
router.delete("/devices/:deviceId", adminController.deleteDevice);
router.post("/devices/:deviceId/telemetry", adminController.simulateTelemetry);

// Geofences Overview Route
router.get("/geofences", adminController.getAllGeofences);

// Telemetry History Log Route
router.get("/telemetries", adminController.getAllTelemetries);

// Live Real-Time MQTT Stream Endpoint (SSE)
router.get("/mqtt-stream", adminController.getMqttStream);

// Map Markers Endpoint (Aggregated Locations)
router.get("/map-markers", adminController.getMapMarkers);

// MQTT Broker Configuration Routes
router.get("/mqtt-config", adminController.getMqttConfig);
router.post("/mqtt-config", adminController.updateMqttConfig);
router.post("/mqtt-config/test", adminController.testMqttConfig);

module.exports = router;
