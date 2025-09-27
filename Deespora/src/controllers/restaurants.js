const axios = require("axios");
const {success,error} = require("../utils/response")


const cities = [
  { name: "New York", lat: 40.7128, lng: -74.0060 },   // USA
  { name: "Los Angeles", lat: 34.0522, lng: -118.2437 },
  { name: "London", lat: 51.5074, lng: -0.1278 },      // UK
  { name: "Toronto", lat: 43.6532, lng: -79.3832 },    // Canada
  { name: "Sydney", lat: -33.8688, lng: 151.2093 },    // Australia
  { name: "Lagos", lat: 6.5244, lng: 3.3792 },         // Nigeria
  { name: "Nairobi", lat: -1.2921, lng: 36.8219 },     // Kenya
  { name: "Cape Town", lat: -33.9249, lng: 18.4241 },  // South Africa
  { name: "Accra", lat: 5.6037, lng: -0.1870 },        // Ghana
];

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

// --------------------------------------------------
// GET nearby restaurants + reviews
// --------------------------------------------------
exports.getRestaurants = async (req, res) => {
  try {
    let { city } = req.query;

    let locationData;
    if (!city) {
      locationData = cities[Math.floor(Math.random() * cities.length)];
      city = locationData.name;
    } else {
      locationData = cities.find(c => c.name.toLowerCase() === city.toLowerCase());
      if (!locationData) return error(res, `City "${city}" not supported`, 404);
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

      if (response.data.results?.length) {
        allResults.push(...response.data.results);
      }

      nextPageToken = response.data.next_page_token;
      if (nextPageToken) await new Promise(r => setTimeout(r, 2000)); // wait for token
    } while (nextPageToken && allResults.length < 200);

    const limitedResults = allResults.slice(0, 20); // limit for demo

    // 🔑 Fetch reviews for top 10 restaurants
    const withReviews = await Promise.all(
      limitedResults.slice(0, 10).map(async (place) => {
        const reviews = await fetchReviews(place.place_id);
        return {
          ...place,
          reviews: reviews.slice(0, 3), // only 3 reviews
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
