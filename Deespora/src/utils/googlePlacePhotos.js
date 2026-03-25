const axios = require("axios");

function buildGooglePlacePhotoUrl(photoReference, maxWidth = 800) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!photoReference || !apiKey) {
    return null;
  }

  const params = new URLSearchParams({
    maxwidth: String(maxWidth),
    photo_reference: photoReference,
    key: apiKey,
  });

  return `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`;
}

function attachGooglePlacePhotoUrls(place) {
  if (!place || typeof place !== "object") {
    return place;
  }

  const photoReference = place.photos?.[0]?.photo_reference || null;

  return {
    ...place,
    hasPhoto: Boolean(photoReference),
    photoUrl: buildGooglePlacePhotoUrl(photoReference, 800),
    thumbnailUrl: buildGooglePlacePhotoUrl(photoReference, 400),
  };
}

async function fetchFreshPlacePhotos(placeId) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placeId || !apiKey) {
    return null;
  }

  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/place/details/json",
      {
        params: {
          place_id: placeId,
          fields: "photos",
          key: apiKey,
        },
        timeout: 10000,
      }
    );

    if (response.data?.status !== "OK") {
      return null;
    }

    const photos = response.data.result?.photos;
    return Array.isArray(photos) && photos.length > 0 ? photos : null;
  } catch (err) {
    return null;
  }
}

async function refreshPlacesPhotoReferences(places, batchSize = 8) {
  if (!Array.isArray(places) || places.length === 0) {
    return [];
  }

  const refreshed = [];

  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (place) => {
        const freshPhotos = await fetchFreshPlacePhotos(place?.place_id);
        if (!freshPhotos) {
          return place;
        }

        return {
          ...place,
          photos: freshPhotos,
        };
      })
    );

    refreshed.push(...batchResults);
  }

  return refreshed;
}

function mergeFreshPhotosIntoCache(cacheData, updatedPlaces) {
  if (!Array.isArray(cacheData) || !Array.isArray(updatedPlaces) || updatedPlaces.length === 0) {
    return cacheData;
  }

  const photosByPlaceId = new Map(
    updatedPlaces
      .filter((place) => place?.place_id && Array.isArray(place.photos) && place.photos.length > 0)
      .map((place) => [place.place_id, place.photos])
  );

  if (photosByPlaceId.size === 0) {
    return cacheData;
  }

  return cacheData.map((place) =>
    photosByPlaceId.has(place?.place_id)
      ? { ...place, photos: photosByPlaceId.get(place.place_id) }
      : place
  );
}

module.exports = {
  buildGooglePlacePhotoUrl,
  attachGooglePlacePhotoUrls,
  refreshPlacesPhotoReferences,
  mergeFreshPhotosIntoCache,
};
