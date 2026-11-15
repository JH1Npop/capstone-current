import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiClock, FiExternalLink, FiMail, FiMapPin, FiPhone, FiRefreshCw, FiWifi, FiWifiOff, FiX } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { Circle, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchTechnicianLocationHistory, fetchTrackingData } from '../../api/api';
import { resolveServiceRegion } from '../../utils/mapRegion';
import { formatTicketId } from '../../utils/roleIds';
import MapTileLayer from '../../components/maps/MapTileLayer';
import SearchFilterBar from '../../components/shared/SearchFilterBar';
import UserAvatar from '../../components/shared/UserAvatar';
import useEscapeKey from '../../hooks/useEscapeKey';
import { startVisibleInterval } from '../../utils/visibleInterval';
import { getRouteProgress } from '../../utils/routeProgress';

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

const keepFocusInsideDialog = (event) => {
  if (event.key !== 'Tab') return;
  const focusable = event.currentTarget.querySelectorAll(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

// Only plain http(s) or same-site photo URLs go into the pin's CSS; anything else falls back to initials.
const safeImageUrl = (value = '') => {
  const url = String(value || '').trim();
  return /^(https?:\/\/|\/)[^\s"'()\\<>]+$/.test(url) ? url : '';
};

const createTechIcon = (name = '', status = 'offline', movementState = 'unknown', imageUrl = '') => {
  const color = TECH_PIN_COLORS[getNameHash(name) % TECH_PIN_COLORS.length];
  const statusColor = TECH_STATUS_RING[status] || TECH_STATUS_RING.offline;
  const initials = escapeHtml(getTechInitials(name));
  const photo = safeImageUrl(imageUrl);
  // The photo sits over the initials as a background, so a photo that fails to load shows the initials.
  const photoLayer = photo
    ? `<span style="position:absolute;inset:0;border-radius:9999px;background:url('${photo}') center/cover no-repeat;"></span>`
    : '';

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:42px;height:42px;">
        <div class="${movementState === 'moving' ? 'tracking-tech-moving-pulse' : ''}" style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:.18;box-shadow:0 0 0 8px ${color}22;"></div>
        <div style="position:absolute;inset:5px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:linear-gradient(135deg,${color},#0f172a);color:#fff;border:3px solid ${statusColor};box-shadow:0 10px 22px rgba(15,23,42,0.28);font-size:12px;font-weight:800;overflow:hidden;">
          ${initials}${photoLayer}
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
// Matches ROUGH_ACCURACY_METERS in backend/services/location_quality.py.
const ROUGH_ACCURACY_METERS = 100;
const ACCURACY_CIRCLE_STYLES = {
  precise: { color: '#2563eb', weight: 1, opacity: 0.6, fillColor: '#3b82f6', fillOpacity: 0.12 },
  rough: { color: '#d97706', weight: 1.5, opacity: 0.8, fillColor: '#f59e0b', fillOpacity: 0.12, dashArray: '6 4' },
  stale: { color: '#64748b', weight: 1, opacity: 0.6, fillColor: '#94a3b8', fillOpacity: 0.08, dashArray: '3 5' },
};
const getAccuracyTone = (tech) => {
  if (tech.gpsState !== 'fresh') return 'stale';
  return Number(tech.gpsAccuracy) > ROUGH_ACCURACY_METERS ? 'rough' : 'precise';
};

// Field work has started once the technician sets off: en route, on site, or working.
const STARTED_TICKET_STATUSES = new Set(['navigating', 'arrived_on_site', 'in_progress']);

const routeTone = {
  not_started: '#2563eb',
  navigating: '#0891b2',
  arrived_on_site: '#059669',
  in_progress: '#059669',
  on_hold: '#d97706'
};

const ticketStatusPresentation = {
  not_started: { label: 'Not started', className: 'border-slate-200 bg-slate-100 text-slate-700' },
  navigating: { label: 'En route', className: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  arrived_on_site: { label: 'On site', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  in_progress: { label: 'In progress', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  on_hold: { label: 'On hold', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

const getTicketStatusPresentation = (status) => ticketStatusPresentation[status] || {
  label: String(status || 'Active').replaceAll('_', ' '),
  className: 'border-blue-200 bg-blue-50 text-blue-700',
};

const formatDistance = (meters) => {
  const value = Number(meters);
  if (!Number.isFinite(value) || value <= 0) return 'Distance unavailable';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.round(value)} m`;
};

const getDirectDistanceMeters = (origin, destination) => {
  if (![origin?.lat, origin?.lng, destination?.lat, destination?.lng].every(Number.isFinite)) return null;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(destination.lat - origin.lat);
  const longitudeDelta = toRadians(destination.lng - origin.lng);
  const originLatitude = toRadians(origin.lat);
  const destinationLatitude = toRadians(destination.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const formatMovement = (technician) => {
  if (technician?.movementState === 'moving') {
    const speed = Number(technician.movementSpeedKph);
    return Number.isFinite(speed) && speed > 0 ? `Moving · ${speed.toFixed(1)} km/h` : 'Moving';
  }
  if (technician?.movementState === 'stationary') return 'Stationary';
  return 'Movement unknown';
};

const formatLastSeen = (value) => {
  if (!value) return 'No GPS update yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No GPS update yet';
  const minutes = Math.max(Math.floor((Date.now() - date.getTime()) / 60000), 0);
  if (minutes < 1) return 'Updated just now';
  if (minutes === 1) return 'Updated 1 min ago';
  if (minutes < 60) return `Updated ${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'Updated 1 hour ago';
  if (hours < 24) return `Updated ${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Updated 1 day ago';
  if (days < 7) return `Updated ${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'Updated 1 week ago';
  if (weeks < 5) return `Updated ${weeks} weeks ago`;

  const months = Math.floor(days / 30);
  if (months === 1) return 'Updated 1 month ago';
  if (months < 12) return `Updated ${months} months ago`;

  const years = Math.floor(days / 365);
  return `Updated ${years} year${years === 1 ? '' : 's'} ago`;
};

const formatRemainingEta = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 'ETA unavailable';
  return `about ${Math.max(Math.round(value / 60), 1)} min left`;
};

// "Updated just now · 2:15 AM" (time only for today, otherwise the date too).
const formatLastUpdate = (value) => {
  if (!value) return 'Never received';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const sameDay = date.toDateString() === new Date().toDateString();
  const clock = sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${formatLastSeen(value)} · ${clock}`;
};

const formatRerouted = (progress) => {
  if (progress?.rerouteReason !== 'off_route' || !progress.reroutedAt) return '';
  return formatLastSeen(progress.reroutedAt).replace('Updated', 'Rerouted');
};

const formatTimestamp = (value) => {
  if (!value) return 'Never received';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const formatJobSchedule = (job) => {
  if (!job?.scheduledDate) return 'Schedule not set';
  const dateTime = new Date(`${job.scheduledDate}T${job.scheduledTime || '00:00:00'}`);
  if (Number.isNaN(dateTime.getTime())) return job.scheduledDate;
  return dateTime.toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    ...(job.scheduledTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
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
  const [trackData, setTrackData] = useState({ techMarkers: [], ticketMarkers: [], trackingConfig: null });
  const [filterStatus, setFilterStatus] = useState('all');
  const [gpsFilter, setGpsFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [ticketFilter, setTicketFilter] = useState('all');
  const [mapInstance, setMapInstance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [focusedTarget, setFocusedTarget] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedTechId, setSelectedTechId] = useState(null);
  const [locationTrail, setLocationTrail] = useState([]);
  const [trailLoading, setTrailLoading] = useState(false);
  const [trailError, setTrailError] = useState('');
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting');
  const requestSequence = useRef(0);
  const detailsTriggerRef = useRef(null);
  const detailsCloseButtonRef = useRef(null);

  const openTechnicianDetails = useCallback((technicianId, trigger = null) => {
    detailsTriggerRef.current = trigger || document.activeElement;
    setSelectedTechId(technicianId);
  }, []);

  const closeTechnicianDetails = useCallback(() => {
    setSelectedTechId(null);
    window.requestAnimationFrame(() => detailsTriggerRef.current?.focus?.());
  }, []);

  const handleMapReady = useCallback((instance) => {
    setMapInstance(instance);
  }, []);

  const loadTrackingData = useCallback(async ({ showLoading = false, manual = false } = {}) => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    if (showLoading) {
      setLoading(true);
    }
    if (manual) setRefreshing(true);

    try {
      const data = await fetchTrackingData();
      if (requestId !== requestSequence.current) return;
      setTrackData((current) => ({
        techMarkers: Array.isArray(data?.techMarkers) ? data.techMarkers : [],
        ticketMarkers: Array.isArray(data?.ticketMarkers) ? data.ticketMarkers : [],
        trackingConfig: data?.trackingConfig || current.trackingConfig,
      }));
      setLastSuccessfulSync(data?.generatedAt ? new Date(data.generatedAt) : new Date());
      setConnectionState('live');
      setError('');
    } catch (loadError) {
      if (requestId !== requestSequence.current) return;
      setConnectionState('delayed');
      setError('Live refresh failed. Last known locations remain visible while the system retries.');
    } finally {
      if (manual) setRefreshing(false);
      if (requestId !== requestSequence.current) return;
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadTrackingData({ showLoading: true });
    return startVisibleInterval(() => loadTrackingData(), TRACKING_REFRESH_MS);
  }, [loadTrackingData]);

  const trackingRegion = useMemo(
    () => resolveServiceRegion(trackData.trackingConfig?.region),
    [trackData.trackingConfig?.region]
  );
  const trackingPolicy = trackData.trackingConfig?.policy || {};
  const trailMinutes = Number(trackingPolicy.recentTrailMinutes) || 60;

  const normalizedSearch = search.trim().toLowerCase();
  const filteredTechs = trackData.techMarkers
    .filter((tech) => filterStatus === 'all' || tech.status === filterStatus)
    .filter((tech) => gpsFilter === 'all' || tech.gpsState === gpsFilter)
    .filter((tech) => !normalizedSearch || [tech.name, tech.email, tech.phone, ...(tech.activeJobs || []).flatMap((job) => [job.service, job.client, job.id, formatTicketId(job.id)])]
      .some((value) => String(value || '').toLowerCase().includes(normalizedSearch)));
  const openTickets = trackData.ticketMarkers
    .filter((ticket) => ticket.status !== 'completed')
    .filter((ticket) => ticketFilter === 'all' || STARTED_TICKET_STATUSES.has(ticket.status));
  const hasCoords = (target) =>
    Number.isFinite(target?.lat) &&
    Number.isFinite(target?.lng) &&
    trackingRegion.bounds.contains([target.lat, target.lng]);
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
  const ticketById = useMemo(
    () => new Map(trackData.ticketMarkers.map((ticket) => [Number(ticket.id), ticket])),
    [trackData.ticketMarkers]
  );
  const routeLines = useMemo(
    () => activeRouteGroups.flatMap((group) =>
      group.assignedTechs
        .map((tech) => {
          // The saved route is the lead's; crew members are measured against it too.
          const isLead = !group.ticket.technicianId || Number(group.ticket.technicianId) === Number(tech.id);
          const progress = getRouteProgress(group.ticket, tech, { isLead });
          return {
            id: `${group.ticket.id}-${tech.id}`,
            ticket: group.ticket,
            tech,
            coords: progress.coords,
            isFallback: progress.isFallback,
            progress,
            color: group.color
          };
        })
        .filter((route) => route.coords.length > 1)
    ),
    [activeRouteGroups]
  );
  const ticketsWithoutCoords = openTickets.length - ticketsWithCoords.length;
  const onlineTechnicians = trackData.techMarkers.filter((tech) => tech.gpsState === 'fresh').length;
  const techniciansOnJobs = trackData.techMarkers.filter((tech) => tech.status === 'on_job').length;
  const gpsAttentionCount = trackData.techMarkers.filter((tech) => tech.gpsState !== 'fresh').length;
  const selectedTech = trackData.techMarkers.find((tech) => Number(tech.id) === Number(selectedTechId)) || null;
  const trailCoords = locationTrail
    .map((point) => [point.lat, point.lng])
    .filter(([lat, lng]) => trackingRegion.bounds.contains([lat, lng]));
  const mapPoints = useMemo(
    () => [
      ...techsWithCoords.map((tech) => [tech.lat, tech.lng]),
      ...ticketsWithCoords.map((ticket) => [ticket.lat, ticket.lng])
    ],
    [techsWithCoords, ticketsWithCoords]
  );

  useEscapeKey(Boolean(selectedTech), closeTechnicianDetails);

  useEffect(() => {
    if (!selectedTech) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => detailsCloseButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedTech]);

  // Whose recent trail is drawn: the technician in the details window, otherwise the one the
  // map is centered on (the details window covers the map, so centering is how you see it).
  const trailTechId = selectedTechId || (focusedTarget?.kind === 'tech' ? focusedTarget.id : null);
  const trailTech = trackData.techMarkers.find((tech) => Number(tech.id) === Number(trailTechId)) || null;
  // Reload the trail with every live refresh, so it grows while the technician drives.
  const trailRefreshKey = lastSuccessfulSync ? lastSuccessfulSync.getTime() : 0;
  const trailLoadedForRef = useRef(null);

  useEffect(() => {
    if (!trailTechId) {
      setLocationTrail([]);
      setTrailError('');
      return undefined;
    }

    let active = true;
    // "Loading" only when switching technicians, not on every 15-second refresh.
    if (trailLoadedForRef.current !== trailTechId) setTrailLoading(true);
    trailLoadedForRef.current = trailTechId;
    setTrailError('');
    fetchTechnicianLocationHistory(trailTechId, { minutes: trailMinutes })
      .then((rows) => {
        if (active) setLocationTrail(rows.slice().reverse());
      })
      .catch(() => {
        if (active) {
          setLocationTrail([]);
          setTrailError('Recent movement history is unavailable.');
        }
      })
      .finally(() => {
        if (active) setTrailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [trailTechId, trailMinutes, trailRefreshKey]);

  useEffect(() => {
    if (!mapInstance) return;

    mapInstance.setMaxBounds(trackingRegion.bounds);
    mapInstance.options.maxBoundsViscosity = 1.0;
    mapInstance.setMinZoom(trackingRegion.minZoom);

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

    mapInstance.setView(trackingRegion.center, trackingRegion.minZoom);
  }, [mapInstance, mapPoints, focusedTarget, trackingRegion]);

  const focusLocation = (target) => {
    if (!target || !hasCoords(target) || !mapInstance) {
      return;
    }

    setFocusedTarget(target);
    mapInstance.flyTo([target.lat, target.lng], target.zoom || 16, { duration: 1.2 });
  };

  const clearFocus = () => {
    setFocusedTarget(null);
    setSelectedRouteId(null);
    if (!mapInstance) return;

    if (mapPoints.length > 1) {
      mapInstance.fitBounds(L.latLngBounds(mapPoints), { padding: [32, 32], maxZoom: 13 });
    } else if (mapPoints.length === 1) {
      mapInstance.setView(mapPoints[0], 12);
    } else {
      mapInstance.setView(trackingRegion.center, trackingRegion.minZoom);
    }
  };

  return (
    <Layout>
      <SearchFilterBar
        className="mb-3"
        searchValue={search}
        onSearchChange={setSearch}
        searchLabel="Find technician or job"
        searchPlaceholder="Name, client, service, or ticket ID"
        disabled={loading}
        filters={[
          {
            key: 'technician-status', label: 'Technician Status', value: filterStatus, defaultValue: 'all', onChange: setFilterStatus,
            options: [
              { value: 'all', label: 'All Technicians' },
              { value: 'available', label: 'Available' },
              { value: 'on_job', label: 'Currently Assigned' },
              { value: 'offline', label: 'Offline / No Recent GPS' },
            ],
          },
          {
            key: 'gps-health', label: 'GPS Health', value: gpsFilter, defaultValue: 'all', onChange: setGpsFilter,
            options: [
              { value: 'all', label: 'All GPS states' },
              { value: 'fresh', label: 'Fresh location' },
              { value: 'stale', label: 'Stale location' },
              { value: 'missing', label: 'Missing coordinates' },
            ],
          },
          {
            key: 'ticket-display', label: 'Ticket Display', value: ticketFilter, defaultValue: 'all', onChange: setTicketFilter,
            options: [
              { value: 'all', label: 'All Active Tickets' },
              { value: 'in_progress', label: 'Only Started Jobs (en route, on site, in progress)' },
            ],
          },
        ]}
        onClear={() => {
          setSearch('');
          setFilterStatus('all');
          setGpsFilter('all');
          setTicketFilter('all');
        }}
        toolbarContent={(
          <>
            <button
              type="button"
              onClick={() => loadTrackingData({ manual: true })}
              disabled={loading || refreshing}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            {focusedTarget ? (
              <button
                type="button"
                onClick={clearFocus}
                className="h-11 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                Show all markers
              </button>
            ) : null}
            {focusedTarget ? (
              <span className="truncate rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                Focused: <strong>{focusedTarget.label}</strong>
              </span>
            ) : null}
          </>
        )}
      />

      <section className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600" role="status" aria-live="polite">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-slate-800">
                {connectionState === 'live' ? <FiWifi className="text-emerald-600" /> : <FiWifiOff className="text-amber-600" />}
                {connectionState === 'live' ? 'Live' : connectionState === 'delayed' ? 'Delayed' : 'Connecting'}
              </span>
              <span className="whitespace-nowrap">{lastSuccessfulSync ? `Synced ${formatLastSeen(lastSuccessfulSync).replace('Updated ', '')}` : 'Waiting for first update'}</span>
              <span className="whitespace-nowrap">Auto-refresh: 15 seconds</span>
              <span className="whitespace-nowrap">{filteredTechs.length}/{trackData.techMarkers.length} shown</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 lg:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Online technicians</div>
              <div className="text-lg font-bold text-emerald-700">{onlineTechnicians}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">On active jobs</div>
              <div className="text-lg font-bold text-blue-700">{techniciansOnJobs}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">GPS attention</div>
              <div className="text-lg font-bold text-amber-600">{gpsAttentionCount}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job sites missing coordinates</div>
              <div className="text-lg font-bold text-rose-600">{ticketsWithoutCoords}</div>
            </div>
          </div>
      </section>

      {loading && (
        <div className="mb-4">
          <PanelSkeleton rows={3} />
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Live Field Map</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {trackingRegion.name} · history retained up to {trackingPolicy.retentionDays || 30} days
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Available</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" />On job</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />Offline</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0 w-5 border-t-[3px] border-solid border-sky-600" />Road route</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-amber-600" />Direct line / off route</span>
          </div>
        </div>
        <div className={`map-wrapper relative shadow-none ${mapPoints.length ? 'h-[62vh] min-h-[500px]' : 'h-[360px] min-h-[360px]'}`}>
          <MapContainer
            center={trackingRegion.center}
            zoom={trackingRegion.minZoom}
            minZoom={trackingRegion.minZoom}
            maxBounds={trackingRegion.bounds}
            maxBoundsViscosity={1.0}
            scrollWheelZoom={true}
            className="h-full w-full"
          >
            <TrackingMapController onReady={handleMapReady} />
            <MapTileLayer />

            {routeLines.map((route) => {
              const isHighlighted = selectedRouteId === route.id;
              const directDistance = getDirectDistanceMeters(route.tech, route.ticket);
              return (
                <Polyline
                  key={`route-${route.id}`}
                  positions={route.coords}
                  color={route.color}
                  weight={isHighlighted ? 8 : 5}
                  opacity={selectedRouteId ? (isHighlighted ? 0.95 : 0.22) : 0.75}
                  dashArray={route.isFallback ? '10 10' : undefined}
                  eventHandlers={{
                    click: () => {
                      setSelectedRouteId(route.id);
                    },
                  }}
                >
                  <Popup minWidth={220} maxWidth={250}>
                    <div className="w-[220px] text-xs text-slate-700">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Selected route</p>
                      <p className="mt-1 font-bold text-slate-950">{route.tech.name}</p>
                      <p className="mt-0.5 truncate" title={`${route.ticket.client} · ${route.ticket.service}`}>
                        To {route.ticket.client} · {route.ticket.service}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                        <div>
                          <p className="text-xs uppercase text-slate-400">Live direct</p>
                          <p className="font-semibold text-slate-900">{formatDistance(directDistance)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-slate-400">Road left</p>
                          <p className="font-semibold text-slate-900">{route.isFallback ? 'Unavailable' : formatDistance(route.progress.remainingMeters)}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-slate-500">
                        {route.progress.offRoute
                          ? 'Off the planned route. A new route is calculated from the next location update.'
                          : route.progress.separate
                            ? "Travelling separately from the lead's route. Dashed line is a direct connection."
                            : route.isFallback ? 'Dashed line is a direct connection.' : formatRemainingEta(route.progress.remainingSeconds)}
                      </p>
                      {formatRerouted(route.progress) ? <p className="mt-1 font-semibold text-blue-700">{formatRerouted(route.progress)}</p> : null}
                      <button
                        type="button"
                        onClick={(event) => openTechnicianDetails(route.tech.id, event.currentTarget)}
                        className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        View technician details
                      </button>
                    </div>
                  </Popup>
                </Polyline>
              );
            })}

            {trailCoords.length > 1 ? (
              <Polyline positions={trailCoords} color="#7c3aed" weight={4} opacity={0.75} dashArray="4 8" />
            ) : null}

            {techsWithCoords.map((tech) => {
              const activeJobDistances = (tech.activeJobs || [])
                .map((job) => getDirectDistanceMeters(tech, job))
                .filter(Number.isFinite);
              const nearestJobDistance = activeJobDistances.length ? Math.min(...activeJobDistances) : null;
              const accuracyMeters = Number(tech.gpsAccuracy) || 0;
              const accuracyTone = getAccuracyTone(tech);
              return (
                <Fragment key={`tech-${tech.id}`}>
                {/* How far off the position may be: the technician is somewhere inside this circle. */}
                {accuracyMeters > 0 ? (
                  <Circle
                    center={[tech.lat, tech.lng]}
                    radius={accuracyMeters}
                    interactive={false}
                    className="tech-accuracy-circle"
                    pathOptions={ACCURACY_CIRCLE_STYLES[accuracyTone]}
                  />
                ) : null}
                <Marker
                  position={[tech.lat, tech.lng]}
                  icon={createTechIcon(tech.name, tech.status, tech.movementState, tech.profileImageUrl)}
                >
                  <Popup minWidth={210} maxWidth={240}>
                    <div className="w-[210px] text-xs text-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <UserAvatar name={tech.name} imageUrl={tech.profileImageUrl} fallback="T" className="h-8 w-8 rounded-full bg-slate-700 text-[11px] font-bold text-white" />
                          <strong className="truncate text-sm text-slate-950">{tech.name}</strong>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tech.movementState === 'moving' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {formatMovement(tech)}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                        <p>{formatLastSeen(tech.lastLocationUpdate)}</p>
                        <p>{nearestJobDistance == null ? 'No active job distance' : `${formatDistance(nearestJobDistance)} direct to nearest job`}</p>
                        <p>GPS accuracy: {accuracyMeters > 0 ? `±${Math.round(accuracyMeters)} m` : 'Unavailable'}</p>
                        {accuracyTone === 'rough' ? (
                          <p className="font-semibold text-amber-700">Rough position: GPS has not locked, so the technician may be anywhere in the amber circle.</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={(event) => openTechnicianDetails(tech.id, event.currentTarget)}
                        className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        View details
                      </button>
                    </div>
                  </Popup>
                </Marker>
                </Fragment>
              );
            })}

            {ticketsWithCoords.map((ticket) => {
              const statusPresentation = getTicketStatusPresentation(ticket.status);

              return (
                <Marker key={`ticket-${ticket.id}`} position={[ticket.lat, ticket.lng]} icon={createTicketIcon(ticket.crewCount)}>
                  <Popup minWidth={225} maxWidth={240}>
                    <article className="w-[225px] max-w-full overflow-hidden text-xs text-slate-700">
                      <header className="pb-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-slate-950">{formatTicketId(ticket.id)}</h3>
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-xs font-bold ${statusPresentation.className}`}>
                            {statusPresentation.label}
                          </span>
                        </div>
                      </header>

                      <dl className="space-y-1.5 border-t border-slate-200 pt-1.5 text-xs">
                        <div className="flex min-w-0 gap-2">
                          <dt className="w-10 shrink-0 text-slate-400">Client</dt>
                          <dd className="truncate font-semibold text-slate-900" title={ticket.client}>{ticket.client}</dd>
                        </div>
                        <div className="flex min-w-0 gap-2">
                          <dt className="w-10 shrink-0 text-slate-400">Work</dt>
                          <dd className="truncate font-medium text-slate-800" title={ticket.service}>{ticket.service}</dd>
                        </div>
                        <div className="flex min-w-0 gap-2">
                          <dt className="w-10 shrink-0 text-slate-400">Site</dt>
                          <dd className="truncate" title={ticket.locationDesc || ''}>{ticket.locationDesc || 'No address provided'}</dd>
                        </div>
                        <div className="flex min-w-0 gap-2">
                          <dt className="w-10 shrink-0 text-slate-400">When</dt>
                          <dd className="truncate">{formatJobSchedule(ticket)}</dd>
                        </div>
                      </dl>
                    </article>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
          <div className="pointer-events-none absolute left-14 top-3 z-[500] rounded-lg border bg-white/90 px-3 py-2 text-sm shadow-lg backdrop-blur">
            <div className="font-medium text-slate-900">Live tracking</div>
            <div className="text-slate-600">{filteredTechs.length}/{trackData.techMarkers.length} technicians visible</div>
            <div className="text-slate-600">{activeRouteGroups.length} job site{activeRouteGroups.length === 1 ? '' : 's'} active</div>
            {trailTech && !selectedTech ? (
              <div className="mt-1 flex items-center gap-1.5 text-violet-800">
                <span className="h-0 w-4 border-t-2 border-dotted border-violet-600" />
                {trailCoords.length > 1 ? `${trailTech.name}: last ${trailMinutes} min` : `${trailTech.name}: no movement in ${trailMinutes} min`}
              </div>
            ) : null}
          </div>
          {!loading && mapPoints.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-slate-100/75 p-4">
              <div className="max-w-md rounded-xl border border-amber-200 bg-white p-5 text-center shadow-lg">
                <FiMapPin className="mx-auto text-2xl text-amber-600" />
                <p className="mt-2 font-semibold text-slate-900">No current locations to plot</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {gpsAttentionCount
                    ? `${gpsAttentionCount} technician${gpsAttentionCount === 1 ? '' : 's'} need a fresh GPS update. Their last known state remains listed below.`
                    : 'No technician or active job currently has coordinates inside the configured service area.'}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {selectedTech ? (
        <div
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeTechnicianDetails();
          }}
        >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="selected-technician-heading"
          onKeyDown={keepFocusInsideDialog}
          className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-start gap-3">
            <UserAvatar name={selectedTech.name} imageUrl={selectedTech.profileImageUrl} fallback="T" className="mt-1 h-12 w-12 rounded-full bg-slate-700 text-sm font-bold text-white" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Technician details</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selectedTech.status === 'on_job' ? 'bg-blue-50 text-blue-700' : selectedTech.status === 'available' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {selectedTech.status === 'on_job' ? 'On active job' : selectedTech.status === 'available' ? 'Available' : 'Offline'}
                </span>
              </div>
              <h3 id="selected-technician-heading" className="mt-1 text-lg font-semibold text-slate-950">{selectedTech.name}</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">TECH-{String(selectedTech.id).padStart(4, '0')}</p>
            </div>
            </div>
            <button ref={detailsCloseButtonRef} type="button" aria-label="Close details" title="Close details" onClick={closeTechnicianDetails} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><FiX aria-hidden="true" size={20} /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            <section aria-labelledby="technician-location-summary">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h4 id="technician-location-summary" className="text-sm font-semibold text-slate-900">Live location summary</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Latest GPS and workload information recorded by the system.</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selectedTech.gpsState === 'fresh' ? 'bg-emerald-50 text-emerald-700' : selectedTech.gpsState === 'stale' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                  {selectedTech.gpsState === 'fresh' ? 'GPS fresh' : selectedTech.gpsState === 'stale' ? 'GPS stale' : 'GPS missing'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-4">
              <TrackingFact label="GPS health" value={selectedTech.gpsState === 'fresh' ? 'Fresh' : selectedTech.gpsState === 'stale' ? 'Stale' : 'Missing'} />
              <TrackingFact label="Last GPS update" value={formatLastUpdate(selectedTech.lastLocationUpdate)} />
              <TrackingFact label="GPS accuracy" value={Number(selectedTech.gpsAccuracy) > 0 ? `+/-${Math.round(Number(selectedTech.gpsAccuracy))} m` : 'Not captured'} />
              <TrackingFact label="Movement" value={formatMovement(selectedTech)} />
              <TrackingFact label="Active workload" value={`${selectedTech.activeJobs?.length || 0} job${selectedTech.activeJobs?.length === 1 ? '' : 's'}`} />
              <TrackingFact label="Recent trail" value={trailLoading ? 'Loading...' : trailError || `${locationTrail.length} point${locationTrail.length === 1 ? '' : 's'} in ${trailMinutes} min`} />
                <TrackingFact className="col-span-2" label="Coordinates" value={hasCoords(selectedTech) ? `${selectedTech.lat.toFixed(6)}, ${selectedTech.lng.toFixed(6)}` : 'No usable coordinates'} />
              </div>
            </section>
            <section aria-labelledby="technician-current-jobs">
              <div className="flex items-center justify-between gap-3">
                <h4 id="technician-current-jobs" className="text-sm font-semibold text-slate-900">Current jobs</h4>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {selectedTech.activeJobs?.length || 0} active
                </span>
              </div>
              {selectedTech.activeJobs?.length ? (
                <div className="mt-2 space-y-2">
                  {selectedTech.activeJobs.map((job) => (
                    <div key={job.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{formatTicketId(job.id)} · {job.service}</p>
                          <p className="mt-1 text-xs text-slate-500">{job.client} · {job.locationDesc}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{getTicketStatusPresentation(job.status).label}</span>
                          <Link
                            to={`/admin/service-tickets?ticketId=${job.id}`}
                            aria-label={`Open ticket ${formatTicketId(job.id)}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Open ticket <FiExternalLink />
                          </Link>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                        <p className="inline-flex items-center gap-1.5"><FiClock />{formatJobSchedule(job)} · {job.priority || 'Normal'} priority</p>
                        <RouteSummary progress={getRouteProgress(ticketById.get(Number(job.id)) || job, selectedTech)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-700">No active job assigned</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">This technician currently has no open field assignment.</p>
                </div>
              )}
            </section>
          </div>
          <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap gap-2">
              {hasCoords(selectedTech) ? (
                <button
                  type="button"
                  onClick={() => {
                    const tech = selectedTech;
                    closeTechnicianDetails();
                    focusLocation({ kind: 'tech', id: tech.id, label: tech.name, lat: tech.lat, lng: tech.lng, zoom: 15 });
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 text-sm font-semibold text-violet-800 transition hover:bg-violet-100"
                >
                  <FiMapPin aria-hidden="true" />Show trail on map
                </button>
              ) : null}
              {selectedTech.phone ? (
                <a href={`tel:${selectedTech.phone}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"><FiPhone aria-hidden="true" />Call</a>
              ) : null}
              {selectedTech.email ? (
                <a href={`mailto:${selectedTech.email}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"><FiMail aria-hidden="true" />Email</a>
              ) : null}
            </div>
            <Link to="/admin/service-tickets" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700">Open Service Tickets<FiExternalLink aria-hidden="true" /></Link>
          </footer>
        </section>
        </div>
      ) : null}

      {activeRouteGroups.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-base font-semibold text-slate-900">Active Job Sites</h3>
          </div>
          <div className="hidden grid-cols-[minmax(14rem,1.3fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_5.5rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Destination</span>
            <span>Crew</span>
            <span>Route</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-slate-200">
            {activeRouteGroups.map(({ ticket, assignedTechs, crewCount }) => {
              const leadName = ticket.leadTechnician || ticket.technicianName || assignedTechs[0]?.name || 'Unassigned';
              const leadTech = assignedTechs.find((tech) => Number(tech.id) === Number(ticket.technicianId)) || assignedTechs[0];
              const progress = getRouteProgress(ticket, leadTech);
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
                  <div className="min-w-0">
                    <RouteSummary progress={progress} />
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
                const isSelected = Number(selectedTechId) === Number(tech.id);
                const techHasCoords = hasCoords(tech);
                return (
                  <li
                    key={tech.id}
                    className={`rounded-lg border px-3 py-2 ${isFocused || isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <UserAvatar name={tech.name} imageUrl={tech.profileImageUrl} fallback="T" className="h-9 w-9 rounded-full bg-slate-700 text-xs font-bold text-white" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-900">{tech.name}</div>
                        <div className="text-xs text-slate-500">{tech.status.replaceAll('_', ' ')} · {formatMovement(tech)} · {formatLastSeen(tech.lastLocationUpdate)} · {tech.activeJobs?.length || 0} active job{tech.activeJobs?.length === 1 ? '' : 's'}</div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={(event) => openTechnicianDetails(tech.id, event.currentTarget)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {isSelected ? 'Details open' : 'View details'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            focusLocation({
                              kind: 'tech', id: tech.id, label: tech.name,
                              lat: tech.lat, lng: tech.lng, zoom: 16
                            });
                          }}
                          disabled={!techHasCoords}
                          title={techHasCoords ? `Center the map on ${tech.name}` : `${tech.name} has no live coordinates yet`}
                          className={`rounded px-2 py-1 text-xs font-semibold text-white ${isFocused ? 'bg-blue-800' : 'bg-brand-600'} disabled:cursor-not-allowed disabled:bg-slate-300`}
                        >
                          {techHasCoords ? (isFocused ? 'Centered' : 'Center') : 'No GPS'}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              {normalizedSearch ? `No technician or job matches "${search.trim()}".` : 'No technicians match the selected filters.'}
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}

// Road distance and ETA still to go, with off-route and reroute notes.
function RouteSummary({ progress }) {
  const rerouted = formatRerouted(progress);
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {progress.offRoute ? (
        <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-800">Off planned route · rerouting</span>
      ) : null}
      {!progress.isFallback ? (
        <>
          <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">{formatDistance(progress.remainingMeters)} to go</span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">{formatRemainingEta(progress.remainingSeconds)}</span>
        </>
      ) : (
        <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-800">
          {progress.remainingMeters ? `${formatDistance(progress.remainingMeters)} direct` : 'Distance unavailable'}
          {progress.offRoute ? '' : ' · road route unavailable'}
        </span>
      )}
      {rerouted ? <span className="rounded-full bg-sky-50 px-2 py-1 font-medium text-sky-800">{rerouted}</span> : null}
    </div>
  );
}

function TrackingFact({ label, value, className = '' }) {
  return (
    <div className={`min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
