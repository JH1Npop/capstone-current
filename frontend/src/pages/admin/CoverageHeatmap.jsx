import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { MapContainer, Circle, CircleMarker, GeoJSON, Marker, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FiMap } from 'react-icons/fi';
import { fetchCoverageHeatmap, fetchTechnicianCoverage } from '../../api/api';
import {
  CALABARZON_BOUNDS,
  CALABARZON_CENTER,
  CALABARZON_MIN_ZOOM
} from '../../utils/mapRegion';
import MapTileLayer from '../../components/maps/MapTileLayer';
import SearchFilterBar from '../../components/shared/SearchFilterBar';

const EMPTY_LEVEL = [];
const BOUNDARY_ATTRIBUTION = 'Boundaries: <a href="https://github.com/faeldon/philippines-json-maps" target="_blank" rel="noopener noreferrer">philippines-json-maps</a> (MIT, PSA/NAMRIA)';
const NO_JOBS_FILL = '#e2e8f0';
const TECH_COLORS =['#2563eb', '#0f766e', '#7c3aed', '#ea580c', '#be123c', '#0891b2'];
const DENSITY_GRADIENT = 'linear-gradient(90deg, #22c55e 0%, #16a34a 25%, #eab308 50%, #f97316 75%, #dc2626 100%)';
const GEOGRAPHIC_LEVELS = {
  hotspot: { option: 'Hotspot areas', singular: 'hotspot', plural: 'hotspots' },
  // Map-based barangays (jobs placed inside official outlines by coordinates), not typed address text.
  barangay: { option: 'Barangay', singular: 'barangay', plural: 'barangays', dataKey: 'barangay_boundary', boundaryBased: true },
  // Uses the boundary-based `municipality` rows: jobs placed inside official outlines by coordinates.
  city: { option: 'City / municipality', singular: 'city / municipality', plural: 'cities / municipalities', dataKey: 'municipality', boundaryBased: true },
  province: { option: 'Province', singular: 'province', plural: 'provinces' },
};

// Zooms to the selected outline, and back out to everything when it is cleared.
function SelectedAreaZoom({ feature, points }) {
  const map = useMap();
  const hadSelection = useRef(false);

  useEffect(() => {
    if (feature) {
      hadSelection.current = true;
      const bounds = L.geoJSON(feature).getBounds();
      if (bounds.isValid()) map.flyToBounds(bounds, { padding: [36, 36], maxZoom: 13, duration: 0.6 });
    } else if (hadSelection.current) {
      hadSelection.current = false;
      if (points.length > 1) map.flyToBounds(points, { padding: [28, 28], maxZoom: 12, duration: 0.6 });
    }
  }, [map, feature]);

  return null;
}

// Spotlight: a dark veil over everything except the selected area (the area is a hole in the
// veil), then a soft white glow and a crisp line along its edge. Not clickable, so the outlines
// underneath still respond.
const SPOTLIGHT_OUTER_RING = [[9, 114], [9, 129], [21, 129], [21, 114]];
const toLatLngRing = (ring) => ring.map(([lng, lat]) => [lat, lng]);
const outerRingsOf = (feature) => {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [toLatLngRing(geometry.coordinates[0])];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => toLatLngRing(polygon[0]));
  return [];
};

function AreaSpotlight({ feature, contextFeature }) {
  const holes = useMemo(() => outerRingsOf(feature), [feature]);
  const contextRings = useMemo(() => outerRingsOf(contextFeature), [contextFeature]);
  if (!holes.length) return null;
  const psgc = feature.properties?.psgc;
  return (
    <>
      <Polygon
        key={`veil-${psgc}`}
        positions={[SPOTLIGHT_OUTER_RING, ...holes]}
        interactive={false}
        className="area-spotlight-veil"
        pathOptions={{ stroke: false, fillColor: '#0f172a', fillOpacity: 0.45, fillRule: 'evenodd' }}
      />
      {/* When a barangay is spotlighted, keep its town's edge visible for context. */}
      {contextRings.length > 0 && (
        <Polygon
          key={`context-${contextFeature.properties?.psgc}`}
          positions={contextRings}
          interactive={false}
          pathOptions={{ color: '#f8fafc', weight: 2, opacity: 0.7, fill: false, dashArray: '6 6' }}
        />
      )}
      <Polygon
        key={`glow-${psgc}`}
        positions={holes}
        interactive={false}
        className="area-spotlight-glow"
        pathOptions={{ color: '#ffffff', weight: 10, opacity: 0.75, fill: false, lineJoin: 'round' }}
      />
      <Polygon
        key={`edge-${psgc}`}
        positions={holes}
        interactive={false}
        pathOptions={{ color: '#0f172a', weight: 2.5, opacity: 1, fill: false, lineJoin: 'round' }}
      />
    </>
  );
}

// A click on empty map clears the selection (outline clicks stop propagation).
function MapClickClear({ onClear }) {
  useMapEvents({ click: onClear });
  return null;
}

function MapResizeController({ mapCenter, points, paused = false }) {
  const map = useMap();

  useEffect(() => {
    // While an area is selected, keep the user's zoom instead of refitting to everything.
    if (paused) return undefined;
    const timer = window.setTimeout(() => {
      map.stop();
      map.invalidateSize({ animate: false });

      if (points.length > 1) {
        map.fitBounds(points, { padding: [28, 28], maxZoom: 12, animate: false });
      } else {
        map.setView(mapCenter, 11, { animate: false });
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [map, mapCenter, points, paused]);

  return null;
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

const getInitials = (name) => String(name || '?')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() || '')
  .join('') || '?';

const getHeatmapColor = (count, maxDensity) => {
  if (!maxDensity) return '#64748b';
  const intensity = count / maxDensity;
  if (intensity > 0.8) return '#dc2626';
  if (intensity > 0.6) return '#f97316';
  if (intensity > 0.4) return '#eab308';
  if (intensity > 0.2) return '#16a34a';
  return '#22c55e';
};

const getIntensity = (count, maxDensity) => (
  maxDensity ? Math.max(0, Math.min(1, Number(count || 0) / maxDensity)) : 0
);

// Glow under each hotspot in screen pixels, so it stays visible at region zoom.
const getGlowRadius = (count, maxDensity) => Math.round(24 + Math.sqrt(getIntensity(count, maxDensity)) * 30);

// Count bubble in screen pixels, so it stays readable at every zoom level.
const createBubbleIcon = (count, maxDensity, aggregated) => {
  const scale = Math.sqrt(getIntensity(count, maxDensity));
  const size = Math.round(aggregated ? 32 + scale * 24 : 24 + scale * 16);
  const fontSize = size >= 44 ? 15 : size >= 32 ? 13 : 11;
  return L.divIcon({
    className: '',
    html: `<div class="heat-bubble" style="width:${size}px;height:${size}px;font-size:${fontSize}px;background:${getHeatmapColor(count, maxDensity)}">${escapeHtml(count)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

const createTechnicianIcon = (name, color) => L.divIcon({
  className: '',
  html: `<div class="tech-pin" style="background:${color}">${escapeHtml(getInitials(name))}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
});

const getServiceBreakdown = (point) => {
  if (Array.isArray(point?.service_breakdown) && point.service_breakdown.length > 0) {
    return point.service_breakdown;
  }

  return Array.isArray(point?.service_types)
    ? point.service_types.map((name) => ({ name, count: 1 }))
    : [];
};

// One small file per city/municipality (about 7 KB each), fetched only when that town is opened.
const BARANGAY_FILES = import.meta.glob('../../data/barangays/*.json');
const barangayFileFor = (townPsgc) => BARANGAY_FILES[`../../data/barangays/${townPsgc}.json`];

const CLIENT_PREVIEW_LIMIT = 8;
const HEAT_POINT_PREVIEW_LIMIT = 6;

// The selected town's barangays with jobs, busiest first; each row opens that barangay.
function BarangayList({ rows, totalBarangays, unplaced, loading, error, onSelect }) {
  return (
    <div className="mt-5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Barangays with jobs ({rows.length}{totalBarangays ? ` of ${totalBarangays}` : ''})
      </h4>
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-amber-700">{error}</p>}
      {loading && <p className="mt-1.5 text-xs text-slate-500">Loading barangay outlines…</p>}
      {rows.length ? (
        <ol className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((row) => (
            <li key={row.psgc}>
              <button
                type="button"
                onClick={() => onSelect(row.psgc)}
                aria-label={`Show barangay ${row.area_name}`}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-slate-50 focus-visible:bg-slate-50"
              >
                <span className="min-w-0 truncate text-slate-800">{row.area_name}</span>
                <span className="shrink-0 font-semibold text-blue-700">{row.count} job{row.count === 1 ? '' : 's'}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1.5 text-sm text-slate-500">No barangay has completed jobs yet.</p>
      )}
      <p className="mt-1.5 text-[11px] text-slate-500">
        Click a barangay on the map or in this list for its details.
        {unplaced > 0 && ` ${unplaced} job${unplaced === 1 ? '' : 's'} sit on a town edge outside every barangay outline.`}
      </p>
    </div>
  );
}

// Everything known about the selected city/municipality or barangay: totals come from its
// geographic_levels row (municipality or barangay_boundary); heat points are the hotspots inside.
function AreaDetailsPanel({
  panelRef, eyebrow, name, subtitle, backLabel, onBack, row, rank, areaCount, shareOf, shareLabel,
  heatPoints, emptyText, children,
}) {
  const services = row ? getServiceBreakdown(row) : [];
  const topServiceCount = Math.max(1, ...services.map((service) => Number(service.count || 0)));
  const clients = row?.clients || [];
  const technicians = row?.technicians || [];
  const share = row && shareOf ? Math.round((row.count / shareOf) * 100) : 0;
  const rankedPoints = [...heatPoints].sort((a, b) => b.count - a.count);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-labelledby="selected-area-heading"
      className="border-t border-slate-200 bg-white p-4 outline-none lg:max-h-[min(68vh,720px)] lg:min-h-[520px] lg:overflow-y-auto lg:border-l lg:border-t-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">{eyebrow}</div>
          <h3 id="selected-area-heading" className="mt-0.5 text-lg font-bold leading-tight text-slate-900">{name}</h3>
          <div className="text-sm text-slate-500">{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {backLabel}
        </button>
      </div>

      {row ? (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <dt className="text-[11px] font-medium text-slate-500">Completed jobs</dt>
              <dd className="mt-0.5 text-xl font-bold text-slate-900">{row.count}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <dt className="text-[11px] font-medium text-slate-500">{shareLabel}</dt>
              <dd className="mt-0.5 text-xl font-bold text-slate-900">{share}%</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <dt className="text-[11px] font-medium text-slate-500">Rank</dt>
              <dd className="mt-0.5 text-xl font-bold text-slate-900">#{rank}<span className="text-xs font-medium text-slate-500"> of {areaCount}</span></dd>
            </div>
          </dl>

          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Services done here</h4>
          <ul className="mt-2 space-y-2">
            {services.map((service) => (
              <li key={service.name} className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-slate-800">{service.name}</span>
                  <span className="font-semibold text-slate-900">{service.count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-brand-500"
                    style={{ width: `${Math.max(6, Math.round((Number(service.count || 0) / topServiceCount) * 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {services.length > 1 && (
            <p className="mt-1.5 text-[11px] text-slate-500">One job can include more than one service.</p>
          )}

          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Technicians ({technicians.length})</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {technicians.length ? technicians.map((tech) => (
              <span key={tech.id} className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{tech.name}</span>
            )) : <span className="text-sm text-slate-500">None recorded</span>}
          </div>

          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Clients served ({clients.length})</h4>
          <p className="mt-1.5 text-sm text-slate-700">
            {clients.slice(0, CLIENT_PREVIEW_LIMIT).map((client) => client.name).join(', ') || 'None recorded'}
            {clients.length > CLIENT_PREVIEW_LIMIT && <span className="text-slate-500"> and {clients.length - CLIENT_PREVIEW_LIMIT} more</span>}
          </p>

          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Heat points in this area ({rankedPoints.length})</h4>
          {rankedPoints.length ? (
            <ol className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {rankedPoints.slice(0, HEAT_POINT_PREVIEW_LIMIT).map((point) => (
                <li key={`${point.lat},${point.lng}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-800" title={point.address || ''}>{point.address || 'Mapped service area'}</span>
                  <span className="shrink-0 font-semibold text-blue-700">{point.count} job{point.count === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500">No heat point centre falls inside this outline.</p>
          )}
          <p className="mt-1.5 text-[11px] text-slate-500">
            Heat points are about 1 km wide; one near a border can sit in the next area.
          </p>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          {emptyText}
        </div>
      )}
      {children}
    </section>
  );
}

export default function CoverageHeatmap() {
  const [heatmapData, setHeatmapData] = useState([]);
  const [geographicLevels, setGeographicLevels] = useState({ barangay: [], city: [], province: [], municipality: [] });
  const [jobsOutsideBoundaries, setJobsOutsideBoundaries] = useState(0);
  const [boundaryShapes, setBoundaryShapes] = useState(null);
  const [boundaryError, setBoundaryError] = useState('');
  // The city/municipality the user clicked (its 10-digit PSGC code), or null.
  const [selectedAreaPsgc, setSelectedAreaPsgc] = useState(null);
  const selectedAreaRef = useRef(null);
  selectedAreaRef.current = selectedAreaPsgc;
  const boundaryLayerRef = useRef(null);
  const areaPanelRef = useRef(null);
  // Barangay drill-down inside the selected town: outlines load per town on first open.
  const [selectedBarangayPsgc, setSelectedBarangayPsgc] = useState(null);
  const selectedBarangayRef = useRef(null);
  selectedBarangayRef.current = selectedBarangayPsgc;
  const [barangayShapesByTown, setBarangayShapesByTown] = useState({});
  const [barangayError, setBarangayError] = useState('');
  const barangayLayerRef = useRef(null);
  const [geographicLevel, setGeographicLevel] = useState('hotspot');
  const [technicianCoverage, setTechnicianCoverage] = useState([]);
  const [clientOptions, setClientOptions] = useState([]);
  const [technicianOptions, setTechnicianOptions] = useState([]);
  const [serviceOptions, setServiceOptions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [selectedServiceType, setSelectedServiceType] = useState('');
  const [showServiceDensity, setShowServiceDensity] = useState(true);
  const [showTechnicianCoverage, setShowTechnicianCoverage] = useState(true);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalPoints: 0, totalJobs: 0, maxDensity: 0, totalTechnicians: 0 });
  // Only the newest request may update the page when filters change quickly.
  const requestSequence = useRef(0);
  const [error, setError] = useState('');
  const geographicConfig = GEOGRAPHIC_LEVELS[geographicLevel];
  const selectedGeographicData = geographicLevel === 'hotspot'
    ? heatmapData
    : geographicLevels[geographicConfig.dataKey || geographicLevel] || EMPTY_LEVEL;
  const showBoundaries = geographicLevel === 'city';
  // Memoised so the map only re-fits when the data changes, not on every
  // re-render (toggling a layer used to snap the zoom back).
  const boundedHeatmapData = useMemo(
    () => selectedGeographicData.filter((point) => CALABARZON_BOUNDS.contains([point.lat, point.lng])),
    [selectedGeographicData]
  );
  const displayedMaxDensity = Math.max(0, ...boundedHeatmapData.map((point) => Number(point.count || 0)));
  const boundedTechnicianCoverage = useMemo(
    () => technicianCoverage.filter((tech) => CALABARZON_BOUNDS.contains(tech.center)),
    [technicianCoverage]
  );
  const isAggregatedLevel = geographicLevel !== 'hotspot';
  // The city/municipality view shows real heat points (hotspots) inside the shaded outlines;
  // barangay and province stay one summary bubble per area.
  const markersAreAggregated = isAggregatedLevel && !showBoundaries;
  const boundedHotspots = useMemo(
    () => heatmapData.filter((point) => CALABARZON_BOUNDS.contains([point.lat, point.lng])),
    [heatmapData]
  );
  const hotspotMaxDensity = Math.max(0, ...boundedHotspots.map((point) => Number(point.count || 0)));
  const selectedAreaHotspots = useMemo(
    () => (selectedAreaPsgc ? boundedHotspots.filter((point) => point.area_psgc === selectedAreaPsgc) : boundedHotspots),
    [boundedHotspots, selectedAreaPsgc]
  );
  const markerPoints = showBoundaries ? selectedAreaHotspots : boundedHeatmapData;
  const markerMaxDensity = showBoundaries ? hotspotMaxDensity : displayedMaxDensity;
  const densityMarkers = useMemo(
    () => markerPoints.map((point) => ({
      point,
      color: getHeatmapColor(point.count, markerMaxDensity),
      icon: createBubbleIcon(point.count, markerMaxDensity, markersAreAggregated),
    })),
    [markerPoints, markerMaxDensity, markersAreAggregated]
  );
  const ticksFor = (max) => (max > 2
    ? [1, Math.round((1 + max) / 2), max]
    : max > 0 ? Array.from({ length: max }, (_, index) => index + 1) : [0]);
  const mapPoints = useMemo(
    () => [
      ...boundedHeatmapData.map((point) => [point.lat, point.lng]),
      ...boundedTechnicianCoverage.map((tech) => tech.center)
    ],
    [boundedHeatmapData, boundedTechnicianCoverage]
  );
  const mapCenter = boundedHeatmapData.length > 0
    ? [boundedHeatmapData[0].lat, boundedHeatmapData[0].lng]
    : boundedTechnicianCoverage.length > 0
      ? boundedTechnicianCoverage[0].center
      : CALABARZON_CENTER;
  const serviceSummary = useMemo(() => {
    const totals = {};

    boundedHeatmapData.forEach((point) => {
      getServiceBreakdown(point).forEach((service) => {
        totals[service.name] = (totals[service.name] || 0) + Number(service.count || 0);
      });
    });

    return Object.entries(totals)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [boundedHeatmapData]);

  // The same hotspot details as the map popups, in a list keyboard and screen-reader users can read.
  const HOTSPOT_LIST_LIMIT = 10;
  const rankedHotspots = useMemo(
    () => [...boundedHeatmapData].sort((a, b) => b.count - a.count || String(a.address || '').localeCompare(String(b.address || ''))),
    [boundedHeatmapData]
  );

  useEffect(() => {
    loadHeatmapData();
  }, [selectedClient, selectedTechnician, selectedServiceType]);

  // The outlines (about 56 KB) load only the first time the boundary view is opened.
  useEffect(() => {
    if (!showBoundaries || boundaryShapes) return undefined;
    let cancelled = false;
    import('../../data/calabarzonCityMunicipalities.json')
      .then((module) => {
        if (!cancelled) {
          setBoundaryShapes(module.default || module);
          setBoundaryError('');
        }
      })
      .catch(() => {
        if (!cancelled) setBoundaryError('City and municipality outlines could not be loaded. Showing the counts only.');
      });
    return () => { cancelled = true; };
  }, [showBoundaries, boundaryShapes]);

  const boundaryCounts = useMemo(() => {
    const counts = new Map();
    (geographicLevels.municipality || []).forEach((row) => counts.set(row.psgc, row));
    return counts;
  }, [geographicLevels]);
  // A new key re-creates the GeoJSON layer, since react-leaflet does not restyle it on prop changes.
  const boundaryLayerKey = useMemo(
    () => `${displayedMaxDensity}:${(geographicLevels.municipality || []).map((row) => `${row.psgc}=${row.count}`).join('|')}`,
    [geographicLevels, displayedMaxDensity]
  );
  // Reads the selection from a ref so the handlers bound when the layer was built stay current.
  const boundaryStyle = (feature) => {
    const row = boundaryCounts.get(feature.properties.psgc);
    const selected = selectedAreaRef.current;
    const isSelected = selected === feature.properties.psgc;
    const base = {
      color: row ? '#334155' : '#64748b',
      weight: row ? 1.5 : 1,
      opacity: row ? 0.9 : 0.75,
      fillColor: row ? getHeatmapColor(row.count, displayedMaxDensity) : NO_JOBS_FILL,
      fillOpacity: row ? 0.6 : 0.35,
    };
    if (!selected) return base;
    // The selected town keeps a strong border; its barangays carry the shading inside it.
    if (isSelected) return { ...base, color: '#0f172a', weight: 4, opacity: 1, fillOpacity: 0.05 };
    // The spotlight veil already darkens the rest; just soften their edges a little.
    return { ...base, opacity: 0.6 };
  };
  const boundaryStyleRef = useRef(boundaryStyle);
  boundaryStyleRef.current = boundaryStyle;
  const onEachBoundary = (feature, layer) => {
    const { name, province, psgc } = feature.properties;
    const row = boundaryCounts.get(psgc);
    const jobs = row ? `${row.count} completed job${row.count === 1 ? '' : 's'}` : 'No completed jobs';
    layer.bindTooltip(`<strong>${escapeHtml(name)}</strong>, ${escapeHtml(province)}<br/>${jobs}<br/><span style="color:#64748b">Click to open its barangays</span>`, { sticky: true, direction: 'top' });
    layer.on({
      // Click or tap opens the town: its barangays appear and the panel shows its details.
      click: (event) => {
        L.DomEvent.stopPropagation(event);
        setSelectedAreaPsgc(psgc);
        setSelectedBarangayPsgc(null);
      },
      mouseover: () => layer.setStyle({ weight: selectedAreaRef.current === psgc ? 4 : 3, color: '#0f172a', opacity: 1 }),
      mouseout: () => layer.setStyle(boundaryStyleRef.current(feature)),
    });
  };

  // Restyle the existing outlines in place when the selection changes (no rebuild, no flicker).
  useEffect(() => {
    const layer = boundaryLayerRef.current;
    if (!layer) return;
    layer.eachLayer((child) => {
      child.setStyle(boundaryStyleRef.current(child.feature));
      if (child.feature?.properties?.psgc === selectedAreaPsgc) child.bringToFront();
    });
  }, [selectedAreaPsgc, boundaryLayerKey, boundaryShapes]);

  // Leaving the city/municipality view clears the selection; a new town clears the barangay.
  useEffect(() => {
    if (!showBoundaries) setSelectedAreaPsgc(null);
  }, [showBoundaries]);
  useEffect(() => {
    setSelectedBarangayPsgc(null);
  }, [selectedAreaPsgc]);

  // Escape steps back one level: barangay, then town.
  useEffect(() => {
    if (!selectedAreaPsgc) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (selectedBarangayRef.current) setSelectedBarangayPsgc(null);
      else setSelectedAreaPsgc(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedAreaPsgc]);

  // Load the selected town's barangay outlines once; later visits reuse them.
  useEffect(() => {
    if (!selectedAreaPsgc || barangayShapesByTown[selectedAreaPsgc]) return undefined;
    const loader = barangayFileFor(selectedAreaPsgc);
    if (!loader) return undefined;
    let cancelled = false;
    loader()
      .then((module) => {
        if (cancelled) return;
        setBarangayShapesByTown((current) => ({ ...current, [selectedAreaPsgc]: module.default || module }));
        setBarangayError('');
      })
      .catch(() => {
        if (!cancelled) setBarangayError('Barangay outlines could not be loaded for this area.');
      });
    return () => { cancelled = true; };
  }, [selectedAreaPsgc, barangayShapesByTown]);

  const featureByPsgc = useMemo(() => {
    const features = new Map();
    (boundaryShapes?.features || []).forEach((feature) => features.set(feature.properties.psgc, feature));
    return features;
  }, [boundaryShapes]);
  const selectedFeature = selectedAreaPsgc ? featureByPsgc.get(selectedAreaPsgc) : null;
  const selectedAreaRow = selectedAreaPsgc ? boundaryCounts.get(selectedAreaPsgc) : null;
  const selectedAreaRank = selectedAreaRow
    ? rankedHotspots.findIndex((row) => row.psgc === selectedAreaPsgc) + 1
    : 0;

  // Barangays of the selected town: shapes, rows (jobs placed by coordinates), selection.
  const townBarangayShapes = selectedAreaPsgc ? barangayShapesByTown[selectedAreaPsgc] : null;
  const townBarangayRows = useMemo(
    () => (geographicLevels.barangay_boundary || [])
      .filter((row) => row.municipality_psgc === selectedAreaPsgc)
      .sort((a, b) => b.count - a.count || a.area_name.localeCompare(b.area_name)),
    [geographicLevels, selectedAreaPsgc]
  );
  const barangayCounts = useMemo(
    () => new Map(townBarangayRows.map((row) => [row.psgc, row])),
    [townBarangayRows]
  );
  const barangayMaxDensity = Math.max(0, ...townBarangayRows.map((row) => Number(row.count || 0)));
  const selectedBarangayFeature = selectedBarangayPsgc
    ? (townBarangayShapes?.features || []).find((feature) => feature.properties.psgc === selectedBarangayPsgc) || null
    : null;
  const selectedBarangayRow = selectedBarangayPsgc ? barangayCounts.get(selectedBarangayPsgc) : null;
  const selectedBarangayRank = selectedBarangayRow
    ? townBarangayRows.findIndex((row) => row.psgc === selectedBarangayPsgc) + 1
    : 0;
  const selectedBarangayHotspots = useMemo(
    () => (selectedBarangayPsgc ? boundedHotspots.filter((point) => point.barangay_psgc === selectedBarangayPsgc) : []),
    [boundedHotspots, selectedBarangayPsgc]
  );
  const barangayLayerKey = `${selectedAreaPsgc}:${barangayMaxDensity}:${townBarangayRows.map((row) => `${row.psgc}=${row.count}`).join('|')}`;

  const barangayStyle = (feature) => {
    const row = barangayCounts.get(feature.properties.psgc);
    const selected = selectedBarangayRef.current;
    const isSelected = selected === feature.properties.psgc;
    const base = {
      color: '#475569',
      weight: 1,
      opacity: 0.8,
      fillColor: row ? getHeatmapColor(row.count, barangayMaxDensity) : '#ffffff',
      fillOpacity: row ? 0.5 : 0.08,
    };
    if (!selected) return base;
    if (isSelected) return { ...base, color: '#1e3a8a', weight: 3.5, opacity: 1, fillOpacity: row ? 0.6 : 0.2 };
    // Other barangays sit under the spotlight veil, which darkens them.
    return base;
  };
  const barangayStyleRef = useRef(barangayStyle);
  barangayStyleRef.current = barangayStyle;
  const onEachBarangay = (feature, layer) => {
    const { name, psgc } = feature.properties;
    const row = barangayCounts.get(psgc);
    const jobs = row ? `${row.count} completed job${row.count === 1 ? '' : 's'}` : 'No completed jobs';
    layer.bindTooltip(`Barangay <strong>${escapeHtml(name)}</strong><br/>${jobs}`, { sticky: true, direction: 'top' });
    layer.on({
      // Click or tap selects the barangay (again to go back to the town).
      click: (event) => {
        L.DomEvent.stopPropagation(event);
        setSelectedBarangayPsgc((current) => (current === psgc ? null : psgc));
      },
      mouseover: () => layer.setStyle({ weight: selectedBarangayRef.current === psgc ? 3.5 : 2.5, color: '#1e3a8a', opacity: 1 }),
      mouseout: () => layer.setStyle(barangayStyleRef.current(feature)),
    });
  };
  useEffect(() => {
    const layer = barangayLayerRef.current;
    if (!layer) return;
    layer.eachLayer((child) => {
      child.setStyle(barangayStyleRef.current(child.feature));
      if (child.feature?.properties?.psgc === selectedBarangayPsgc) child.bringToFront();
    });
  }, [selectedBarangayPsgc, barangayLayerKey, townBarangayShapes]);

  // Inside a town the barangays are shaded on their own scale, so the legend follows it.
  const legendShowsBarangays = showBoundaries && Boolean(townBarangayShapes);
  const legendTicks = ticksFor(legendShowsBarangays ? barangayMaxDensity : displayedMaxDensity);
  const legendUnit = legendShowsBarangays ? 'jobs per barangay' : showBoundaries ? 'jobs per city / town' : 'jobs per area';

  const selectAreaFromList = (psgc) => {
    setSelectedAreaPsgc(psgc);
  };
  const scrollToAreaPanel = () => {
    areaPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    areaPanelRef.current?.focus({ preventScroll: true });
  };

  const loadHeatmapData = async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    try {
      const filters = {
        client: selectedClient,
        technician: selectedTechnician,
        serviceType: selectedServiceType
      };
      const [heatmapResponse, coverageResponse] = await Promise.all([
        fetchCoverageHeatmap(filters),
        fetchTechnicianCoverage(filters)
      ]);
      if (requestId !== requestSequence.current) return;

      setHeatmapData(heatmapResponse.heatmap_data || []);
      setGeographicLevels(heatmapResponse.geographic_levels || { barangay: [], city: [], province: [], municipality: [] });
      setJobsOutsideBoundaries(Number(heatmapResponse.jobs_outside_boundaries || 0));
      setTechnicianCoverage(coverageResponse.coverage_areas || []);
      setClientOptions(heatmapResponse.client_options || []);
      setTechnicianOptions(heatmapResponse.technician_options || coverageResponse.coverage_areas?.map((tech) => ({
        id: tech.technician_id,
        name: tech.name
      })) || []);
      setServiceOptions(heatmapResponse.service_options || []);
      setStats({
        totalPoints: heatmapResponse.total_points || 0,
        totalJobs: heatmapResponse.total_jobs ?? (heatmapResponse.heatmap_data || []).reduce((sum, point) => sum + Number(point.count || 0), 0),
        maxDensity: heatmapResponse.max_density || 0,
        totalTechnicians: coverageResponse.total_technicians || 0
      });
      setError('');
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setHeatmapData([]);
      setGeographicLevels({ barangay: [], city: [], province: [], municipality: [] });
      setJobsOutsideBoundaries(0);
      setTechnicianCoverage([]);
      setServiceOptions([]);
      setStats({ totalPoints: 0, totalJobs: 0, maxDensity: 0, totalTechnicians: 0 });
      setError(error.message || 'Unable to load coverage heatmap.');
    }
    if (requestId === requestSequence.current) setLoading(false);
  };

  const resetFilters = () => {
    setSelectedClient('');
    setSelectedTechnician('');
    setSelectedServiceType('');
  };

  const getTechnicianColor = (technicianId, index) => {
    const numericId = Number(technicianId);
    const colorIndex = Number.isFinite(numericId) ? numericId % TECH_COLORS.length : index % TECH_COLORS.length;
    return TECH_COLORS[colorIndex];
  };

  return (
    <Layout>
      {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <SearchFilterBar
        className="mb-4"
        filters={[
          { key: 'client', label: 'Client locations', value: selectedClient, defaultValue: '', onChange: setSelectedClient, options: [{ value: '', label: 'All client locations' }, ...clientOptions.map((client) => ({ value: String(client.id), label: client.name }))] },
          { key: 'technician', label: 'Technician coverage', value: selectedTechnician, defaultValue: '', onChange: setSelectedTechnician, options: [{ value: '', label: 'All technicians' }, ...technicianOptions.map((technician) => ({ value: String(technician.id), label: technician.name }))] },
          { key: 'service', label: 'Service density', value: selectedServiceType, defaultValue: '', onChange: setSelectedServiceType, options: [{ value: '', label: 'All services' }, ...serviceOptions.map((service) => ({ value: String(service.id), label: service.name }))] },
        ]}
        onClear={resetFilters}
        toolbarContent={(
          // Phones: "View by" on its own row, then both layer toggles side by side.
          // From sm up everything sits in one line after the Filters button.
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <label className="col-span-2 flex h-10 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 sm:col-span-1">
              <span className="shrink-0 text-xs font-semibold text-slate-500">View by</span>
              <select
                aria-label="Geographic level"
                value={geographicLevel}
                onChange={(event) => setGeographicLevel(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none"
              >
                {Object.entries(GEOGRAPHIC_LEVELS).map(([value, config]) => (
                  <option key={value} value={value}>{config.option}</option>
                ))}
              </select>
            </label>
            <span aria-hidden="true" className="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 sm:inline">Layers</span>
            <div role="group" aria-label="Map layers" className="col-span-2 grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                aria-pressed={showServiceDensity}
                onClick={() => setShowServiceDensity((current) => !current)}
                className={`inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition sm:justify-start ${showServiceDensity ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${showServiceDensity ? 'bg-brand-500' : 'bg-slate-300'}`} />
                <span className="truncate">Service density</span>
              </button>
              <button
                type="button"
                aria-pressed={showTechnicianCoverage}
                aria-label="Technician coverage"
                onClick={() => setShowTechnicianCoverage((current) => !current)}
                className={`inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition sm:justify-start ${showTechnicianCoverage ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${showTechnicianCoverage ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="truncate sm:hidden">Technicians</span>
                <span className="hidden truncate sm:inline">Technician coverage</span>
              </button>
            </div>
          </div>
        )}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">Completed jobs</div>
          <div className="mt-1.5 text-3xl font-bold text-slate-800">{stats.totalJobs}</div>
          <div className="mt-1 text-xs text-slate-400">With a mapped service location</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">{geographicLevel === 'hotspot' ? 'Hotspots' : `Mapped ${geographicConfig.plural}`}</div>
          <div className="mt-1.5 text-3xl font-bold text-slate-800">{boundedHeatmapData.length}</div>
          <div className="mt-1 text-xs text-slate-400">{geographicLevel === 'hotspot' ? 'Areas about 1 km across' : geographicConfig.boundaryBased ? 'Placed inside official boundaries' : `Grouped by saved ${geographicConfig.singular}`}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">Busiest {geographicConfig.singular}</div>
          <div className="mt-1.5 text-3xl font-bold text-blue-600">{displayedMaxDensity}</div>
          <div className="mt-1 text-xs text-slate-400">{geographicLevel === 'hotspot' ? 'Most completed jobs in one ~1 km area' : `Most completed jobs in one ${geographicConfig.singular}`}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[13px] font-medium text-slate-500">Technicians with a location</div>
          <div className="mt-1.5 text-3xl font-bold text-emerald-600">{stats.totalTechnicians}</div>
          <div className="mt-1 text-xs text-slate-400">Shown as 10 km coverage circles</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <FiMap className="text-sky-500" />
            Coverage Map
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Showing {stats.totalJobs} completed job{stats.totalJobs === 1 ? '' : 's'} grouped into {boundedHeatmapData.length} mapped {boundedHeatmapData.length === 1 ? geographicConfig.singular : geographicConfig.plural}.
          </p>
          {showBoundaries && (
            <p className="mt-1 text-xs text-slate-500">
              Each outline is shaded by its completed jobs; gray areas have none yet.
              {jobsOutsideBoundaries > 0 && ` ${jobsOutsideBoundaries} job${jobsOutsideBoundaries === 1 ? ' is' : 's are'} outside CALABARZON and not shaded.`}
            </p>
          )}
          {showBoundaries && boundaryError && (
            <p role="alert" className="mt-1 text-xs font-medium text-amber-700">{boundaryError}</p>
          )}
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
          {loading ? (
            <div className="h-[min(68vh,720px)] min-h-[520px] p-4 lg:col-span-2">
            <PanelSkeleton rows={10} />
          </div>
        ) : (
          <div className={`coverage-map relative h-[min(68vh,720px)] min-h-[520px] ${rankedHotspots.length || (showBoundaries && selectedFeature) ? '' : 'lg:col-span-2'}`}>
            {!showServiceDensity && !showTechnicianCoverage && (
              <div role="status" className="pointer-events-none absolute inset-x-0 top-4 z-[500] mx-auto w-fit rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-800 shadow">
                Both layers are hidden. Turn on Service density or Technician coverage.
              </div>
            )}
            {showServiceDensity && (
              <div role="img" aria-label="Service density scale, lower to higher jobs per area" className="pointer-events-none absolute bottom-10 left-3 z-[500] w-40 rounded-xl border border-white/80 bg-white/95 p-2.5 shadow-lg backdrop-blur-sm sm:bottom-7 sm:left-4 sm:w-48 sm:p-3">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-800">
                  <span>Service density</span>
                  <span className="font-normal text-slate-500">{legendUnit}</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full" style={{ background: DENSITY_GRADIENT }} />
                <div className="mt-1 flex justify-between text-[11px] font-semibold text-slate-700">
                  {legendTicks.map((tick) => <span key={tick}>{tick}</span>)}
                </div>
                <div className="mt-0.5 hidden justify-between text-[10px] text-slate-500 sm:flex">
                  <span>Fewer jobs</span>
                  <span>Busiest</span>
                </div>
              </div>
            )}
            {/* Phones: the details panel sits below the map, so show a short summary that links to it. */}
            {showBoundaries && selectedFeature && (
              <div className="absolute left-14 right-3 top-3 z-[500] flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg lg:hidden">
                <div className="min-w-0 text-sm">
                  <div className="truncate font-semibold text-slate-900">
                    {selectedBarangayFeature ? `Brgy. ${selectedBarangayFeature.properties.name}` : selectedFeature.properties.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {(() => {
                      const summaryRow = selectedBarangayFeature ? selectedBarangayRow : selectedAreaRow;
                      return summaryRow ? `${summaryRow.count} completed job${summaryRow.count === 1 ? '' : 's'}` : 'No completed jobs yet';
                    })()}
                  </div>
                </div>
                <button type="button" onClick={scrollToAreaPanel} className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
                  View details
                </button>
              </div>
            )}
            <MapContainer
              center={mapCenter}
              zoom={11}
              minZoom={CALABARZON_MIN_ZOOM}
              maxBounds={CALABARZON_BOUNDS}
              maxBoundsViscosity={1.0}
              className="h-full w-full"
            >
              <MapResizeController mapCenter={mapCenter} points={mapPoints} paused={Boolean(selectedAreaPsgc)} />
              <MapTileLayer />
              {showBoundaries && (
                <>
                  <SelectedAreaZoom feature={selectedBarangayFeature || selectedFeature} points={mapPoints} />
                  <MapClickClear onClear={() => setSelectedAreaPsgc(null)} />
                </>
              )}

              {showBoundaries && showServiceDensity && boundaryShapes && (
                <GeoJSON
                  ref={boundaryLayerRef}
                  key={boundaryLayerKey}
                  data={boundaryShapes}
                  style={boundaryStyle}
                  onEachFeature={onEachBoundary}
                  attribution={BOUNDARY_ATTRIBUTION}
                />
              )}

              {/* Barangays of the selected town, drawn on top of it and shaded by their own jobs. */}
              {showBoundaries && showServiceDensity && townBarangayShapes && (
                <GeoJSON
                  ref={barangayLayerRef}
                  key={barangayLayerKey}
                  data={townBarangayShapes}
                  style={barangayStyle}
                  onEachFeature={onEachBarangay}
                />
              )}

              {/* Above the outlines, below the heat points and bubbles of the selected area. */}
              {showBoundaries && selectedFeature && (
                <AreaSpotlight
                  feature={selectedBarangayFeature || selectedFeature}
                  contextFeature={selectedBarangayFeature ? selectedFeature : null}
                />
              )}

              {/* Soft glow under real heat points only: three stacked translucent rings fade
                  outwards like a heat gradient. Barangay/province bubbles are centre-point
                  summaries, and a glow there would suggest an area. */}
              {showServiceDensity && !markersAreAggregated && densityMarkers.flatMap(({ point, color }) => (
                  [1, 0.68, 0.38].map((scale) => (
                    <CircleMarker
                      key={`glow-${scale}-${point.lat},${point.lng}`}
                      center={[point.lat, point.lng]}
                      radius={Math.round(getGlowRadius(point.count, markerMaxDensity) * scale)}
                      interactive={false}
                      pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.16 }}
                    />
                  ))
                ))}

              {showServiceDensity && densityMarkers.map(({ point, icon }) => {
                const serviceBreakdown = getServiceBreakdown(point);

                return (
                  <Marker
                    key={`heatmap-${geographicLevel}-${point.lat},${point.lng}`}
                    position={[point.lat, point.lng]}
                    icon={icon}
                    title={`${point.address || 'Mapped service area'}: ${point.count} completed job${point.count === 1 ? '' : 's'}`}
                    zIndexOffset={Number(point.count || 0) * 10}
                  >
                    <Popup>
                      <div className="min-w-[220px] text-left text-sm">
                        <strong>{markersAreAggregated ? geographicConfig.option : 'Service hotspot'}</strong>
                        <div className="mt-1 text-slate-700">{point.address || 'Mapped service area'}</div>
                        <div className="mt-2 font-semibold text-slate-900">
                          {point.count} completed service{point.count === 1 ? '' : 's'}
                        </div>
                        <div className="mt-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Services Completed Here</div>
                          <ul className="mt-1 space-y-1">
                            {serviceBreakdown.map((service) => (
                              <li key={service.name} className="flex items-center justify-between gap-3">
                                <span>{service.name}</span>
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                  {service.count}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {Array.isArray(point.status_breakdown) && point.status_breakdown.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status Mix</div>
                            <ul className="mt-1 space-y-1">
                              {point.status_breakdown.map((statusItem) => (
                                <li key={statusItem.name} className="flex items-center justify-between gap-3">
                                  <span>{statusItem.name}</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                    {statusItem.count}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="mt-2 text-xs text-slate-500">
                          Clients: {(point.clients || []).map((client) => client.name).join(', ') || 'n/a'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Technicians: {(point.technicians || []).map((tech) => tech.name).join(', ') || 'n/a'}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {showTechnicianCoverage && boundedTechnicianCoverage.map((tech, index) => {
                const color = getTechnicianColor(tech.technician_id, index);
                const popup = (
                  <Popup>
                    <div className="text-center">
                      <strong>{tech.name}</strong><br />
                      Coverage Area: {tech.radius_km} km radius
                    </div>
                  </Popup>
                );
                return (
                  <Fragment key={`coverage-${tech.technician_id ?? index}`}>
                    {/* Not clickable, so clicks reach the city outlines underneath; the pin opens the details. */}
                    <Circle
                      center={tech.center}
                      radius={tech.radius_km * 1000}
                      interactive={false}
                      pathOptions={{
                        color,
                        fillColor: color,
                        fillOpacity: 0.06,
                        weight: 1.5,
                        opacity: 0.8,
                        dashArray: '6, 6'
                      }}
                    />
                    <Marker
                      position={tech.center}
                      icon={createTechnicianIcon(tech.name, color)}
                      title={`${tech.name}: ${tech.radius_km} km coverage`}
                    >
                      {popup}
                    </Marker>
                  </Fragment>
                );
              })}
            </MapContainer>
          </div>
        )}

        {!loading && showBoundaries && selectedFeature && (
          selectedBarangayFeature ? (
            <AreaDetailsPanel
              panelRef={areaPanelRef}
              eyebrow="Barangay"
              name={selectedBarangayFeature.properties.name}
              subtitle={`${selectedFeature.properties.name}, ${selectedFeature.properties.province}`}
              backLabel={`Back to ${selectedFeature.properties.name}`}
              onBack={() => setSelectedBarangayPsgc(null)}
              row={selectedBarangayRow}
              rank={selectedBarangayRank}
              areaCount={townBarangayRows.length}
              shareOf={selectedAreaRow?.count || 0}
              shareLabel="Share of town"
              heatPoints={selectedBarangayHotspots}
              emptyText="No completed jobs in this barangay yet for the current filters."
            />
          ) : (
            <AreaDetailsPanel
              panelRef={areaPanelRef}
              eyebrow="City / municipality"
              name={selectedFeature.properties.name}
              subtitle={selectedFeature.properties.province}
              backLabel="Back to all areas"
              onBack={() => setSelectedAreaPsgc(null)}
              row={selectedAreaRow}
              rank={selectedAreaRank}
              areaCount={rankedHotspots.length}
              shareOf={stats.totalJobs}
              shareLabel="Share of all"
              heatPoints={selectedAreaHotspots}
              emptyText="No completed jobs here yet for the current filters."
            >
              <BarangayList
                rows={townBarangayRows}
                totalBarangays={townBarangayShapes?.features?.length || 0}
                unplaced={selectedAreaRow?.unplaced_barangay_jobs || 0}
                loading={!townBarangayShapes && !barangayError}
                error={barangayError}
                onSelect={setSelectedBarangayPsgc}
              />
            </AreaDetailsPanel>
          )
        )}

        {!loading && rankedHotspots.length > 0 && !(showBoundaries && selectedFeature) && (
          <section aria-labelledby="busiest-hotspots-heading" className="border-t border-slate-200 bg-slate-50/60 p-4 lg:max-h-[min(68vh,720px)] lg:min-h-[520px] lg:overflow-y-auto lg:border-l lg:border-t-0">
            <h3 id="busiest-hotspots-heading" className="text-sm font-semibold text-slate-900">Busiest {geographicConfig.plural}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Showing {Math.min(HOTSPOT_LIST_LIMIT, rankedHotspots.length)} of {rankedHotspots.length}, most completed jobs first.
              {showBoundaries && ' Select an area here or on the map to see its details.'}
            </p>
            <ol className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {rankedHotspots.slice(0, HOTSPOT_LIST_LIMIT).map((point) => {
                const content = (
                  <>
                    <span className="min-w-0 truncate font-medium text-slate-900" title={point.address || ''}>{point.address || 'Mapped service area'}</span>
                    <span className="font-semibold text-blue-700">{point.count} job{point.count === 1 ? '' : 's'}</span>
                    <span className="min-w-0 truncate text-xs text-slate-500">
                      {getServiceBreakdown(point).map((service) => `${service.name} (${service.count})`).join(', ')}
                      {(point.technicians || []).length ? ` · ${(point.technicians || []).map((tech) => tech.name).join(', ')}` : ''}
                    </span>
                  </>
                );
                const rowClass = 'grid w-full gap-1 px-3 py-2 text-left text-sm sm:grid-cols-[minmax(0,1.4fr)_6rem_minmax(0,1.6fr)] sm:items-center lg:grid-cols-1';
                return (
                  <li key={point.psgc || `${point.lat},${point.lng}`}>
                    {showBoundaries && point.psgc ? (
                      <button
                        type="button"
                        onClick={() => selectAreaFromList(point.psgc)}
                        aria-label={`Show details for ${point.address}`}
                        className={`${rowClass} transition hover:bg-white focus-visible:bg-white`}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className={rowClass}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            {boundedTechnicianCoverage.length ? boundedTechnicianCoverage.map((tech, index) => {
              const color = getTechnicianColor(tech.technician_id, index);
              return (
                <div key={tech.technician_id} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-dashed"
                    style={{ borderColor: color, backgroundColor: `${color}22` }}
                  ></div>
                  <span>{tech.name} coverage</span>
                </div>
              );
            }) : (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border-2 border-dashed border-blue-500 bg-blue-50"></div>
                <span>Technician Coverage Areas</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-900">Service Mix</div>
        {serviceSummary.length ? (
          <div className="flex flex-wrap gap-2">
            {serviceSummary.map((service) => (
              <span
                key={service.name}
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
              >
                {service.name}: {service.count}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No completed service locations are available for the selected filters.
          </p>
        )}
      </div>
    </Layout>
  );
}
