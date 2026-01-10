const fs = require('fs');
const path = require('path');

const memoryCache = new Map();

function getCachePath(name) {
  return path.join(__dirname, "../cache", `${name}Cache.json`);
}


function readCache(name) {
  if (memoryCache.has(name)) {
    return memoryCache.get(name);
  }

  const CACHE_FILE = getCachePath(name);
  if (!fs.existsSync(CACHE_FILE)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    memoryCache.set(name, data);
    return data;
  } catch (err) {
    console.error(`❌ Error reading cache "${name}"`, err);
    return null;
  }
}



function writeCache(data, name) {
  const CACHE_FILE = getCachePath(name);
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8');
    memoryCache.set(name, data);
  } catch (err) {
    console.error(`❌ Error writing cache "${name}"`, err);
  }
}

function preloadCaches() {
  const cacheDir = path.join(__dirname, "../cache");
  if (!fs.existsSync(cacheDir)) return;

  try {
    const files = fs.readdirSync(cacheDir);
    files.forEach((file) => {
      if (!file.endsWith("Cache.json")) return;
      const name = file.replace(/Cache\.json$/, "");
      const fullPath = path.join(cacheDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        memoryCache.set(name, data);
      } catch (err) {
        console.error(`❌ Error preloading cache "${name}"`, err);
      }
    });
  } catch (err) {
    console.error("❌ Error preloading caches", err);
  }
}

module.exports = { readCache, writeCache, preloadCaches };
