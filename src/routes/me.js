const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/meController");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

router.get("/overview", ctrl.getOverview);

module.exports = router;
