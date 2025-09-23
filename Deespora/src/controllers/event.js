const axios = require("axios");
const { success, error } = require("../utils/response");



const cities = [
  "New York", "Los Angeles", "Chicago", "Miami", "San Francisco", // USA
  "Toronto", "Vancouver", "Montreal", // Canada
  "London", "Manchester", "Birmingham", // UK
  "Berlin", "Hamburg", "Munich", // Germany
  "Amsterdam", "Rotterdam", // Netherlands
  "Sydney", "Melbourne", "Brisbane", // Australia
  "Dublin", "Cork", // Ireland
  "Madrid", "Barcelona" // Spain,
];

exports.getEvents = async (req, res) => {
  try {
    // Pick a random city if not provided
    let { location } = req.query;
    if (!location) {
      const randomIndex = Math.floor(Math.random() * cities.length);
      location = cities[randomIndex];
    }

    const url = "https://app.ticketmaster.com/discovery/v2/events.json";

    const response = await axios.get(url, {
      params: {
        apikey: process.env.TICKETMASTER_API_KEY, // hidden in .env
        city: location,
        size: 200,
      },
    });

    const events = response.data._embedded?.events;

    if (!events || events.length === 0) {
      return error(res, "No events found", 404);
    }

    // Randomize and pick 5
    const shuffled = events.sort(() => 0.5 - Math.random());
    const randomEvents = shuffled.slice(0, 5);

    return success(res, `Random events fetched from ${location}`, randomEvents);
  } catch (err) {
    console.error("❌ Error fetching random events:", err.response?.data || err.message);
    return error(res, "Failed to fetch random events", 500, err.message);
  }
};
