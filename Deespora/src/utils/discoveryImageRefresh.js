const cron = require("node-cron");
const { readCache, writeCache } = require("./RestCache");
const {
  attachGooglePlacePhotoUrls,
  refreshPlacesPhotoReferences,
} = require("./googlePlacePhotos");

const DISCOVERY_CACHE_NAMES = ["restaurants", "catering", "worship"];

async function refreshDiscoveryCacheImages(cacheName) {
  const cachedData = readCache(cacheName) || [];
  if (!Array.isArray(cachedData) || cachedData.length === 0) {
    writeCache([], cacheName);
    return {
      cacheName,
      total: 0,
      refreshed: 0,
    };
  }

  const refreshablePlaces = cachedData.filter((place) => place?.place_id);
  const refreshedPlaces = await refreshPlacesPhotoReferences(refreshablePlaces);
  const refreshedByPlaceId = new Map(
    refreshedPlaces
      .filter((place) => place?.place_id)
      .map((place) => [place.place_id, place])
  );

  let refreshedCount = 0;
  const nextCacheData = cachedData.map((place) => {
    const refreshedPlace = refreshedByPlaceId.get(place?.place_id);
    if (!refreshedPlace) {
      return attachGooglePlacePhotoUrls(place);
    }

    const previousRef = place.photos?.[0]?.photo_reference || null;
    const nextRef = refreshedPlace.photos?.[0]?.photo_reference || null;
    if (nextRef && nextRef !== previousRef) {
      refreshedCount += 1;
    }

    return attachGooglePlacePhotoUrls(refreshedPlace);
  });

  writeCache(nextCacheData, cacheName);

  return {
    cacheName,
    total: cachedData.length,
    refreshed: refreshedCount,
  };
}

async function refreshAllDiscoveryCacheImages() {
  const results = [];

  for (const cacheName of DISCOVERY_CACHE_NAMES) {
    const summary = await refreshDiscoveryCacheImages(cacheName);
    results.push(summary);
  }

  return {
    updatedAt: new Date().toISOString(),
    caches: results,
  };
}

function startDiscoveryImageRefreshCron() {
  cron.schedule("0 3 */3 * *", async () => {
    console.log("🖼️ Running 3-day discovery image refresh...");
    try {
      const summary = await refreshAllDiscoveryCacheImages();
      console.log("✅ Discovery image refresh complete", summary);
    } catch (err) {
      console.error("❌ Discovery image refresh failed:", err.message);
    }
  });
}

module.exports = {
  DISCOVERY_CACHE_NAMES,
  refreshDiscoveryCacheImages,
  refreshAllDiscoveryCacheImages,
  startDiscoveryImageRefreshCron,
};
