import { useEffect, useMemo, useRef, useState } from 'react';
import { toTelHref } from '../../utils/landingSettings';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { MapContainer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { FiNavigation, FiRefreshCw, FiFlag, FiChevronRight, FiPhone, FiMoreHorizontal, FiExternalLink } from 'react-icons/fi';
import { fetchNavigationRoute, fetchTechnicianJob, fetchTechnicianJobs, fetchTechnicianTrackingPolicy, markTechnicianArrival, startJobNavigation, updateTechnicianLocation } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useGPSTracking } from '../../hooks/useGPSTracking';
import GPSStatusIndicator, { GPSNotice } from '../../components/ui/GPSStatusIndicator';
import {
  resolveServiceRegion
} from '../../utils/mapRegion';
import { formatTicketId } from '../../utils/roleIds';
import { OFF_ROUTE_METERS, distanceToRouteMeters, measureAlongRoute } from '../../utils/routeProgress';
import MapTileLayer from '../../components/maps/MapTileLayer';

const techIcon = L.divIcon({
  html: '<div class="w-12 h-12 bg-blue-500 rounded-full shadow-lg border-4 border-white flex items-center justify-center text-white font-bold text-sm">You</div>',
  className: 'leaflet-marker-icon',
  iconSize: [48, 48],
  iconAnchor: [24, 48]
});

const jobIcon = L.divIcon({
  html: '<div class="w-12 h-12 bg-red-500 rounded-full shadow-lg border-4 border-white flex items-center justify-center text-white font-bold text-xs">Job</div>',
  className: 'leaflet-marker-icon',
  iconSize: [48, 48],
  iconAnchor: [24, 48]
});

const EMPTY_ROUTE = {
  distanceKm: 0,
  estimatedTimeMin: 0,
  travelSpeedKph: 35,
  routeCoords: [],
  directions: []
};

// Each recalculation is one routing-service (ORS) request, on a free daily quota. Recalculate
// only when the technician leaves the route (same rule as backend/services/route_tracking.py),
// or every 2 minutes to refresh the ETA; the driven part is already greyed out in between.
const ROUTE_RECALCULATE_MS = 120000;
const ROUTE_RETRY_MS = 30000;
const LOCATION_UPDATE_MS = 10000;
const LOCATION_UPDATE_DISTANCE_KM = 0.02;
const DEFAULT_TRAVEL_SPEED_KPH = 35;
const MIN_RELIABLE_SPEED_KPH = 3;
const MAX_RELIABLE_SPEED_KPH = 120;
const MAX_SPEED_SAMPLES = 5;

// What the page offers depends on where the job is in its workflow.
const READY_TO_TRAVEL = new Set(['not_started', 'for_inspection', 'inspection_completed', 'ready_for_service', 'awaiting_materials']);
const ON_SITE = new Set(['arrived_on_site', 'in_progress']);
const FINISHED = new Set(['completed', 'cancelled', 'turned_over_/_accepted', 'turned_over_accepted']);
const PICKABLE = new Set([...READY_TO_TRAVEL, 'navigating', ...ON_SITE]);
const STEP_REACHED_KM = 0.03;
const normalizeStatusKey = (status) => String(status || '').toLowerCase().replace(/\s+/g, '_');

// In-app navigation is the main path. Google Maps and Waze (voice directions) are an extra option
// under "More": they open at the job's pinned location, but a phone browser pauses this page in the
// background, so live tracking stops until the technician comes back.
const googleMapsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
const wazeUrl = (lat, lng) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

// Opened from the sidebar with no job chosen: list the jobs that can be navigated to.
function NavigationJobPicker() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchTechnicianJobs()
      .then((data) => {
        if (!active) return;
        const usable = data
          .filter((job) => PICKABLE.has(normalizeStatusKey(job.status)) && Number.isFinite(Number(job.latitude)) && Number.isFinite(Number(job.longitude)))
          .sort((a, b) => {
            const rank = (job) => (['navigating', 'arrived_on_site', 'in_progress'].includes(normalizeStatusKey(job.status)) ? 0 : 1);
            return rank(a) - rank(b) || String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || ''));
          });
        setJobs(usable);
      })
      .catch((loadError) => active && setError(loadError.message || 'Unable to load your jobs.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return (
    <div className="card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><FiNavigation className="text-blue-500" /> Choose a job to navigate to</h2>
      <p className="mt-1 text-sm text-slate-500">Jobs under way are listed first.</p>
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading your jobs…</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {!loading && !error && jobs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
          No jobs with a map location to travel to right now.
          <Link to="/technician/my-jobs" className="mt-3 block font-semibold text-brand-700">Open My Jobs</Link>
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {jobs.map((job) => {
          const code = formatTicketId(job.ticketId || job.id);
          const underWay = ['navigating', 'arrived_on_site', 'in_progress'].includes(normalizeStatusKey(job.status));
          return (
            <Link
              key={job.id}
              to={`/technician/map-navigation?ticketId=${job.ticketId || job.id}`}
              aria-label={`Navigate to ${code}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900">{code}: {job.service}</span>
                <span className="block truncate text-sm text-slate-500">{job.client?.full_name || job.client} · {job.address || 'Location'}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${underWay ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>{underWay ? 'Under way' : 'Ready'}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

function MapBoundsUpdater({ routeCoords, jobLoc, techLoc, routeKey }) {
  const map = useMap();
  const fittedRouteKeyRef = useRef(null);

  useEffect(() => {
    if (!routeCoords || routeCoords.length < 2 || !jobLoc) return;
    if (fittedRouteKeyRef.current === routeKey) return;

    try {
      const allCoords = [techLoc, ...routeCoords, jobLoc];
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      fittedRouteKeyRef.current = routeKey;
    } catch (fitError) {
      console.error('Error fitting bounds:', fitError);
    }
  }, [map, routeCoords, jobLoc, techLoc, routeKey]);
  return null;
}

function ServiceRegionController({ region }) {
  const map = useMap();

  useEffect(() => {
    map.setMaxBounds(region.bounds);
    map.options.maxBoundsViscosity = 1.0;
    map.setMinZoom(region.minZoom);
    map.invalidateSize();
  }, [map, region]);

  return null;
}

function MapResizeController() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let animationFrame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    const refreshMapSize = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(refreshMapSize)
      : null;

    resizeObserver?.observe(container);
    window.addEventListener('resize', refreshMapSize);
    window.addEventListener('orientationchange', refreshMapSize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', refreshMapSize);
      window.removeEventListener('orientationchange', refreshMapSize);
    };
  }, [map]);

  return null;
}

export default function TechnicianMapNavigation() {
  const [searchParams] = useSearchParams();
  const ticketId = searchParams.get('ticketId') || searchParams.get('jobId');
  const { user } = useAuth();
  const techName = user?.username || 'Technician';
  const [job, setJob] = useState(null);
  const [route, setRoute] = useState(EMPTY_ROUTE);
  const [arrived, setArrived] = useState(false);
  const [arrivalSaving, setArrivalSaving] = useState(false);
  const [arrivalMessage, setArrivalMessage] = useState('');
  const [navigationStarted, setNavigationStarted] = useState(false);
  const [jobLoading, setJobLoading] = useState(Boolean(ticketId));
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [trackingConfig, setTrackingConfig] = useState(null);
  const [liveTravelSpeedKph, setLiveTravelSpeedKph] = useState(null);
  const [error, setError] = useState('');
  const [pendingStart, setPendingStart] = useState(false);
  const [startingTrip, setStartingTrip] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef(null);

  // The More menu closes on an outside tap or Escape.
  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !moreMenuRef.current?.contains(event.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', close);
    };
  }, [moreOpen]);
  const lastRouteRequestRef = useRef({ at: 0, lat: null, lng: null });
  const lastLocationUpdateRef = useRef({ at: 0, lat: null, lng: null });
  const routeRequestSeqRef = useRef(0);
  const navigationStartingRef = useRef(false);
  const previousSpeedLocationRef = useRef(null);
  const speedSamplesRef = useRef([]);

  const {
    location: gpsLocation,
    error: gpsError,
    permission: gpsPermission,
    startWatching,
    stopWatching,
    watching
  } = useGPSTracking({ autoStart: false });

  const trackingRegion = useMemo(
    () => resolveServiceRegion(trackingConfig?.region),
    [trackingConfig?.region]
  );
  const trackingPolicy = trackingConfig?.policy || {};
  const techLoc = gpsLocation ? [gpsLocation.latitude, gpsLocation.longitude] : trackingRegion.center;
  const hasJobCoordinates =
    job?.latitude != null &&
    job?.longitude != null &&
    Number.isFinite(Number(job.latitude)) &&
    Number.isFinite(Number(job.longitude));
  const jobLoc = hasJobCoordinates ? [Number(job.latitude), Number(job.longitude)] : null;
  const loading = jobLoading;
  const effectiveTravelSpeedKph = liveTravelSpeedKph || route.travelSpeedKph || DEFAULT_TRAVEL_SPEED_KPH;
  // Where the phone is along the route right now. The route is requested only every 2 minutes
  // (or when off it), so distance, time, the current step and the driven part are all counted
  // from the live position in between, not from the last route request.
  const routeMeasure = useMemo(
    () => (gpsLocation ? measureAlongRoute(route.routeCoords, [gpsLocation.latitude, gpsLocation.longitude]) : null),
    [route.routeCoords, gpsLocation?.latitude, gpsLocation?.longitude]
  );
  const isOffRoute = Boolean(routeMeasure)
    && routeMeasure.offRouteMeters > Math.max(OFF_ROUTE_METERS, 1.5 * (Number(gpsLocation?.accuracy) || 0));
  const remainingKm = routeMeasure && !isOffRoute
    ? Number(((routeMeasure.remainingMeters + routeMeasure.offRouteMeters) / 1000).toFixed(1))
    : route.distanceKm;
  const displayedTravelTimeMin = remainingKm > 0
    ? Math.max(1, Math.round((remainingKm / effectiveTravelSpeedKph) * 60))
    : 0;
  // The step being driven: the last one whose start is at or behind the phone's position.
  const currentStepIndex = useMemo(() => {
    if (!routeMeasure || isOffRoute || !route.directions.length) return 0;
    let index = 0;
    route.directions.forEach((step, stepIndex) => {
      if (Number.isInteger(step.startIndex) && step.startIndex <= routeMeasure.segment - 1) index = stepIndex;
    });
    return index;
  }, [routeMeasure, isOffRoute, route.directions]);
  const estimateStepMinutes = (distanceMeters, fallbackDurationSeconds = 0) => {
    if (Number(distanceMeters) > 0) {
      return Math.max(1, Math.round(((Number(distanceMeters) / 1000) / effectiveTravelSpeedKph) * 60));
    }
    return fallbackDurationSeconds > 0 ? Math.max(1, Math.round(fallbackDurationSeconds / 60)) : 0;
  };

  const loadRoute = async (techLat = techLoc[0], techLng = techLoc[1], { force = false, accuracy = 0 } = {}) => {
    if (!jobLoc) {
      return;
    }

    const now = Date.now();
    const previous = lastRouteRequestRef.current;
    const offRouteMeters = distanceToRouteMeters(route.routeCoords, [techLat, techLng]);
    const offRoute = offRouteMeters != null
      && offRouteMeters > Math.max(OFF_ROUTE_METERS, 1.5 * (Number(accuracy) || 0));
    // On the route: refresh every 2 minutes. Off the route, or no route yet (the last request
    // failed): ask again, but never more than once every 30 s. A route whose start the routing
    // service snaps to a road over 200 m away would otherwise look "off route" on every reading.
    const waitMs = offRoute || offRouteMeters == null ? ROUTE_RETRY_MS : ROUTE_RECALCULATE_MS;

    if (!force && previous.lat != null && now - previous.at < waitMs) {
      return;
    }

    lastRouteRequestRef.current = { at: now, lat: techLat, lng: techLng };
    const requestSeq = routeRequestSeqRef.current + 1;
    routeRequestSeqRef.current = requestSeq;
    setRouteLoading(true);

    try {
      const data = await fetchNavigationRoute(techLat, techLng, jobLoc[0], jobLoc[1]);
      if (routeRequestSeqRef.current !== requestSeq) return;
      setRoute(data);
      setRouteError('');
    } catch (routeError) {
      if (routeRequestSeqRef.current !== requestSeq) return;
      setRoute(EMPTY_ROUTE);
      setRouteError(`${routeError.message || 'Unable to calculate the route for this ticket.'} You can still travel to the site and mark arrival.`);
    } finally {
      if (routeRequestSeqRef.current === requestSeq) {
        setRouteLoading(false);
      }
    }
  };

  useEffect(() => {
    let active = true;
    routeRequestSeqRef.current += 1;
    lastRouteRequestRef.current = { at: 0, lat: null, lng: null };
    setRouteError('');
    setRouteLoading(false);
    if (!ticketId) {
      setJob(null);
      setJobLoading(false);
      setRoute(EMPTY_ROUTE);
      setNavigationStarted(false);
      setLiveTravelSpeedKph(null);
      previousSpeedLocationRef.current = null;
      speedSamplesRef.current = [];
      return;
    }

    const loadJob = async () => {
      setJobLoading(true);
      setArrivalMessage('');
      setRoute(EMPTY_ROUTE);
      setNavigationStarted(false);
      setLiveTravelSpeedKph(null);
      previousSpeedLocationRef.current = null;
      speedSamplesRef.current = [];

      try {
        const jobData = await fetchTechnicianJob(ticketId);
        if (!active) return;
        setJob(jobData);
        const statusLower = String(jobData.status || '').toLowerCase().replace(/\s+/g, '_');
        setArrived(['arrived_on_site', 'in_progress', 'completed'].includes(statusLower));
        // Reopening the page mid-trip must not ask the technician to start navigation again.
        setNavigationStarted(statusLower === 'navigating');
        setError('');
      } catch (loadError) {
        if (!active) return;
        setJob(null);
        setError(loadError.message || 'Unable to load job details.');
      } finally {
        if (active) setJobLoading(false);
      }
    };

    loadJob();
    return () => {
      active = false;
      routeRequestSeqRef.current += 1;
    };
  }, [ticketId]);

  useEffect(() => {
    let active = true;
    fetchTechnicianTrackingPolicy()
      .then((data) => {
        if (active) setTrackingConfig(data);
      })
      .catch((policyError) => {
        console.warn('Unable to load location-sharing policy', policyError);
      });
    return () => {
      active = false;
      stopWatching();
    };
  }, [stopWatching]);

  const startLocationSharing = () => {
    startWatching();
  };

  const statusKey = normalizeStatusKey(job?.status);
  const readyToTravel = READY_TO_TRAVEL.has(statusKey) && !navigationStarted;
  const isOnHold = statusKey === 'on_hold';
  const isFinished = FINISHED.has(statusKey);
  const clientPhone = job?.client?.phone;

  const stopLocationSharing = () => {
    stopWatching();
  };

  // Starting the trip is the technician's decision: it marks the job "Navigating" and tells the client
  // and the office that they are on the way. Sharing location alone only previews the route.
  // It never waits for the directions lookup, so a slow or failed route can't block travel or arrival.
  const beginTrip = async () => {
    if (!ticketId || navigationStartingRef.current) return;
    navigationStartingRef.current = true;
    setStartingTrip(true);
    setError('');
    try {
      await startJobNavigation(ticketId);
      setNavigationStarted(true);
      setJob((current) => (current ? { ...current, status: 'navigating' } : current));
      setArrivalMessage('Trip started. The client has been told you are on the way.');
    } catch (navigationError) {
      setError(navigationError.message || 'Unable to start navigation for this job.');
    } finally {
      navigationStartingRef.current = false;
      setStartingTrip(false);
    }
  };

  const requestStartTrip = () => {
    setError('');
    if (gpsLocation) {
      beginTrip();
      return;
    }
    // Location first; the trip starts as soon as the first position arrives.
    setPendingStart(true);
    startWatching();
  };

  useEffect(() => {
    if (!pendingStart || !gpsLocation || !job) return;
    setPendingStart(false);
    beginTrip();
  }, [pendingStart, gpsLocation, job]);

  useEffect(() => {
    if (pendingStart && gpsError) setPendingStart(false);
  }, [pendingStart, gpsError]);

  useEffect(() => {
    if (!jobLoc || arrived || !gpsLocation) {
      return;
    }

    loadRoute(gpsLocation.latitude, gpsLocation.longitude, { accuracy: gpsLocation.accuracy });
  }, [ticketId, job?.latitude, job?.longitude, arrived, gpsLocation?.latitude, gpsLocation?.longitude]);

  useEffect(() => {
    if (!gpsLocation) {
      return;
    }

    const timestamp = Number(gpsLocation.timestamp) || Date.now();
    const previous = previousSpeedLocationRef.current;
    let measuredSpeedKph = Number(gpsLocation.speed) * 3.6;

    if ((!Number.isFinite(measuredSpeedKph) || measuredSpeedKph < MIN_RELIABLE_SPEED_KPH) && previous) {
      const elapsedHours = (timestamp - previous.timestamp) / 3600000;
      const hasUsableInterval = elapsedHours > 0 && elapsedHours <= (60 / 3600);
      const accuracy = Math.max(Number(gpsLocation.accuracy) || 0, Number(previous.accuracy) || 0);
      if (hasUsableInterval && accuracy <= 100) {
        const movedKm = calculateDistanceKm(
          previous.latitude,
          previous.longitude,
          gpsLocation.latitude,
          gpsLocation.longitude
        );
        measuredSpeedKph = movedKm / elapsedHours;
      }
    }

    previousSpeedLocationRef.current = {
      latitude: gpsLocation.latitude,
      longitude: gpsLocation.longitude,
      accuracy: gpsLocation.accuracy,
      timestamp,
    };

    if (Number.isFinite(measuredSpeedKph)
      && measuredSpeedKph >= MIN_RELIABLE_SPEED_KPH
      && measuredSpeedKph <= MAX_RELIABLE_SPEED_KPH) {
      const samples = [...speedSamplesRef.current, measuredSpeedKph].slice(-MAX_SPEED_SAMPLES);
      speedSamplesRef.current = samples;
      setLiveTravelSpeedKph(Math.round(samples.reduce((total, speed) => total + speed, 0) / samples.length));
    }
  }, [gpsLocation]);

  useEffect(() => {
    if (!gpsLocation) {
      return;
    }

    const { latitude, longitude, accuracy } = gpsLocation;

    const updateLocationAndRoute = async () => {
      const now = Date.now();
      const previousLocation = lastLocationUpdateRef.current;
      const movedKm = previousLocation.lat == null || previousLocation.lng == null
        ? Infinity
        : calculateDistanceKm(previousLocation.lat, previousLocation.lng, latitude, longitude);

      if (now - previousLocation.at >= LOCATION_UPDATE_MS || movedKm >= LOCATION_UPDATE_DISTANCE_KM) {
        lastLocationUpdateRef.current = { at: now, lat: latitude, lng: longitude };
        try {
          await updateTechnicianLocation({ lat: latitude, lng: longitude, accuracy, measuredAt: gpsLocation.timestamp });
        } catch (updateError) {
          console.warn('Failed to update technician location', updateError);
        }
      }

      if (!arrived && jobLoc) {
        await loadRoute(latitude, longitude, { accuracy });
      }
    };

    updateLocationAndRoute();
  }, [gpsLocation, arrived, techName, ticketId, job?.latitude, job?.longitude]);

  // Map bounds are now handled by MapBoundsUpdater component

  const markArrived = async () => {
    if (!ticketId || arrivalSaving) return;
    setArrivalSaving(true);
    setArrivalMessage('');
    setError('');
    try {
      const result = await markTechnicianArrival(ticketId, {
        latitude: gpsLocation?.latitude,
        longitude: gpsLocation?.longitude,
      });
      setArrived(true);
      setJob((current) => current ? { ...current, status: 'arrived_on_site' } : current);
      setArrivalMessage(result?.validation_result === 'bypassed'
        ? 'Arrival confirmed. Location validation was bypassed by superadmin.'
        : 'Arrival confirmed.'
      );
    } catch (err) {
      setError(err.message || 'Unable to mark arrival.');
    } finally {
      setArrivalSaving(false);
    }
  };

  const currentStep = route.directions[currentStepIndex] || null;
  const followingStep = route.directions[currentStepIndex + 1] || null;
  const atCurrentTurn = Boolean(routeMeasure && currentStep && Number.isInteger(currentStep.startIndex)
    && currentStepIndex > 0
    && calculateDistanceKm(
      gpsLocation.latitude, gpsLocation.longitude,
      route.routeCoords[currentStep.startIndex][0], route.routeCoords[currentStep.startIndex][1],
    ) <= STEP_REACHED_KM);
  const upcomingStep = atCurrentTurn || !followingStep ? currentStep : followingStep;
  const upcomingMeters = !routeMeasure || !upcomingStep
    ? null
    : atCurrentTurn
      ? 0
      : upcomingStep === followingStep && Number.isInteger(followingStep.startIndex)
        ? routeMeasure.metersToIndex(followingStep.startIndex)
        : routeMeasure.remainingMeters;
  const formatMetersAhead = (value) => (value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.max(Math.round(value / 10) * 10, 0)} m`);
  // The part of the line already travelled, up to where the phone is now.
  const travelledCoords = routeMeasure && !isOffRoute ? routeMeasure.travelledCoords : [];

  if (!ticketId) {
    return (
      <Layout>
        <NavigationJobPicker />
      </Layout>
    );
  }

  if (!jobLoading && (!job || !jobLoc)) {
    return (
      <Layout>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-xl font-semibold">Unable to start navigation</h2>
          <p className="mt-2 text-sm">
            {error || 'This ticket does not have a usable service location yet.'}
          </p>
          <Link
            to="/technician/my-jobs"
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Back to My Jobs
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-3 card p-3 sm:mb-6 sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-800 sm:mb-2 sm:gap-3 sm:text-2xl">
          <FiNavigation className="shrink-0 text-blue-500" size={24} />
          Navigation to {formatTicketId(ticketId)}
        </h2>
        <p className="line-clamp-2 text-sm text-slate-600 sm:text-base">
          {job ? `${job.service} for ${job.client?.full_name || job.client} | ${job.address || 'Location pending'}` : 'Loading job details...'}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {watching ? 'Location sharing active' : 'Location sharing off'} | {route.directions.length} turns | {trackingRegion.name}
        </p>
        <div className={`mt-3 rounded-xl border px-3 py-3 text-sm sm:px-4 ${watching ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">Location sharing</p>
              <p className="truncate text-xs opacity-80">{watching ? 'Live location is visible to authorized supervisors.' : 'Required to calculate and update your route.'}</p>
            </div>
            <button
              type="button"
              onClick={watching ? stopLocationSharing : startLocationSharing}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-white ${watching ? 'bg-slate-700 hover:bg-slate-800' : 'bg-brand-600 hover:bg-brand-700'}`}
            >
              {watching ? 'Stop sharing' : 'Start location sharing'}
            </button>
          </div>
          <details className="mt-2 text-xs opacity-80">
            <summary className="cursor-pointer font-medium">Privacy and retention details</summary>
            <p className="mt-1 leading-5">Used for dispatch, navigation, arrival support, and safety. Authorized supervisors can view current and recent locations. History is retained for up to {trackingPolicy.retentionDays || 30} days. Sharing stops when you leave this page or choose Stop sharing.</p>
          </details>
        </div>
        <GPSStatusIndicator status={gpsPermission} accuracy={gpsLocation?.accuracy} className="mt-2" />
        <GPSNotice
          status={gpsPermission}
          error={gpsError}
          location={gpsLocation}
          onRequestAccess={startLocationSharing}
          className="mt-3"
        />
        {error && !loading && (
          <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {routeError && !loading && (
          <p role="status" className="mt-2 text-sm text-amber-700">{routeError}</p>
        )}
        {isOffRoute && !arrived ? (
          <div role="status" className="mt-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">You are off the planned route</p>
            <p className="text-xs text-amber-800">
              {routeLoading ? 'Finding a new route from where you are…' : 'A new route from where you are will load shortly. Head toward the job site.'}
            </p>
          </div>
        ) : upcomingStep && (
          <div className="mt-3 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3">
            <p className="text-sm font-semibold text-blue-900">Next: {upcomingStep.instruction}</p>
            <p className="text-xs text-blue-700">
              {upcomingMeters == null
                ? (upcomingStep.distance ? `${(upcomingStep.distance / 1000).toFixed(1)} km` : '')
                : upcomingMeters <= STEP_REACHED_KM * 1000 ? 'Now' : `In ${formatMetersAhead(upcomingMeters)}`}
              {upcomingMeters != null && upcomingMeters > STEP_REACHED_KM * 1000 && estimateStepMinutes(upcomingMeters)
                ? ` | ${estimateStepMinutes(upcomingMeters)} min`
                : ''}
            </p>
          </div>
        )}
      </div>

      <div className="mb-5 grid gap-3 sm:gap-5 xl:mb-8 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="map-wrapper h-[46dvh] min-h-[20rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:h-[55vh] sm:min-h-[24rem] xl:h-auto xl:min-h-[60vh] xl:self-stretch">
          {loading ? (
            <div className="h-full w-full p-4">
              <PanelSkeleton rows={8} />
            </div>
          ) : (
            <MapContainer
              center={jobLoc || techLoc}
              zoom={trackingRegion.minZoom}
              minZoom={trackingRegion.minZoom}
              maxZoom={18}
              maxBounds={trackingRegion.bounds}
              maxBoundsViscosity={1.0}
              className="h-full w-full"
              style={{ height: '100%', minHeight: 0, width: '100%' }}
            >
              <ServiceRegionController region={trackingRegion} />
              <MapResizeController />
              <MapBoundsUpdater routeCoords={route.routeCoords} jobLoc={jobLoc} techLoc={techLoc} routeKey={ticketId} />
              <MapTileLayer />

              {gpsLocation ? (
                <Marker position={techLoc} icon={techIcon}>
                  <Popup>
                    <div>
                      <strong>Your Location</strong>
                      <br />
                      Moving to job site...
                    </div>
                  </Popup>
                </Marker>
              ) : null}

              <Marker position={jobLoc} icon={jobIcon}>
                <Popup>
                  <div className="text-center">
                    <strong>Job Site</strong>
                    <br />
                    {remainingKm > 0 ? `${remainingKm} km away` : 'Route not calculated'}
                    <br />
                    {displayedTravelTimeMin > 0 ? `~${displayedTravelTimeMin} min` : 'Start location sharing first'}
                  </div>
                </Popup>
              </Marker>

              {route.routeCoords.length > 1 && (
                <>
                  {/* Full route in blue */}
                  <Polyline positions={route.routeCoords} color="#3b82f6" weight={5} opacity={0.8} />
                  {/* Completed portion in green */}
                  {travelledCoords.length > 1 && (
                    <Polyline
                      positions={travelledCoords}
                      color="#10b981"
                      weight={6}
                      opacity={0.95}
                    />
                  )}
                </>
              )}
            </MapContainer>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 p-3 text-white shadow-lg sm:p-5">
              <div className="mb-1 text-2xl font-bold sm:text-3xl">{remainingKm > 0 ? `${remainingKm} km` : '--'}</div>
              <div className="text-xs text-blue-100 sm:text-base">{isOffRoute ? 'Distance · off route' : 'Distance left'}</div>
            </div>

            <div className="rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 p-3 text-white shadow-lg sm:p-5">
              <div className="mb-1 text-2xl font-bold sm:text-3xl">{displayedTravelTimeMin > 0 ? `${displayedTravelTimeMin} min` : '--'}</div>
              <div className="text-xs text-emerald-100 sm:text-base">
                {liveTravelSpeedKph ? `Live · ${liveTravelSpeedKph} km/h` : `Estimated · ${effectiveTravelSpeedKph} km/h`}
              </div>
            </div>
          </div>

          <div className="order-3 rounded-xl border bg-white p-4 shadow-sm sm:p-5 xl:order-2">
            <h4 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              Turn-by-Turn Directions ({route.directions.length ? `${currentStepIndex + 1}/${route.directions.length}` : '0/0'})
            </h4>
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {route.directions.length > 0 ? route.directions.map((direction, index) => (
                <div
                  key={`${direction.instruction}-${index}`}
                  className={`flex gap-3 rounded-lg p-3 transition ${
                    index === currentStepIndex
                      ? 'border-2 border-blue-500 bg-blue-100 shadow-md'
                      : index < currentStepIndex
                        ? 'bg-emerald-50 opacity-60'
                        : 'bg-slate-50'
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                      index === currentStepIndex
                        ? 'bg-blue-500'
                        : index < currentStepIndex
                          ? 'bg-emerald-500'
                          : 'bg-slate-300'
                    }`}
                  >
                    {index < currentStepIndex ? 'OK' : index + 1}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${index === currentStepIndex ? 'text-blue-900' : 'text-slate-800'}`}>
                      {direction.instruction}
                    </p>
                    <p className="text-xs text-slate-500">
                      {direction.distance ? `${(direction.distance / 1000).toFixed(1)} km` : ''}
                      {estimateStepMinutes(direction.distance, direction.duration) ? ` | ${estimateStepMinutes(direction.distance, direction.duration)} min` : ''}
                    </p>
                  </div>
                  {index === currentStepIndex && <FiChevronRight className="flex-shrink-0 text-blue-500" size={20} />}
                </div>
              )) : (
                <p className="py-4 text-center text-slate-500">
                  {gpsLocation ? 'No directions available' : 'Start location sharing to calculate directions.'}
                </p>
              )}
            </div>
          </div>

          <div className="order-2 rounded-xl border bg-white p-3 shadow-sm sm:p-5 xl:order-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="font-semibold text-slate-900">Actions</h4>
              {jobLoc ? (
                <div className="relative" ref={moreMenuRef}>
                  <button
                    type="button"
                    aria-label="More navigation options"
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    onClick={() => setMoreOpen((open) => !open)}
                    className="grid h-10 w-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    <FiMoreHorizontal size={20} />
                  </button>
                  {moreOpen ? (
                    <div role="menu" aria-label="Open in another app" className="absolute right-0 z-[1000] mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                      <a role="menuitem" href={googleMapsUrl(jobLoc[0], jobLoc[1])} target="_blank" rel="noopener noreferrer" onClick={() => setMoreOpen(false)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <FiExternalLink aria-hidden="true" /> Open in Google Maps
                      </a>
                      <a role="menuitem" href={wazeUrl(jobLoc[0], jobLoc[1])} target="_blank" rel="noopener noreferrer" onClick={() => setMoreOpen(false)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <FiExternalLink aria-hidden="true" /> Open in Waze
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="space-y-3">
              {statusKey === 'cancelled' ? (
                <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  The office cancelled this job, so it is no longer on your job list.
                  <Link to="/technician/my-jobs" className="mt-2 block font-semibold text-brand-700">Open My Jobs</Link>
                </div>
              ) : isFinished ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  This job is finished.
                  <Link to="/technician/job-history" className="mt-2 block font-semibold text-brand-700">Open Job History</Link>
                </div>
              ) : isOnHold ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This job is on hold. Resume it from My Jobs before you travel.
                  <Link to={`/technician/my-jobs?ticketId=${ticketId}`} className="mt-2 block font-semibold text-amber-900 underline">Open the job</Link>
                </div>
              ) : readyToTravel ? (
                <button
                  type="button"
                  onClick={requestStartTrip}
                  disabled={startingTrip || pendingStart}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                >
                  <FiNavigation />
                  {startingTrip || pendingStart ? 'Starting trip…' : 'Start trip'}
                </button>
              ) : !arrived ? (
                <button
                  type="button"
                  onClick={markArrived}
                  disabled={arrivalSaving || !gpsLocation}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white shadow-lg transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FiFlag />
                  {arrivalSaving ? 'Marking arrival…' : !gpsLocation ? 'Share location to mark arrival' : 'Mark Arrived'}
                </button>
              ) : (
                <Link
                  to={`/technician/my-jobs?ticketId=${ticketId}`}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-500 px-4 py-3 font-semibold text-white shadow-lg transition hover:bg-emerald-600"
                >
                  Proceed to Job
                  <FiChevronRight size={20} />
                </Link>
              )}
              {readyToTravel ? (
                <p className="text-xs text-slate-500">Start trip tells the client and the office you are on the way. Sharing your location alone only previews the route.</p>
              ) : null}
              {arrivalMessage && (
                <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  {arrivalMessage}
                </p>
              )}
              {clientPhone ? (
                <a href={toTelHref(clientPhone)} aria-label={`Call ${job.client?.full_name || 'the client'}`} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FiPhone aria-hidden="true" /> Call client
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => loadRoute(undefined, undefined, { force: true })}
                disabled={routeLoading || !gpsLocation}
                className="group flex min-h-11 w-full items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-left text-sm transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiRefreshCw className={`transition-transform group-hover:rotate-180 ${routeLoading ? 'animate-spin' : ''}`} />
                {routeLoading ? 'Recalculating…' : 'Recalculate Route'}
              </button>
            </div>
          </div>

          <div className="order-4 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">
            GPS updates in real time | Route recalculates automatically
          </div>
        </div>
      </div>
    </Layout>
  );
}
