const bcrypt = require('bcryptjs');
const User = require("../models/User");
const { success, error } = require("../utils/response");
const { signJwt } = require("../utils/jwt");
const { randomToken, hashToken, compareToken } = require("../utils/crypto");
const { sendEmail } = require("../utils/sendEmail");
const dotenv = require("dotenv");
const axios = require("axios");
const mongoose = require("mongoose");

dotenv.config();




// POST /auth/register



export async function register(req, res) {
  try {
    const { firstName, lastName, email, password, phoneNumber } = req.body;

    if (!firstName || !lastName || !email || !password || !phoneNumber) {
      return error(res, "First name, last name, email, phone number, and password are required", 400);
    }

    // Check for existing email
    const existingEmail = await User.findOne({ email });
    if (existingEmail) return error(res, "Email already in use", 409);

    // Check for existing phone number
    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) return error(res, "Phone number already in use", 409);

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      passwordHash,
      phoneNumber,
      phoneVerified: false,
    });

    return success(
      res,
      "Registered",
      {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneVerified: user.phoneVerified,
      },
      201
    );
  } catch (e) {
    // Handle duplicate key error from Mongo
    if (e.code === 11000) {
      if (e.keyPattern?.email) {
        return error(res, "Email already in use", 409);
      }
      if (e.keyPattern?.phoneNumber) {
        return error(res, "Phone number already in use", 409);
      }
      return error(res, "Duplicate field value", 409);
    }

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

    const token = signJwt({ uid: String(user._id), email: user.email });

    return success(res, "Login successful", {
      token,
      user: {
        id: user._id,
        email: user.email,
        phoneVerified: user.phoneVerified,
        emailVerified: user.emailVerified,
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

    // Always respond the same (security best practice)
    if (user) {
      // Generate 5-digit numeric code
      const token = Math.floor(10000 + Math.random() * 90000).toString();

      const tokenHash = await hashToken(token);
      const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

      user.resetPasswordTokenHash = tokenHash;
      user.resetPasswordExpiresAt = expires;
      await user.save();

      // Send via email
      await sendEmail({
        to: email,
        subject: "Your password reset code",
        html: `<p>Your password reset code is:</p>
               <h2>${token}</h2>
               <p>This code will expire in 30 minutes.</p>`,
      });
    }

    return success(res, "If the email exists, a reset code will be sent.");
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

    // Compare user input with stored hash
    const match = await compareToken(token, user.resetPasswordTokenHash);
    if (!match) return error(res, "Invalid token", 400);

    // Update password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);

    // Clear reset fields
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    return success(res, "Password updated",200);
  } catch (e) {
    return error(res, e.message, 500);
  }
}




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

    const user = await User.findOne({ email });
    if (!user) return error(res, "User not found", 404);

    user.emailOtp = otp;
    user.emailOtpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 min
    await user.save();

    await sendEmail({
      to: email,
      subject: "Verify your email",
      html: `<p>Your verification code is:</p>
             <h2>${otp}</h2>
             <p>This code will expire in 5 minutes.</p>`,
    });

    return success(res, "Verification code sent to email");
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

    if (!user.emailOtp || user.emailOtpExpires < Date.now()) {
      return error(res, "OTP expired. Request a new one.", 400);
    }

    if (user.emailOtp !== code) {
      return error(res, "Invalid OTP", 400);
    }

    user.emailVerified = true;
    user.emailOtp = null;
    user.emailOtpExpires = null;
    await user.save();

    return success(res, "Email verified successfully", {
      uid: user._id.toString(),
      email: user.email,
    });
  } catch (err) {
    console.error("❌ Error verifying Email OTP:", err);
    return error(res, err.message, 500);
  }
}




