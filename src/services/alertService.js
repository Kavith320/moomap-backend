// src/services/alertService.js
// Creates alerts and fans them out to delivery channels:
//   1. MongoDB (Alert collection)      -> REST: GET /api/alerts
//   2. In-process emitter              -> SSE:  GET /api/alerts/stream
//   3. Optional webhook (ALERT_WEBHOOK_URL) -> plug in SMS / Telegram / n8n / etc.
const EventEmitter = require("events");
const Alert = require("../models/Alert");

const alertEmitter = new EventEmitter();
alertEmitter.setMaxListeners(0); // one listener per open SSE connection

async function deliverWebhook(alert) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const headers = { "Content-Type": "application/json" };
  if (process.env.ALERT_WEBHOOK_SECRET) {
    headers["X-MooMap-Secret"] = process.env.ALERT_WEBHOOK_SECRET;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(`⚠️ Alert webhook responded ${res.status}`);
  } catch (err) {
    console.warn("⚠️ Alert webhook failed:", err.message);
  }
}

async function createAlert(data) {
  const alert = await Alert.create(data);
  const json = alert.toJSON();

  console.log(`🚨 [${json.severity}] ${json.title} (user ${json.userId})`);
  alertEmitter.emit("alert", json);
  deliverWebhook(json); // fire-and-forget; never blocks ingestion

  return alert;
}

module.exports = { createAlert, alertEmitter };
