const axios = require("axios");
const {success,error} = require("../utils/response")
const { readCache, writeCache } = require('../utils/RestCache');
const cron = require("node-cron");



cron.schedule("0 0 * * *", async () => {
  console.log("⏰ Running daily cache refresh for African restaurants...");
  try {
    await getRestaurants({ /* dummy req */ }, { 
      json: () => {},
      status: () => ({ json: () => {} }),
    });
    console.log("✅ Cache refreshed successfully");
  } catch (err) {
    console.error("❌ Failed to refresh cache:", err);
  }
});

// =======================
// Helpers
// =======================

// 🔎 Fetch reviews for a single place
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
      console.error(`⚠️ [Google Places Details] status=${resp.data.status}`, resp.data.error_message);
    }

    return resp.data.result?.reviews || [];
  } catch (err) {
    console.error("❌ [fetchReviews] Request failed:", err.response?.data || err.message);
    return [];
  }
}

// 🔎 Resolve a city name to lat/lng
async function getCityCoordinates(city) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json`;
  try {
    const resp = await axios.get(url, {
      params: {
        address: city,
        key: process.env.GOOGLE_PLACES_API_KEY,
      },
    });

    if (resp.data.status !== "OK") {
      console.error(`⚠️ [Geocode] status=${resp.data.status}`, resp.data.error_message);
    }

    if (!resp.data.results || resp.data.results.length === 0) {
      throw new Error(`Could not find coordinates for "${city}"`);
    }

    const { lat, lng } = resp.data.results[0].geometry.location;
    return { lat, lng };
  } catch (err) {
    console.error("❌ [getCityCoordinates] Request failed:", err.response?.data || err.message);
    throw err;
  }
}

// =======================
// Fetch & cache restaurants
// =======================
async function fetchAndCacheRestaurants() {
  console.log("🌍 Fetching African restaurants from Google...");

  const usCities = [
    { name: "New York", lat: 40.7128, lng: -74.0060 },
    { name: "Los Angeles", lat: 34.0522, lng: -118.2437 },
    { name: "Chicago", lat: 41.8781, lng: -87.6298 },
    { name: "Houston", lat: 29.7604, lng: -95.3698 },
    { name: "Atlanta", lat: 33.7490, lng: -84.3880 },
    { name: "Washington DC", lat: 38.9072, lng: -77.0369 },
    { name: "Dallas", lat: 32.7767, lng: -96.7970 },
    { name: "Seattle", lat: 47.6062, lng: -122.3321 },
    { name: "San Francisco", lat: 37.7749, lng: -122.4194 },
    { name: "Minneapolis", lat: 44.9778, lng: -93.2650 },
    { name: "Philadelphia", lat: 39.9526, lng: -75.1652 },
    { name: "Boston", lat: 42.3601, lng: -71.0589 },
    { name: "Miami", lat: 25.7617, lng: -80.1918 },
    { name: "Denver", lat: 39.7392, lng: -104.9903 },
    { name: "Phoenix", lat: 33.4484, lng: -112.0740 },
    { name: "Las Vegas", lat: 36.1699, lng: -115.1398 },
  ];

  const africanKeywords = [
    "african", "nigerian", "ethiopian", "ghanaian", "senegalese",
    "somali", "cameroonian", "egyptian", "north african", "sudanese",
    "afro fusion", "afro-caribbean",
  ];

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
  let allResults = [];

  for (const city of usCities) {
    console.log(`📍 Searching restaurants in ${city.name}...`);
    let nextPageToken = null;

    do {
      try {
        const response = await axios.get(url, {
          params: {
            key: process.env.GOOGLE_PLACES_API_KEY,
            location: `${city.lat},${city.lng}`,
            radius: 10000,
            type: "restaurant",
            keyword: "african restaurant",
            pagetoken: nextPageToken,
          },
        });

        if (response.data.status !== "OK") {
          console.error(`⚠️ [Nearby Search] city=${city.name} status=${response.data.status}`, response.data.error_message);
        }

        if (response.data.results?.length) {
          response.data.results.forEach(r => (r.city = city.name));
          allResults.push(...response.data.results);
        }

        nextPageToken = response.data.next_page_token;
        if (nextPageToken) {
          console.log(`⏳ Waiting for next page in ${city.name}...`);
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        console.error(`❌ [Nearby Search] Failed in ${city.name}:`, err.response?.data || err.message);
        break;
      }
    } while (nextPageToken && allResults.length < 2000);
  }

  const filteredResults = allResults.filter(place =>
    africanKeywords.some(k =>
      `${place.name} ${place.vicinity || ""}`.toLowerCase().includes(k)
    )
  );

  const limitedResults = filteredResults.slice(0, 1000);

  console.log(`🌟 Fetching reviews for ${limitedResults.length} restaurants...`);

  const batchSize = 50;
  let withReviews = [];

  for (let i = 0; i < limitedResults.length; i += batchSize) {
    const batch = limitedResults.slice(i, i + batchSize);
    const batchWithReviews = await Promise.all(
      batch.map(async place => {
        const reviews = await fetchReviews(place.place_id);
        return { ...place, reviews: reviews.slice(0, 20) };
      })
    );
    withReviews.push(...batchWithReviews);
  }

  console.log(`💾 Caching ${withReviews.length} restaurants with reviews`);
  writeCache(withReviews);

  return withReviews;
}

// ✅ API Handler
exports.getRestaurants = async (req, res) => {
  try {
    const cachedData = readCache();
    if (cachedData && cachedData.length > 0) {
      console.log("📌 Returning cached restaurants with reviews");
      return success(res, "African restaurants across the US (from cache)", cachedData);
    }

    const data = await fetchAndCacheRestaurants();
    return success(res, "African restaurants across the US", data);
  } catch (err) {
    console.error("❌ Error fetching African restaurants:", err.response?.data || err.message);
    return error(res, "Failed to fetch African restaurants", 500, err.message);
  }
};

// 🕒 Daily refresh at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("⏰ Running daily cache refresh for African restaurants...");
  try {
    await fetchAndCacheRestaurants();
    console.log("✅ Daily cache refresh complete");
  } catch (err) {
    console.error("❌ Failed to refresh cache:", err.response?.data || err.message);
  }
});







// --------------------------------------------------
// SEARCH restaurants by keyword & city + reviews
// --------------------------------------------------
exports.searchRestaurants = async (req, res) => {
  try {
    const { city, keyword } = req.query;
    if (!keyword) return error(res, "Keyword is required", 400);
    if (!city) return error(res, "City is required", 400);

    // 1) Get city coordinates
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
    const geoRes = await axios.get(geoUrl, {
      params: { address: city, key: process.env.GOOGLE_PLACES_API_KEY },
    });
    if (!geoRes.data.results?.length) return error(res, `City "${city}" not found`, 404);

    const { lat, lng } = geoRes.data.results[0].geometry.location;

    // 2) Search restaurants
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
    const allResults = [];
    let nextPageToken = null;

    do {
      const response = await axios.get(url, {
        params: {
          key: process.env.GOOGLE_PLACES_API_KEY,
          query: `${keyword} restaurant in ${city}`,
          location: `${lat},${lng}`,
          radius: 5000,
          pagetoken: nextPageToken,
        },
      });

      if (response.data.results?.length) {
        allResults.push(...response.data.results);
      }

      nextPageToken = response.data.next_page_token;
      if (nextPageToken) await new Promise(r => setTimeout(r, 2000));
    } while (nextPageToken && allResults.length < 100);

    const limitedResults = allResults.slice(0, 20); // limit for demo

    // 🔑 Fetch reviews for top 10
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
      restaurants: withReviews,
    });
  } catch (err) {
    console.error("❌ Error searching restaurants:", err.response?.data || err.message);
    return error(res, "Failed to search restaurants", 500, err.message);
  }
};
