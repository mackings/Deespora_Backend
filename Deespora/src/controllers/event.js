const axios = require("axios");
const { success, error } = require("../utils/response");

const AFRICAN_ARTISTS = [
  "Burna Boy", "Wizkid", "Davido", "Tiwa Savage", "Rema", "Tems", "Asake", "Omah Lay",
  "Ayra Starr", "Fireboy DML", "Adekunle Gold", "Oxlade", "Stonebwoy", "Shatta Wale",
  "Sarkodie", "Tyla", "Nasty C", "Black Coffee", "Master KG", "Diamond Platnumz",
  "Angelique Kidjo", "Fally Ipupa", "Kizz Daniel", "Lojay", "BNXN", "Simi"
];

const AFRICAN_KEYWORDS = [
  "afrobeat", "afrobeats", "african music", "african festival", "amapiano",
  "highlife", "soukous", "african diaspora", "nigerian event", "ghanaian event"
];

const AFRICAN_TERMS = [
  ...AFRICAN_ARTISTS.map(a => a.toLowerCase()),
  "african", "afrobeat", "afrobeats", "amapiano", "highlife", "soukous", "nigeria",
  "nigerian", "ghana", "ghanaian", "south africa", "south african", "kenyan", "diaspora"
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const formatDateForTM = (date = new Date()) =>
  date.toISOString().replace(/\.\d{3}Z$/, "Z");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function eventTime(event) {
  return new Date(
    event.dates?.start?.dateTime ||
    event.dates?.start?.localDate ||
    event.datetime_utc ||
    0
  ).getTime();
}

function looksAfrican(event) {
  const text = [
    event.name,
    event.title,
    event.info,
    event.pleaseNote,
    ...(event._embedded?.attractions || []).map(a => a.name),
    ...(event.performers || []).map(p => p.name),
    event.classifications?.[0]?.genre?.name,
    event.classifications?.[0]?.subGenre?.name,
    event.taxonomies?.map(t => t.name).join(" ")
  ].join(" ").toLowerCase();

  return AFRICAN_TERMS.some(term => {
    const escaped = escapeRegex(term);
    const exactTerm = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return exactTerm.test(text);
  });
}

function normalizeTicketmasterEvent(e) {
  return {
    id: e.id || '',
    name: e.name || '',
    type: e.type || '',
    url: e.url || '',
    images: e.images || [],
    sales: e.sales || {},
    dates: e.dates || {},
    classifications: e.classifications || [],
    _embedded: { venues: e._embedded?.venues || e.venues || [] },
    source: "ticketmaster"
  };
}

function normalizeSeatGeekEvent(e) {
  const image = e.performers?.find(p => p.image)?.image || e.performers?.[0]?.image || "";

  return {
    id: e.id ? `seatgeek-${e.id}` : '',
    name: e.title || '',
    type: e.type || 'event',
    url: e.url || '',
    images: image ? [{ url: image, fallback: false }] : [],
    sales: {},
    dates: {
      start: {
        localDate: e.datetime_local ? e.datetime_local.slice(0, 10) : '',
        localTime: e.datetime_local ? e.datetime_local.slice(11, 19) : '',
        dateTime: e.datetime_utc || '',
        dateTBD: Boolean(e.date_tbd),
        timeTBA: Boolean(e.time_tbd)
      },
      timezone: e.venue?.timezone || '',
      status: { code: e.status || '' }
    },
    classifications: (e.taxonomies || []).map(t => ({
      primary: false,
      segment: { name: t.name || '' }
    })),
    _embedded: {
      venues: e.venue ? [{
        name: e.venue.name || '',
        type: 'venue',
        id: e.venue.id ? `seatgeek-venue-${e.venue.id}` : '',
        url: e.venue.url || '',
        postalCode: e.venue.postal_code || '',
        timezone: e.venue.timezone || '',
        city: { name: e.venue.city || '' },
        state: { name: e.venue.state || '', stateCode: e.venue.state || '' },
        country: { name: e.venue.country || 'United States', countryCode: e.venue.country || 'US' },
        address: { line1: e.venue.address || '' },
        location: {
          longitude: e.venue.location?.lon?.toString() || '',
          latitude: e.venue.location?.lat?.toString() || ''
        }
      }] : []
    },
    source: "seatgeek"
  };
}

async function fetchTicketmasterEvents() {
  if (!process.env.TICKETMASTER_API_KEY) return [];

  const url = "https://app.ticketmaster.com/discovery/v2/events.json";
  const currentDateTime = formatDateForTM();
  const searchTerms = [...AFRICAN_ARTISTS, ...AFRICAN_KEYWORDS];

  const makeRequest = async (term, attempt = 0) => {
    try {
      const { data } = await axios.get(url, {
        params: {
          apikey: process.env.TICKETMASTER_API_KEY,
          countryCode: "US",
          keyword: term,
          size: 50,
          sort: "date,asc",
          startDateTime: currentDateTime,
          locale: "en-us"
        },
        timeout: 10000
      });
      return data._embedded?.events || [];
    } catch (err) {
      if (err.response?.status === 429 && attempt < 2) {
        await sleep((attempt + 1) * 2000);
        return makeRequest(term, attempt + 1);
      }
      return [];
    }
  };

  const allEvents = [];

  // Ticketmaster's default limit is 5 requests/second, so keep batches small.
  for (let i = 0; i < searchTerms.length; i += 4) {
    const batch = searchTerms.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map(term => makeRequest(term)));
    allEvents.push(...results.filter(r => r.status === "fulfilled").flatMap(r => r.value));
    if (i + 4 < searchTerms.length) await sleep(1000);
  }

  return allEvents.map(normalizeTicketmasterEvent);
}

async function fetchSeatGeekEvents() {
  if (!process.env.SEATGEEK_CLIENT_ID) return [];

  const url = "https://api.seatgeek.com/2/events";
  const searchTerms = [...AFRICAN_KEYWORDS, ...AFRICAN_ARTISTS.slice(0, 12)];
  const allEvents = [];

  const makeRequest = async term => {
    try {
      const { data } = await axios.get(url, {
        params: {
          client_id: process.env.SEATGEEK_CLIENT_ID,
          client_secret: process.env.SEATGEEK_CLIENT_SECRET,
          q: term,
          "venue.country": "US",
          per_page: 50,
          sort: "datetime_utc.asc",
          "datetime_utc.gte": new Date().toISOString()
        },
        timeout: 10000
      });
      return data.events || [];
    } catch {
      return [];
    }
  };

  for (let i = 0; i < searchTerms.length; i += 5) {
    const batch = searchTerms.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(term => makeRequest(term)));
    allEvents.push(...results.filter(r => r.status === "fulfilled").flatMap(r => r.value));
  }

  const normalizedEvents = allEvents.map(normalizeSeatGeekEvent);
  const hasAfricanMatches = normalizedEvents.some(looksAfrican);

  if (hasAfricanMatches) return normalizedEvents;

  try {
    const { data } = await axios.get(url, {
      params: {
        client_id: process.env.SEATGEEK_CLIENT_ID,
        client_secret: process.env.SEATGEEK_CLIENT_SECRET,
        "venue.country": "US",
        type: "concert",
        per_page: 50,
        sort: "datetime_utc.asc",
        "datetime_utc.gte": new Date().toISOString()
      },
      timeout: 10000
    });

    return [
      ...normalizedEvents,
      ...(data.events || []).map(e => ({
        ...normalizeSeatGeekEvent(e),
        sampleOnly: true
      }))
    ];
  } catch {
    return normalizedEvents;
  }
}

// Fetch African events from available providers and return one compatible response shape.
async function fetchAndCacheEvents() {
  const limit = Number(reqLimitSafe(process.env.EVENTS_PROVIDER_LIMIT, 60));
  const providerResults = await Promise.allSettled([
    fetchTicketmasterEvents(),
    fetchSeatGeekEvents()
  ]);

  const allEvents = providerResults
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .filter(e => eventTime(e) >= Date.now() - 24 * 60 * 60 * 1000);

  const uniqueEvents = Array.from(new Map(
    allEvents.map(e => [`${e.name.toLowerCase()}-${eventTime(e)}-${e._embedded?.venues?.[0]?.name || ""}`, e])
  ).values());

  const filtered = uniqueEvents.filter(looksAfrican);
  const seatGeekSamples = uniqueEvents
    .filter(e => e.source === "seatgeek" && e.sampleOnly);

  return (filtered.length ? [...filtered, ...seatGeekSamples] : uniqueEvents)
    .sort((a, b) => eventTime(a) - eventTime(b))
    .slice(0, limit);
}

function reqLimitSafe(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 100);
}

exports.fetchAndCacheEvents = fetchAndCacheEvents;

// ✅ API handler
exports.getEvents = async (req, res) => {
  try {
    const events = await fetchAndCacheEvents();
    return res.json({
      success: true,
      message: `African events across the US`,
      data: events
    });
  } catch (err) {
    console.error("❌ Error fetching events:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch African events",
      error: err.message
    });
  }
};

// 🕒 Auto-refresh disabled (events always fetched live)






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
