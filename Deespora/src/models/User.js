import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phoneNumber: { type: String },
  phoneVerified: { type: Boolean, default: false },
  resetPasswordTokenHash: { type: String, default: null },
  resetPasswordExpiresAt: { type: Date, default: null },
}, { timestamps: true });

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

const User = mongoose.model("User", userSchema);
export default User;
