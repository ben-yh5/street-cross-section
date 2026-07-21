import { findNearestCachedWay, parseRoadTags } from './osm.js';

// Parse a GPX file string into an ordered array of {lat, lon} track points.
export function parseGPX(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid GPX file');
  const pts = [...doc.querySelectorAll('trkpt, rtept')].map(el => ({
    lat: parseFloat(el.getAttribute('lat')),
    lon: parseFloat(el.getAttribute('lon')),
  })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length < 2) throw new Error('GPX contains no track points');
  return pts;
}

function distMeters(a, b) {
  const dLat = (b.lat - a.lat) * 111320;
  const dLon = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

// Resample the track so points are roughly `everyMeters` apart.
export function samplePoints(pts, everyMeters = 80) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += distMeters(pts[i - 1], pts[i]);
    if (acc >= everyMeters) {
      out.push(pts[i]);
      acc = 0;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Bearing of travel at point i, using the previous and next sample points
// so the estimate is stable even right at a turn.
function travelBearing(sampled, i) {
  const a = sampled[Math.max(0, i - 1)];
  const b = sampled[Math.min(sampled.length - 1, i + 1)];
  const dLat = b.lat - a.lat;
  const dLon = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
  return (Math.atan2(dLon, dLat) * 180) / Math.PI;
}

// Everything that affects the cross-section drawing. Two stretches of the
// same street with different signatures get separate list entries.
// directionsKnown is deliberately excluded: a stretch tagged only lanes=2
// and one tagged lanes:forward=1 + lanes:backward=1 are the same physical
// layout, differing only in whether arrows can be drawn.
function layoutSignature(road) {
  return [
    road.lanesForward, road.lanesBackward, road.oneway,
    road.bikeLeft, road.bikeRight, road.parkingLeft, road.parkingRight,
  ].join('|');
}

// Entries covering less route distance than this are dropped — they are
// usually turn pockets, slip lanes, or brief map-matching noise.
const MIN_SEGMENT_M = 100;

/**
 * Match sampled route points to cached OSM ways.
 * Returns ordered segments: { key, road, way, lat, lon, distanceM }
 * Consecutive points collapse into one entry only while BOTH the street name
 * and the lane layout stay the same; a layout change mid-street starts a new
 * entry. Segments shorter than MIN_SEGMENT_M are removed, and same-key
 * neighbors that become adjacent after removal are merged.
 */
export function matchRouteToRoads(sampled) {
  const segments = [];
  let prevPoint = null;
  let current = null;

  for (let i = 0; i < sampled.length; i++) {
    const p = sampled[i];
    const legM = prevPoint ? distMeters(prevPoint, p) : 0;
    prevPoint = p;

    const way = findNearestCachedWay(p.lat, p.lon, 0.0004, travelBearing(sampled, i));
    if (!way) {
      if (current) { segments.push(current); current = null; }
      continue;
    }

    const road = parseRoadTags(way.tags || {}, way.geometry, p.lat, p.lon);
    const name = way.tags?.name || `way:${way.id}`;
    const key  = `${name}::${layoutSignature(road)}`;

    if (current && current.key === key) {
      current.distanceM += legM;
      // Prefer showing the variant with known lane directions (has arrows)
      if (road.directionsKnown && !current.road.directionsKnown) current.road = road;
      continue;
    }

    if (current) segments.push(current);
    current = { key, way, lat: p.lat, lon: p.lon, distanceM: legM, road };
  }
  if (current) segments.push(current);

  // Drop short segments, then merge same-key neighbors that touch as a result
  const merged = [];
  for (const seg of segments) {
    if (seg.distanceM < MIN_SEGMENT_M) continue;
    const last = merged[merged.length - 1];
    if (last && last.key === seg.key) {
      last.distanceM += seg.distanceM;
      if (seg.road.directionsKnown && !last.road.directionsKnown) last.road = seg.road;
    } else {
      merged.push(seg);
    }
  }
  return merged;
}
