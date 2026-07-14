// src/controllers/geofencesController.js
const mongoose = require("mongoose");
const Geofence = require("../models/Geofence");

// Helper to get userId from token
function getUserId(req) {
  return String(req.user.userId);
}

// 🔹 GET /api/geofences
// Return all geofences for the logged-in user
exports.getAllGeofences = async (req, res) => {
  try {
    const userId = getUserId(req);

    const doc = await Geofence.findOne({ userId });

    if (!doc) {
      return res.json([]);  // user has no geofence doc yet
    }

    res.json(doc.geofences);
  } catch (err) {
    console.error("Error fetching geofences:", err);
    res.status(500).json({ message: "Failed to fetch geofences" });
  }
};

// 🔹 GET /api/geofences/:fenceId
// Get a single geofence by its _id inside user's document
exports.getGeofenceById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { fenceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(fenceId)) {
      return res.status(400).json({ message: "Invalid geofence id" });
    }

    const doc = await Geofence.findOne(
      { userId, "geofences._id": fenceId },
      { "geofences.$": 1 }
    );

    if (!doc || !doc.geofences || doc.geofences.length === 0) {
      return res.status(404).json({ message: "Geofence not found" });
    }

    res.json(doc.geofences[0]);
  } catch (err) {
    console.error("Error fetching geofence:", err);
    res.status(500).json({ message: "Failed to fetch geofence" });
  }
};

// 🔹 POST /api/geofences
// Create a new geofence and push into the user's geofences array
exports.createGeofence = async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      name,
      enabled,
      polygon,
      cattleIds,
    } = req.body;

    if (polygon && !Array.isArray(polygon)) {
      return res.status(400).json({ message: "polygon must be an array" });
    }

    const newFence = {
      name,
      enabled,
      polygon: polygon || [],
      cattleIds: cattleIds || [],
    };

    // find or create the user's geofence doc
    let doc = await Geofence.findOne({ userId });

    if (!doc) {
      doc = new Geofence({
        userId,
        geofences: [newFence],
      });
    } else {
      doc.geofences.push(newFence);
    }

    await doc.save();

    // last element is the one we just pushed
    const created = doc.geofences[doc.geofences.length - 1];

    res.status(201).json(created);
  } catch (err) {
    console.error("Error creating geofence:", err);
    res.status(500).json({ message: "Failed to create geofence" });
  }
};

// 🔹 PUT /api/geofences/:fenceId
// Update a geofence inside the user's geofences array
exports.updateGeofence = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { fenceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(fenceId)) {
      return res.status(400).json({ message: "Invalid geofence id" });
    }

    const doc = await Geofence.findOne({ userId });

    if (!doc) {
      return res.status(404).json({ message: "No geofences for this user" });
    }

    const fence = doc.geofences.id(fenceId);

    if (!fence) {
      return res.status(404).json({ message: "Geofence not found" });
    }

    const allowedFields = ["name", "enabled", "polygon", "cattleIds"];

    for (const key of allowedFields) {
      if (key in req.body) {
        fence[key] = req.body[key];
      }
    }

    fence.updatedAt = new Date();

    await doc.save();

    res.json(fence);
  } catch (err) {
    console.error("Error updating geofence:", err);
    res.status(500).json({ message: "Failed to update geofence" });
  }
};

// 🔹 DELETE /api/geofences/:fenceId
// Remove a geofence from the user's geofences array
exports.deleteGeofence = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { fenceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(fenceId)) {
      return res.status(400).json({ message: "Invalid geofence id" });
    }

    const doc = await Geofence.findOne({ userId });

    if (!doc) {
      return res.status(404).json({ message: "No geofences for this user" });
    }

    const fence = doc.geofences.id(fenceId);

    if (!fence) {
      return res.status(404).json({ message: "Geofence not found" });
    }

    fence.deleteOne(); // remove from array

    await doc.save();

    res.json({ message: "Geofence deleted" });
  } catch (err) {
    console.error("Error deleting geofence:", err);
    res.status(500).json({ message: "Failed to delete geofence" });
  }
};
