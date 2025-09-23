const express = require("express");
const { requireAuth } = require("../middleware/auth.js");
const { getEvents } = require("../controllers/event.js");
const router = express.Router();


const {
  register,
  login,
  me,
  requestPasswordReset,
  resetPassword,
  sendEmailOtp,
  verifyEmailOtp
} = require("../controllers/auth.js");



// Email/password
router.post("/register", register);
router.post("/auth/login", login);
//router.get("/me", requireAuth, me);

// Password reset
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);

// Firebase Phone
router.post("/send-otp", sendEmailOtp);
router.post("/verify-otp", verifyEmailOtp);



router.get("/all-events", getEvents);

module.exports = router;


