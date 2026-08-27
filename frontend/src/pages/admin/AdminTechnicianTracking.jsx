import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchTrackingData } from '../../api/api';
import {
  CALABARZON_BOUNDS,
  CALABARZON_CENTER,
  CALABARZON_MIN_ZOOM,
} from '../../utils/mapRegion';
import { formatTicketId } from '../../utils/roleIds';
import MapTileLayer from '../../components/maps/MapTileLayer';

const TECH_PIN_COLORS = ['#2563eb', '#16a34a', '#f97316', '#8b5cf6', '#0891b2', '#e11d48'];
const TECH_STATUS_RING = {
  available: '#22c55e',
  on_job: '#38bdf8',
  offline: '#94a3b8'
};

const getNameHash = (value = '') => value.split('').reduce((total, char) => total + char.charCodeAt(0), 0);

const getTechInitials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'T';

const createTechIcon = (name = '', status = 'offline') => {
  const color = TECH_PIN_COLORS[getNameHash(name) % TECH_PIN_COLORS.length];
  const statusColor = TECH_STATUS_RING[status] || TECH_STATUS_RING.offline;
  const initials = getTechInitials(name);

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:42px;height:42px;">
        <div style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:.18;box-shadow:0 0 0 8px ${color}22;"></div>
        <div style="position:absolute;inset:5px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:linear-gradient(135deg,${color},#0f172a);color:#fff;border:3px solid ${statusColor};box-shadow:0 10px 22px rgba(15,23,42,0.28);font-size:12px;font-weight:800;">
          ${initials}
        </div>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18]
  });
};

const createTicketIcon = (crewCount = 0) => {
  const hasCrew = Number(crewCount) > 1;
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:${hasCrew ? 42 : 28}px;height:30px;">
        <div style="position:absolute;left:0;top:2px;display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#f59e0b;border:4px solid #fff7ed;box-shadow:0 8px 18px rgba(217,119,6,0.32);">
          <div style="width:8px;height:8px;border-radius:9999px;background:#7c2d12;"></div>
        </div>
        ${hasCrew ? `<div style="position:absolute;right:0;top:0;min-width:24px;height:18px;border-radius:9999px;background:#0f172a;color:#fff;border:2px solid #fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px;">${crewCount}</div>` : ''}
      </div>
    `,
    iconSize: hasCrew ? [42, 30] : [28, 30],
    iconAnchor: [13, 15],
    popupAnchor: [0, -12]
  });
};

const TRACKING_REFRESH_MS = 15000;

const routeTone = {
  not_started: '#2563eb',
  in_progress: '#059669',
  on_hold: '#d97706'
};

const formatDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 'ETA unavailable';
  const minutes = Math.max(Math.round(value / 60), 1);
  return `${minutes} min ETA`;
};

const formatDistance = (meters) => {
  const value = Number(meters);
  if (!Number.isFinite(value) || value <= 0) return 'Distance unavailable';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.round(value)} m`;
};

const formatLastSeen = (value) => {
  if (!value) return 'No GPS update yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No GPS update yet';
  const minutes = Math.max(Math.floor((Date.now() - date.getTime()) / 60000), 0);
  if (minutes < 1) return 'Updated just now';
  if (minutes === 1) return 'Updated 1 min ago';
  return `Updated ${minutes} min ago`;
};

const getRouteCoords = (ticket, tech) => {
  const coordinates = ticket?.routeGeometry?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length > 1) {
    return coordinates
      .map((coord) => [Number(coord[1]), Number(coord[0])])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  }
  if (
    Number.isFinite(tech?.lat) &&
    Number.isFinite(tech?.lng) &&
    Number.isFinite(ticket?.lat) &&
    Number.isFinite(ticket?.lng)
  ) {
    return [[tech.lat, tech.lng], [ticket.lat, ticket.lng]];
  }
  return [];
};

function TrackingMapController({ onReady }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      window.clearTimeout(resizeTimer);
      onReady(null);
    };
  }, [map, onReady]);

  return null;
}

export default function AdminTechnicianTracking() {
  const [trackData, setTrackData] = useState({ techMarkers: [], ticketMarkers: [] });
  const [filterStatus, setFilterStatus] = useState('all');
  const [ticketFilter, setTicketFilter] = useState('all');
  const [mapInstance, setMapInstance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusedTarget, setFocusedTarget] = useState(null);

  const handleMapReady = useCallback((instance) => {
    setMapInstance(instance);
  }, []);

  const loadTrackingData = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) {
      setLoading(true);
    }
    setError('');

    try {
      const data = await fetchTrackingData();
      setTrackData({
        techMarkers: Array.isArray(data?.techMarkers) ? data.techMarkers : [],
        ticketMarkers: Array.isArray(data?.ticketMarkers) ? data.ticketMarkers : []
      });
    } catch (loadError) {
      setTrackData({ techMarkers: [], ticketMarkers: [] });
      setError('Live tracking data is unavailable. Please check the backend /tracking endpoint.');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadTrackingData({ showLoading: true });
    const refreshTimer = window.setInterval(() => loadTrackingData(), TRACKING_REFRESH_MS);

    return () => window.clearInterval(refreshTimer);
  }, [loadTrackingData]);

  const filteredTechs = trackData.techMarkers.filter(
    (tech) => filterStatus === 'all' || tech.status === filterStatus
  );
  const openTickets = trackData.ticketMarkers
    .filter((ticket) => ticket.status !== 'completed')
    .filter((ticket) => ticketFilter === 'all' || ticket.status === 'in_progress');
  const hasCoords = (target) =>
    Number.isFinite(target?.lat) &&
    Number.isFinite(target?.lng) &&
    CALABARZON_BOUNDS.contains([target.lat, target.lng]);
  const techsWithCoords = filteredTechs.filter(hasCoords);
  const ticketsWithCoords = openTickets.filter(hasCoords);
  const techById = useMemo(
    () => new Map(techsWithCoords.map((tech) => [Number(tech.id), tech])),
    [techsWithCoords]
  );
  const activeRouteGroups = useMemo(
    () => ticketsWithCoords
      .map((ticket) => {
        const assignedTechs = (ticket.crewMembers || [])
          .map((member) => techById.get(Number(member.id)))
          .filter(Boolean);
        if (!assignedTechs.length && ticket.technicianId && techById.has(Number(ticket.technicianId))) {
          assignedTechs.push(techById.get(Number(ticket.technicianId)));
        }
        return {
          id: ticket.id,
          ticket,
          assignedTechs,
          crewCount: Number(ticket.crewCount || assignedTechs.length || 0),
          color: routeTone[ticket.status] || '#2563eb'
        };
      })
      .filter((group) => group.assignedTechs.length > 0),
    [ticketsWithCoords, techById]
  );
  const routeLines = useMemo(
    () => activeRouteGroups.flatMap((group) =>
      group.assignedTechs
        .map((tech) => ({
          id: `${group.ticket.id}-${tech.id}`,
          ticket: group.ticket,
          tech,
          coords: getRouteCoords(group.ticket, tech),
          color: group.color
        }))
        .filter((route) => route.coords.length > 1)
    ),
    [activeRouteGroups]
  );
  const techsWithoutCoords = filteredTechs.length - techsWithCoords.length;
  const onlineTechsWithCoords = techsWithCoords.filter((tech) => tech.status !== 'offline');
  const ticketsWithoutCoords = openTickets.length - ticketsWithCoords.length;
  const mapPoints = useMemo(
    () => [
      ...techsWithCoords.map((tech) => [tech.lat, tech.lng]),
      ...ticketsWithCoords.map((ticket) => [ticket.lat, ticket.lng])
    ],
    [techsWithCoords, ticketsWithCoords]
  );

  useEffect(() => {
    if (!mapInstance) return;

    mapInstance.setMaxBounds(CALABARZON_BOUNDS);
    mapInstance.options.maxBoundsViscosity = 1.0;
    mapInstance.setMinZoom(CALABARZON_MIN_ZOOM);

    if (focusedTarget) {
      return;
    }

    if (mapPoints.length > 0) {
      if (mapPoints.length > 1) {
        mapInstance.fitBounds(L.latLngBounds(mapPoints), { padding: [32, 32], maxZoom: 13 });
        return;
      }

      if (mapPoints.length === 1) {
        mapInstance.setView(mapPoints[0], 12);
        return;
      }
    }

    mapInstance.setView(CALABARZON_CENTER, CALABARZON_MIN_ZOOM);
  }, [mapInstance, mapPoints, focusedTarget]);

  const focusLocation = (target) => {
    if (!target || !hasCoords(target) || !mapInstance) {
      return;
    }

    setFocusedTarget(target);
    mapInstance.flyTo([target.lat, target.lng], target.zoom || 16, { duration: 1.2 });
  };

  const clearFocus = () => {
    setFocusedTarget(null);
    if (!mapInstance) return;

    if (mapPoints.length > 1) {
      mapInstance.fitBounds(L.latLngBounds(mapPoints), { padding: [32, 32], maxZoom: 13 });
    } else if (mapPoints.length === 1) {
      mapInstance.setView(mapPoints[0], 12);
    } else {
      mapInstance.setView(CALABARZON_CENTER, CALABARZON_MIN_ZOOM);
    }
  };

  return (
    <Layout>
      <section className="mb-3 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(14rem,1fr)_auto]">
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <label className="min-w-[12rem] text-xs font-semibold uppercase tracking-wide text-slate-500">
              Technician Status
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                disabled={loading}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="all">All Technicians</option>
                <option value="available">Available</option>
                <option value="on_job">Currently Assigned</option>
                <option value="offline">Offline / No Recent GPS</option>
              </select>
            </label>
            <label className="min-w-[14rem] text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ticket Display
              <select
                value={ticketFilter}
                onChange={(e) => setTicketFilter(e.target.value)}
                disabled={loading}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="all">All Active Tickets</option>
                <option value="in_progress">Only Started Jobs</option>
              </select>
            </label>
            {focusedTarget ? (
              <button
                onClick={clearFocus}
                className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                Show all markers
              </button>
            ) : null}
            {focusedTarget ? (
              <span className="truncate rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                Focused: <strong>{focusedTarget.label}</strong>
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-2 sm:min-w-[34rem]">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Visible</div>
              <div className="text-lg font-bold text-slate-900">{filteredTechs.length}/{trackData.techMarkers.length}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Online</div>
              <div className="text-lg font-bold text-emerald-700">{onlineTechsWithCoords.length}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Routes</div>
              <div className="text-lg font-bold text-blue-700">{activeRouteGroups.length}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">No GPS</div>
              <div className="text-lg font-bold text-amber-600">{techsWithoutCoords + ticketsWithoutCoords}</div>
            </div>
          </div>
        </div>
      </section>

      {loading && (
        <div className="mb-4">
          <PanelSkeleton rows={3} />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Technician Tracking</h2>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Available</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" />On job</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />Offline</span>
          </div>
        </div>
        <div className="map-wrapper relative h-[66vh] min-h-[540px] shadow-none">
          <MapContainer
            center={CALABARZON_CENTER}
            zoom={CALABARZON_MIN_ZOOM}
            minZoom={CALABARZON_MIN_ZOOM}
            maxBounds={CALABARZON_BOUNDS}
            maxBoundsViscosity={1.0}
            scrollWheelZoom={true}
            className="h-full w-full"
          >
            <TrackingMapController onReady={handleMapReady} />
            <MapTileLayer />

            {routeLines.map((route) => (
              <Polyline
                key={`route-${route.id}`}
                positions={route.coords}
                color={route.color}
                weight={5}
                opacity={0.75}
              />
            ))}

            {techsWithCoords.map((tech) => (
              <Marker key={`tech-${tech.id}`} position={[tech.lat, tech.lng]} icon={createTechIcon(tech.name, tech.status)}>
                <Popup>
                  <div className="text-sm">
                    <strong>{tech.name}</strong>
                    <br />
                    Status: {tech.status}
                    <br />
                    Coordinates: {tech.lat.toFixed(6)}, {tech.lng.toFixed(6)}
                    <br />
                    {formatLastSeen(tech.lastLocationUpdate)}
                  </div>
                </Popup>
              </Marker>
            ))}

            {ticketsWithCoords.map((ticket) => (
              <Marker key={`ticket-${ticket.id}`} position={[ticket.lat, ticket.lng]} icon={createTicketIcon(ticket.crewCount)}>
                <Popup>
                  <div className="text-sm">
                    <strong>{formatTicketId(ticket.id)}</strong>
                    <br />
                    {ticket.client} / {ticket.service}
                    <br />
                    {ticket.locationDesc || 'No landmark provided'}
                  {ticket.technicianName && (
                    <>
                      <br />
                      Lead: {ticket.leadTechnician || ticket.technicianName}
                    </>
                  )}
                  {Array.isArray(ticket.crewMembers) && ticket.crewMembers.length > 1 && (
                    <>
                      <br />
                      Crew: {ticket.crewMembers.map((member) => member.name).join(', ')}
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
            ))}
          </MapContainer>
          <div className="absolute left-4 top-4 rounded-lg border bg-white/90 px-3 py-2 text-sm shadow-lg backdrop-blur">
            <div className="font-medium text-slate-900">Live tracking</div>
            <div className="text-slate-600">{filteredTechs.length}/{trackData.techMarkers.length} technicians visible</div>
            <div className="text-slate-600">{activeRouteGroups.length} job site{activeRouteGroups.length === 1 ? '' : 's'} active</div>
          </div>
        </div>
      </div>

      {activeRouteGroups.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-base font-semibold text-slate-900">Active Job Sites</h3>
          </div>
          <div className="hidden grid-cols-[minmax(14rem,1.3fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_5.5rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Destination</span>
            <span>Crew</span>
            <span>Route</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-slate-200">
            {activeRouteGroups.map(({ ticket, assignedTechs, crewCount }) => {
              const leadName = ticket.leadTechnician || ticket.technicianName || assignedTechs[0]?.name || 'Unassigned';
              return (
                <div
                  key={`active-route-${ticket.id}`}
                  className="grid gap-3 px-4 py-3 text-sm transition hover:bg-blue-50/60 md:grid-cols-[minmax(14rem,1.3fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_5.5rem] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{formatTicketId(ticket.id)} | {ticket.service}</div>
                    <div className="truncate text-xs text-slate-500">{ticket.client}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-slate-700">Lead: {leadName}</div>
                    <div className="truncate text-xs text-slate-500">
                      {crewCount || assignedTechs.length} tech{(crewCount || assignedTechs.length) === 1 ? '' : 's'} | {assignedTechs.map((tech) => tech.name).join(', ')}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">{formatDistance(ticket.routeDistance)}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">{formatDuration(ticket.routeDuration)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      focusLocation({
                        kind: 'ticket',
                        id: ticket.id,
                        label: formatTicketId(ticket.id),
                        lat: ticket.lat,
                        lng: ticket.lng,
                        zoom: 14
                      })
                    }
                    className="h-8 rounded border border-blue-200 bg-white px-2 text-xs font-semibold text-blue-700 hover:border-blue-400 hover:bg-blue-50 md:justify-self-end"
                  >
                    Center
                  </button>
                </div>
            );})}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-base font-semibold text-slate-900">Technicians</h3>
          {filteredTechs.length ? (
            <ul className="space-y-1.5 text-sm">
              {filteredTechs.map((tech) => {
                const isFocused = focusedTarget?.kind === 'tech' && focusedTarget.id === tech.id;
                const techHasCoords = hasCoords(tech);
                return (
                  <li
                    key={tech.id}
                    className={`rounded-lg border px-3 py-2 ${isFocused ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">{tech.name}</div>
                        <div className="text-xs text-slate-500">{tech.status} | {formatLastSeen(tech.lastLocationUpdate)}</div>
                      </div>
                      <button
                        onClick={() =>
                          focusLocation({
                            kind: 'tech',
                            id: tech.id,
                            label: tech.name,
                            lat: tech.lat,
                            lng: tech.lng,
                            zoom: 16
                          })
                        }
                        disabled={!techHasCoords}
                        title={techHasCoords ? `Center the map on ${tech.name}` : `${tech.name} has no live coordinates yet`}
                        className={`shrink-0 rounded px-2 py-1 text-xs font-semibold text-white ${
                          isFocused ? 'bg-blue-800' : 'bg-blue-600'
                        } disabled:cursor-not-allowed disabled:bg-slate-300`}
                      >
                        {techHasCoords ? (isFocused ? 'Centered' : 'Center') : 'No GPS'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No technicians found with the selected status.</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
