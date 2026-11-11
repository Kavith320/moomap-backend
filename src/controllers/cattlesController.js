const Cattle = require("../models/Cattle");
const Device = require("../models/Device");
const FenceState = require("../models/FenceState");
const { decodeImage, saveImage, removeImage } = require("../services/media");

// A collar may only be linked to one cattle; otherwise its location and alerts
// would be visible to whoever attached it.
async function collarTaken(collarId, exceptCattleId) {
  const other = await Cattle.findOne({ collarId, _id: { $ne: exceptCattleId } }, { _id: 1 }).lean();
  return Boolean(other);
}

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
      if (await collarTaken(collarId, cattleId)) {
        return res.status(409).json({ message: "collarId is already assigned to another cattle" });
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

    // Empty string / null detaches the collar
    if ((collarId === "" || collarId === null) && cattle.collarId) {
      cattle.collarId = undefined;
      await FenceState.deleteOne({ _id: id });
    }

    // Verify collarId if updated
    if (collarId && collarId !== cattle.collarId) {
      const deviceExists = await Device.findById(collarId);
      if (!deviceExists) {
        return res.status(400).json({ message: "Invalid collarId (not found in collar/device table)" });
      }
      if (await collarTaken(collarId, id)) {
        return res.status(409).json({ message: "collarId is already assigned to another cattle" });
      }
      cattle.collarId = collarId;
      await FenceState.deleteOne({ _id: id }); // old collar's positions no longer apply
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
    if (Image !== undefined && Image !== cattle.Image) {
      removeImage(cattle.Image);
      cattle.Image = Image;
      cattle.imageCredit = undefined;
      cattle.imageSourceUrl = undefined;
    }

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
    await FenceState.deleteOne({ _id: id });
    removeImage(cattle.Image);

    res.status(200).json({ message: "Cattle deleted" });
  } catch (error) {
    console.error("Error deleting cattle:", error);
    res.status(500).json({ message: "Error deleting cattle" });
  }
};

// 🔵 UPLOAD / REPLACE PHOTO
// POST /api/cattles/:id/image  { image: "data:image/jpeg;base64,...", credit?, sourceUrl? }
exports.uploadCattleImage = async (req, res) => {
  const { id } = req.params;
  try {
    const cattle = await Cattle.findOne({ _id: id, userId: req.user.userId });
    if (!cattle) return res.status(404).json({ message: "Cattle not found" });

    let decoded;
    try {
      decoded = decodeImage(req.body && req.body.image);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const credit = req.body.credit == null ? "" : String(req.body.credit).trim().slice(0, 300);
    const sourceUrl = req.body.sourceUrl == null ? "" : String(req.body.sourceUrl).trim();
    if (sourceUrl && !/^https:\/\//.test(sourceUrl)) {
      return res.status(400).json({ message: "sourceUrl must be an https:// link" });
    }

    const previous = cattle.Image;
    cattle.Image = saveImage("cattle", decoded);
    cattle.imageCredit = credit || undefined;
    cattle.imageSourceUrl = sourceUrl.slice(0, 500) || undefined;
    await cattle.save();
    removeImage(previous);

    res.status(200).json(cattle);
  } catch (error) {
    console.error("Error uploading cattle image:", error);
    res.status(500).json({ message: "Error saving image" });
  }
};

// 🔵 REMOVE PHOTO
exports.deleteCattleImage = async (req, res) => {
  const { id } = req.params;
  try {
    const cattle = await Cattle.findOne({ _id: id, userId: req.user.userId });
    if (!cattle) return res.status(404).json({ message: "Cattle not found" });
    removeImage(cattle.Image);
    cattle.Image = undefined;
    cattle.imageCredit = undefined;
    cattle.imageSourceUrl = undefined;
    await cattle.save();
    res.status(200).json(cattle);
  } catch (error) {
    console.error("Error deleting cattle image:", error);
    res.status(500).json({ message: "Error removing image" });
  }
};
