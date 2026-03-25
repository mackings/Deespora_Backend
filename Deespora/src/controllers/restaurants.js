const axios = require("axios");
const {success,error} = require("../utils/response")
const { readCache, writeCache } = require('../utils/RestCache');
const {
  attachGooglePlacePhotoUrls,
  refreshPlacesPhotoReferences,
  mergeFreshPhotosIntoCache,
} = require("../utils/googlePlacePhotos");
const cron = require("node-cron");

const CACHE_NAME = "restaurants";

const DRIVE_SPEED_KM_PER_MIN = 0.6; // ~36 km/h average city driving
const RADIUS_TIERS_MINUTES = [5, 30, 60];

const AFRICAN_FOOD_KEYWORDS = [
  "jollof",
  "amala",
  "egusi",
  "suya",
  "fufu",
  "pounded yam",
  "akara",
  "ofada",
  "moi moi",
  "waakye",
  "injera",
  "doro wat",
  "berbere",
  "nyama choma",
  "bunny chow",
  "bobotie",
  "banku",
  "kenkey",
  "koko",
  "bofrot",
  "shito",
  "tuo zaafi",
  "kebab",
  "shawarma",
  "mandazi",
  "samosa",
  "chapati",
  "ugali",
  "sadza",
  "pap",
  "chakalaka",
  "matoke",
  "posho",
  "koshari",
  "ful medames",
  "molokhia",
  "tagine",
  "couscous",
  "harira",
  "muamba",
  "yassa",
  "thieboudienne",
  "attieke",
  "efo riro",
  "edikaikong",
  "ogbono",
  "banga soup",
  "pepper soup",
  "okro soup",
  "fried plantain",
  "red red",
];

const AFRICAN_RESTAURANT_KEYWORDS = [
  "African",
  "African restaurant",
  "African cuisine",
  "Nigerian restaurant",
  "Ethiopian restaurant",
  "Ghanaian restaurant",
  "Senegalese restaurant",
  "Somali restaurant",
  "North African restaurant",
  "Afro fusion restaurant",
  "Afro-caribbean restaurant",
];

function normalizeKeyword(value) {
  return String(value || "").toLowerCase().trim();
}

function matchesKeyword(place, keyword) {
  const haystack = [
    place?.name,
    place?.formatted_address,
    place?.vicinity,
    Array.isArray(place?.types) ? place.types.join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizeKeyword(keyword));
}

function buildRestaurantSearchKeywords(keyword) {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return [];
  const keywords = [keyword];
  if (AFRICAN_FOOD_KEYWORDS.includes(normalized)) {
    keywords.push(...AFRICAN_RESTAURANT_KEYWORDS);
  }
  return Array.from(new Set(keywords));
}

cron.schedule("59 23 28-31 * *", async () => {
  console.log("⏰ Running daily cache refresh for African restaurants...");
  try {
    await fetchAndCacheRestaurants();
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

function haversineDistanceKm(a, b) {
  const toRad = (val) => (val * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function isRestaurant(place) {
  return Array.isArray(place?.types) && place.types.includes("restaurant");
}

function isNigeriaResult(place) {
  const components = Array.isArray(place?.address_components)
    ? place.address_components.map((c) => `${c.long_name || ""} ${c.short_name || ""}`).join(" ")
    : "";
  const text = [
    place?.formatted_address,
    place?.vicinity,
    place?.plus_code?.compound_code,
    place?.plus_code?.global_code,
    components,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes("nigeria");
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

    const geoResult = resp.data.results[0];
    const country = geoResult.address_components?.find((c) => c.types?.includes("country"))?.short_name;
    if (country === "NG") {
      throw new Error("Searches for Nigeria are not supported");
    }
    const { lat, lng } = geoResult.geometry.location;
    return { lat, lng };
  } catch (err) {
    console.error("❌ [getCityCoordinates] Request failed:", err.response?.data || err.message);
    throw err;
  }
}

async function fetchRestaurantsNearLocation({ lat, lng, keyword }) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
  let allResults = [];
  let nextPageToken = null;

  do {
    try {
      const response = await axios.get(url, {
        params: {
          key: process.env.GOOGLE_PLACES_API_KEY,
          location: `${lat},${lng}`,
          radius: 50000,
          type: "restaurant",
          keyword,
          pagetoken: nextPageToken,
        },
      });

      if (response.data.status !== "OK") {
        console.error(`⚠️ [Nearby Search] status=${response.data.status}`, response.data.error_message);
      }

      if (response.data.results?.length) {
        const filtered = response.data.results.filter((r) => isRestaurant(r) && !isNigeriaResult(r));
        allResults.push(...filtered);
      }

      nextPageToken = response.data.next_page_token;
      if (nextPageToken) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`❌ [Nearby Search] Failed for keyword "${keyword}":`, err.response?.data || err.message);
      break;
    }
  } while (nextPageToken && allResults.length < 200);

  return allResults;
}

async function fetchRestaurantsNearLocationWithRadius({ lat, lng, keyword, radius }) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
  let allResults = [];
  let nextPageToken = null;

  do {
    try {
      const response = await axios.get(url, {
        params: {
          key: process.env.GOOGLE_PLACES_API_KEY,
          location: `${lat},${lng}`,
          radius,
          type: "restaurant",
          keyword,
          pagetoken: nextPageToken,
        },
      });

      if (response.data.status !== "OK") {
        console.error(`⚠️ [Nearby Search] status=${response.data.status}`, response.data.error_message);
      }

      if (response.data.results?.length) {
        allResults.push(...response.data.results);
      }

      nextPageToken = response.data.next_page_token;
      if (nextPageToken) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`❌ [Nearby Search] Failed for keyword "${keyword}":`, err.response?.data || err.message);
      break;
    }
  } while (nextPageToken && allResults.length < 200);

  return allResults;
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
    { name: "San Diego", lat: 32.7157, lng: -117.1611 },
    { name: "Orlando", lat: 28.5383, lng: -81.3792 },
    { name: "Baltimore", lat: 39.2904, lng: -76.6122 },
    { name: "Charlotte", lat: 35.2271, lng: -80.8431 },
    { name: "Austin", lat: 30.2672, lng: -97.7431 },
    { name: "Detroit", lat: 42.3314, lng: -83.0458 },
    { name: "Newark", lat: 40.7357, lng: -74.1724 },
    { name: "St. Louis", lat: 38.6270, lng: -90.1994 },
    { name: "Tampa", lat: 27.9506, lng: -82.4572 },
    { name: "Raleigh", lat: 35.7796, lng: -78.6382 },
  ];

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
  const resultMap = new Map();

  for (const city of usCities) {
    console.log(`📍 Searching restaurants in ${city.name}...`);
    for (const keyword of AFRICAN_RESTAURANT_KEYWORDS) {
      let nextPageToken = null;

      do {
        try {
          const response = await axios.get(url, {
            params: {
              key: process.env.GOOGLE_PLACES_API_KEY,
              location: `${city.lat},${city.lng}`,
              radius: 15000,
              type: "restaurant",
              keyword,
              pagetoken: nextPageToken,
            },
          });

          if (response.data.status !== "OK") {
            console.error(`⚠️ [Nearby Search] city=${city.name} status=${response.data.status}`, response.data.error_message);
          }

          if (response.data.results?.length) {
            response.data.results
              .filter((r) => isRestaurant(r) && !isNigeriaResult(r))
              .forEach((r) => {
                r.city = city.name;
                resultMap.set(r.place_id, r);
              });
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
      } while (nextPageToken && resultMap.size < 4000);
    }
  }

  const limitedResults = Array.from(resultMap.values()).slice(0, 3000);

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
  writeCache(withReviews, CACHE_NAME);

  return withReviews;
}

// ✅ API Handler
exports.getRestaurants = async (req, res) => {
  return exports.getNearbyRestaurants(req, res);
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
// NEARBY restaurants by user location (cache-first)
// --------------------------------------------------
exports.getNearbyRestaurants = async (req, res) => {
  try {
    const { lat, lng, city } = req.query;

    let coords;
    if (lat && lng) {
      coords = { lat: Number(lat), lng: Number(lng) };
    } else if (city) {
      coords = await getCityCoordinates(city);
    } else {
      return error(res, "lat/lng or city is required", 400);
    }

    if (Number.isNaN(coords.lat) || Number.isNaN(coords.lng)) {
      return error(res, "Invalid coordinates", 400);
    }

    const cachedData = (readCache(CACHE_NAME) || []).filter((p) => isRestaurant(p) && !isNigeriaResult(p));
    const withDistance = cachedData
      .filter((place) => place?.geometry?.location)
      .map((place) => {
        const placeCoords = {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        };
        const distanceKm = haversineDistanceKm(coords, placeCoords);
        const distanceMinutes = Math.round(distanceKm / DRIVE_SPEED_KM_PER_MIN);
        return { ...place, distanceKm, distanceMinutes };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const maxRadiusKm = RADIUS_TIERS_MINUTES[RADIUS_TIERS_MINUTES.length - 1] * DRIVE_SPEED_KM_PER_MIN;
    const withinMaxRadius = withDistance.filter((place) => place.distanceKm <= maxRadiusKm);
    if (withinMaxRadius.length > 0) {
      const refreshedResults = await refreshPlacesPhotoReferences(withinMaxRadius);
      const updatedCache = mergeFreshPhotosIntoCache(cachedData, refreshedResults);
      writeCache(updatedCache, CACHE_NAME);

      return success(res, "Nearby African restaurants (from cache)", {
        source: "cache",
        radiusMinutes: RADIUS_TIERS_MINUTES[RADIUS_TIERS_MINUTES.length - 1],
        count: refreshedResults.length,
        restaurants: refreshedResults.map(attachGooglePlacePhotoUrls),
      });
    }

    const fetched = [];
    for (const keyword of AFRICAN_RESTAURANT_KEYWORDS) {
      const results = await fetchRestaurantsNearLocation({
        lat: coords.lat,
        lng: coords.lng,
        keyword,
      });
      fetched.push(...results);
    }

    const deduped = Array.from(new Map(fetched.map((p) => [p.place_id, p])).values())
      .filter((p) => isRestaurant(p) && !isNigeriaResult(p));
    const toCache = [...cachedData, ...deduped];

    const enriched = deduped.map((place) => {
      const placeCoords = {
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
      };
      const distanceKm = haversineDistanceKm(coords, placeCoords);
      const distanceMinutes = Math.round(distanceKm / DRIVE_SPEED_KM_PER_MIN);
      return { ...place, distanceKm, distanceMinutes };
    }).sort((a, b) => a.distanceKm - b.distanceKm);

    const refreshedResults = await refreshPlacesPhotoReferences(enriched);
    const updatedCache = mergeFreshPhotosIntoCache(toCache, refreshedResults);
    writeCache(updatedCache, CACHE_NAME);

    return success(res, "Nearby African restaurants (fresh + cached)", {
      source: "google",
      radiusMinutes: 60,
      count: refreshedResults.length,
      restaurants: refreshedResults.map(attachGooglePlacePhotoUrls),
    });
  } catch (err) {
    console.error("❌ Error fetching nearby restaurants:", err.response?.data || err.message);
    return error(res, "Failed to fetch nearby restaurants", 500, err.message);
  }
};







// --------------------------------------------------
// SEARCH restaurants by keyword & city + reviews
// --------------------------------------------------
exports.searchRestaurants = async (req, res) => {
  try {
    const { city, keyword, lat, lng } = req.query;
    if (!keyword) return error(res, "Keyword is required", 400);
    if (!city && (!lat || !lng)) return error(res, "City or lat/lng is required", 400);

    let coords;
    if (lat && lng) {
      coords = { lat: Number(lat), lng: Number(lng) };
      if (Number.isNaN(coords.lat) || Number.isNaN(coords.lng)) {
        return error(res, "Invalid coordinates", 400);
      }
    } else {
      // 1) Get city coordinates
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
      const geoRes = await axios.get(geoUrl, {
        params: { address: city, key: process.env.GOOGLE_PLACES_API_KEY },
      });
      if (!geoRes.data.results?.length) return error(res, `City "${city}" not found`, 404);

      const geoResult = geoRes.data.results[0];
      const country = geoResult.address_components?.find((c) => c.types?.includes("country"))?.short_name;
      if (country === "NG") {
        return error(res, "Searches for Nigeria are not supported", 400);
      }
      coords = geoResult.geometry.location;
    }

    const searchKeywords = buildRestaurantSearchKeywords(keyword);
    const cachedData = (readCache(CACHE_NAME) || []).filter((p) => isRestaurant(p) && !isNigeriaResult(p));
    const cachedMatches = cachedData.filter((place) => searchKeywords.some((k) => matchesKeyword(place, k)));
    const usedCache = cachedMatches.length > 0;

    let allResults = [];
    if (usedCache) {
      allResults = cachedMatches;
    } else {
      // 2) Search restaurants (prefer nearby, widen radius if needed)
      const radiusTiers = [3000, 8000, 20000];
      let nearbyResults = [];
      for (const radius of radiusTiers) {
        const collected = [];
        for (const searchKeyword of searchKeywords) {
          const results = await fetchRestaurantsNearLocationWithRadius({
            lat: coords.lat,
            lng: coords.lng,
            keyword: searchKeyword,
            radius,
          });
          collected.push(...results);
        }
        const filtered = collected.filter((r) => isRestaurant(r) && !isNigeriaResult(r));
        if (filtered.length > 0) {
          nearbyResults = filtered;
          break;
        }
      }

      if (nearbyResults.length > 0) {
        allResults = nearbyResults;
      } else {
        // 3) Fallback to text search
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
        let nextPageToken = null;

        do {
          const response = await axios.get(url, {
            params: {
              key: process.env.GOOGLE_PLACES_API_KEY,
              query: city ? `${keyword} in ${city}` : keyword,
              location: `${coords.lat},${coords.lng}`,
              radius: 5000,
              type: "restaurant",
              pagetoken: nextPageToken,
            },
          });

          if (response.data.results?.length) {
            const filtered = response.data.results.filter((r) => isRestaurant(r) && !isNigeriaResult(r));
            allResults.push(...filtered);
          }

          nextPageToken = response.data.next_page_token;
          if (nextPageToken) await new Promise(r => setTimeout(r, 2000));
        } while (nextPageToken && allResults.length < 100);
      }
    }

    const withDistance = allResults
      .filter((place) => place?.geometry?.location)
      .map((place) => {
        const placeCoords = {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        };
        const distanceKm = haversineDistanceKm(coords, placeCoords);
        const distanceMinutes = Math.round(distanceKm / DRIVE_SPEED_KM_PER_MIN);
        return { ...place, distanceKm, distanceMinutes };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const limitedResults = withDistance.slice(0, 20); // limit for demo
    const refreshedResults = await refreshPlacesPhotoReferences(limitedResults);

    if (refreshedResults.length > 0) {
      const nextCacheData = !usedCache && allResults.length > 0
        ? Array.from(new Map([...cachedData, ...allResults].map((p) => [p.place_id, p])).values())
        : cachedData;
      const updatedCache = mergeFreshPhotosIntoCache(nextCacheData, refreshedResults);
      writeCache(updatedCache, CACHE_NAME);
    }

    // 🔑 Fetch reviews for top 10
    const withReviews = await Promise.all(
      refreshedResults.slice(0, 10).map(async (place) => {
        const reviews = await fetchReviews(place.place_id);
        return attachGooglePlacePhotoUrls({
          ...place,
          reviews: reviews.slice(0, 3),
        });
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
