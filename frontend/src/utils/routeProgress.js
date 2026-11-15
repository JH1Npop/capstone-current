// Where a technician is along their planned road route to a job, for the admin tracking map.
//
// The server keeps `ticket.routeGeometry` (GeoJSON [lng, lat]) current and reroutes when a
// navigating technician leaves it (backend/services/route_tracking.py), but only after their next
// location arrives and at most once a minute. In between, this trims the route to where the
// technician is now, so the line starts at them and the distance/ETA count down.

// Keep in step with OFF_ROUTE_METERS in backend/services/route_tracking.py.
export const OFF_ROUTE_METERS = 200;

const EARTH_RADIUS_M = 6371000;

const toXY = ([lat, lng], refLat) => [
  (lng * Math.PI / 180) * EARTH_RADIUS_M * Math.cos(refLat * Math.PI / 180),
  (lat * Math.PI / 180) * EARTH_RADIUS_M,
];

const fromXY = ([x, y], refLat) => [
  (y / EARTH_RADIUS_M) * 180 / Math.PI,
  (x / (EARTH_RADIUS_M * Math.cos(refLat * Math.PI / 180))) * 180 / Math.PI,
];

const meters = (a, b, refLat) => {
  const [ax, ay] = toXY(a, refLat);
  const [bx, by] = toXY(b, refLat);
  return Math.hypot(ax - bx, ay - by);
};

const pathLength = (points, refLat) => points.reduce(
  (total, point, index) => (index ? total + meters(points[index - 1], point, refLat) : 0),
  0,
);

const isPoint = (point) => Array.isArray(point) && point.every(Number.isFinite);

/**
 * Metres from a point to a route of [lat, lng] points (null without a usable route).
 * Used by the technician Navigation page to recalculate only when off the route.
 */
export function distanceToRouteMeters(routeLatLng, point) {
  const route = (routeLatLng || []).filter(isPoint);
  if (route.length < 2 || !isPoint(point)) return null;
  const refLat = point[0];
  const [px, py] = toXY(point, refLat);
  let best = Infinity;
  for (let index = 1; index < route.length; index += 1) {
    const [ax, ay] = toXY(route[index - 1], refLat);
    const [bx, by] = toXY(route[index], refLat);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

/**
 * Where a point is along a route of [lat, lng] points, for live countdowns between route
 * requests (the technician Navigation page asks for a new route only every 2 minutes or when
 * off it). Returns null without a usable route.
 *   offRouteMeters  distance from the point to the route
 *   segment         index of the route segment the point is on (route[segment-1] .. route[segment])
 *   remainingMeters along the route from the snapped point to the end
 *   travelledCoords route already driven (start .. snapped point), for greying out
 *   metersToIndex(i) along the route from the snapped point to route point i (0 if passed)
 */
export function measureAlongRoute(routeLatLng, point) {
  const route = (routeLatLng || []).filter(isPoint);
  if (route.length < 2 || !isPoint(point)) return null;
  const refLat = point[0];
  const [px, py] = toXY(point, refLat);
  let best = { distance: Infinity, segment: 1, snapped: route[0] };
  for (let index = 1; index < route.length; index += 1) {
    const [ax, ay] = toXY(route[index - 1], refLat);
    const [bx, by] = toXY(route[index], refLat);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    const projected = [ax + t * dx, ay + t * dy];
    const distance = Math.hypot(px - projected[0], py - projected[1]);
    // On a near tie (standing on a turn point) prefer the later segment: the turn is next.
    if (distance <= best.distance + 0.5) best = { distance, segment: index, snapped: fromXY(projected, refLat) };
  }
  // Metres from route point i to the end, computed once.
  const tail = new Array(route.length).fill(0);
  for (let index = route.length - 2; index >= 0; index -= 1) {
    tail[index] = tail[index + 1] + meters(route[index], route[index + 1], refLat);
  }
  const fromSnappedToSegmentEnd = meters(best.snapped, route[best.segment], refLat);
  const remainingMeters = fromSnappedToSegmentEnd + tail[best.segment];
  return {
    offRouteMeters: best.distance,
    // The route segment the point is on: it runs from route[segment - 1] to route[segment].
    segment: best.segment,
    remainingMeters,
    travelledCoords: [...route.slice(0, best.segment), best.snapped],
    metersToIndex: (index) => {
      if (!Number.isInteger(index) || index < best.segment) return 0;
      return Math.max(remainingMeters - tail[Math.min(index, route.length - 1)], 0);
    },
  };
}

/**
 * @returns {{
 *   coords: number[][], isFallback: boolean, offRoute: boolean,
 *   remainingMeters: number|null, remainingSeconds: number|null,
 *   reroutedAt: string|null, rerouteReason: string|null
 * }}
 */
export function getRouteProgress(ticket, tech, { isLead = true } = {}) {
  const techPoint = [Number(tech?.lat), Number(tech?.lng)];
  const jobPoint = [Number(ticket?.lat), Number(ticket?.lng)];
  const geometry = ticket?.routeGeometry || null;
  const reroutedAt = geometry?.computed_at || null;
  const rerouteReason = geometry?.reason || null;
  const direct = (offRoute) => ({
    coords: isPoint(techPoint) && isPoint(jobPoint) ? [techPoint, jobPoint] : [],
    isFallback: true,
    offRoute,
    remainingMeters: isPoint(techPoint) && isPoint(jobPoint) ? meters(techPoint, jobPoint, techPoint[0]) : null,
    remainingSeconds: null,
    reroutedAt,
    rerouteReason,
  });

  let route = (geometry?.coordinates || [])
    .map((coord) => [Number(coord?.[1]), Number(coord?.[0])])
    .filter(isPoint);
  if (route.length < 2 || !isPoint(techPoint)) return direct(false);

  const refLat = techPoint[0];
  // Routes saved before 2026-11-15 ran from the job to the technician; turn those around.
  if (isPoint(jobPoint) && meters(route[0], jobPoint, refLat) < meters(route[route.length - 1], jobPoint, refLat)) {
    route = [...route].reverse();
  }

  // Nearest point on the route to the technician.
  const [px, py] = toXY(techPoint, refLat);
  let best = { distance: Infinity, segment: 0, point: route[0] };
  for (let index = 1; index < route.length; index += 1) {
    const [ax, ay] = toXY(route[index - 1], refLat);
    const [bx, by] = toXY(route[index], refLat);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    const projected = [ax + t * dx, ay + t * dy];
    const distance = Math.hypot(px - projected[0], py - projected[1]);
    if (distance < best.distance) best = { distance, segment: index, point: fromXY(projected, refLat) };
  }

  const tolerance = Math.max(OFF_ROUTE_METERS, 1.5 * (Number(tech?.gpsAccuracy) || 0));
  // Only the lead's location reroutes the ticket; a crew member away from the lead's route is
  // travelling separately (direct line), not "off route".
  if (best.distance > tolerance) return isLead ? direct(true) : { ...direct(false), separate: true };

  const remaining = [best.point, ...route.slice(best.segment)];
  const totalMeters = pathLength(route, refLat);
  const remainingAlong = pathLength(remaining, refLat);
  const duration = Number(ticket?.routeDuration);
  return {
    coords: [techPoint, ...remaining],
    isFallback: false,
    offRoute: false,
    remainingMeters: best.distance + remainingAlong,
    remainingSeconds: Number.isFinite(duration) && duration > 0 && totalMeters > 0
      ? duration * (remainingAlong / totalMeters)
      : null,
    reroutedAt,
    rerouteReason,
  };
}
