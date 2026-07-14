const express = require("express");
const router = express.Router();
const cattleController = require("../controllers/cattlesController");
const { verifyToken } = require("../middleware/auth");

// Protected cattle routes
router.get("/", verifyToken, cattleController.getAllCattles);
router.get("/:id", verifyToken, cattleController.getCattleById);
router.post("/", verifyToken, cattleController.createCattle);
router.put("/:id", verifyToken, cattleController.updateCattle);
router.delete("/:id", verifyToken, cattleController.deleteCattle);

module.exports = router;
