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
    const url = "https://app.ticketmaster.com/discovery/v2/events.json";

    const formatDateForTM = (date = new Date()) =>
      date.toISOString().replace(/\.\d{3}Z$/, "Z");

    const currentDateTime = formatDateForTM();
    console.log("📅 startDateTime:", currentDateTime);

    // 🎵 Popular African artists and keywords
    const africanArtists = [
      "Burna Boy","Wizkid","Davido","Tiwa Savage","Rema","Tems","Asake","Omah Lay",
      "Ayra Starr","Fireboy DML","Adekunle Gold","Oxlade",
      "Stonebwoy","Shatta Wale","Sarkodie","Tyla","Nasty C",
      "Black Coffee","Master KG","Diamond Platnumz","Angelique Kidjo","Fally Ipupa"
    ];

    const africanKeywords = [
      "afrobeat","afrobeats","african music","african festival","amapiano"
    ];

    // 👇 curated fixed list to reduce randomness
    const searchTerms = [
      ...africanArtists.slice(0, 6), // top 6 artists
      ...africanKeywords            // + genres
    ];

    console.log("🔍 Searching for:", searchTerms.join(", "));

    // --- Helper to make each request ---
    const makeRequest = async (term, attempt = 0) => {
      try {
        const { data } = await axios.get(url, {
          params: {
            apikey: process.env.TICKETMASTER_API_KEY,
            countryCode: "US",
            keyword: term,
            size: 20,
            sort: "date,asc",
            startDateTime: currentDateTime,
            locale: "en-us"
          },
          timeout: 10000
        });

        const events = data._embedded?.events || [];
        console.log(`✅ ${events.length} events for "${term}"`);
        return events;
      } catch (err) {
        if (err.response?.status === 429 && attempt < 2) {
          const delay = (attempt + 1) * 2000;
          console.warn(`⏳ Rate-limited for "${term}", retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          return makeRequest(term, attempt + 1);
        }
        console.warn(`❌ Failed for "${term}":`, err.message);
        return [];
      }
    };

    // --- No PQueue: run all in parallel ---
    const results = await Promise.allSettled(
      searchTerms.map(term => makeRequest(term))
    );

    // Combine all results
    let allEvents = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value);

    // 🔄 Fallback if no events found
    if (!allEvents.length) {
      console.log("🔄 Running fallback search...");
      try {
        const { data } = await axios.get(url, {
          params: {
            apikey: process.env.TICKETMASTER_API_KEY,
            countryCode: "US",
            classificationName: "Music",
            keyword: "afrobeat",
            size: 20,
            sort: "date,asc",
            startDateTime: currentDateTime
          }
        });
        allEvents = data._embedded?.events || [];
        console.log(`🔄 Fallback found ${allEvents.length}`);
      } catch (e) {
        console.error("❌ Fallback failed:", e.message);
      }
    }

    if (!allEvents.length) {
      return res.status(404).json({ success: false, message: "No African events found in the US" });
    }

    // Deduplicate by ID
    const uniqueEvents = Array.from(new Map(allEvents.map(e => [e.id, e])).values());

    // Filter for African-related
    const africanTerms = [
      ...africanArtists.map(a => a.toLowerCase()),
      "african","afrobeat","afrobeats","amapiano","highlife","nigeria","ghana","south africa"
    ];

    const filtered = uniqueEvents.filter(e => {
      const text = [
        e.name,
        e.info,
        e.pleaseNote,
        ...(e._embedded?.attractions || []).map(a => a.name),
        e.classifications?.[0]?.genre?.name
      ]
        .join(" ")
        .toLowerCase();

      return africanTerms.some(t => text.includes(t));
    });

    const finalEvents = (filtered.length ? filtered : uniqueEvents)
      .sort((a, b) => {
        const da = new Date(a.dates?.start?.dateTime || a.dates?.start?.localDate || 0);
        const db = new Date(b.dates?.start?.dateTime || b.dates?.start?.localDate || 0);
        return da - db;
      })
      .slice(0, 10);

    // ✅ Match Flutter model
    const apiEvents = finalEvents.map(e => ({
      id: e.id || '',
      name: e.name || '',
      type: e.type || '',
      url: e.url || '',
      images: e.images || [],
      sales: e.sales || {},
      dates: e.dates || {},
      classifications: e.classifications || [],
      _embedded: {
        venues: e._embedded?.venues || e.venues || []
      }
    }));

    return res.json({
      success: true,
      message: `Found ${apiEvents.length} African events in the US`,
      data: apiEvents
    });

  } catch (err) {
    console.error("❌ Main error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch African events",
      error: err.message
    });
  }
};






exports.searchEvent = async (req, res) => {
  try {
    // Extract from request body
    const { keyword, size = 50, ...filters } = req.body;

    if (!keyword) {
      return error(res, "Keyword is required (e.g., 'Music', 'Football', 'Festival')", 400);
    }

    const url = "https://app.ticketmaster.com/discovery/v2/events.json";

    // Build params
    const params = {
      apikey: process.env.TICKETMASTER_API_KEY,
      keyword,
      size,       // default 50
      ...filters, // any other filter user sends (city, countryCode, startDateTime, etc.)
    };

    const response = await axios.get(url, { params });

    const events = response.data._embedded?.events;

    if (!events || events.length === 0) {
      return error(
        res,
        `No events found for "${keyword}" ${filters.city ? "in " + filters.city : "worldwide"}`,
        404
      );
    }

    return success(
      res,
      `Search results for "${keyword}" ${filters.city ? "in " + filters.city : "worldwide"}`,
      {
        count: events.length,
        page: response.data.page,
        events,
      }
    );
  } catch (err) {
    console.error("❌ Error searching events:", err.response?.data || err.message);
    return error(res, "Failed to search events", 500, err.message);
  }
};


