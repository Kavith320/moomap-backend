// src/services/telemetryProcessor.js
// Runs after every telemetry message (MQTT or admin simulation) and raises alerts:
//   - geofence exit / re-entry
//   - low battery
//   - collar back online (after an offline alert)
// Also exports the periodic offline sweep.
const Cattle = require("../models/Cattle");
const Device = require("../models/Device");
const Geofence = require("../models/Geofence");
const FenceState = require("../models/FenceState");
const { createAlert } = require("./alertService");
const { isValidPoint, validatePolygon, pointInPolygon } = require("./geo");
const { evaluateFence } = require("./geofenceEngine");

const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);
const settings = () => ({
  confirmReadings: num(process.env.GEOFENCE_CONFIRM_READINGS, 2),
  lowBatteryPercent: num(process.env.LOW_BATTERY_PERCENT, 20),
  offlineAfterMinutes: num(process.env.OFFLINE_AFTER_MINUTES, 60),
});

const cattleName = (c) => c.name || c._id;

async function checkGeofences(cattle, deviceId, point, timestamp) {
  const { confirmReadings } = settings();
  const userId = String(cattle.userId);

  const doc = await Geofence.findOne({ userId }).lean();
  const fences = ((doc && doc.geofences) || []).filter(
    (f) =>
      f.enabled !== false &&
      Array.isArray(f.cattleIds) &&
      f.cattleIds.includes(cattle._id) &&
      validatePolygon(f.polygon) === null
  );

  const stateDoc = await FenceState.findById(cattle._id).lean();
  const prevStates = (stateDoc && stateDoc.fences) || {};
  const nextStates = {}; // fences that no longer apply are dropped automatically

  for (const fence of fences) {
    const fenceId = String(fence._id);
    const inside = pointInPolygon(point, fence.polygon);
    const { state, transition } = evaluateFence(prevStates[fenceId], inside, confirmReadings);
    nextStates[fenceId] = state;

    if (!transition) continue;

    const fenceName = fence.name || "Unnamed fence";
    const exit = transition === "exit";
    await createAlert({
      userId,
      cattleId: cattle._id,
      cattleName: cattleName(cattle),
      deviceId,
      type: exit ? "geofence_exit" : "geofence_enter",
      severity: exit ? "critical" : "info",
      title: exit
        ? `${cattleName(cattle)} left ${fenceName}`
        : `${cattleName(cattle)} is back inside ${fenceName}`,
      message: exit
        ? `${cattleName(cattle)} was detected outside the geofence "${fenceName}".`
        : `${cattleName(cattle)} returned inside the geofence "${fenceName}".`,
      fenceId,
      fenceName,
      location: point,
    });
  }

  await FenceState.updateOne(
    { _id: cattle._id },
    {
      $set: {
        userId,
        deviceId,
        fences: nextStates,
        lastLocation: { lat: point.lat, lon: point.lon, timestamp },
      },
    },
    { upsert: true }
  );
}

async function checkDeviceHealth(device, cattleList, batteryPercent) {
  const { lowBatteryPercent } = settings();
  const alertState = device.alertState || {};
  const set = {};

  if (alertState.offline) {
    set["alertState.offline"] = false;
    for (const cattle of cattleList) {
      await createAlert({
        userId: String(cattle.userId),
        cattleId: cattle._id,
        cattleName: cattleName(cattle),
        deviceId: device._id,
        type: "device_online",
        severity: "info",
        title: `${cattleName(cattle)}'s collar is back online`,
        message: `Collar ${device._id} started reporting again.`,
      });
    }
  }

  if (Number.isFinite(batteryPercent)) {
    if (batteryPercent <= lowBatteryPercent && !alertState.lowBattery) {
      set["alertState.lowBattery"] = true;
      for (const cattle of cattleList) {
        await createAlert({
          userId: String(cattle.userId),
          cattleId: cattle._id,
          cattleName: cattleName(cattle),
          deviceId: device._id,
          type: "low_battery",
          severity: "warning",
          title: `Low battery on ${cattleName(cattle)}'s collar (${batteryPercent}%)`,
          message: `Collar ${device._id} battery is at ${batteryPercent}%. Charge or replace it soon.`,
          data: { batteryPercent },
        });
      }
    } else if (batteryPercent > lowBatteryPercent + 5 && alertState.lowBattery) {
      // 5% hysteresis so a battery hovering at the threshold doesn't re-alert
      set["alertState.lowBattery"] = false;
    }
  }

  if (Object.keys(set).length) {
    await Device.updateOne({ _id: device._id }, { $set: set });
  }
}

/**
 * Evaluate one telemetry reading. Never throws: alerting must not break ingestion.
 * @param {{deviceId:string, timestamp?:Date, lat?:number, lon?:number, gpsValid?:boolean, batteryPercent?:number}} t
 */
async function processTelemetry(t) {
  try {
    const timestamp = t.timestamp || new Date();
    const [device, cattleList] = await Promise.all([
      Device.findById(t.deviceId).lean(),
      Cattle.find({ collarId: t.deviceId }).lean(),
    ]);
    if (!device || cattleList.length === 0) return; // collar not linked to any cattle

    await checkDeviceHealth(device, cattleList, t.batteryPercent);

    const point = { lat: t.lat, lon: t.lon };
    const hasFix =
      t.gpsValid !== false && isValidPoint(point) && !(point.lat === 0 && point.lon === 0);
    if (!hasFix) return;

    for (const cattle of cattleList) {
      await checkGeofences(cattle, t.deviceId, point, timestamp);
    }
  } catch (err) {
    console.error(`❌ Alert processing failed for device ${t && t.deviceId}:`, err);
  }
}

async function sweepOfflineDevices() {
  const { offlineAfterMinutes } = settings();
  const cutoff = new Date(Date.now() - offlineAfterMinutes * 60 * 1000);

  const stale = await Device.find({
    lastSeen: { $lt: cutoff },
    "alertState.offline": { $ne: true },
  }).lean();

  for (const device of stale) {
    const cattleList = await Cattle.find({ collarId: device._id }).lean();
    for (const cattle of cattleList) {
      await createAlert({
        userId: String(cattle.userId),
        cattleId: cattle._id,
        cattleName: cattleName(cattle),
        deviceId: device._id,
        type: "device_offline",
        severity: "warning",
        title: `${cattleName(cattle)}'s collar is offline`,
        message: `No data from collar ${device._id} for over ${offlineAfterMinutes} minutes.`,
        location: device.lastLocation
          ? { lat: device.lastLocation.lat, lon: device.lastLocation.lon }
          : undefined,
        data: { lastSeen: device.lastSeen },
      });
    }
    await Device.updateOne({ _id: device._id }, { $set: { "alertState.offline": true } });
  }
}

function startAlertMonitor() {
  const run = () =>
    sweepOfflineDevices().catch((err) => console.error("❌ Offline sweep failed:", err));
  run();
  const timer = setInterval(run, 60 * 1000);
  timer.unref();
  console.log(`⏱️ Alert monitor started (offline after ${settings().offlineAfterMinutes} min)`);
}

module.exports = { processTelemetry, sweepOfflineDevices, startAlertMonitor, settings };
