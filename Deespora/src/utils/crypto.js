const crypto = require("crypto");
const bcrypt = require("bcryptjs");

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

async function hashToken(token) {
  console.log('🔐 Hashing token with bcrypt:', token);
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(token, salt);
  console.log('✅ Token hashed successfully');
  return hashed;
}

async function compareToken(token, tokenHash) {
  console.log('🔍 Comparing tokens:');
  console.log('   Plain token:', token);
  console.log('   Token hash:', tokenHash);
  const result = await bcrypt.compare(token, tokenHash);
  console.log('   Match result:', result);
  return result;
}

module.exports = { randomToken, hashToken, compareToken };