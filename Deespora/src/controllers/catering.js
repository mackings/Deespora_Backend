const axios = require("axios");
const { success, error } = require("../utils/response");
const cron = require("node-cron");
const path = require("path");
const fs = require("fs");

// =======================
// Cache Helpers
// =======================
const CACHE_FILE = path.join(__dirname, "../cache/catering.json");

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  } catch (err) {
    console.error("⚠️ Error reading cache:", err.message);
    return null;
  }
}

function writeCache(data) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    console.log(`💾 Cache updated: ${CACHE_FILE}`);
  } catch (err) {
    console.error("⚠️ Error writing cache:", err.message);
  }
}

// =======================
// Fetch Reviews for a Place
// =======================
async function fetchReviews(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json`;
  try {
    const resp = await axios.get(url, {
      params: {
        place_id: placeId,
        key: process.env.GOOGLE_PLACES_API_KEY,
        fields: "name,rating,user_ratings_total,reviews",
      },
    });

    if (resp.data.status !== "OK") {
      console.warn(`[fetchReviews] status=${resp.data.status}`, resp.data.error_message);
    }

    return resp.data.result?.reviews || [];
  } catch (err) {
    console.error("❌ [fetchReviews] Failed:", err.response?.data || err.message);
    return [];
  }
}

// =======================
// Fetch & Cache African Catering Companies
// =======================
async function fetchAndCacheCateringCompanies() {
  console.log("🌍 Fetching African catering companies from Google...");

  const usCities = [
    "New York", "Los Angeles", "Chicago", "Houston", "Atlanta", "Washington DC",
    "Dallas", "Seattle", "San Francisco", "Minneapolis", "Philadelphia",
    "Boston", "Miami", "Denver", "Phoenix", "Las Vegas"
  ];

  const africanKeywords = [
    "african catering",
    "nigerian catering",
    "ghanaian catering",
    "ethiopian catering",
    "cameroonian catering",
    "kenyan catering",
    "senegalese catering",
    "african food service",
    "african restaurant catering",
    "diaspora catering"
  ];

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
  let allResults = [];

  for (const city of usCities) {
    for (const keyword of africanKeywords) {
      console.log(`📍 Searching "${keyword}" in ${city}...`);
      let nextPageToken = null;

      do {
        try {
          const response = await axios.get(url, {
            params: {
              key: process.env.GOOGLE_PLACES_API_KEY,
              query: `${keyword} in ${city}`,
              type: "restaurant",
              pagetoken: nextPageToken,
            },
          });

          if (response.data.status !== "OK" && response.data.status !== "ZERO_RESULTS") {
            console.warn(`[TextSearch] ${city} - ${keyword}: ${response.data.status}`);
          }

          if (response.data.results?.length) {
            response.data.results.forEach((r) => (r.city = city));
            allResults.push(...response.data.results);
          }

          nextPageToken = response.data.next_page_token;
          if (nextPageToken) await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
          console.error(`❌ [TextSearch] Failed in ${city}:`, err.message);
          break;
        }
      } while (nextPageToken && allResults.length < 1500);
    }
  }

  console.log(`🧩 Total raw results: ${allResults.length}`);

  // Filter duplicates
  const uniqueResults = [
    ...new Map(allResults.map((item) => [item.place_id, item])).values(),
  ];

  // Fetch reviews in small batches
  console.log(`🌟 Fetching reviews for ${uniqueResults.length} catering companies...`);
  const batchSize = 30;
  let withReviews = [];

  for (let i = 0; i < uniqueResults.length; i += batchSize) {
    const batch = uniqueResults.slice(i, i + batchSize);
    const batchWithReviews = await Promise.all(
      batch.map(async (place) => {
        const reviews = await fetchReviews(place.place_id);
        return { ...place, reviews: reviews.slice(0, 10) };
      })
    );
    withReviews.push(...batchWithReviews);
  }

  console.log(`💾 Caching ${withReviews.length} catering companies`);
  writeCache(withReviews);

  return withReviews;
}

// =======================
// API Handler
// =======================
exports.getCateringCompanies = async (req, res) => {
  try {
    const cachedData = readCache();
    if (cachedData && cachedData.length > 0) {
      console.log("📌 Returning cached catering companies");
      return success(res, "African catering companies (from cache)", cachedData);
    }

    const data = await fetchAndCacheCateringCompanies();
    return success(res, "African catering companies (fresh from Google)", data);
  } catch (err) {
    console.error("❌ Error fetching companies:", err.message);
    return error(res, "Failed to fetch African catering companies", 500, err.message);
  }
};

// =======================
// Cron Job - Refresh Monthly (Last Day of Month at 11:59 PM)
// =======================
cron.schedule("59 23 28-31 * *", async () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Only run if tomorrow is a new month
  if (tomorrow.getMonth() !== today.getMonth()) {
    console.log("⏰ Running monthly cache refresh for African catering companies...");
    try {
      await fetchAndCacheCateringCompanies();
      console.log("✅ Monthly cache refresh complete");
    } catch (err) {
      console.error("❌ Failed to refresh monthly cache:", err.message);
    }
  }
});
