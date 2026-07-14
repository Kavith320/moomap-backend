const Cattle = require("../models/Cattle");
const Device = require("../models/Device");

// 🔵 GET ALL CATTLE
exports.getAllCattles = async (req, res) => {
  try {
    const userId = req.user.userId; // show only user's cattle

    const result = await Cattle.find({ userId }).sort({ _id: 1 });

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching cattle:", error);
    res.status(500).json({ message: "Error fetching cattle" });
  }
};

// 🔵 GET SINGLE CATTLE
exports.getCattleById = async (req, res) => {
  const { id } = req.params; // id = cattleId

  try {
    const userId = req.user.userId;

    const cattle = await Cattle.findOne({ _id: id, userId });

    if (!cattle) {
      return res.status(404).json({ message: "Cattle not found" });
    }

    res.status(200).json(cattle);
  } catch (error) {
    console.error("Error fetching single cattle:", error);
    res.status(500).json({ message: "Error fetching cattle" });
  }
};

// 🔵 CREATE CATTLE
exports.createCattle = async (req, res) => {
  const {
    cattleId,
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
  } = req.body;

  const userId = req.user.userId;

  try {
    // Check if cattleId already exists
    const existingCattle = await Cattle.findById(cattleId);
    if (existingCattle) {
      return res.status(409).json({ message: "cattleId already exists" });
    }

    // Check if collarId exists in devices collection (if supplied)
    if (collarId) {
      const deviceExists = await Device.findById(collarId);
      if (!deviceExists) {
        return res.status(400).json({ message: "Invalid collarId (not found in collar/device table)" });
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
  } catch (error) {
    console.error("Error creating cattle:", error);
    res.status(500).json({ message: "Error creating cattle" });
  }
};

// 🔵 UPDATE CATTLE
exports.updateCattle = async (req, res) => {
  const { id } = req.params; // cattleId
  const {
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
  } = req.body;

  const userId = req.user.userId;

  try {
    const cattle = await Cattle.findOne({ _id: id, userId });
    if (!cattle) {
      return res.status(403).json({ message: "Not authorized or cattle not found" });
    }

    // Verify collarId if updated
    if (collarId && collarId !== cattle.collarId) {
      const deviceExists = await Device.findById(collarId);
      if (!deviceExists) {
        return res.status(400).json({ message: "Invalid collarId (not found in collar/device table)" });
      }
      cattle.collarId = collarId;
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

    res.status(200).json(cattle);
  } catch (error) {
    console.error("Error updating cattle:", error);
    res.status(500).json({ message: "Error updating cattle" });
  }
};

// 🔵 DELETE CATTLE
exports.deleteCattle = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const cattle = await Cattle.findOne({ _id: id, userId });
    if (!cattle) {
      return res.status(403).json({ message: "Not authorized or cattle not found" });
    }

    await Cattle.findByIdAndDelete(id);

    res.status(200).json({ message: "Cattle deleted" });
  } catch (error) {
    console.error("Error deleting cattle:", error);
    res.status(500).json({ message: "Error deleting cattle" });
  }
};
