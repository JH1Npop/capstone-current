import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { MapContainer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  createServiceRequest,
  convertSolarEstimate,
  fetchSolarEstimate,
  fetchServiceTypes,
  reverseGeocodeLocation,
  searchLocations
} from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import { CALABARZON_BOUNDS, clampToCalabarzon } from '../../utils/mapRegion';
import { defaultLeafletMarkerIcon } from '../../utils/leafletMarkerIcon';
import { formatEstimateId, formatRequestId } from '../../utils/roleIds';
import {
  FiArrowRight,
  FiCheckCircle,
  FiMapPin,
  FiSearch,
  FiUser,
} from 'react-icons/fi';
import MapTileLayer from '../../components/maps/MapTileLayer';
import AppointmentAvailabilityCalendar from '../../components/client/AppointmentAvailabilityCalendar';

// Debounce helper
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

/** Region IV-A (Cavite, Laguna, Batangas, Rizal, Quezon) — map + search limited to this area. */
const TIME_SLOT_OPTIONS = [
  { value: '', label: 'No preference' },
  { value: 'morning', label: 'Morning (8 AM - 11 AM)' },
  { value: 'midday', label: 'Midday (11 AM - 2 PM)' },
  { value: 'afternoon', label: 'Afternoon (2 PM - 5 PM)' }
];

const isUnavailableAppointmentStatus = (status) => status === 'closed' || status === 'full';
const appointmentStatusLabel = (status) => (
  status === 'limited' ? 'Limited' : status === 'full' ? 'Full' : status === 'closed' ? 'Closed' : ''
);

const CALABARZON_PROVINCES = ['Cavite', 'Laguna', 'Batangas', 'Rizal', 'Quezon'];
const CITY_PROVINCE_OVERRIDES = {
  lucena: 'Quezon',
  'lucena city': 'Quezon',
};

// 44 px tall, with 16 px text on phones so the browser does not zoom into the field.
const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-900 sm:text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

function RequestSectionHeading({ id, title }) {
  return (
    <h2 id={id} className="text-base font-semibold text-slate-950">{title}</h2>
  );
}

// "2026-11-20" → "Fri, Nov 20, 2026" (read as a calendar day, not shifted by time zone).
const formatPreferredDate = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return value || '';
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

// An error shown inside the section it is about.
function SectionError({ text }) {
  return text ? <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{text}</p> : null;
}

const requestBrowserPosition = (options) => new Promise((resolve, reject) => {
  navigator.geolocation.getCurrentPosition(resolve, reject, options);
});

const getLocationErrorMessage = (error) => {
  if (error?.code === 1) {
    return 'Location permission is blocked. Open this site in your phone browser settings, set Location to Allow, then try again.';
  }
  if (error?.code === 2) {
    return 'Your phone could not determine its location. Turn on Location/GPS and Precise Location, then move near a window or outdoors and try again.';
  }
  if (error?.code === 3) {
    return 'Location took too long to respond. Check that Location/GPS is on, then try again.';
  }
  return 'Could not get your current location. You can still search for the address or tap the map to place the pin.';
};

const extractProvinceName = (address = {}, displayName = '', cityName = '') => {
  const rawDirectValue =
    address.province ||
    address.county ||
    address.state_district ||
    address.region ||
    '';
  const directValue = /\bdistrict\b/i.test(rawDirectValue) ? '' : rawDirectValue;
  const cityOverride = CITY_PROVINCE_OVERRIDES[String(cityName || '').trim().toLowerCase()];

  const searchableText = [
    directValue,
    address.state,
    displayName,
  ].filter(Boolean).join(' ').toLowerCase();

  return CALABARZON_PROVINCES.find((province) =>
    searchableText.includes(province.toLowerCase())
  ) || cityOverride || String(directValue || '').replace(/\s+Province$/i, '');
};

function LocationPicker({ lat, lng, setLat, setLng, onLocationChange }) {
  const map = useMapEvents({
    click(e) {
      const [clat, clng] = clampToCalabarzon(e.latlng.lat, e.latlng.lng);
      setLat(clat);
      setLng(clng);
      if (onLocationChange) {
        onLocationChange(clat, clng);
      }
    }
  });

  // Update map center when coordinates change
  useEffect(() => {
    if (lat != null && lng != null && map) {
      map.setView([lat, lng], map.getZoom());
    }
  }, [lat, lng, map]);

  return lat != null && lng != null ? <Marker position={[lat, lng]} icon={defaultLeafletMarkerIcon} /> : null;
}

export default function ClientServiceRequests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionRefs = { service: useRef(null), location: useRef(null), schedule: useRef(null) };
  // Which section a validation error belongs to, so it is shown (and scrolled to) there.
  const [errorSection, setErrorSection] = useState('');
  const [locationNotice, setLocationNotice] = useState('');
  const [searchState, setSearchState] = useState('idle');
  const solarEstimateId = searchParams.get('solarEstimate');
  const [serviceTypes, setServiceTypes] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [notes, setNotes] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTimeSlot, setPreferredTimeSlot] = useState('');
  const [selectedDateAvailability, setSelectedDateAvailability] = useState(null);
  const [schedulingNotes, setSchedulingNotes] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [message, setMessage] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [successDialog, setSuccessDialog] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [mapCenter, setMapCenter] = useState(() => {
    const c = CALABARZON_BOUNDS.getCenter();
    return [c.lat, c.lng];
  });
  const [linkedEstimate, setLinkedEstimate] = useState(null);

  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const selectedServiceTypes = serviceTypes.filter((serviceType) =>
    serviceTypeIds.some((serviceTypeId) => String(serviceType.id) === String(serviceTypeId))
  );
  const selectedServiceMaterials = selectedServiceTypes.flatMap((serviceType) =>
    Array.isArray(serviceType?.inventory_requirements)
      ? serviceType.inventory_requirements
        .filter((requirement) => requirement.auto_reserve)
        .map((requirement) => ({ ...requirement, service_type_name: serviceType.name }))
      : []
  );

  const toggleServiceType = (serviceTypeId) => {
    setServiceTypeIds((current) => {
      const normalizedId = String(serviceTypeId);
      if (current.includes(normalizedId)) {
        return current.filter((id) => id !== normalizedId);
      }
      return [...current, normalizedId];
    });
  };

  const loadPageData = async () => {
    try {
      const serviceTypeData = await fetchServiceTypes();
      setServiceTypes(serviceTypeData);
      setError('');
    } catch (err) {
      setServiceTypes([]);
      setError(err.message || 'Unable to load service types.');
    }
  };

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
    if (!solarEstimateId) {
      setLinkedEstimate(null);
      return;
    }
    fetchSolarEstimate(solarEstimateId)
      .then((estimate) => {
        setLinkedEstimate(estimate);
        const result = estimate.result_snapshot || {};
        setNotes((current) => current || `Solar site assessment for ${estimate.estimate_code || formatEstimateId(estimate.id)}: ${result.panelCount || 0} panels and ${result.installedCapacity || 0} kWp preliminary capacity.`);
      })
      .catch((loadError) => {
        setLinkedEstimate(null);
        setSubmitError(loadError.message || 'Unable to load the linked solar estimate.');
      });
  }, [solarEstimateId]);

  useEffect(() => {
    searchLocation(debouncedSearchQuery);
  }, [debouncedSearchQuery]);

  const searchLocation = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchState('idle');
      return;
    }

    setSearchState('searching');
    try {
      const sw = CALABARZON_BOUNDS.getSouthWest();
      const ne = CALABARZON_BOUNDS.getNorthEast();
      const viewbox = `${sw.lng},${ne.lat},${ne.lng},${sw.lat}`;
      const results = await searchLocations({ query, viewbox, limit: 5 });
      setSearchResults(results);
      setSearchState(results.length ? 'done' : 'empty');
    } catch (err) {
      setLocationError(err.message || 'Location search failed.');
      setSearchResults([]);
      setSearchState('idle');
    }
  };

const selectSearchResult = async (result) => {
  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);

  const [clat, clng] = clampToCalabarzon(lat, lng);

  setLatitude(clat);
  setLongitude(clng);
  setMapCenter([clat, clng]);

  setSearchQuery('');
  setSearchResults([]);
  setSearchState('idle');
  setLocationError('');

  await reverseGeocode(clat, clng);
};

  // Reverse geocoding: Get address from coordinates
 const reverseGeocode = async (lat, lng) => {
  try {
    const result = await reverseGeocodeLocation({ lat, lng });

    if (!result) return false;
    if (result.lookup_status === 'unavailable') {
      setLocationError(
        result.message ||
        'The map location is selected, but its address could not be loaded. Enter the address manually.'
      );
      return false;
    }

    const addr = result.address || {};

    const houseNumber = addr.house_number || '';
    const road = addr.road || addr.street || '';
    const barangay =
      addr.village ||
      addr.hamlet ||
      addr.suburb ||
      addr.neighbourhood ||
      '';

    const cityName =
      addr.city ||
      addr.town ||
      addr.municipality ||
      '';

    const provinceName = extractProvinceName(addr, result.display_name, cityName);

    const fullAddress = [
      houseNumber,
      road,
      barangay,
    ]
      .filter(Boolean)
      .join(', ');

    setAddress(
      fullAddress ||
      result.display_name ||
      ''
    );

    setCity(cityName);
    setProvince(provinceName);
    return true;
  } catch (err) {
    setLocationError(
      err.message ||
      'Could not read address from selected location. Enter the address manually.'
    );
    return false;
  }
};

  // Handle map location change (when user clicks on map)
  const handleLocationChange = (lat, lng) => {
    const [clat, clng] = clampToCalabarzon(lat, lng);
    setMapCenter([clat, clng]);
    setLocationError('');
    setLocationNotice('');
    reverseGeocode(clat, clng);
  };

  const insecurePhoneLocation =
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);

  const handleUseMyLocation = async () => {
    setLocationError('');
    setLocationNotice('');

    if (insecurePhoneLocation) {
      setLocationError(
        'Phone browsers block GPS on local HTTP links. Open the deployed HTTPS website, or use an HTTPS development link, then try again.'
      );
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('This browser does not support location access. Search for the address or tap the map instead.');
      return;
    }

    setIsLocating(true);
    try {
      let position;
      try {
        position = await requestBrowserPosition({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 30000,
        });
      } catch (error) {
        if (error?.code === 1) throw error;
        position = await requestBrowserPosition({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 120000,
        });
      }

      const rawLat = position.coords.latitude;
      const rawLng = position.coords.longitude;
      const [clat, clng] = clampToCalabarzon(rawLat, rawLng);

      setLatitude(clat);
      setLongitude(clng);
      setMapCenter([clat, clng]);
      setSubmitError('');
      const addressResolved = await reverseGeocode(clat, clng);

      const moved = Math.abs(clat - rawLat) > 0.0005 || Math.abs(clng - rawLng) > 0.0005;
      setLocationNotice(
        moved
          ? 'Your position was outside Calabarzon; the pin was moved to the nearest point inside the service area.'
          : addressResolved
            ? `Current location selected${Number.isFinite(position.coords.accuracy) ? ` (accuracy about ${Math.round(position.coords.accuracy)} m)` : ''}.`
            : 'Current location pin selected. Please confirm the address fields before submitting.'
      );
    } catch (error) {
      setLocationError(getLocationErrorMessage(error));
    } finally {
      setIsLocating(false);
    }
  };

  const failIn = (section, text) => {
    setMessage('');
    setErrorSection(section);
    setSubmitError(text);
    // Bring the section with the problem into view (on a phone it can be far above the button).
    window.requestAnimationFrame(() => sectionRefs[section]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return false;
  };

  const validateRequest = () => {
    setSubmitError('');
    setErrorSection('');

    if (serviceTypeIds.length === 0) {
      return failIn('service', 'Please choose at least one service type.');
    }
    if (!serviceTypeIds.every((serviceTypeId) => serviceTypes.some((serviceType) => String(serviceType.id) === String(serviceTypeId)))) {
      return failIn('service', 'Please choose only available service types.');
    }
    if (latitude == null || longitude == null) {
      return failIn('location', 'Please select location on the map (lat/lng).');
    }
    if (!address.trim()) {
      return failIn('location', 'Please add a location note (street/landmark).');
    }
    if (!city.trim()) {
      return failIn('location', 'Please enter a city.');
    }
    if (!province.trim()) {
      return failIn('location', 'Please enter a province.');
    }
    if (!preferredDate) {
      return failIn('schedule', 'Please select a preferred appointment date.');
    }
    if (selectedDateAvailability?.availability?.status === 'unavailable') {
      return failIn('schedule', 'The selected appointment date has no availability. Please choose another date.');
    }
    const selectedSlotStatus = selectedDateAvailability?.availability?.slots?.[preferredTimeSlot]?.status;
    if (preferredTimeSlot && isUnavailableAppointmentStatus(selectedSlotStatus)) {
      return failIn('schedule', 'The selected time slot is full or closed. Please choose an available time slot.');
    }

    return true;
  };

  const createRequest = async () => {
    setIsSubmitting(true);
    setConfirmDialogOpen(false);
    setErrorSection('');
    setMessage('Submitting service request...');
    try {
      const requestPayload = {
        service_type: Number(serviceTypeIds[0]),
        service_types: serviceTypeIds.map((serviceTypeId) => Number(serviceTypeId)),
        description: notes.trim() || 'No additional details provided.',
        priority: 'Normal',
        preferred_date: preferredDate || null,
        preferred_time_slot: preferredTimeSlot || null,
        scheduling_notes: schedulingNotes.trim() || null,
        location_address: address.trim(),
        location_city: city.trim(),
        location_province: province.trim(),
        latitude,
        longitude
      };
      const conversion = linkedEstimate
        ? await convertSolarEstimate(linkedEstimate.id, requestPayload)
        : null;
      const createdRequest = conversion?.service_request || await createServiceRequest(requestPayload);
      setSubmitError('');
      const successMessage = `Your request has been submitted. ${formatRequestId(createdRequest.id)} is now waiting for review.`;
      setMessage(`Service request #${createdRequest.id} submitted for review.`);
      setSuccessDialog({
        title: 'Request submitted',
        message: successMessage,
        requestId: createdRequest.id,
      });
      setLocationNotice('');
      setAddress('');
      setCity('');
      setProvince('');
      setNotes('');
      setServiceTypeIds([]);
      setPreferredDate('');
      setPreferredTimeSlot('');
      setSelectedDateAvailability(null);
      setSchedulingNotes('');
      setLatitude(null);
      setLongitude(null);
      setLinkedEstimate(null);
      if (solarEstimateId) setSearchParams({}, { replace: true });
      const c = CALABARZON_BOUNDS.getCenter();
      setMapCenter([c.lat, c.lng]);
      await loadPageData();
    } catch (err) {
      setMessage('');
      setSubmitError(err.message || 'Unable to create service request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Warn before the page is closed with a half-filled form.
  const formStarted = Boolean(serviceTypeIds.length || address.trim() || notes.trim() || preferredDate || latitude != null);
  useEffect(() => {
    if (!formStarted || isSubmitting) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [formStarted, isSubmitting]);

  // Escape closes the success box.
  useEffect(() => {
    if (!successDialog) return undefined;
    const close = (event) => {
      if (event.key === 'Escape') {
        setSuccessDialog(null);
        setMessage('');
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [successDialog]);

  // Progress shown on the step bar.
  const stepsDone = {
    Service: serviceTypeIds.length > 0,
    Location: latitude != null && Boolean(address.trim() && city.trim() && province.trim()),
    Schedule: Boolean(preferredDate),
    Details: Boolean(notes.trim()),
  };
  const stepTargets = { Service: 'service', Location: 'location', Schedule: 'schedule', Details: 'details' };
  const detailsRef = useRef(null);
  const goToStep = (step) => {
    const ref = step === 'Details' ? detailsRef : sectionRefs[stepTargets[step]];
    ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmitRequest = (e) => {
    e.preventDefault();
    if (validateRequest()) {
      setConfirmDialogOpen(true);
    }
  };

  const messageToneClassName = message.includes('REQ-')
    ? 'text-green-600'
    : 'text-slate-600';
  const selectedTimeSlotLabel = TIME_SLOT_OPTIONS.find((option) => option.value === preferredTimeSlot)?.label || 'No preference';

  return (
    <Layout>
      {linkedEstimate ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{linkedEstimate.estimate_code || formatEstimateId(linkedEstimate.id)} is linked.</strong>{' '}
          Select the site-assessment service, appointment, and exact map location to submit it for review.
        </div>
      ) : null}
      {confirmDialogOpen && (
        <ConfirmationDialog
          title="Submit service request?"
          message="Review the details before sending it to AFN."
          tone="brand"
          icon="info"
          confirmLabel="Confirm submit"
          cancelLabel="Review again"
          loading={isSubmitting}
          onCancel={() => setConfirmDialogOpen(false)}
          onConfirm={createRequest}
        >
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-3 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Services</p>
              <p className="mt-1 font-medium text-slate-900">
                {selectedServiceTypes.map((serviceType) => serviceType.name).join(', ')}
              </p>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-3 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Location</p>
              <p className="mt-1 text-slate-800">{address}</p>
              <p className="mt-1 text-xs text-slate-500">{[city, province].filter(Boolean).join(', ')}</p>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Preferred Date</p>
              <p className="mt-1 text-slate-800">{formatPreferredDate(preferredDate)}</p>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Time Slot</p>
              <p className="mt-1 text-slate-800">{selectedTimeSlotLabel}</p>
            </div>
            {notes.trim() && (
              <div className="rounded-2xl border border-surface-200 bg-white p-3 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Details</p>
                <p className="mt-1 text-slate-800">{notes.trim()}</p>
              </div>
            )}
          </div>
        </ConfirmationDialog>
      )}

      {successDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div role="dialog" aria-modal="true" aria-labelledby="request-success-title" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <FiCheckCircle size={30} />
            </div>
            <h2 id="request-success-title" className="mt-4 text-xl font-bold text-slate-950">{successDialog.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{successDialog.message}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => navigate(`/client/requests/${successDialog.requestId}?entity=request`)}
                className="min-h-11 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
              >
                View request
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setSuccessDialog(null);
                  setMessage('');
                }}
                className="min-h-11 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <section aria-label="Request steps" className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Plan your service visit</p>
            <p className="mt-0.5 text-xs text-slate-500">Complete each section, then review your request before sending it.</p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-semibold text-slate-500 sm:w-[25rem]">
            {['Service', 'Location', 'Schedule', 'Details'].map((step, index) => (
              <button
                key={step}
                type="button"
                onClick={() => goToStep(step)}
                aria-label={`${step}${stepsDone[step] ? ' (done)' : ''}`}
                className={`min-h-11 rounded-lg px-2 py-2 transition ${stepsDone[step] ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 hover:bg-slate-100'}`}
              >
                <span className={`mr-1 ${stepsDone[step] ? 'text-emerald-600' : 'text-brand-600'}`}>{stepsDone[step] ? '✓' : index + 1}</span>{step}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      <div className="mt-5">
        <form onSubmit={handleSubmitRequest} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-5 p-5 sm:p-6">
            <div ref={sectionRefs.service} className="scroll-mt-24">
            <RequestSectionHeading
              id="request-service-title"
              title="Choose services"
            />
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
                <FiUser aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Requesting as</p>
                <p className="truncate text-sm font-semibold text-slate-800">
                  {[user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.username || 'Signed-in client'}
                </p>
              </div>
            </div>
            <div>
              <p id="request-service-types" className={labelClass}>Service Types *</p>
              <div role="group" aria-labelledby="request-service-types" className="rounded-xl border border-slate-300 bg-white p-2">
                {serviceTypes.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {serviceTypes.map((serviceType) => {
                      const checked = serviceTypeIds.includes(String(serviceType.id));
                      return (
                        <label
                          key={serviceType.id}
                          className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                            checked ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleServiceType(serviceType.id)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium">{serviceType.name}</span>
                            {serviceType.description ? <span className="mt-0.5 block line-clamp-2 text-xs text-slate-500">{serviceType.description}</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-500">No service types available</div>
                )}
              </div>
              {selectedServiceTypes.length > 0 && (
                <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2.5 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800">
                    Selected services: {selectedServiceTypes.map((serviceType) => serviceType.name).join(', ')}
                  </div>
                  {selectedServiceMaterials.length > 0 ? (
                    <>
                      <div className="mt-2 font-semibold text-slate-800">Materials reserved after technician assignment</div>
                      <div className="mt-1">
                        {selectedServiceMaterials.map((requirement) => (
                          `${requirement.service_type_name}: ${requirement.item_name} x${requirement.quantity}`
                        )).join(', ')}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
              {errorSection === 'service' ? <SectionError text={submitError} /> : null}
            </div>
            <div ref={sectionRefs.location} className="scroll-mt-24 border-t border-slate-200 pt-5">
              <RequestSectionHeading
                id="request-location-title"
                title="Service location"
              />
              <p className="mt-1 text-xs text-slate-500">Search, tap the map or use your location to drop a pin. The address fields fill in, and you can correct them.</p>
            </div>
            {/* Full-width step: search and "Use My Location" on one row, the map, then the address fields in one row. */}
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                    <FiSearch className="text-slate-400" size={18} aria-hidden="true" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search address or landmark"
                      aria-label="Search service location"
                      className="min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
                      autoComplete="off"
                      onKeyDown={(event) => {
                        // The search sits inside the form: Enter picks the first place instead of submitting.
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (searchResults[0]) selectSearchResult(searchResults[0]);
                        }
                        if (event.key === 'Escape') {
                          setSearchResults([]);
                          setSearchState('idle');
                        }
                      }}
                    />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-elevated">
                      {searchResults.map((result, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => selectSearchResult(result)}
                          className="min-h-11 w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-brand-50"
                        >
                          <div className="truncate font-medium">{result.display_name.split(',')[0]}</div>
                          <div className="truncate text-xs text-slate-500">{result.display_name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={isLocating}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-wait disabled:opacity-60"
                >
                  <FiMapPin aria-hidden="true" />
                  {isLocating ? 'Finding location...' : 'Use My Location'}
                </button>
              </div>
              {searchState === 'empty' && searchQuery.trim() ? (
                <p role="status" className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">No places found in the service area. Try a nearby landmark, or tap the map.</p>
              ) : null}

              <div className="map-wrapper h-72 overflow-hidden rounded-xl border border-slate-200 lg:h-80">
                <MapContainer
                  center={mapCenter}
                  zoom={10}
                  className="h-full w-full"
                  maxBounds={CALABARZON_BOUNDS}
                  maxBoundsViscosity={1}
                  minZoom={9}
                  maxZoom={18}
                >
                  <MapTileLayer />
                  <LocationPicker lat={latitude} lng={longitude} setLat={setLatitude} setLng={setLongitude} onLocationChange={handleLocationChange} />
                </MapContainer>
              </div>

              {/* Pin status and any location message, side by side on wide screens. */}
              <div className="grid gap-2 md:grid-cols-2">
                <div className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                  latitude != null && longitude != null
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${latitude != null && longitude != null ? 'bg-green-500' : 'bg-slate-300'}`} />
                  {latitude != null && longitude != null
                    ? `Pin selected: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                    : 'No location pin selected yet'}
                </div>
                {locationError ? (
                  <p className="flex min-h-11 items-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800" role="alert">
                    {locationError}
                  </p>
                ) : locationNotice ? (
                  <p role="status" className="flex min-h-11 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">{locationNotice}</p>
                ) : null}
              </div>
              {insecurePhoneLocation ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  GPS cannot open from a phone using this local HTTP address. Use the deployed HTTPS site or an HTTPS development link. Address search and manual map selection still work.
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3 pt-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="col-span-2 lg:col-span-1">
                  <label htmlFor="request-address" className={labelClass}>Address / Landmark *</label>
                  <input id="request-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="House number, street, barangay, or nearby landmark" required />
                </div>
                <div>
                  <label htmlFor="request-city" className={labelClass}>City *</label>
                  <input id="request-city" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} placeholder="Enter city name" required />
                </div>
                <div>
                  <label htmlFor="request-province" className={labelClass}>Province *</label>
                  <input id="request-province" value={province} onChange={(e) => setProvince(e.target.value)} className={inputClass} placeholder="Enter province name" required />
                </div>
              </div>
              {errorSection === 'location' ? <SectionError text={submitError} /> : null}
            </div>
            <section ref={sectionRefs.schedule} className="scroll-mt-24 border-t border-slate-200 pt-5" aria-labelledby="preferred-schedule-title">
              <RequestSectionHeading
                id="preferred-schedule-title"
                title="Preferred schedule"
              />
              <div className="mt-5">
                <AppointmentAvailabilityCalendar
                  value={preferredDate}
                  onChange={setPreferredDate}
                  onSelectedDayChange={setSelectedDateAvailability}
                />
              </div>
              <div className="mt-4">
                <label htmlFor="request-time-slot" className={labelClass}>Preferred Time Slot</label>
                <select
                  id="request-time-slot"
                  value={preferredTimeSlot}
                  onChange={(e) => setPreferredTimeSlot(e.target.value)}
                  className={inputClass}
                >
                  {TIME_SLOT_OPTIONS.map((option) => (
                    <option
                      key={option.value || 'none'}
                      value={option.value}
                      disabled={Boolean(
                        option.value
                        && isUnavailableAppointmentStatus(selectedDateAvailability?.availability?.slots?.[option.value]?.status)
                      )}
                    >
                      {option.label}
                      {option.value && appointmentStatusLabel(selectedDateAvailability?.availability?.slots?.[option.value]?.status)
                        ? ` — ${appointmentStatusLabel(selectedDateAvailability?.availability?.slots?.[option.value]?.status)}`
                        : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Service visits are scheduled during business hours, from 8 AM to 5 PM.</p>
              </div>
              {errorSection === 'schedule' ? <SectionError text={submitError} /> : null}
            </section>
            <div ref={detailsRef} className="scroll-mt-24 border-t border-slate-200 pt-5">
              <RequestSectionHeading
                id="request-details-title"
                title="Additional details"
              />
            </div>
            <div>
              <label htmlFor="request-details" className={labelClass}>
                Notes <span className="text-slate-400">(Optional)</span>
              </label>
              <textarea id="request-details" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows="4" placeholder="Describe the work needed or anything the team should know before visiting" />
            </div>
            {submitError && !errorSection ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p> : null}
            {message && <p className={`rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm ${messageToneClassName}`}>{message}</p>}
          </div>
          <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
            <button
              type="submit"
              disabled={isSubmitting || serviceTypes.length === 0}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isSubmitting ? 'Submitting...' : 'Create Service Request'}
              {!isSubmitting && <FiArrowRight aria-hidden="true" />}
            </button>
          </div>
        </form>

      </div>
    </Layout>
  );
}
