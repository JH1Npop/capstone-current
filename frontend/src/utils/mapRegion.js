import L from 'leaflet';

// Region IV-A: Cavite, Laguna, Batangas, Rizal, and Quezon.
export const CALABARZON_BOUNDS = L.latLngBounds(
  L.latLng(13.38, 119.88),
  L.latLng(14.96, 122.42)
);

const center = CALABARZON_BOUNDS.getCenter();

export const CALABARZON_CENTER = [center.lat, center.lng];
export const CALABARZON_MIN_ZOOM = 8;
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
