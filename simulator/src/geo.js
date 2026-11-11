// Local flat-earth (east/north metres) <-> lat/lon around an origin.
// Accurate to well under a metre over a few kilometres, which is all a pasture needs.
const R = 6378137;
const DEG = 180 / Math.PI;

function toLatLon(origin, x, y) {
  return {
    lat: origin.lat + (y / R) * DEG,
    lon: origin.lon + (x / (R * Math.cos(origin.lat / DEG))) * DEG,
  };
}

function toXY(origin, lat, lon) {
  return {
    x: ((lon - origin.lon) / DEG) * R * Math.cos(origin.lat / DEG),
    y: ((lat - origin.lat) / DEG) * R,
  };
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Distance to the nearest fence edge (always positive).
function distToEdge(p, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(p, poly[j], poly[i]));
  return d;
}

function centroid(points) {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

// Irregular convex-ish pasture polygon around (0,0).
function makePasture(radiusM, rnd, vertices = 7) {
  const poly = [];
  for (let i = 0; i < vertices; i++) {
    const angle = (i / vertices) * 2 * Math.PI + rnd.range(-0.15, 0.15);
    const r = radiusM * rnd.range(0.8, 1.1);
    poly.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  return poly;
}

module.exports = { toLatLon, toXY, pointInPolygon, distToEdge, centroid, makePasture };
