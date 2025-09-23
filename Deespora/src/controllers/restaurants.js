const axios = require("axios");




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
    let { city } = req.query;

    // Pick a random city if none provided
    let locationData;
    if (!city) {
      locationData = cities[Math.floor(Math.random() * cities.length)];
      city = locationData.name;
    } else {
      locationData = cities.find(c => c.name.toLowerCase() === city.toLowerCase());
      if (!locationData) return res.status(404).json({ error: "City not supported" });
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
      // Google requires a short delay to use next_page_token
      if (nextPageToken) await new Promise(resolve => setTimeout(resolve, 2000));

    } while (nextPageToken && allResults.length < 200);

    const limitedResults = allResults.slice(0, 200);

    if (!limitedResults || limitedResults.length === 0) {
      return res.status(404).json({ error: "No restaurants found" });
    }

    return res.json({
      success: true,
      message: `Restaurants from ${city}`,
      data: limitedResults,
    });
  } catch (err) {
    console.error("❌ Error fetching restaurants:", err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to fetch restaurants", details: err.message });
  }
};