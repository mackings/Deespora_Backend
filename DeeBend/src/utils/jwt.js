const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

const secret = process.env.JWT_SECRET || "dev_secret_change_me";
const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

function signJwt(payload) {
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyJwt(token) {
  return jwt.verify(token, secret);
}

module.exports = { signJwt, verifyJwt };
