const axios = require("axios");
const {success,error} = require("../utils/response")


const cities = [
  { name: "New York", lat: 40.7128, lng: -74.0060 },   // USA
  { name: "Los Angeles", lat: 34.0522, lng: -118.2437 }, 
  { name: "London", lat: 51.5074, lng: -0.1278 },      // UK
  { name: "Toronto", lat: 43.6532, lng: -79.3832 },    // Canada
  { name: "Sydney", lat: -33.8688, lng: 151.2093 },   // Australia
  { name: "Lagos", lat: 6.5244, lng: 3.3792 },        // Nigeria
  { name: "Nairobi", lat: -1.2921, lng: 36.8219 },    // Kenya
  { name: "Cape Town", lat: -33.9249, lng: 18.4241 }, // South Africa
  { name: "Accra", lat: 5.6037, lng: -0.1870 },       // Ghana
];


exports.getRestaurants = async (req, res) => {
  try {
    let { city } = req.body;

    let locationData;
    if (!city) {
      // If no city provided, pick random (from cities array or let’s say default Lagos)
      locationData = cities[Math.floor(Math.random() * cities.length)];
      city = locationData.name;
    } else {
      locationData = cities.find(c => c.name.toLowerCase() === city.toLowerCase());
      if (!locationData) {
        return error(res, `City "${city}" not supported`, 404);
      }
    }

    const { lat, lng } = locationData;
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

      const results = response.data.results;
      if (results && results.length > 0) {
        allResults.push(...results);
      }

      nextPageToken = response.data.next_page_token;
      if (nextPageToken) await new Promise(resolve => setTimeout(resolve, 2000));

    } while (nextPageToken && allResults.length < 200);

    const limitedResults = allResults.slice(0, 200);

    if (!limitedResults || limitedResults.length === 0) {
      return error(res, "No restaurants found", 404);
    }

    return success(res, `Restaurants from ${city}`, limitedResults);
  } catch (err) {
    console.error("❌ Error fetching restaurants:", err.response?.data || err.message);
    return error(res, "Failed to fetch restaurants", 500, err.message);
  }
};


// 🔍 Search restaurants by keyword & city
exports.searchRestaurants = async (req, res) => {
  try {
    let { city, keyword } = req.body;

    if (!keyword) return error(res, "Keyword is required (e.g., 'African', 'Pizza', 'Sushi')", 400);
    if (!city) return error(res, "City is required to search", 400);

    // Step 1: Convert city name → lat/lng
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
    const geoResponse = await axios.get(geoUrl, {
      params: { address: city, key: process.env.GOOGLE_PLACES_API_KEY },
    });

    if (!geoResponse.data.results || geoResponse.data.results.length === 0) {
      return error(res, `City "${city}" not found`, 404);
    }

    const { lat, lng } = geoResponse.data.results[0].geometry.location;

    // Step 2: Google Places Text Search
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

      if (response.data.results && response.data.results.length > 0) {
        allResults.push(...response.data.results);
      }

      nextPageToken = response.data.next_page_token;
      if (nextPageToken) await new Promise(resolve => setTimeout(resolve, 2000));

    } while (nextPageToken && allResults.length < 100);

    const limitedResults = allResults.slice(0, 100);

    if (!limitedResults || limitedResults.length === 0) {
      return error(res, `No restaurants found for "${keyword}" in ${city}`, 404);
    }

    return success(res, `Search results for "${keyword}" in ${city}`, {
      count: limitedResults.length,
      restaurants: limitedResults,
    });
  } catch (err) {
    console.error("❌ Error searching restaurants:", err.response?.data || err.message);
    return error(res, "Failed to search restaurants", 500, err.message);
  }
};