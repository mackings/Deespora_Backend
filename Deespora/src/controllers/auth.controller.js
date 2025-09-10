import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { signJwt } from "../utils/jwt.js";
import { randomToken, hashToken, compareToken } from "../utils/crypto.js";
import { sendEmail } from "../utils/sendEmail.js";
import {verifyIdToken,createCustomToken} from "../services/firebase.js"
import dotenv from "dotenv";
import axios from "axios";



// POST /auth/register
export async function register(req, res) {
  try {
    const { email, password, phoneNumber } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already in use" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({ email, passwordHash, phoneNumber, phoneVerified: false });
    return res.status(201).json({ message: "Registered", user: { id: user._id, email: user.email, phoneVerified: user.phoneVerified } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// POST /auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // Optional: enforce phone verification before login
     if (!user.phoneVerified) return res.status(403).json({ error: "Phone not verified" });

    const token = signJwt({ uid: String(user._id), email: user.email });
    return res.json({ token, user: { id: user._id, email: user.email, phoneVerified: user.phoneVerified } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// GET /auth/me
export async function me(req, res) {
  return res.json({ user: req.user });
}

// POST /auth/request-password-reset
export async function requestPasswordReset(req, res) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ message: "If the email exists, a reset link will be sent." });

    const token = randomToken(24);
    const tokenHash = await hashToken(token);
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpiresAt = expires;
    await user.save();

    const resetLink = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    await sendEmail({
      to: email,
      subject: "Reset your password",
      html: `<p>Click the link below to reset your password (valid for 30 minutes):</p><p><a href="${resetLink}">${resetLink}</a></p>`,
    });

    return res.json({ message: "If the email exists, a reset link will be sent." });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// POST /auth/reset-password
export async function resetPassword(req, res) {
  try {
    const { email, token, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.resetPasswordTokenHash || !user.resetPasswordExpiresAt) {
      return res.status(400).json({ error: "Invalid token" });
    }
    if (user.resetPasswordExpiresAt < new Date()) {
      return res.status(400).json({ error: "Token expired" });
    }

    const match = await compareToken(token, user.resetPasswordTokenHash);
    if (!match) return res.status(400).json({ error: "Invalid token" });

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    return res.json({ message: "Password updated" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// POST /auth/send-otp (Firebase)

export async function sendOtp(req, res) {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "phoneNumber required" });

    // Find existing user or create a phone-only user
    let user = await User.findOne({ phoneNumber });
    if (!user) {
      user = await User.create({ phoneNumber, phoneVerified: false });
    }

    // Generate Firebase custom token for this user
    const customToken = await createCustomToken(user._id.toString());

    return res.json({ customToken, uid: user._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /auth/verify-otp
export async function verifyOtp(req, res) {
  try {
    const { uid, idToken } = req.body;
    if (!uid || !idToken) return res.status(400).json({ error: "uid and idToken required" });

    // Verify the token with Firebase Admin SDK
    const decoded = await verifyIdToken(idToken);

    // Support both ObjectId (_id) and phoneNumber
    let user;
    if (mongoose.Types.ObjectId.isValid(uid)) {
      user = await User.findById(uid);
    }
    if (!user) {
      user = await User.findOne({ phoneNumber: uid });
    }

    if (!user) return res.status(404).json({ error: "User not found" });

    user.phoneVerified = true;
    await user.save();

    return res.json({ message: "Phone verified", uid: user._id.toString(), phone: user.phoneNumber });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
}

