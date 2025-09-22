import mongoose from "mongoose";
import bcrypt from "bcryptjs";


const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phoneNumber: { type: String, required: true, unique: true, trim: true },
  phoneVerified: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },

  resetPasswordTokenHash: { type: String, default: null },
  resetPasswordExpiresAt: { type: Date, default: null },

  emailOtp: { type: String, default: null },
  emailOtpExpires: { type: Date, default: null },
}, { timestamps: true });

userSchema.methods.comparePassword = async function (plainPassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plainPassword, this.passwordHash);
};






const User = mongoose.model("User", userSchema);
export default User;
