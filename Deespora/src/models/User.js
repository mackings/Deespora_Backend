const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true, trim: true },
    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },

    role: { type: String, enum: ["admin", "user"], default: "user" },  
    isActive: { type: Boolean, default: true }, 

    // Password reset fields
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpiresAt: { type: Date, default: null },
    resetPasswordMethod: { type: String, enum: ["custom_token", "twilio_verify"], default: null }, // ✅ ADD THIS

    // Email OTP fields
    emailOtp: { type: String, default: null },
    emailOtpExpires: { type: Date, default: null },

    // Phone OTP fields
    phoneOtp: { type: String, default: null },
    phoneOtpExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = async function (plainPassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plainPassword, this.passwordHash);
};

const User = mongoose.model("User", userSchema);

module.exports = User;