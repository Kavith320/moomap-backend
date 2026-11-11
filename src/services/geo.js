// src/services/geo.js
// Pure geometry helpers (no DB access) so they can be unit-tested.

function isValidPoint(p) {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}

// Returns an error message string, or null when the polygon is usable.
function validatePolygon(polygon) {
  if (!Array.isArray(polygon)) return "polygon must be an array";
  if (polygon.length < 3) return "polygon needs at least 3 points";
  for (let i = 0; i < polygon.length; i++) {
    if (!isValidPoint(polygon[i])) {
      return `polygon[${i}] must be { lat, lon } numbers within valid ranges`;
    }
  }
  return null;
}

// Ray-casting point-in-polygon. Treats lat/lon as planar coordinates, which is
// accurate enough for farm-sized fences (not for fences spanning the antimeridian).
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon;
    const yi = polygon[i].lat;
    const xj = polygon[j].lon;
    const yj = polygon[j].lat;
    const crosses =
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

module.exports = { isValidPoint, validatePolygon, pointInPolygon };
