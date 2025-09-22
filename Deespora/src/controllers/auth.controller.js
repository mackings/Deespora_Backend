import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { success } from "../utils/response.js";
import { signJwt } from "../utils/jwt.js";
import { randomToken, hashToken, compareToken } from "../utils/crypto.js";
import { sendEmail } from "../utils/sendEmail.js";
import dotenv from "dotenv";
import axios from "axios";
import mongoose from "mongoose";





// POST /auth/register

export async function register(req, res) {
  try {
    const { email, password, phoneNumber } = req.body;
    if (!email || !password) return error(res, "Email and password are required", 400);

    const exists = await User.findOne({ email });
    if (exists) return error(res, "Email already in use", 409);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({ email, passwordHash, phoneNumber, phoneVerified: false });

    return success(res, "Registered", {
      id: user._id,
      email: user.email,
      phoneVerified: user.phoneVerified,
    }, 201);
  } catch (e) {
    return error(res, e.message, 500);
  }
}


// POST /auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return error(res, "Invalid credentials", 401);

    const ok = await user.comparePassword(password);
    if (!ok) return error(res, "Invalid credentials", 401);

    // Optional: enforce phone/email verification before login
    if (!user.phoneVerified) return error(res, "Phone not verified", 403);

    const token = signJwt({ uid: String(user._id), email: user.email });

    return success(res, {
      token,
      user: {
        id: user._id,
        email: user.email,
        phoneVerified: user.phoneVerified,
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
}



// GET /auth/me
export async function me(req, res) {
  return success(res,{User});
}

// POST /auth/request-password-reset
export async function requestPasswordReset(req, res) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always respond the same (security best practice: don’t reveal if email exists)
    if (user) {
      const token = randomToken(24);
      const tokenHash = await hashToken(token);
      const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

      user.resetPasswordTokenHash = tokenHash;
      user.resetPasswordExpiresAt = expires;
      await user.save();

      const resetLink = `${
        process.env.CLIENT_URL || "http://localhost:5173"
      }/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

      await sendEmail({
        to: email,
        subject: "Reset your password",
        html: `<p>Click the link below to reset your password (valid for 30 minutes):</p><p><a href="${resetLink}">${resetLink}</a></p>`,
      });
    }

    return success(res, { message: "If the email exists, a reset link will be sent." });
  } catch (e) {
    return error(res, e.message, 500);
  }
}




// POST /auth/reset-password
export async function resetPassword(req, res) {
  try {
    const { email, token, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.resetPasswordTokenHash || !user.resetPasswordExpiresAt) {
      return error(res, "Invalid token", 400);
    }

    if (user.resetPasswordExpiresAt < new Date()) {
      return error(res, "Token expired", 400);
    }

    const match = await compareToken(token, user.resetPasswordTokenHash);
    if (!match) return error(res, "Invalid token", 400);

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    return success(res, { message: "Password updated" });
  } catch (e) {
    return error(res, e.message, 500);
  }
}




// POST /auth/send-otp
// Helper function to generate a 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}



// POST /auth/send-email-otp
export async function sendEmailOtp(req, res) {
  try {
    const { email } = req.body;
    if (!email) return error(res, "Email required", 400);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    let user = await User.findOne({ email });
    if (!user) user = await User.create({ email, phoneVerified: false });

    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();

    await sendEmail({
      to: email,
      subject: "Your verification code",
      html: `<p>Your verification code is:</p><h2>${otp}</h2><p>This code will expire in 5 minutes.</p>`,
    });

    console.log(`✅ Email OTP ${otp} sent to ${email}`);
    return success(res, "OTP sent to email");
  } catch (err) {
    console.error("❌ Error sending Email OTP:", err);
    return error(res, "Failed to send OTP", 500, err.message);
  }
}



// POST /auth/verify-email-otp
export async function verifyEmailOtp(req, res) {
  try {
    const { email, code } = req.body;
    if (!email || !code) return error(res, "Email and code required", 400);

    const user = await User.findOne({ email });
    if (!user) return error(res, "User not found", 404);

    // Check OTP validity
    if (!user.otp || user.otpExpires < Date.now()) {
      return error(res, "OTP expired. Request a new one.", 400);
    }
    if (user.otp !== code) {
      return error(res, "Invalid OTP", 400);
    }

    // Mark verified
    user.phoneVerified = true; // consider renaming to emailVerified
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // ✅ Use success util
    return success(res, {
      message: "Email verified successfully",
      uid: user._id.toString(),
      email: user.email,
    });
  } catch (err) {
    console.error("❌ Error verifying Email OTP:", err);
    return error(res, err.message, 500);
  }
}




