#!/usr/bin/env node
// Run once: node scripts/fetch-roads.js
// Fetches all tagged road ways for the project bbox and saves to static/roads.json

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'static', 'roads.json');

const SOUTH = 47.467656540602945;
const WEST  = -122.44882237169958;
const NORTH = 47.767978506439036;
const EAST  = -122.0275632746153;

const HIGHWAY_FILTER = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$';

const query = `[out:json][timeout:300][maxsize:1073741824];
way(${SOUTH},${WEST},${NORTH},${EAST})[highway~"${HIGHWAY_FILTER}"];
out body geom qt;`;

console.log('Querying Overpass API...');
console.log(`  bbox: S=${SOUTH} W=${WEST} N=${NORTH} E=${EAST}`);

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

let resp;
for (const endpoint of ENDPOINTS) {
  console.log(`  trying ${endpoint} ...`);
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'street_cross_section_demo/1.0',
      },
    });
    if (resp.ok) break;
    console.warn(`  → ${resp.status} ${resp.statusText}, trying next...`);
  } catch (e) {
    console.warn(`  → network error: ${e.message}, trying next...`);
  }
}

if (!resp?.ok) {
  console.error('All Overpass endpoints failed.');
  process.exit(1);
}

const data = await resp.json();
const ways = data.elements.filter(el => el.type === 'way' && el.geometry?.length >= 2);

// Strip fields we don't need to keep the file lean.
// The bbox is large, so keep only tags the app actually parses.
const KEEP_TAG = /^(highway|name|ref|lanes|oneway|cycleway|parking:|surface|maxspeed)/;
const slim = ways.map(w => ({
  id: w.id,
  tags: Object.fromEntries(
    Object.entries(w.tags || {}).filter(([k]) => KEEP_TAG.test(k))
  ),
  geometry: w.geometry,  // [{lat, lon}, ...]
}));

writeFileSync(OUT_PATH, JSON.stringify(slim));
console.log(`Saved ${slim.length} ways → ${OUT_PATH}`);
const kb = Math.round(Buffer.byteLength(JSON.stringify(slim)) / 1024);
console.log(`File size: ${kb} KB`);
