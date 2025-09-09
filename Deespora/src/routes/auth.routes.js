import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  register, login, me,
  requestPasswordReset, resetPassword,
  sendOtp, verifyOtp
} from "../controllers/auth.controller.js";

const router = Router();

// Email/password
router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);

// Password reset
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);

// Firebase Phone
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

export default router;
