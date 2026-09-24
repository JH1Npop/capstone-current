import L from 'leaflet';

export const DEFAULT_SERVICE_REGION = Object.freeze({
  name: 'CALABARZON',
  southWest: [13.38, 119.88],
  northEast: [14.96, 122.42],
  minZoom: 8,
});

const validCoordinatePair = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((coordinate) => Number.isFinite(Number(coordinate)));

export const resolveServiceRegion = (candidate = {}) => {
  const southWest = validCoordinatePair(candidate.southWest)
    ? candidate.southWest.map(Number)
    : DEFAULT_SERVICE_REGION.southWest;
  const northEast = validCoordinatePair(candidate.northEast)
    ? candidate.northEast.map(Number)
    : DEFAULT_SERVICE_REGION.northEast;
  const hasOrderedBounds = southWest[0] < northEast[0] && southWest[1] < northEast[1];
  const safeSouthWest = hasOrderedBounds ? southWest : DEFAULT_SERVICE_REGION.southWest;
  const safeNorthEast = hasOrderedBounds ? northEast : DEFAULT_SERVICE_REGION.northEast;
  const bounds = L.latLngBounds(L.latLng(...safeSouthWest), L.latLng(...safeNorthEast));
  const center = bounds.getCenter();
  const requestedZoom = Number(candidate.minZoom);

  return {
    name: String(candidate.name || DEFAULT_SERVICE_REGION.name),
    bounds,
    center: [center.lat, center.lng],
    minZoom: Number.isInteger(requestedZoom) && requestedZoom >= 1 && requestedZoom <= 18
      ? requestedZoom
      : DEFAULT_SERVICE_REGION.minZoom,
  };
};

export const SERVICE_REGION = resolveServiceRegion();
export const SERVICE_REGION_BOUNDS = SERVICE_REGION.bounds;
export const SERVICE_REGION_CENTER = SERVICE_REGION.center;
export const SERVICE_REGION_MIN_ZOOM = SERVICE_REGION.minZoom;

// Compatibility aliases keep existing request/location pages stable while using
// the same configurable service-region contract on newly migrated map pages.
export const CALABARZON_BOUNDS = SERVICE_REGION_BOUNDS;
export const CALABARZON_CENTER = SERVICE_REGION_CENTER;
export const CALABARZON_MIN_ZOOM = SERVICE_REGION_MIN_ZOOM;
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors';

export const isInsideCalabarzon = (lat, lng) =>
  Number.isFinite(Number(lat)) &&
  Number.isFinite(Number(lng)) &&
  CALABARZON_BOUNDS.contains([Number(lat), Number(lng)]);

export const clampToCalabarzon = (lat, lng) => {
  const numericLat = Number(lat);
  const numericLng = Number(lng);
  if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) {
    return CALABARZON_CENTER;
  }

  const sw = CALABARZON_BOUNDS.getSouthWest();
  const ne = CALABARZON_BOUNDS.getNorthEast();

  return [
    Math.min(ne.lat, Math.max(sw.lat, numericLat)),
    Math.min(ne.lng, Math.max(sw.lng, numericLng))
  ];
};
