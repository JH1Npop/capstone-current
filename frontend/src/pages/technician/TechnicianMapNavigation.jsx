import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { MapContainer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { FiNavigation, FiRefreshCw, FiFlag, FiChevronRight } from 'react-icons/fi';
import { fetchNavigationRoute, fetchTechnicianJob, markTechnicianArrival, startJobNavigation, updateTechnicianLocation } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useGPSTracking } from '../../hooks/useGPSTracking';
import GPSStatusIndicator, { GPSNotice } from '../../components/ui/GPSStatusIndicator';
import {
  CALABARZON_BOUNDS,
  CALABARZON_CENTER,
  CALABARZON_MIN_ZOOM
} from '../../utils/mapRegion';
import { formatTicketId } from '../../utils/roleIds';
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
  routeCoords: [],
  directions: []
};

const ROUTE_RECALCULATE_MS = 30000;
const ROUTE_RECALCULATE_DISTANCE_KM = 0.1;
const LOCATION_UPDATE_MS = 10000;
const LOCATION_UPDATE_DISTANCE_KM = 0.02;

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

function MapBoundsUpdater({ routeCoords, jobLoc, techLoc }) {
  const map = useMap();
  useEffect(() => {
    if (!routeCoords || routeCoords.length < 2 || !jobLoc) return;
    try {
      const allCoords = [techLoc, ...routeCoords, jobLoc];
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } catch (fitError) {
      console.error('Error fitting bounds:', fitError);
    }
  }, [map, routeCoords, jobLoc, techLoc]);
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
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [watchStarted, setWatchStarted] = useState(false);
  const [error, setError] = useState(ticketId ? '' : 'Open a job from My Jobs before starting navigation.');
  const lastRouteRequestRef = useRef({ at: 0, lat: null, lng: null });
  const lastLocationUpdateRef = useRef({ at: 0, lat: null, lng: null });
  const routeRequestSeqRef = useRef(0);

  const {
    location: gpsLocation,
    error: gpsError,
    permission: gpsPermission,
    requestPermission,
    startWatching,
    stopWatching
  } = useGPSTracking({ autoStart: false });

  const techLoc = gpsLocation ? [gpsLocation.latitude, gpsLocation.longitude] : CALABARZON_CENTER;
  const hasJobCoordinates =
    job?.latitude != null &&
    job?.longitude != null &&
    Number.isFinite(Number(job.latitude)) &&
    Number.isFinite(Number(job.longitude));
  const jobLoc = hasJobCoordinates ? [Number(job.latitude), Number(job.longitude)] : null;
  const loading = jobLoading;

  const loadRoute = async (techLat = techLoc[0], techLng = techLoc[1], { force = false } = {}) => {
    if (!jobLoc) {
      return;
    }

    const now = Date.now();
    const previous = lastRouteRequestRef.current;
    const movedKm = previous.lat == null || previous.lng == null
      ? Infinity
      : calculateDistanceKm(previous.lat, previous.lng, techLat, techLng);

    if (!force && now - previous.at < ROUTE_RECALCULATE_MS && movedKm < ROUTE_RECALCULATE_DISTANCE_KM) {
      return;
    }

    lastRouteRequestRef.current = { at: now, lat: techLat, lng: techLng };
    const requestSeq = routeRequestSeqRef.current + 1;
    routeRequestSeqRef.current = requestSeq;
    setRouteLoading(true);
    setCurrentStepIndex(0);

    try {
      const data = await fetchNavigationRoute(techLat, techLng, jobLoc[0], jobLoc[1]);
      if (routeRequestSeqRef.current !== requestSeq) return;
      setRoute(data);
      setError('');
      if (ticketId && !navigationStarted) {
        try {
          await startJobNavigation(ticketId);
          setNavigationStarted(true);
        } catch (navigationError) {
          console.warn('Failed to record navigation start', navigationError);
        }
      }
    } catch (routeError) {
      if (routeRequestSeqRef.current !== requestSeq) return;
      setRoute(EMPTY_ROUTE);
      setError(routeError.message || 'Unable to calculate the route for this ticket.');
    } finally {
      if (routeRequestSeqRef.current === requestSeq) {
        setRouteLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!ticketId) {
      setJob(null);
      setJobLoading(false);
      setRoute(EMPTY_ROUTE);
      setNavigationStarted(false);
      return;
    }

    const loadJob = async () => {
      setJobLoading(true);
      setArrivalMessage('');
      setRoute(EMPTY_ROUTE);
      setNavigationStarted(false);

      try {
        const jobData = await fetchTechnicianJob(ticketId);
        setJob(jobData);
        const statusLower = String(jobData.status || '').toLowerCase().replace(/\s+/g, '_');
        setArrived(['arrived_on_site', 'in_progress', 'completed'].includes(statusLower));
        setError('');
      } catch (loadError) {
        setJob(null);
        setError(loadError.message || 'Unable to load job details.');
      } finally {
        setJobLoading(false);
      }
    };

    loadJob();
  }, [ticketId]);

  useEffect(() => {
    if (!watchStarted) {
      startWatching();
      setWatchStarted(true);
    }

    return () => {
      stopWatching();
    };
  }, []);

  useEffect(() => {
    if (!jobLoc || arrived) {
      return;
    }

    loadRoute();
  }, [ticketId, job?.latitude, job?.longitude, arrived]);

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
          await updateTechnicianLocation({ techName, lat: latitude, lng: longitude, accuracy });
        } catch (updateError) {
          console.warn('Failed to update technician location', updateError);
        }
      }

      if (!arrived && jobLoc) {
        await loadRoute(latitude, longitude);
      }
    };

    updateLocationAndRoute();
  }, [gpsLocation, arrived, techName, ticketId, job?.latitude, job?.longitude]);

  useEffect(() => {
    if (!route.routeCoords || route.routeCoords.length === 0 || !gpsLocation || !jobLoc) {
      return;
    }

    const userLatLng = [gpsLocation.latitude, gpsLocation.longitude];
    const distanceToJob = calculateDistanceKm(userLatLng[0], userLatLng[1], jobLoc[0], jobLoc[1]);
    // We intentionally do not auto-set `arrived = true` here because the technician
    // needs to explicitly click the 'Mark Arrived' button to update the backend status.

    if (currentStepIndex < route.directions.length) {
      const nextStep = route.directions[currentStepIndex];
      if (nextStep?.distance && nextStep.distance / 1000 < 0.1) {
        setCurrentStepIndex(Math.min(currentStepIndex + 1, route.directions.length - 1));
      }
    }
  }, [gpsLocation, route, currentStepIndex, job?.latitude, job?.longitude]);

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

  if (!ticketId) {
    return (
      <Layout>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h2 className="text-xl font-semibold">Navigation needs a selected ticket</h2>
          <p className="mt-2 text-sm">
            Open a job first so navigation can use the real customer address and coordinates.
          </p>
          <Link
            to="/technician/my-jobs"
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Go to My Jobs
          </Link>
        </div>
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
      <div className="mb-6 card p-4 sm:p-5">
        <h2 className="mb-2 flex items-center gap-3 text-xl font-semibold text-slate-800 sm:text-2xl">
          <FiNavigation className="text-blue-500" size={28} />
          Navigation to {formatTicketId(ticketId)}
        </h2>
        <p className="text-slate-600">
          {job ? `${job.service} for ${job.client?.full_name || job.client} | ${job.address || 'Location pending'}` : 'Loading job details...'}
        </p>
        <p className="mt-1 text-sm text-slate-500">Live GPS tracking enabled | {route.directions.length} turns</p>
        <GPSStatusIndicator status={gpsPermission} accuracy={gpsLocation?.accuracy} className="mt-2" />
        <GPSNotice
          status={gpsPermission}
          error={gpsError}
          location={gpsLocation}
          onRequestAccess={async () => {
            try {
              await requestPermission();
              startWatching();
            } catch {
              // The visible GPS notice explains what the technician needs to enable.
            }
          }}
          className="mt-3"
        />
        {gpsError && (
          <p className="mt-2 text-sm text-red-600">
            GPS error: Turn on Location/GPS and allow browser location access. {gpsError.message}
          </p>
        )}
        {error && !loading && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        {currentStep && (
          <div className="mt-3 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3">
            <p className="text-sm font-semibold text-blue-900">Next: {currentStep.instruction}</p>
            <p className="text-xs text-blue-700">
              {currentStep.distance ? `${(currentStep.distance / 1000).toFixed(1)} km` : ''}
              {currentStep.duration ? ` | ${Math.round(currentStep.duration / 60)} min` : ''}
            </p>
          </div>
        )}
      </div>

      <div className="mb-8 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="h-[60vh] min-h-[24rem] p-4">
              <PanelSkeleton rows={8} />
            </div>
          ) : (
            <MapContainer
              center={jobLoc || techLoc}
              zoom={CALABARZON_MIN_ZOOM}
              minZoom={CALABARZON_MIN_ZOOM}
              maxZoom={18}
              maxBounds={CALABARZON_BOUNDS}
              maxBoundsViscosity={1.0}
              className="h-[60vh] min-h-[24rem]"
            >
              <MapBoundsUpdater routeCoords={route.routeCoords} jobLoc={jobLoc} techLoc={techLoc} />
              <MapTileLayer />

              <Marker position={techLoc} icon={techIcon}>
                <Popup>
                  <div>
                    <strong>Your Location</strong>
                    <br />
                    Moving to job site...
                  </div>
                </Popup>
              </Marker>

              <Marker position={jobLoc} icon={jobIcon}>
                <Popup>
                  <div className="text-center">
                    <strong>Job Site</strong>
                    <br />
                    {route.distanceKm} km away
                    <br />
                    ~{route.estimatedTimeMin} min
                  </div>
                </Popup>
              </Marker>

              {route.routeCoords.length > 1 && (
                <>
                  {/* Full route in blue */}
                  <Polyline positions={route.routeCoords} color="#3b82f6" weight={5} opacity={0.8} />
                  {/* Completed portion in green */}
                  {currentStepIndex > 0 && currentStepIndex < route.routeCoords.length && (
                    <Polyline
                      positions={route.routeCoords.slice(0, currentStepIndex + 1)}
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

        <div className="space-y-4">
          <div className="rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-3xl font-bold">{route.distanceKm} km</div>
            <div className="text-blue-100">Distance</div>
          </div>

          <div className="rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 p-5 text-white shadow-lg">
            <div className="mb-1 text-3xl font-bold">{route.estimatedTimeMin} min</div>
            <div className="text-emerald-100">Travel Time</div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm sm:p-5">
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
                      {direction.duration ? ` | ${Math.round(direction.duration / 60)} min` : ''}
                    </p>
                  </div>
                  {index === currentStepIndex && <FiChevronRight className="flex-shrink-0 text-blue-500" size={20} />}
                </div>
              )) : (
                <p className="py-4 text-center text-slate-500">No directions available</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm sm:p-5">
            <h4 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">Actions</h4>
            <div className="space-y-3">
              <button
                onClick={() => loadRoute(undefined, undefined, { force: true })}
                disabled={routeLoading}
                className="group flex w-full items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-left transition hover:bg-slate-200"
              >
                <FiRefreshCw className={`transition-transform group-hover:rotate-180 ${routeLoading ? 'animate-spin' : ''}`} />
                {routeLoading ? 'Recalculating...' : 'Recalculate Route'}
              </button>
              {!arrived ? (
                <button
                  onClick={markArrived}
                  disabled={arrivalSaving}
                  className="flex w-full items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-white shadow-lg transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FiFlag />
                  {arrivalSaving ? 'Marking arrival...' : 'Mark Arrived'}
                </button>
              ) : (
                <div className="w-full rounded-xl border-2 border-emerald-400 bg-emerald-100 p-4 text-center font-medium text-emerald-800">
                  Arrived at site
                </div>
              )}
              {arrivalMessage && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  {arrivalMessage}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">
            GPS updates in real time | Route recalculates automatically
          </div>
        </div>
      </div>
    </Layout>
  );
}
