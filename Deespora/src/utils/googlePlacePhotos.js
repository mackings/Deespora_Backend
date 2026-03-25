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

module.exports = {
  buildGooglePlacePhotoUrl,
  attachGooglePlacePhotoUrls,
};
