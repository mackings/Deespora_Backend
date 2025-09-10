import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  email: { type: String, required: false, unique: true, lowercase: true, trim: true }, // optional for phone-only users
  passwordHash: { type: String, required: false }, // optional
  phoneNumber: { type: String, required: true, unique: true },
  phoneVerified: { type: Boolean, default: false },
  resetPasswordTokenHash: { type: String, default: null },
  resetPasswordExpiresAt: { type: Date, default: null },
}, { timestamps: true });


userSchema.methods.comparePassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

const User = mongoose.model("User", userSchema);
export default User;
