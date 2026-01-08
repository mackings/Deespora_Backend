const fs = require('fs');
const path = require('path');



function getCachePath(name) {
  return path.join(__dirname, "../cache", `${name}Cache.json`);
}

function readCache(name) {
  const CACHE_FILE = getCachePath(name);
  if (!fs.existsSync(CACHE_FILE)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
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
  } catch (err) {
    console.error(`❌ Error writing cache "${name}"`, err);
  }
}

module.exports = { readCache, writeCache };
