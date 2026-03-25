const axios = require("axios");
const { success, error } = require("../utils/response");
const cron = require("node-cron");
const { readCache, writeCache } = require("../utils/RestCache");
const { attachGooglePlacePhotoUrls } = require("../utils/googlePlacePhotos");

const CACHE_NAME = "catering";
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

const AFRICAN_CATERING_KEYWORDS = [
  "African",
  "African catering",
  "African cuisine",
  "African restaurant",
  "Nigerian catering",
  "Ghanaian catering",
  "Ethiopian catering",
  "Cameroonian catering",
  "Kenyan catering",
  "Senegalese catering",
  "Somali catering",
  "African food service",
  "African restaurant catering",
  "Diaspora catering",
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

function buildCateringSearchKeywords(keyword) {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return [];
  const keywords = [keyword];
  if (AFRICAN_FOOD_KEYWORDS.includes(normalized)) {
    keywords.push(...AFRICAN_CATERING_KEYWORDS);
  }
  return Array.from(new Set(keywords));
}

function isCateringPlace(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  if (types.includes("restaurant") || types.includes("meal_delivery") || types.includes("meal_takeaway") || types.includes("cafe")) {
    return true;
  }
  const name = (place?.name || "").toLowerCase();
  return name.includes("cater");
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

async function fetchCateringNearLocationWithRadius({ lat, lng, keyword, radius }) {
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

async function resolveCoordinatesFromQuery({ lat, lng, city }) {
  if (lat && lng) {
    const coords = { lat: Number(lat), lng: Number(lng) };
    if (Number.isNaN(coords.lat) || Number.isNaN(coords.lng)) {
      return { errorMessage: "Invalid coordinates", statusCode: 400 };
    }
    return { coords };
  }

  if (!city) {
    return { errorMessage: "City or lat/lng is required", statusCode: 400 };
  }

  const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
  const geoRes = await axios.get(geoUrl, {
    params: { address: city, key: process.env.GOOGLE_PLACES_API_KEY },
  });
  if (!geoRes.data.results?.length) {
    return { errorMessage: `City "${city}" not found`, statusCode: 404 };
  }

  const geoResult = geoRes.data.results[0];
  const country = geoResult.address_components?.find((c) => c.types?.includes("country"))?.short_name;
  if (country === "NG") {
    return { errorMessage: "Searches for Nigeria are not supported", statusCode: 400 };
  }

  return { coords: geoResult.geometry.location };
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
    "Boston", "Miami", "Denver", "Phoenix", "Las Vegas",
    "San Diego", "Orlando", "Baltimore", "Charlotte", "Austin",
    "Detroit", "Newark", "St. Louis", "Tampa", "Raleigh"
  ];

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
  const resultMap = new Map();

  for (const city of usCities) {
    for (const keyword of AFRICAN_CATERING_KEYWORDS) {
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
            response.data.results
              .filter((r) => isCateringPlace(r) && !isNigeriaResult(r))
              .forEach((r) => {
                r.city = city;
                resultMap.set(r.place_id, r);
              });
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
  writeCache(withReviews, CACHE_NAME);

  return withReviews;
}

// =======================
// API Handler
// =======================
exports.getCateringCompanies = async (req, res) => {
  try {
    const { coords, errorMessage, statusCode } = await resolveCoordinatesFromQuery(req.query);
    if (errorMessage) {
      return error(res, errorMessage, statusCode);
    }

    const cachedData = (readCache(CACHE_NAME) || []).filter((p) => isCateringPlace(p) && !isNigeriaResult(p));
    const withDistance = cachedData
      .filter((place) => place?.geometry?.location)
      .map((place) => {
        const placeCoords = {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        };
        const distanceKm = haversineDistanceKm(coords, placeCoords);
        const distanceMinutes = Math.round(distanceKm / DRIVE_SPEED_KM_PER_MIN);
        return attachGooglePlacePhotoUrls({ ...place, distanceKm, distanceMinutes });
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const maxRadiusKm = RADIUS_TIERS_MINUTES[RADIUS_TIERS_MINUTES.length - 1] * DRIVE_SPEED_KM_PER_MIN;
    const withinMaxRadius = withDistance.filter((place) => place.distanceKm <= maxRadiusKm);
    if (withinMaxRadius.length > 0) {
      return success(res, "Nearby African catering companies (from cache)", {
        source: "cache",
        radiusMinutes: RADIUS_TIERS_MINUTES[RADIUS_TIERS_MINUTES.length - 1],
        count: withinMaxRadius.length,
        catering: withinMaxRadius,
      });
    }

    const fetched = [];
    for (const keyword of AFRICAN_CATERING_KEYWORDS) {
      const results = await fetchCateringNearLocationWithRadius({
        lat: coords.lat,
        lng: coords.lng,
        keyword,
        radius: 50000,
      });
      fetched.push(...results);
    }

    const deduped = Array.from(new Map(fetched.map((p) => [p.place_id, p])).values())
      .filter((p) => isCateringPlace(p) && !isNigeriaResult(p));
    writeCache([...cachedData, ...deduped], CACHE_NAME);

    const enriched = deduped
      .filter((place) => place?.geometry?.location)
      .map((place) => {
        const placeCoords = {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        };
        const distanceKm = haversineDistanceKm(coords, placeCoords);
        const distanceMinutes = Math.round(distanceKm / DRIVE_SPEED_KM_PER_MIN);
        return attachGooglePlacePhotoUrls({ ...place, distanceKm, distanceMinutes });
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return success(res, "Nearby African catering companies (fresh + cached)", {
      source: "google",
      radiusMinutes: RADIUS_TIERS_MINUTES[RADIUS_TIERS_MINUTES.length - 1],
      count: enriched.length,
      catering: enriched,
    });
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

// --------------------------------------------------
// SEARCH catering by keyword & city + reviews
// --------------------------------------------------
exports.searchCatering = async (req, res) => {
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

    const searchKeywords = buildCateringSearchKeywords(keyword);
    const cachedData = (readCache(CACHE_NAME) || []).filter((p) => isCateringPlace(p) && !isNigeriaResult(p));
    const cachedMatches = cachedData.filter((place) => searchKeywords.some((k) => matchesKeyword(place, k)));
    const usedCache = cachedMatches.length > 0;

    let allResults = [];
    if (usedCache) {
      allResults = cachedMatches;
    } else {
      const radiusTiers = [3000, 8000, 20000];
      let nearbyResults = [];
      for (const radius of radiusTiers) {
        const collected = [];
        for (const searchKeyword of searchKeywords) {
          const results = await fetchCateringNearLocationWithRadius({
            lat: coords.lat,
            lng: coords.lng,
            keyword: searchKeyword,
            radius,
          });
          collected.push(...results);
        }
        const filtered = collected.filter((r) => isCateringPlace(r) && !isNigeriaResult(r));
        if (filtered.length > 0) {
          nearbyResults = filtered;
          break;
        }
      }

      if (nearbyResults.length > 0) {
        allResults = nearbyResults;
      } else {
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
            const filtered = response.data.results.filter((r) => isCateringPlace(r) && !isNigeriaResult(r));
            allResults.push(...filtered);
          }

          nextPageToken = response.data.next_page_token;
          if (nextPageToken) await new Promise((r) => setTimeout(r, 2000));
        } while (nextPageToken && allResults.length < 100);
      }
    }

    if (!usedCache && allResults.length > 0) {
      const deduped = Array.from(new Map([...cachedData, ...allResults].map((p) => [p.place_id, p])).values());
      writeCache(deduped, CACHE_NAME);
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
        return attachGooglePlacePhotoUrls({ ...place, distanceKm, distanceMinutes });
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const limitedResults = withDistance.slice(0, 20);

    const withReviews = await Promise.all(
      limitedResults.slice(0, 10).map(async (place) => {
        const reviews = await fetchReviews(place.place_id);
        return attachGooglePlacePhotoUrls({
          ...place,
          reviews: reviews.slice(0, 3),
        });
      })
    );

    return success(res, `Search results for "${keyword}" in ${city}`, {
      count: withReviews.length,
      catering: withReviews,
    });
  } catch (err) {
    console.error("❌ Error searching catering:", err.response?.data || err.message);
    return error(res, "Failed to search catering", 500, err.message);
  }
};
