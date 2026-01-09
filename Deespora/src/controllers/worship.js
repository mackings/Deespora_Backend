const axios = require("axios");
const { success, error } = require("../utils/response");
const cron = require("node-cron");
const { readCache, writeCache } = require("../utils/RestCache");

const CACHE_NAME = "worship";

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
    "Boston", "Miami", "Denver", "Phoenix", "Las Vegas",
    "San Diego", "Orlando", "Baltimore", "Charlotte", "Austin",
    "Detroit", "Newark", "St. Louis", "Tampa", "Raleigh"
  ];

  // Major African Pentecostal/Charismatic Churches
  const africanChurches = [
    "African church",
    "African worship",
    "African worship center",
    "African christian church",
    "African Pentecostal church",
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
    "Nigerian church",
    "Ghanaian church",
    "Congolese church",
    "Eritrean church",
    "Ethiopian church",
  ];

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
  const resultMap = new Map();

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
            response.data.results.forEach((r) => resultMap.set(r.place_id, r));
          }

          nextPageToken = response.data.next_page_token;
          if (nextPageToken) await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
          console.error(`❌ [TextSearch] Failed in ${city}:`, err.message);
          break;
        }
      } while (nextPageToken && resultMap.size < 4000);
    }
  }

  console.log(`🧩 Total raw results: ${resultMap.size}`);

  const uniqueResults = Array.from(resultMap.values());

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
  writeCache(withReviews, CACHE_NAME);

  return withReviews;
}

// =======================
// API Handler
// =======================
exports.getAfricanChurches = async (req, res) => {
  try {
    const cachedData = readCache(CACHE_NAME);
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

// --------------------------------------------------
// SEARCH worship by keyword & city + reviews
// --------------------------------------------------
exports.searchWorship = async (req, res) => {
  try {
    const { city, keyword } = req.query;
    if (!keyword) return error(res, "Keyword is required", 400);
    if (!city) return error(res, "City is required", 400);

    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
    const geoRes = await axios.get(geoUrl, {
      params: { address: city, key: process.env.GOOGLE_PLACES_API_KEY },
    });
    if (!geoRes.data.results?.length) return error(res, `City "${city}" not found`, 404);

    const { lat, lng } = geoRes.data.results[0].geometry.location;

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
    const allResults = [];
    let nextPageToken = null;

    do {
      const response = await axios.get(url, {
        params: {
          key: process.env.GOOGLE_PLACES_API_KEY,
          query: `${keyword} in ${city}`,
          location: `${lat},${lng}`,
          radius: 5000,
          pagetoken: nextPageToken,
        },
      });

      if (response.data.results?.length) {
        allResults.push(...response.data.results);
      }

      nextPageToken = response.data.next_page_token;
      if (nextPageToken) await new Promise((r) => setTimeout(r, 2000));
    } while (nextPageToken && allResults.length < 100);

    const limitedResults = allResults.slice(0, 20);

    const withReviews = await Promise.all(
      limitedResults.slice(0, 10).map(async (place) => {
        const reviews = await fetchReviews(place.place_id);
        return {
          ...place,
          reviews: reviews.slice(0, 3),
        };
      })
    );

    return success(res, `Search results for "${keyword}" in ${city}`, {
      count: withReviews.length,
      worship: withReviews,
    });
  } catch (err) {
    console.error("❌ Error searching worship:", err.response?.data || err.message);
    return error(res, "Failed to search worship", 500, err.message);
  }
};
