const { success, error } = require("../utils/response");
const { readCache, writeCache } = require("../utils/RestCache");
const { attachGooglePlacePhotoUrls } = require("../utils/googlePlacePhotos");
const { fetchAndCacheEvents } = require("./event");

function pickBestEventImage(event) {
  const images = Array.isArray(event?.images) ? event.images : [];
  return (
    images.find((img) => img?.ratio === "16_9" && img?.url) ||
    images.find((img) => img?.url) ||
    null
  );
}

function buildEventNotification(event, isNew) {
  const image = pickBestEventImage(event);
  return {
    id: `event:${event.id}`,
    type: isNew ? "new_event" : "upcoming_event",
    title: event.name,
    message: isNew
      ? "New event added to the feed"
      : "Upcoming event from the feed",
    imageUrl: image?.url || null,
    url: event.url || null,
    eventDate:
      event?.dates?.start?.dateTime ||
      event?.dates?.start?.localDate ||
      null,
    venue:
      event?._embedded?.venues?.[0]?.name ||
      null,
    source: "events",
  };
}

function getLatestReviewTimestamp(place) {
  const reviews = Array.isArray(place?.reviews) ? place.reviews : [];
  return reviews.reduce((max, review) => {
    const time = Number(review?.time || 0);
    return time > max ? time : max;
  }, 0);
}

function buildPlaceNotification(place, type) {
  const withPhotoUrls = attachGooglePlacePhotoUrls(place);
  return {
    id: `${type}:${place.place_id}`,
    type: `latest_${type}`,
    title: withPhotoUrls.name || `Latest ${type}`,
    message:
      type === "restaurant"
        ? "Restaurant spotlight from the discovery feed"
        : "Catering spotlight from the discovery feed",
    imageUrl: withPhotoUrls.photoUrl || withPhotoUrls.thumbnailUrl || withPhotoUrls.icon || null,
    rating: withPhotoUrls.rating || null,
    reviewCount: Array.isArray(withPhotoUrls.reviews) ? withPhotoUrls.reviews.length : 0,
    latestReviewAt: getLatestReviewTimestamp(withPhotoUrls) || null,
    location:
      withPhotoUrls.formatted_address ||
      withPhotoUrls.vicinity ||
      null,
    source: type,
  };
}

function pickPlaceHighlights(cacheName, type, limit) {
  const cachedData = readCache(cacheName) || [];
  return cachedData
    .filter((place) => place?.place_id)
    .sort((a, b) => {
      const reviewTimeDiff = getLatestReviewTimestamp(b) - getLatestReviewTimestamp(a);
      if (reviewTimeDiff !== 0) return reviewTimeDiff;
      return Number(b?.rating || 0) - Number(a?.rating || 0);
    })
    .slice(0, limit)
    .map((place) => buildPlaceNotification(place, type));
}

exports.getNotifications = async (req, res) => {
  try {
    const eventsLimit = Math.min(Math.max(Number(req.query.eventsLimit || 3), 1), 10);
    const placesLimit = Math.min(Math.max(Number(req.query.placesLimit || 2), 1), 10);

    const cachedEventsSnapshot = readCache("events");
    const previousEvents = Array.isArray(cachedEventsSnapshot?.data)
      ? cachedEventsSnapshot.data
      : [];

    let liveEvents = [];
    try {
      liveEvents = await fetchAndCacheEvents();
    } catch (err) {
      console.error("Notifications events fetch failed:", err.message);
    }

    const eventsToUse = liveEvents.length > 0 ? liveEvents : previousEvents;
    const previousEventIds = new Set(previousEvents.map((event) => event.id));
    const newEvents = liveEvents.filter((event) => !previousEventIds.has(event.id));
    const selectedEvents = (newEvents.length > 0 ? newEvents : eventsToUse).slice(0, eventsLimit);

    if (liveEvents.length > 0) {
      writeCache(
        {
          data: liveEvents,
          _timestamp: new Date().toISOString(),
        },
        "events"
      );
    }

    const eventNotifications = selectedEvents.map((event) =>
      buildEventNotification(event, newEvents.some((candidate) => candidate.id === event.id))
    );
    const restaurantNotifications = pickPlaceHighlights("restaurants", "restaurant", placesLimit);
    const cateringNotifications = pickPlaceHighlights("catering", "catering", placesLimit);

    return success(res, "Notifications retrieved successfully", {
      generatedAt: new Date().toISOString(),
      events: eventNotifications,
      restaurants: restaurantNotifications,
      catering: cateringNotifications,
      notifications: [
        ...eventNotifications,
        ...restaurantNotifications,
        ...cateringNotifications,
      ],
    });
  } catch (err) {
    console.error("Notifications error:", err);
    return error(res, "Failed to retrieve notifications", 500, err.message);
  }
};
