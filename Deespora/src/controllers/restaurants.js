const axios = require("axios");
const {success,error} = require("../utils/response")


// helper: fetch reviews for a single place
async function fetchReviews(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json`;
  const resp = await axios.get(url, {
    params: {
      place_id: placeId,
      key: process.env.GOOGLE_PLACES_API_KEY,
      fields: "name,rating,user_ratings_total,reviews",
    },
  });

  return resp.data.result?.reviews || [];
}

// helper: resolve a city name to lat/lng using Geocoding API
async function getCityCoordinates(city) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json`;
  const resp = await axios.get(url, {
    params: {
      address: city,
      key: process.env.GOOGLE_PLACES_API_KEY,
    },
  });

  if (!resp.data.results || resp.data.results.length === 0) {
    throw new Error(`Could not find coordinates for "${city}"`);
  }

  const { lat, lng } = resp.data.results[0].geometry.location;
  return { lat, lng };
}

// --------------------------------------------------
// GET nearby restaurants + reviews (supports any city)
// --------------------------------------------------


exports.getRestaurants = async (req, res) => {
  try {
    // 🔑 Predefined major US cities with coordinates
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
    ];

    const africanKeywords = [
      "african",
      "nigerian",
      "ethiopian",
      "ghanaian",
      "senegalese",
      "somali",
      "cameroonian",
      "egyptian",
      "north african",
      "sudanese",
      "afro fusion",
      "afro-caribbean",
    ];

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;

    let allResults = [];

    // 🔥 Loop through each city
    for (const city of usCities) {
      let nextPageToken = null;

      do {
        const response = await axios.get(url, {
          params: {
            key: process.env.GOOGLE_PLACES_API_KEY,
            location: `${city.lat},${city.lng}`,
            radius: 10000, // 10km radius
            type: "restaurant",
            keyword: "african restaurant",
            pagetoken: nextPageToken,
          },
        });

        if (response.data.results?.length) {
          // attach city info for reference
          response.data.results.forEach(r => {
            r.city = city.name;
          });

          allResults.push(...response.data.results);
        }

        nextPageToken = response.data.next_page_token;
        if (nextPageToken) await new Promise(r => setTimeout(r, 2000)); // wait for token
      } while (nextPageToken && allResults.length < 500);
    }

    // 🔎 Filter to African cuisines
    const filteredResults = allResults.filter(place =>
      africanKeywords.some(k =>
        `${place.name} ${place.vicinity || ""}`.toLowerCase().includes(k)
      )
    );

    // 🔑 Limit results to avoid huge payload
    const limitedResults = filteredResults.slice(0, 50);

    // 🔑 Fetch reviews for top restaurants
    const withReviews = await Promise.all(
      limitedResults.slice(0, 15).map(async (place) => {
        const reviews = await fetchReviews(place.place_id);
        return {
          ...place,
          reviews: reviews.slice(0, 3),
        };
      })
    );

    return success(res, "African restaurants across the US", withReviews);
  } catch (err) {
    console.error("❌ Error fetching African restaurants:", err.response?.data || err.message);
    return error(res, "Failed to fetch African restaurants", 500, err.message);
  }
};






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
