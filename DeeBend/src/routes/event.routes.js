const express = require("express");
const { getEvents } = require("../controllers/event.controller.js");

const router = express.Router();

router.get("/all-events", getEvents);

module.exports = router;
