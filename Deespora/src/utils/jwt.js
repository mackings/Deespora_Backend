import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const secret = process.env.JWT_SECRET || "dev_secret_change_me";
const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

export function signJwt(payload) {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyJwt(token) {
  return jwt.verify(token, secret);
}
