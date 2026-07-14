const express = require("express");
const router = express.Router();
const geofencesController = require("../controllers/geofencesController");
const { verifyToken } = require("../middleware/auth");

// All routes require login
router.get("/", verifyToken, geofencesController.getAllGeofences);
router.get("/:fenceId", verifyToken, geofencesController.getGeofenceById);
router.post("/", verifyToken, geofencesController.createGeofence);
router.put("/:fenceId", verifyToken, geofencesController.updateGeofence);
router.delete("/:fenceId", verifyToken, geofencesController.deleteGeofence);

module.exports = router;
