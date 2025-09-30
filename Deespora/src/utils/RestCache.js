const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'restaurantCache.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in ms

function readCache() {
  if (!fs.existsSync(CACHE_FILE)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const age = Date.now() - data.timestamp;
    if (age > CACHE_DURATION) return null; // cache expired
    return data.restaurants;
  } catch (err) {
    console.error('❌ Error reading cache', err);
    return null;
  }
}

function writeCache(restaurants) {
  try {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ timestamp: Date.now(), restaurants }),
      'utf-8'
    );
  } catch (err) {
    console.error('❌ Error writing cache', err);
  }
}

module.exports = { readCache, writeCache };
