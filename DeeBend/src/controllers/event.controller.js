const axios = require("axios");
const { success, error } = require("../utils/response");







export async function getEvents(req, res) {
  try {
    // Optional: allow client to pass location, fallback to "New York"
    const { location = "New York" } = req.query;

    const response = await axios.get("https://www.eventbriteapi.com/v3/events/search/", {
      headers: {
        Authorization: `Bearer 4LVH3SNHH6RXSSUCE2U3`, // your private token
      },
      params: {
        "location.address": location,
        "location.within": "50km",
        "page_size": 50, // fetch up to 50 events
      },
    });

    const events = response.data.events;

    if (!events || events.length === 0) {
      return error(res, "No events found", 404);
    }

    // Randomize and pick 5
    const shuffled = events.sort(() => 0.5 - Math.random());
    const randomEvents = shuffled.slice(0, 5);

    return success(res, "Random events fetched", randomEvents);
  } catch (err) {
    console.error("❌ Error fetching random events:", err.response?.data || err.message);
    return error(res, "Failed to fetch random events", 500, err.message);
  }
}
