const axios = require("axios");

// Base URL and token from environment
const WISE_API_BASE = process.env.WISE_API_BASE;
const WISE_API_KEY = process.env.WISE_API_KEY;

async function getWiseRates(from = "USD", to = "NGN", amount = 1) {
  try {
    const response = await axios.get(`${WISE_API_BASE}/rates`, {
      params: { source: from, target: to },
      headers: {
        Authorization: `Bearer ${WISE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const rateObj = response.data[0]; // pick first rate

    return {
      rate: rateObj.rate,
      source: rateObj.source,
      target: rateObj.target,
      time: rateObj.time,
    };
  } catch (error) {
    console.error("Wise API error:", error.response?.data || error.message);
    throw new Error(
      error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.message
    );
  }
}

module.exports = { getWiseRates };
