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
    let { city } = req.query;

    if (!city) {
      return error(res, "Please provide a city name", 400);
    }

    // 🔑 Get coordinates for the given city
    const { lat, lng } = await getCityCoordinates(city);

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
    const allResults = [];
    let nextPageToken = null;

    do {
      const response = await axios.get(url, {
        params: {
          key: process.env.GOOGLE_PLACES_API_KEY,
          location: `${lat},${lng}`,
          radius: 2000,
          type: "restaurant",
          pagetoken: nextPageToken,
        },
      });

      if (response.data.results?.length) {
        allResults.push(...response.data.results);
      }

      nextPageToken = response.data.next_page_token;
      if (nextPageToken) await new Promise(r => setTimeout(r, 2000)); // wait for token
    } while (nextPageToken && allResults.length < 200);

    const limitedResults = allResults.slice(0, 20);

    // 🔑 Fetch reviews for top 10 restaurants
    const withReviews = await Promise.all(
      limitedResults.slice(0, 10).map(async (place) => {
        const reviews = await fetchReviews(place.place_id);
        return {
          ...place,
          reviews: reviews.slice(0, 3), // only 3 reviews per restaurant
        };
      })
    );

    return success(res, `Restaurants from ${city}`, withReviews);
  } catch (err) {
    console.error("❌ Error fetching restaurants:", err.response?.data || err.message);
    return error(res, "Failed to fetch restaurants", 500, err.message);
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
