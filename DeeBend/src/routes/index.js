const express = require("express");
const authRoutes = require("./auth.routes.js");
const eventRoutes = require("./event.routes.js");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/events", eventRoutes);

module.exports = router;
