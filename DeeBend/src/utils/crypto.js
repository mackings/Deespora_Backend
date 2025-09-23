const crypto = require("crypto");
const bcrypt = require("bcryptjs");

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

async function hashToken(token) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(token, salt);
}

async function compareToken(token, tokenHash) {
  return bcrypt.compare(token, tokenHash);
}

module.exports = { randomToken, hashToken, compareToken };

