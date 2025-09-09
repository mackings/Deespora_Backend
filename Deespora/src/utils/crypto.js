import crypto from "crypto";
import bcrypt from "bcryptjs";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export async function hashToken(token) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(token, salt);
}

export async function compareToken(token, tokenHash) {
  return bcrypt.compare(token, tokenHash);
}
