const axios = require("axios");
const { success, error } = require("../utils/response");
const cron = require("node-cron");
const path = require("path");
const fs = require("fs");




// Cache Helpers
// =======================
const CACHE_FILE = path.join(__dirname, "../cache/real_estate.json");

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
// Fetch & Cache Real Estate Companies
// =======================
async function fetchAndCacheRealEstateCompanies() {
  console.log("🌍 Fetching African real estate companies from Google...");

  const usCities = [
    "New York", "Los Angeles", "Chicago", "Houston", "Atlanta", "Washington DC",
    "Dallas", "Seattle", "San Francisco", "Minneapolis", "Philadelphia",
    "Boston", "Miami", "Denver", "Phoenix", "Las Vegas"
  ];

  const africanKeywords = [
    "african real estate",
    "nigerian real estate",
    "ghanaian real estate",
    "ethiopian real estate",
    "cameroonian real estate",
    "kenyan real estate",
    "senegalese real estate",
    "african property",
    "african realtor",
    "african housing",
    "african homes",
    "diaspora real estate",
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
              type: "real_estate_agency",
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
  console.log(`🌟 Fetching reviews for ${uniqueResults.length} companies...`);
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

  console.log(`💾 Caching ${withReviews.length} real estate companies`);
  writeCache(withReviews);

  return withReviews;
}


// =======================
// API Handler
// =======================
exports.getRealEstateCompanies = async (req, res) => {
  try {
    const cachedData = readCache();
    if (cachedData && cachedData.length > 0) {
      console.log("📌 Returning cached real estate companies");
      return success(res, "African real estate companies (from cache)", cachedData);
    }

    const data = await fetchAndCacheRealEstateCompanies();
    return success(res, "African real estate companies (fresh from Google)", data);
  } catch (err) {
    console.error("❌ Error fetching companies:", err.message);
    return error(res, "Failed to fetch African real estate companies", 500, err.message);
  }
};

// =======================
// Cron Job - Refresh Daily at Midnight
// =======================
cron.schedule("0 0 * * *", async () => {
  console.log("⏰ Running daily cache refresh for African real estate companies...");
  try {
    await fetchAndCacheRealEstateCompanies();
    console.log("✅ Daily cache refresh complete");
  } catch (err) {
    console.error("❌ Failed to refresh cache:", err.message);
  }
});
