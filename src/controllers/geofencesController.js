// src/controllers/geofencesController.js
const mongoose = require("mongoose");
const Geofence = require("../models/Geofence");
const Cattle = require("../models/Cattle");
const FenceState = require("../models/FenceState");
const { validatePolygon } = require("../services/geo");

// Helper to get userId from token
function getUserId(req) {
  return String(req.user.userId);
}

// Validates polygon / cattleIds / enabled from a create or update body.
// Returns an error message, or null when valid. An empty polygon is allowed (draft fence).
async function validateFenceInput(userId, body) {
  if ("polygon" in body) {
    if (!Array.isArray(body.polygon)) return "polygon must be an array";
    if (body.polygon.length > 0) {
      const err = validatePolygon(body.polygon);
      if (err) return err;
    }
  }

  if ("enabled" in body && typeof body.enabled !== "boolean") {
    return "enabled must be a boolean";
  }

  if ("cattleIds" in body) {
    const ids = body.cattleIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      return "cattleIds must be an array of strings";
    }
    const unique = [...new Set(ids)];
    const owned = await Cattle.find({ _id: { $in: unique }, userId }, { _id: 1 }).lean();
    if (owned.length !== unique.length) {
      const ownedSet = new Set(owned.map((c) => c._id));
      const missing = unique.filter((id) => !ownedSet.has(id));
      return `Unknown cattleIds: ${missing.join(", ")}`;
    }
  }

  return null;
}

// Forget inside/outside status for a fence so the next reading re-evaluates from scratch.
function resetFenceState(userId, fenceId) {
  return FenceState.updateMany({ userId }, { $unset: { [`fences.${fenceId}`]: "" } });
}

// 🔹 GET /api/geofences/status
// For each of the user's fences: which assigned cattle are inside / outside right now.
exports.getGeofenceStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const [doc, states, cattle] = await Promise.all([
      Geofence.findOne({ userId }).lean(),
      FenceState.find({ userId }).lean(),
      Cattle.find({ userId }, { name: 1, collarId: 1 }).lean(),
    ]);

    const stateByCattle = new Map(states.map((s) => [s._id, s]));
    const cattleById = new Map(cattle.map((c) => [c._id, c]));

    const result = ((doc && doc.geofences) || []).map((fence) => {
      const fenceId = String(fence._id);
      const members = (fence.cattleIds || []).map((cattleId) => {
        const c = cattleById.get(cattleId);
        const s = stateByCattle.get(cattleId);
        const fs = s && s.fences && s.fences[fenceId];
        return {
          cattleId,
          name: c ? c.name : undefined,
          collarId: c ? c.collarId : undefined,
          status: (fs && fs.status) || "unknown",
          lastLocation: s ? s.lastLocation : null,
        };
      });

      return {
        fenceId,
        name: fence.name,
        enabled: fence.enabled !== false,
        cattle: members,
        insideCount: members.filter((m) => m.status === "inside").length,
        outsideCount: members.filter((m) => m.status === "outside").length,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Error fetching geofence status:", err);
    res.status(500).json({ message: "Failed to fetch geofence status" });
  }
};

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

    const validationError = await validateFenceInput(userId, req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
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

    const validationError = await validateFenceInput(userId, req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const allowedFields = ["name", "enabled", "polygon", "cattleIds"];

    for (const key of allowedFields) {
      if (key in req.body) {
        fence[key] = req.body[key];
      }
    }

    fence.updatedAt = new Date();

    await doc.save();

    // Shape changed: previous inside/outside status is no longer meaningful
    if ("polygon" in req.body) {
      await resetFenceState(userId, fenceId);
    }

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
    await resetFenceState(userId, fenceId);

    res.json({ message: "Geofence deleted" });
  } catch (err) {
    console.error("Error deleting geofence:", err);
    res.status(500).json({ message: "Failed to delete geofence" });
  }
};
