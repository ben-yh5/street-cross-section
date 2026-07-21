/**
 * Minimal tag filter language for OSM ways.
 *
 * Syntax examples:
 *   highway = primary
 *   lanes > 2
 *   name ~ Pike            (case-insensitive contains)
 *   highway = secondary AND cycleway = lane
 *   oneway = yes OR lanes >= 4
 *   NOT highway = service
 *   highway EXISTS         (tag is present)
 */

export function compileQuery(raw) {
  const js = raw
    // logical keywords → JS operators (whole-word, case-insensitive)
    .replace(/\bAND\b/gi, '&&')
    .replace(/\bOR\b/gi,  '||')
    .replace(/\bNOT\b/gi, '!')
    // key EXISTS → tag-in-object check
    .replace(/([a-zA-Z0-9:_-]+)\s+EXISTS/gi, (_, k) => `(${sq(k)} in t)`)
    // key op value   (op before = must be checked first to avoid double-replacement)
    .replace(/([a-zA-Z0-9:_-]+)\s*(>=|<=|!=|~|>|<|=)\s*([^\s()&|!,]+)/g, cond);

  return new Function('t', `"use strict"; return !!(${js});`);
}

function sq(s) { return JSON.stringify(s); }

function cond(_, key, op, raw) {
  const k  = sq(key);
  const ref = `(t[${k}]||'')`;
  const num = parseFloat(raw);
  const v   = sq(raw);

  switch (op) {
    case '=':  return `t[${k}]===${v}`;
    case '!=': return `t[${k}]!==${v}`;
    case '~':  return `${ref}.toLowerCase().includes(${sq(raw.toLowerCase())})`;
    case '>':  return `+${ref}>${num}`;
    case '<':  return `+${ref}<${num}`;
    case '>=': return `+${ref}>=${num}`;
    case '<=': return `+${ref}<=${num}`;
    default:   return 'false';
  }
}

function midpoint(way) {
  const g = way.geometry;
  const m = g[Math.floor(g.length / 2)];
  return { lat: m.lat, lon: m.lon };
}

/**
 * Run a compiled (or raw string) query against an array of ways.
 * Returns up to `limit` results sorted by proximity to `center` {lat, lon}.
 */
export function runQuery(queryStr, ways, { center = null, limit = 10 } = {}) {
  if (!queryStr.trim()) return [];

  let predicate;
  try {
    predicate = compileQuery(queryStr);
  } catch (e) {
    throw new Error(`Query syntax error: ${e.message}`);
  }

  const matches = [];
  for (const way of ways) {
    try { if (predicate(way.tags)) matches.push(way); } catch {}
  }

  if (center) {
    matches.sort((a, b) => {
      const ma = midpoint(a), mb = midpoint(b);
      const da = (ma.lat - center.lat) ** 2 + (ma.lon - center.lon) ** 2;
      const db = (mb.lat - center.lat) ** 2 + (mb.lon - center.lon) ** 2;
      return da - db;
    });
  }

  return { hits: matches.slice(0, limit), total: matches.length };
}
