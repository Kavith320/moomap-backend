// src/controllers/alertsController.js
// User-scoped alert APIs. Every query is filtered by the token's userId.
const mongoose = require("mongoose");
const Alert = require("../models/Alert");
const { alertEmitter } = require("../services/alertService");

const uid = (req) => String(req.user.userId);

// Shared filter builder (also used by the admin list, without the userId scope).
function buildFilter(query) {
  const filter = {};
  if (query.unread === "true") filter.read = false;
  if (query.type) filter.type = { $in: String(query.type).split(",") };
  if (query.cattleId) filter.cattleId = String(query.cattleId);
  if (query.deviceId) filter.deviceId = String(query.deviceId);
  if (query.before) {
    const d = new Date(query.before);
    if (!isNaN(d)) filter.createdAt = { $lt: d };
  }
  return filter;
}

async function listWithCursor(filter, query, res) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(limit);
  const nextBefore =
    alerts.length === limit ? alerts[alerts.length - 1].createdAt.toISOString() : null;
  res.json({ alerts, nextBefore });
}

exports.buildFilter = buildFilter;
exports.listWithCursor = listWithCursor;

// GET /api/alerts?unread=true&type=geofence_exit,low_battery&cattleId=&limit=50&before=<ISO>
exports.listAlerts = async (req, res) => {
  try {
    await listWithCursor({ ...buildFilter(req.query), userId: uid(req) }, req.query, res);
  } catch (err) {
    console.error("Error listing alerts:", err);
    res.status(500).json({ message: "Failed to fetch alerts" });
  }
};

// GET /api/alerts/unread-count
exports.unreadCount = async (req, res) => {
  try {
    const count = await Alert.countDocuments({ userId: uid(req), read: false });
    res.json({ count });
  } catch (err) {
    console.error("Error counting alerts:", err);
    res.status(500).json({ message: "Failed to count alerts" });
  }
};

// PATCH /api/alerts/:alertId/read
exports.markRead = async (req, res) => {
  try {
    const { alertId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(alertId)) {
      return res.status(400).json({ message: "Invalid alert id" });
    }
    const alert = await Alert.findOneAndUpdate(
      { _id: alertId, userId: uid(req) },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    );
    if (!alert) return res.status(404).json({ message: "Alert not found" });
    res.json(alert);
  } catch (err) {
    console.error("Error marking alert read:", err);
    res.status(500).json({ message: "Failed to update alert" });
  }
};

// POST /api/alerts/read-all
exports.markAllRead = async (req, res) => {
  try {
    const result = await Alert.updateMany(
      { userId: uid(req), read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    console.error("Error marking alerts read:", err);
    res.status(500).json({ message: "Failed to update alerts" });
  }
};

// DELETE /api/alerts/:alertId
exports.deleteAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(alertId)) {
      return res.status(400).json({ message: "Invalid alert id" });
    }
    const result = await Alert.deleteOne({ _id: alertId, userId: uid(req) });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Alert not found" });
    res.json({ message: "Alert deleted" });
  } catch (err) {
    console.error("Error deleting alert:", err);
    res.status(500).json({ message: "Failed to delete alert" });
  }
};

// GET /api/alerts/stream  (Server-Sent Events; EventSource can't set headers, so pass ?token=)
exports.streamAlerts = (req, res) => {
  const userId = uid(req);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);

  const listener = (alert) => {
    if (String(alert.userId) === userId) {
      res.write(`event: alert\ndata: ${JSON.stringify(alert)}\n\n`);
    }
  };
  alertEmitter.on("alert", listener);

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    alertEmitter.off("alert", listener);
    res.end();
  });
};
