const { success, error } = require("../utils/response");
const {
  refreshAllDiscoveryCacheImages,
} = require("../utils/discoveryImageRefresh");

exports.refreshDiscoveryImages = async (req, res) => {
  try {
    const summary = await refreshAllDiscoveryCacheImages();
    return success(res, "Discovery cache images refreshed successfully", summary);
  } catch (err) {
    console.error("Refresh discovery cache images error:", err);
    return error(res, "Failed to refresh discovery cache images", 500, err.message);
  }
};
