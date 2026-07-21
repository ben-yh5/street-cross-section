const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Bounding box for the pre-fetched cache
const CACHE_BBOX = {
  south: 47.467656540602945,
  north: 47.767978506439036,
  west: -122.44882237169958,
  east: -122.0275632746153,
};

// Module-level cache: array of { id, tags, geometry } loaded from roads.json
let cachedWays = null;
let cacheLoading = null;

export async function initCache() {
  if (cachedWays !== null) return;
  if (cacheLoading) return cacheLoading;

  cacheLoading = fetch('/roads.json')
    .then(r => {
      if (!r.ok) throw new Error(`roads.json not found (${r.status})`);
      return r.json();
    })
    .then(data => {
      cachedWays = data;
      console.log(`[OSM cache] loaded ${cachedWays.length} ways from roads.json`);
    })
    .catch(err => {
      console.warn('[OSM cache] could not load roads.json, will use live Overpass:', err.message);
      cachedWays = [];   // empty → fall through to live queries
    });

  return cacheLoading;
}

function inBbox(lat, lon) {
  return lat >= CACHE_BBOX.south && lat <= CACHE_BBOX.north &&
         lon >= CACHE_BBOX.west  && lon <= CACHE_BBOX.east;
}

// ── geometry helpers ────────────────────────────────────────────────────────

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function minDistToWay(lat, lon, nodes) {
  let min = Infinity;
  for (let i = 0; i < nodes.length - 1; i++) {
    const d = distToSegment(lat, lon, nodes[i].lat, nodes[i].lon, nodes[i + 1].lat, nodes[i + 1].lon);
    if (d < min) min = d;
  }
  return min;
}

function calcBearing(lat, lon, nodes) {
  let bestDist = Infinity, bestIdx = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    const mx = (nodes[i].lat + nodes[i + 1].lat) / 2;
    const my = (nodes[i].lon + nodes[i + 1].lon) / 2;
    const d = Math.hypot(lat - mx, lon - my);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  const a = nodes[bestIdx], b = nodes[bestIdx + 1];
  const dLat = b.lat - a.lat;
  const dLon = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
  return (Math.atan2(dLon, dLat) * 180) / Math.PI;
}

function pickClosest(lat, lon, ways) {
  let closest = null, closestDist = Infinity;
  for (const way of ways) {
    if (!way.geometry || way.geometry.length < 2) continue;
    const d = minDistToWay(lat, lon, way.geometry);
    if (d < closestDist) { closestDist = d; closest = way; }
  }
  return closest;
}

export function getCachedWays() { return cachedWays ?? []; }

// Difference between two bearings ignoring direction of travel (0..90)
function bearingDiff180(a, b) {
  let d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}

// Nearest cached way to a point, or null if none within maxDist (degrees).
// If `routeBearing` is given, only ways roughly parallel to it (within
// maxAngle degrees, ignoring direction) are considered — this keeps
// perpendicular cross-streets from matching near intersections.
// Way bounding boxes are memoized on first use for fast rejection.
export function findNearestCachedWay(lat, lon, maxDist = 0.0004, routeBearing = null, maxAngle = 35) {
  if (!cachedWays?.length) return null;
  let best = null, bestD = maxDist;
  for (const w of cachedWays) {
    if (!w._bbox) {
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const n of w.geometry) {
        if (n.lat < minLat) minLat = n.lat;
        if (n.lat > maxLat) maxLat = n.lat;
        if (n.lon < minLon) minLon = n.lon;
        if (n.lon > maxLon) maxLon = n.lon;
      }
      w._bbox = { minLat, maxLat, minLon, maxLon };
    }
    const b = w._bbox;
    if (lat < b.minLat - maxDist || lat > b.maxLat + maxDist ||
        lon < b.minLon - maxDist || lon > b.maxLon + maxDist) continue;
    const d = minDistToWay(lat, lon, w.geometry);
    if (d >= bestD) continue;
    if (routeBearing !== null) {
      const wayBearing = calcBearing(lat, lon, w.geometry);
      if (bearingDiff180(wayBearing, routeBearing) > maxAngle) continue;
    }
    bestD = d;
    best = w;
  }
  return best;
}

// ── public API ───────────────────────────────────────────────────────────────

export async function fetchRoadFromOSM(lat, lon) {
  // Use cache if the click is inside the pre-fetched bbox
  if (inBbox(lat, lon) && cachedWays !== null && cachedWays.length > 0) {
    // Narrow candidates: ways whose bounding box is within ~0.01° (~800m) of click
    const candidates = cachedWays.filter(w => {
      const nodes = w.geometry;
      return nodes.some(n =>
        Math.abs(n.lat - lat) < 0.01 && Math.abs(n.lon - lon) < 0.01
      );
    });
    const closest = pickClosest(lat, lon, candidates);
    if (!closest) return null;
    return parseRoadTags(closest.tags || {}, closest.geometry, lat, lon);
  }

  // Fall back to live Overpass (outside bbox, or cache not loaded)
  return fetchFromOverpass(lat, lon);
}

async function fetchFromOverpass(lat, lon) {
  const query = `[out:json][timeout:10];
way(around:30,${lat},${lon})[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"];
out body geom qt;`;

  const resp = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
  });
  if (!resp.ok) throw new Error('Overpass query failed');
  const data = await resp.json();
  if (!data.elements?.length) return null;

  const closest = pickClosest(lat, lon, data.elements.filter(e => e.type === 'way'));
  if (!closest) return null;
  return parseRoadTags(closest.tags || {}, closest.geometry, lat, lon);
}

// ── tag parsing ──────────────────────────────────────────────────────────────

function parseCycleway(tags) {
  // Returns 'track' | 'buffered' | 'lane' | 'shared_lane' | null per side
  function classify(val, bufferTag) {
    if (!val) return null;
    if (val === 'track' || val === 'opposite_track') return 'track';
    if (val === 'buffered_lane') return 'buffered';
    if (val === 'lane' || val === 'opposite_lane') return bufferTag ? 'buffered' : 'lane';
    if (val === 'shared_lane') return 'shared_lane';
    return null;
  }

  const base  = tags['cycleway:both'] || tags['cycleway'];
  const right = tags['cycleway:right'] ?? base;
  const left  = tags['cycleway:left']  ?? base;
  const bufR  = tags['cycleway:right:buffer'] || tags['cycleway:buffer'];
  const bufL  = tags['cycleway:left:buffer']  || tags['cycleway:buffer'];

  return { bikeLeft: classify(left, bufL), bikeRight: classify(right, bufR) };
}

function parseParking(tags) {
  const vals = ['parallel', 'diagonal', 'perpendicular', 'marked', 'yes'];
  return {
    parkingRight: vals.includes(tags['parking:lane:right']) || vals.includes(tags['parking:lane:both']),
    parkingLeft:  vals.includes(tags['parking:lane:left'])  || vals.includes(tags['parking:lane:both']),
  };
}

export function parseRoadTags(tags, nodes, lat, lon) {
  const name    = tags['name'] || tags['ref'] || 'Unnamed road';
  const highway = tags['highway'] || 'road';

  const onewayTag     = tags['oneway'];
  const oneway        = onewayTag === 'yes' || onewayTag === '1' || onewayTag === '-1';
  const oneWayReversed = onewayTag === '-1';

  const totalLanes = tags['lanes']          ? parseInt(tags['lanes'], 10)          : null;
  const fwdTag     = tags['lanes:forward']  ? parseInt(tags['lanes:forward'], 10)  : null;
  const bwdTag     = tags['lanes:backward'] ? parseInt(tags['lanes:backward'], 10) : null;

  let lanesForward = null, lanesBackward = null, directionsKnown = false;

  if (oneway) {
    const n = totalLanes ?? 1;
    lanesForward  = oneWayReversed ? 0 : n;
    lanesBackward = oneWayReversed ? n : 0;
    directionsKnown = true;
  } else if (fwdTag !== null && bwdTag !== null) {
    lanesForward = fwdTag; lanesBackward = bwdTag; directionsKnown = true;
  } else if (fwdTag !== null) {
    lanesForward  = fwdTag;
    lanesBackward = totalLanes !== null ? totalLanes - fwdTag : null;
    directionsKnown = lanesBackward !== null;
  } else if (bwdTag !== null) {
    lanesBackward = bwdTag;
    lanesForward  = totalLanes !== null ? totalLanes - bwdTag : null;
    directionsKnown = lanesForward !== null;
  } else if (totalLanes !== null) {
    lanesForward  = Math.ceil(totalLanes / 2);
    lanesBackward = Math.floor(totalLanes / 2);
    directionsKnown = false;
  }

  const { bikeLeft, bikeRight }     = parseCycleway(tags);
  const { parkingLeft, parkingRight } = parseParking(tags);
  const bearing = nodes?.length >= 2 ? calcBearing(lat, lon, nodes) : 0;

  return {
    name, highway, oneway,
    oneWayDir: oneway ? (oneWayReversed ? 'backward' : 'forward') : null,
    lanesForward, lanesBackward, directionsKnown,
    bikeLeft, bikeRight, parkingLeft, parkingRight,
    bearing,
  };
}
