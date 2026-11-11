// src/controllers/meController.js
// Aggregated, user-scoped views for the user portal.
const Cattle = require("../models/Cattle");
const Device = require("../models/Device");
const Geofence = require("../models/Geofence");
const FenceState = require("../models/FenceState");
const Alert = require("../models/Alert");
const { settings } = require("../services/telemetryProcessor");

// GET /api/me/overview
// Everything the portal dashboard + map needs in one call.
exports.getOverview = async (req, res) => {
  try {
    const userId = String(req.user.userId);
    const { lowBatteryPercent, offlineAfterMinutes } = settings();

    const [cattle, fenceDoc, states, unreadAlerts] = await Promise.all([
      Cattle.find({ userId }).sort({ _id: 1 }).lean(),
      Geofence.findOne({ userId }).lean(),
      FenceState.find({ userId }).lean(),
      Alert.countDocuments({ userId, read: false }),
    ]);

    const collarIds = cattle.map((c) => c.collarId).filter(Boolean);
    const devices = collarIds.length
      ? await Device.find(
          { _id: { $in: collarIds } },
          { lastSeen: 1, lastLocation: 1, lastBatteryPercent: 1, alertState: 1, type: 1 }
        ).lean()
      : [];

    const deviceById = new Map(devices.map((d) => [d._id, d]));
    const stateByCattle = new Map(states.map((s) => [s._id, s]));
    const geofences = (fenceDoc && fenceDoc.geofences) || [];
    const fenceById = new Map(geofences.map((f) => [String(f._id), f]));
    const offlineCutoff = Date.now() - offlineAfterMinutes * 60 * 1000;

    const items = cattle.map((c) => {
      const d = c.collarId ? deviceById.get(c.collarId) : null;
      const s = stateByCattle.get(c._id);

      const device = d
        ? {
            deviceId: d._id,
            type: d.type,
            lastSeen: d.lastSeen || null,
            lastLocation: d.lastLocation || null,
            batteryPercent: d.lastBatteryPercent ?? null,
            online:
              Boolean(d.lastSeen) &&
              new Date(d.lastSeen).getTime() >= offlineCutoff &&
              !(d.alertState && d.alertState.offline),
            lowBattery:
              typeof d.lastBatteryPercent === "number" &&
              d.lastBatteryPercent <= lowBatteryPercent,
          }
        : null;

      // Fences this cattle is assigned to, with its current status in each
      const fences = geofences
        .filter((f) => f.enabled !== false && (f.cattleIds || []).includes(c._id))
        .map((f) => {
          const fs = s && s.fences && s.fences[String(f._id)];
          return { fenceId: String(f._id), name: f.name, status: (fs && fs.status) || "unknown" };
        });

      let fenceStatus = "none";
      if (fences.length) {
        if (fences.some((f) => f.status === "outside")) fenceStatus = "outside";
        else if (fences.every((f) => f.status === "inside")) fenceStatus = "inside";
        else fenceStatus = "unknown";
      }

      return {
        cattleId: c._id,
        name: c.name,
        breed: c.breed,
        age: c.age,
        gender: c.gender,
        color: c.color,
        weight: c.weight,
        healthNotes: c.healthNotes,
        farmName: c.farmName,
        Image: c.Image,
        imageCredit: c.imageCredit,
        imageSourceUrl: c.imageSourceUrl,
        collarId: c.collarId || null,
        device,
        fences,
        fenceStatus,
      };
    });

    const withDevice = items.filter((i) => i.device);
    res.json({
      summary: {
        cattle: items.length,
        withCollar: withDevice.length,
        online: withDevice.filter((i) => i.device.online).length,
        offline: withDevice.filter((i) => !i.device.online).length,
        lowBattery: withDevice.filter((i) => i.device.lowBattery).length,
        outside: items.filter((i) => i.fenceStatus === "outside").length,
        geofences: geofences.length,
        unreadAlerts,
      },
      settings: { lowBatteryPercent, offlineAfterMinutes },
      cattle: items,
      geofences: [...fenceById.values()],
    });
  } catch (err) {
    console.error("Error building overview:", err);
    res.status(500).json({ message: "Failed to load overview" });
  }
};
