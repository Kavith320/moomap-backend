const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/alertsController");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

// Static paths must come before /:alertId
router.get("/", ctrl.listAlerts);
router.get("/unread-count", ctrl.unreadCount);
router.get("/stream", ctrl.streamAlerts);
router.post("/read-all", ctrl.markAllRead);
router.patch("/:alertId/read", ctrl.markRead);
router.delete("/:alertId", ctrl.deleteAlert);

module.exports = router;
