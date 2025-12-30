const axios = require("axios");
const { success, error } = require("../utils/response");
const cron = require("node-cron");
const path = require("path");
const fs = require("fs");




// Cache Helpers
// =======================
const CACHE_FILE = path.join(__dirname, "../cache/african_churches.json");

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
        fields: "name,rating,user_ratings_total,reviews,formatted_address,opening_hours",
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
// Fetch & Cache African Churches
// =======================
async function fetchAndCacheAfricanChurches() {
  console.log("⛪ Fetching African churches from Google...");

  const usCities = [
    "New York", "Los Angeles", "Chicago", "Houston", "Atlanta", "Washington DC",
    "Dallas", "Seattle", "San Francisco", "Minneapolis", "Philadelphia",
    "Boston", "Miami", "Denver", "Phoenix", "Las Vegas"
  ];

  // Major African Pentecostal/Charismatic Churches
  const africanChurches = [
    "Redeemed Christian Church of God RCCG",
    "Mountain of Fire and Miracles Ministries MFM",
    "Living Faith Church Winners Chapel",
    "Christ Embassy Believers LoveWorld",
    "Deeper Life Bible Church",
    "The Synagogue Church of All Nations SCOAN",
    "Salvation Ministries",
    "House on the Rock Church",
    "The Lord's Chosen Charismatic Revival Movement",
    "Daystar Christian Centre",
    "Commonwealth of Zion Assembly COZA",
    "Dunamis International Gospel Centre",
    "The Elevation Church",
    "Citadel Global Community Church",
    "african pentecostal church",
    "nigerian church",
    "ghanaian church",
    "african worship center",
    "african christian church",
  ];

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
  let allResults = [];

  for (const city of usCities) {
    for (const churchName of africanChurches) {
      console.log(`⛪ Searching "${churchName}" in ${city}...`);
      let nextPageToken = null;

      do {
        try {
          const response = await axios.get(url, {
            params: {
              key: process.env.GOOGLE_PLACES_API_KEY,
              query: `${churchName} in ${city}`,
              type: "church",
              pagetoken: nextPageToken,
            },
          });

          if (response.data.status !== "OK" && response.data.status !== "ZERO_RESULTS") {
            console.warn(`[TextSearch] ${city} - ${churchName}: ${response.data.status}`);
          }

          if (response.data.results?.length) {
            response.data.results.forEach((r) => {
              r.city = city;
              r.searchTerm = churchName;
            });
            allResults.push(...response.data.results);
          }

          nextPageToken = response.data.next_page_token;
          if (nextPageToken) await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
          console.error(`❌ [TextSearch] Failed in ${city}:`, err.message);
          break;
        }
      } while (nextPageToken && allResults.length < 2000);
    }
  }

  console.log(`🧩 Total raw results: ${allResults.length}`);

  // Filter duplicates by place_id
  const uniqueResults = [
    ...new Map(allResults.map((item) => [item.place_id, item])).values(),
  ];

  // Fetch reviews in small batches
  console.log(`🌟 Fetching reviews for ${uniqueResults.length} churches...`);
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

  console.log(`💾 Caching ${withReviews.length} African churches`);
  writeCache(withReviews);

  return withReviews;
}

// =======================
// API Handler
// =======================
exports.getAfricanChurches = async (req, res) => {
  try {
    const cachedData = readCache();
    if (cachedData && cachedData.length > 0) {
      console.log("📌 Returning cached African churches");
      return success(res, "African churches (from cache)", cachedData);
    }

    const data = await fetchAndCacheAfricanChurches();
    return success(res, "African churches (fresh from Google)", data);
  } catch (err) {
    console.error("❌ Error fetching churches:", err.message);
    return error(res, "Failed to fetch African churches", 500, err.message);
  }
};

// =======================
// Cron Job - Refresh Daily at Midnight
// =======================
cron.schedule("59 23 28-31 * *", async () => {
  console.log("⏰ Running daily cache refresh for African churches...");
  try {
    await fetchAndCacheAfricanChurches();
    console.log("✅ Daily cache refresh complete");
  } catch (err) {
    console.error("❌ Failed to refresh cache:", err.message);
  }
});
