const axios = require("axios");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
require("dotenv").config();





// -------------------------------------------------
// CONFIG
// -------------------------------------------------
const ENV = process.env.REVOLUT_ENV || "sandbox";
const CLIENT_ID = process.env.REVOLUT_CLIENT_ID;

const CONFIG = {
  sandbox: {
    BASE_URL: "https://sandbox-b2b.revolut.com/api/1.0",
    AUTH_URL: "https://sandbox-b2b.revolut.com/api/1.0/auth/token"
  },
  production: {
    BASE_URL: "https://b2b.revolut.com/api/1.0",
    AUTH_URL: "https://b2b.revolut.com/api/1.0/auth/token"
  }
};

// 🔥 Use your ROOT files
const PRIVATE_KEY_PATH = path.join(process.cwd(), "private.pem");
const REFRESH_TOKEN_PATH = path.join(process.cwd(), "refresh_token.txt");

let accessToken = null;
let tokenExpiry = null;

// -------------------------------------------------
// GENERATE CLIENT ASSERTION JWT
// -------------------------------------------------
function generateClientAssertion() {
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");

  const payload = {
    iss: CLIENT_ID,           // Your Revolut app ID
    sub: CLIENT_ID,           // Same as iss
    aud: CONFIG[ENV].AUTH_URL, // Revolut OAuth endpoint
    exp: Math.floor(Date.now() / 1000) + 300 // 5 min expiry
  };

  return jwt.sign(payload, privateKey, {
    algorithm: "RS256"
  });
}

// -------------------------------------------------
// REFRESH TOKEN HANDLING
// -------------------------------------------------
function loadRefreshToken() {
  if (!fs.existsSync(REFRESH_TOKEN_PATH)) {
    throw new Error("❌ Refresh token not found. Run initial authorization.");
  }
  return fs.readFileSync(REFRESH_TOKEN_PATH, "utf8").trim();
}

function saveRefreshToken(token) {
  fs.writeFileSync(REFRESH_TOKEN_PATH, token, "utf8");
}

// -------------------------------------------------
// FIRST TIME: EXCHANGE AUTH CODE FOR TOKENS
// -------------------------------------------------
async function exchangeCodeForToken(authorizationCode) {
  const assertion = generateClientAssertion();

  const response = await axios.post(
    CONFIG[ENV].AUTH_URL,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + response.data.expires_in * 1000;

  saveRefreshToken(response.data.refresh_token);

  return response.data;
}

// -------------------------------------------------
// REFRESH ACCESS TOKEN
// -------------------------------------------------
async function refreshAccessToken() {
  const refreshToken = loadRefreshToken();
  const assertion = generateClientAssertion();

  const response = await axios.post(
    CONFIG[ENV].AUTH_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + response.data.expires_in * 1000;

  return response.data;
}

// -------------------------------------------------
// ALWAYS RETURN A VALID ACCESS TOKEN
// -------------------------------------------------
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry - 30000) {
    return accessToken;
  }
  await refreshAccessToken();
  return accessToken;
}

// -------------------------------------------------
// PUBLIC API: Get FX Rates
// -------------------------------------------------
async function getRevolutRates(from = "USD", to = "NGN", amount = 1) {
  const token = await getAccessToken();

  const response = await axios.get(`${CONFIG[ENV].BASE_URL}/rate`, {
    params: { from, to, amount },
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  return response.data;
}

module.exports = {
  exchangeCodeForToken,
  getRevolutRates
};
