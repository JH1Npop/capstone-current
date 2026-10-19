import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Tooltip } from 'react-leaflet';
import MapTileLayer from './maps/MapTileLayer';

// Loaded lazily by the landing page so the map library does not slow the first paint.
export default function LandingLocationMap({ latitude, longitude, label }) {
  const center = [latitude, longitude];
  return (
    <MapContainer
      key={`${latitude},${longitude}`}
      center={center}
      zoom={14}
      scrollWheelZoom={false}
      className="h-full min-h-72 w-full"
      aria-label={`Map showing ${label}`}
    >
      <MapTileLayer />
      <CircleMarker center={center} radius={11} pathOptions={{ color: '#1d4ed8', weight: 3, fillColor: '#f59e0b', fillOpacity: 0.95 }}>
        <Tooltip direction="top" offset={[0, -10]} permanent>{label}</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
