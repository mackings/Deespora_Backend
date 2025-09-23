const express = require("express");
const { requireAuth } = require("../middleware/auth.js");
const {
  register,
  login,
  me,
  requestPasswordReset,
  resetPassword,
  sendEmailOtp,
  verifyEmailOtp
} = require("../controllers/auth.controller.js");

const router = express.Router();

// Email/password
router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);

// Password reset
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);

// Firebase Phone
router.post("/send-otp", sendEmailOtp);
router.post("/verify-otp", verifyEmailOtp);

module.exports = router;
