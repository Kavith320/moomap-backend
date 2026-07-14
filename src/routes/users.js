const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ctrl = require("../controllers/usersController");

// Health check
router.get("/_health", (req, res) => res.json({ ok: true, resource: "users" }));

// Auth routes
router.post("/login", ctrl.loginUser);
router.post("/", ctrl.createUser);

// Protected routes (JWT required)
router.get("/me", auth.verifyToken, ctrl.getUser);
router.put("/me", auth.verifyToken, ctrl.updateUser);
router.delete("/me", auth.verifyToken, ctrl.deleteUser);

module.exports = router;
