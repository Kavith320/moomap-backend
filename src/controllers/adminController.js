// src/controllers/adminController.js
const User = require("../models/User");
const Cattle = require("../models/Cattle");
const Device = require("../models/Device");
const Geofence = require("../models/Geofence");
const Telemetry = require("../models/Telemetry");
const startMqtt = require("../mqtt/mqttClient");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ==================== STATISTICS ====================
exports.getStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCattles = await Cattle.countDocuments();
    const totalDevices = await Device.countDocuments();
    const totalTelemetry = await Telemetry.countDocuments();

    // Sum geofences arrays across all user documents
    const geofencesResult = await Geofence.aggregate([
      { $project: { numberOfGeofences: { $size: { $ifNull: ["$geofences", []] } } } },
      { $group: { _id: null, total: { $sum: "$numberOfGeofences" } } }
    ]);
    const totalGeofences = geofencesResult.length > 0 ? geofencesResult[0].total : 0;

    // Database Status
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected";

    // MQTT Status
    const mqttConnected = typeof startMqtt.isMqttConnected === "function" ? startMqtt.isMqttConnected() : false;

    // Battery Stats
    const lowBatteryCollars = await Device.countDocuments({ lastBatteryPercent: { $lt: 20 } });
    const avgBatteryResult = await Device.aggregate([
      { $group: { _id: null, avgBattery: { $avg: "$lastBatteryPercent" } } }
    ]);
    const avgBattery = avgBatteryResult.length > 0 ? Math.round(avgBatteryResult[0].avgBattery || 0) : 0;

    // Breed Breakdown
    const breedBreakdown = await Cattle.aggregate([
      { $group: { _id: "$breed", count: { $sum: 1 } } }
    ]);

    // Device Type Breakdown
    const deviceTypeBreakdown = await Device.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } }
    ]);

    // Recent Telemetry (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentTelemetryStats = await Telemetry.aggregate([
      { $match: { timestamp: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      counts: {
        users: totalUsers,
        cattles: totalCattles,
        devices: totalDevices,
        geofences: totalGeofences,
        telemetry: totalTelemetry,
      },
      health: {
        database: dbStatus,
        mqtt: mqttConnected ? "connected" : "disconnected",
      },
      collars: {
        total: totalDevices,
        lowBattery: lowBatteryCollars,
        avgBattery,
      },
      breedBreakdown,
      deviceTypeBreakdown,
      recentTelemetryStats,
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: "Failed to load dashboard statistics" });
  }
};

// ==================== USER MANAGEMENT ====================
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    const query = {};
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { nicNo: { $regex: search, $options: "i" } },
        { _id: { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      users,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalUsers: total,
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users list" });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { firstName, lastName, gender, mobile, nicNo, address, password, role } = req.body;

    if (!firstName || !lastName || !mobile || !password) {
      return res.status(400).json({ error: "firstName, lastName, mobile, and password are required" });
    }

    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(409).json({ error: "Mobile number already in use" });
    }

    const userId = String(Math.floor(10000 + Math.random() * 90000));
    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      _id: userId,
      firstName,
      lastName,
      gender,
      mobile,
      nicNo,
      address,
      password: hashed,
      role: role || "user",
    });

    res.status(201).json(user.toJSON());
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, gender, mobile, nicNo, address, password, role } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (gender !== undefined) user.gender = gender;
    if (nicNo !== undefined) user.nicNo = nicNo;
    if (address !== undefined) user.address = address;
    if (role !== undefined) user.role = role;

    if (mobile !== undefined && mobile !== user.mobile) {
      const existingUser = await User.findOne({ mobile });
      if (existingUser) {
        return res.status(409).json({ error: "Mobile number already in use" });
      }
      user.mobile = mobile;
    }

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();
    res.json(user.toJSON());
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Clean up cattle and geofences owned by this user
    await Cattle.deleteMany({ userId });
    await Geofence.deleteOne({ userId });

    res.json({ message: "User and all associated data deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

// ==================== CATTLE MANAGEMENT ====================
exports.getAllCattles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { breed: { $regex: search, $options: "i" } },
        { farmName: { $regex: search, $options: "i" } },
        { collarId: { $regex: search, $options: "i" } },
        { userId: { $regex: search, $options: "i" } },
        { _id: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Cattle.countDocuments(query);
    const cattles = await Cattle.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Fetch owners manually
    const userIds = [...new Set(cattles.map(c => c.userId))];
    const users = await User.find({ _id: { $in: userIds } }).select("firstName lastName mobile");
    const userMap = new Map(users.map(u => [u._id, u]));

    const populatedCattles = cattles.map(cattle => {
      const c = cattle.toJSON();
      const owner = userMap.get(c.userId);
      c.owner = owner ? { firstName: owner.firstName, lastName: owner.lastName, mobile: owner.mobile } : null;
      return c;
    });

    res.json({
      cattles: populatedCattles,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalCattles: total,
    });
  } catch (err) {
    console.error("Error fetching cattles:", err);
    res.status(500).json({ error: "Failed to fetch cattle list" });
  }
};

exports.createCattle = async (req, res) => {
  try {
    const { cattleId, name, breed, age, gender, color, weight, healthNotes, farmName, address, Image, collarId, userId } = req.body;

    if (!cattleId || !userId) {
      return res.status(400).json({ message: "cattleId and userId are required" });
    }

    const existingCattle = await Cattle.findById(cattleId);
    if (existingCattle) {
      return res.status(409).json({ message: "cattleId already exists" });
    }

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(400).json({ message: "User does not exist" });
    }

    if (collarId) {
      const deviceExists = await Device.findById(collarId);
      if (!deviceExists) {
        return res.status(400).json({ message: "Invalid collarId (device not registered)" });
      }
    }

    const cattle = await Cattle.create({
      _id: cattleId,
      name,
      breed,
      age,
      gender,
      color,
      weight,
      healthNotes,
      farmName,
      address,
      Image,
      collarId,
      userId,
    });

    res.status(201).json(cattle);
  } catch (err) {
    console.error("Error creating cattle:", err);
    res.status(500).json({ error: "Failed to create cattle" });
  }
};

exports.updateCattle = async (req, res) => {
  try {
    const { cattleId } = req.params;
    const { name, breed, age, gender, color, weight, healthNotes, farmName, address, Image, collarId, userId } = req.body;

    const cattle = await Cattle.findById(cattleId);
    if (!cattle) {
      return res.status(404).json({ error: "Cattle not found" });
    }

    if (userId) {
      const userExists = await User.findById(userId);
      if (!userExists) {
        return res.status(400).json({ message: "User does not exist" });
      }
      cattle.userId = userId;
    }

    if (collarId !== undefined) {
      if (collarId) {
        const deviceExists = await Device.findById(collarId);
        if (!deviceExists) {
          return res.status(400).json({ message: "Invalid collarId (device not registered)" });
        }
        cattle.collarId = collarId;
      } else {
        cattle.collarId = undefined;
      }
    }

    if (name !== undefined) cattle.name = name;
    if (breed !== undefined) cattle.breed = breed;
    if (age !== undefined) cattle.age = age;
    if (gender !== undefined) cattle.gender = gender;
    if (color !== undefined) cattle.color = color;
    if (weight !== undefined) cattle.weight = weight;
    if (healthNotes !== undefined) cattle.healthNotes = healthNotes;
    if (farmName !== undefined) cattle.farmName = farmName;
    if (address !== undefined) cattle.address = address;
    if (Image !== undefined) cattle.Image = Image;

    await cattle.save();
    res.json(cattle);
  } catch (err) {
    console.error("Error updating cattle:", err);
    res.status(500).json({ error: "Failed to update cattle" });
  }
};

exports.deleteCattle = async (req, res) => {
  try {
    const { cattleId } = req.params;

    const cattle = await Cattle.findByIdAndDelete(cattleId);
    if (!cattle) {
      return res.status(404).json({ error: "Cattle not found" });
    }

    res.json({ message: "Cattle deleted successfully" });
  } catch (err) {
    console.error("Error deleting cattle:", err);
    res.status(500).json({ error: "Failed to delete cattle" });
  }
};

// ==================== DEVICE/COLLAR MANAGEMENT ====================
exports.getAllDevices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    const query = {};
    if (search) {
      query.$or = [
        { _id: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
        { group: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Device.countDocuments(query);
    const devices = await Device.find(query)
      .sort({ lastSeen: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      devices,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalDevices: total,
    });
  } catch (err) {
    console.error("Error fetching devices:", err);
    res.status(500).json({ error: "Failed to fetch devices list" });
  }
};

exports.createDevice = async (req, res) => {
  try {
    const { deviceId, type, group, notes } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId is required" });
    }

    const existingDevice = await Device.findById(deviceId);
    if (existingDevice) {
      return res.status(409).json({ error: "deviceId is already registered" });
    }

    const device = await Device.create({
      _id: deviceId,
      type: type || "unknown",
      group: group || "unknown",
      notes: notes || "",
      lastSeen: new Date(),
    });

    res.status(201).json(device);
  } catch (err) {
    console.error("Error creating device:", err);
    res.status(500).json({ error: "Failed to create device" });
  }
};

exports.updateDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { type, group, notes } = req.body;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    if (type !== undefined) device.type = type;
    if (group !== undefined) device.group = group;
    if (notes !== undefined) device.notes = notes;

    await device.save();
    res.json(device);
  } catch (err) {
    console.error("Error updating device:", err);
    res.status(500).json({ error: "Failed to update device" });
  }
};

exports.deleteDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await Device.findByIdAndDelete(deviceId);
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Unassign this collar from any cattle
    await Cattle.updateMany({ collarId: deviceId }, { $unset: { collarId: "" } });

    res.json({ message: "Device deleted successfully and unassigned from cattle" });
  } catch (err) {
    console.error("Error deleting device:", err);
    res.status(500).json({ error: "Failed to delete device" });
  }
};

// ==================== GEOFENCE MANAGEMENT ====================
exports.getAllGeofences = async (req, res) => {
  try {
    const docs = await Geofence.find();

    const allGeofences = [];
    const userIds = docs.map(d => d.userId);
    const users = await User.find({ _id: { $in: userIds } }).select("firstName lastName mobile");
    const userMap = new Map(users.map(u => [u._id, u]));

    for (const doc of docs) {
      const owner = userMap.get(doc.userId);
      const ownerInfo = owner ? { firstName: owner.firstName, lastName: owner.lastName, mobile: owner.mobile } : null;

      for (const fence of doc.geofences) {
        allGeofences.push({
          _id: fence._id,
          name: fence.name || "Unnamed",
          enabled: fence.enabled,
          polygon: fence.polygon,
          cattleIds: fence.cattleIds,
          createdAt: fence.createdAt,
          updatedAt: fence.updatedAt,
          userId: doc.userId,
          owner: ownerInfo,
        });
      }
    }

    res.json(allGeofences);
  } catch (err) {
    console.error("Error fetching geofences:", err);
    res.status(500).json({ error: "Failed to fetch geofences" });
  }
};

// ==================== HISTORICAL TELEMETRY ====================
exports.getAllTelemetries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const deviceId = req.query.deviceId || "";
    const skip = (page - 1) * limit;

    const query = {};
    if (deviceId) {
      query.deviceId = { $regex: deviceId, $options: "i" };
    }

    const total = await Telemetry.countDocuments(query);
    const telemetries = await Telemetry.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      telemetries,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalTelemetries: total,
    });
  } catch (err) {
    console.error("Error fetching telemetries:", err);
    res.status(500).json({ error: "Failed to fetch telemetry logs" });
  }
};

// ==================== SIMULATE TELEMETRY ====================
exports.simulateTelemetry = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { type, group, lat, lon, batteryPercent, batteryVoltage } = req.body;

    const deviceExists = await Device.findById(deviceId);
    if (!deviceExists) {
      return res.status(404).json({ error: "Device not found. Register the device first." });
    }

    const now = new Date();
    const payload = {
      device_id: deviceId,
      type: type || "slave",
      gps: {
        lat: typeof lat === "number" ? lat : 6.9271,
        lon: typeof lon === "number" ? lon : 79.8612,
        valid: true,
      },
      battery: {
        percent: typeof batteryPercent === "number" ? batteryPercent : 85,
        voltage: typeof batteryVoltage === "number" ? batteryVoltage : 4.1,
      },
    };

    // 1️⃣ Save telemetry history
    const telemetry = await Telemetry.create({
      deviceId,
      timestamp: now,
      topic: `${group || "cc"}/${deviceId}/payload`,
      gpsLat: payload.gps.lat,
      gpsLon: payload.gps.lon,
      gpsValid: payload.gps.valid,
      batteryPercent: payload.battery.percent,
      batteryVoltage: payload.battery.voltage,
      raw: payload,
    });

    // 2️⃣ Update Device snapshot
    const update = {
      type: payload.type,
      group: group || "cc",
      lastSeen: now,
      lastLocation: {
        lat: payload.gps.lat,
        lon: payload.gps.lon,
        timestamp: now,
      },
      lastBatteryPercent: payload.battery.percent,
      lastBatteryVoltage: payload.battery.voltage,
      meta: payload,
    };

    await Device.findByIdAndUpdate(deviceId, { $set: update }, { new: true });

    res.json({ message: "Telemetry simulated and saved successfully", telemetry });
  } catch (err) {
    console.error("Error simulating telemetry:", err);
    res.status(500).json({ error: "Failed to simulate telemetry" });
  }
};

// ==================== REAL-TIME MQTT STREAM (SSE) ====================
exports.getMqttStream = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Create message sender helper
  const sendMqttMessage = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Listen to incoming MQTT messages
  const listener = (msg) => {
    sendMqttMessage(msg);
  };

  // Subscribe to emitter
  if (startMqtt.telemetryEmitter) {
    startMqtt.telemetryEmitter.on("message", listener);
  }

  // Handle client disconnection
  req.on("close", () => {
    if (startMqtt.telemetryEmitter) {
      startMqtt.telemetryEmitter.off("message", listener);
    }
    res.end();
  });
};

// ==================== MAP MARKERS ENDPOINT ====================
exports.getMapMarkers = async (req, res) => {
  try {
    // Fetch all cattle
    const cattles = await Cattle.find();

    // Fetch all devices to match their locations and types
    const devices = await Device.find();

    // Fetch all users to match owner details
    const users = await User.find();
    
    // Create lookup maps
    const deviceMap = {};
    devices.forEach(d => {
      deviceMap[d._id] = d;
    });

    const userMap = {};
    users.forEach(u => {
      userMap[u.userId || u._id] = u;
    });

    // Combine into markers list
    const markers = cattles.map(c => {
      const dev = deviceMap[c.collarId];
      const owner = userMap[c.userId];
      return {
        cattleId: c.cattleId || c._id,
        name: c.name,
        breed: c.breed,
        gender: c.gender,
        collarId: c.collarId,
        owner: owner ? {
          name: `${owner.firstName} ${owner.lastName}`,
          mobile: owner.mobile,
          userId: owner.userId || owner._id
        } : null,
        location: dev && dev.lastLocation ? {
          lat: dev.lastLocation.lat,
          lon: dev.lastLocation.lon,
          timestamp: dev.lastLocation.timestamp
        } : null,
        type: dev ? dev.type : "unknown",
        batteryPercent: dev ? dev.lastBatteryPercent : null,
        batteryVoltage: dev ? dev.lastBatteryVoltage : null,
        lastSeen: dev ? dev.lastSeen : null
      };
    });

    res.json(markers);
  } catch (err) {
    console.error("Error fetching map markers:", err);
    res.status(500).json({ error: "Failed to fetch map markers" });
  }
};
