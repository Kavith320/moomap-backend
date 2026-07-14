const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/collarDataController");
const auth = require("../middleware/auth");

router.get("/:id", auth.verifyToken, ctrl.getCollarDataById);

module.exports = router;
