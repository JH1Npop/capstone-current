import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { getLocalDateInputValue } from '../../utils/date';
import { CALABARZON_BOUNDS, clampToCalabarzon } from '../../utils/mapRegion';
import { FiCheckCircle, FiSearch } from 'react-icons/fi';
import MapTileLayer from '../../components/maps/MapTileLayer';

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
  { value: 'afternoon', label: 'Afternoon (2 PM - 5 PM)' },
  { value: 'evening', label: 'Evening (5 PM - 8 PM)' }
];

const CALABARZON_PROVINCES = ['Cavite', 'Laguna', 'Batangas', 'Rizal', 'Quezon'];
const CITY_PROVINCE_OVERRIDES = {
  lucena: 'Quezon',
  'lucena city': 'Quezon',
};

const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

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

  return lat != null && lng != null ? <Marker position={[lat, lng]} /> : null;
}

export default function ClientServiceRequests() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const solarEstimateId = searchParams.get('solarEstimate');
  const [serviceTypes, setServiceTypes] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [notes, setNotes] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTimeSlot, setPreferredTimeSlot] = useState('');
  const [schedulingNotes, setSchedulingNotes] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [message, setMessage] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [successDialog, setSuccessDialog] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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
        setNotes((current) => current || `Solar site assessment for estimate #${estimate.id}: ${result.panelCount || 0} panels and ${result.installedCapacity || 0} kWp preliminary capacity.`);
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
      return;
    }

    try {
      const sw = CALABARZON_BOUNDS.getSouthWest();
      const ne = CALABARZON_BOUNDS.getNorthEast();
      const viewbox = `${sw.lng},${ne.lat},${ne.lng},${sw.lat}`;
      const results = await searchLocations({ query, viewbox, limit: 5 });
      setSearchResults(results);
    } catch (err) {
      setSubmitError(err.message || 'Location search failed.');
      setSearchResults([]);
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

  await reverseGeocode(clat, clng);
};

  // Reverse geocoding: Get address from coordinates
 const reverseGeocode = async (lat, lng) => {
  try {
    const result = await reverseGeocodeLocation({ lat, lng });

    if (!result) return;

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
  } catch (err) {
    setSubmitError(
      err.message ||
      'Could not read address from selected location.'
    );
  }
};

  // Handle map location change (when user clicks on map)
  const handleLocationChange = (lat, lng) => {
    const [clat, clng] = clampToCalabarzon(lat, lng);
    setMapCenter([clat, clng]);
    reverseGeocode(clat, clng);
  };

  const validateRequest = () => {
    setSubmitError('');

    if (serviceTypeIds.length === 0) {
      setMessage('');
      setSubmitError('Please choose at least one service type.');
      return false;
    }
    if (!serviceTypeIds.every((serviceTypeId) => serviceTypes.some((serviceType) => String(serviceType.id) === String(serviceTypeId)))) {
      setMessage('');
      setSubmitError('Please choose only available service types.');
      return false;
    }
    if (latitude == null || longitude == null) {
      setMessage('');
      setSubmitError('Please select location on the map (lat/lng).');
      return false;
    }
    if (!address.trim()) {
      setMessage('');
      setSubmitError('Please add a location note (street/landmark).');
      return false;
    }
    if (!city.trim()) {
      setMessage('');
      setSubmitError('Please enter a city.');
      return false;
    }
    if (!province.trim()) {
      setMessage('');
      setSubmitError('Please enter a province.');
      return false;
    }
    if (!preferredDate) {
      setMessage('');
      setSubmitError('Please select a preferred appointment date.');
      return false;
    }

    return true;
  };

  const createRequest = async () => {
    setIsSubmitting(true);
    setConfirmDialogOpen(false);
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
      const successMessage = `Your request has been submitted. Request #${createdRequest.id} is now waiting for review.`;
      setMessage(`Service request #${createdRequest.id} submitted for review.`);
      setSuccessDialog({
        title: 'Request submitted',
        message: successMessage,
      });
      setAddress('');
      setCity('');
      setProvince('');
      setNotes('');
      setServiceTypeIds([]);
      setPreferredDate('');
      setPreferredTimeSlot('');
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

  const handleSubmitRequest = (e) => {
    e.preventDefault();
    if (validateRequest()) {
      setConfirmDialogOpen(true);
    }
  };

  const messageToneClassName = message.startsWith('Service request #')
    ? 'text-green-600'
    : 'text-slate-600';
  const selectedTimeSlotLabel = TIME_SLOT_OPTIONS.find((option) => option.value === preferredTimeSlot)?.label || 'No preference';

  return (
    <Layout>
      {linkedEstimate ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Solar estimate #{linkedEstimate.id} is linked.</strong>{' '}
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
              <p className="mt-1 text-slate-800">{preferredDate}</p>
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
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <FiCheckCircle size={30} />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-950">{successDialog.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{successDialog.message}</p>
            <button
              type="button"
              onClick={() => {
                setSuccessDialog(null);
                setMessage('');
              }}
              className="mt-5 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              OK
            </button>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Service Requests</h1>
        <p className="text-sm text-slate-500">Create a service request, choose a service type, and pin the location for dispatch.</p>
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={handleSubmitRequest} className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Request Details</h2>
          </div>
          <div className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Client</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {[user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.username || 'Signed-in client'}
                </div>
              </div>
            </div>
            <div>
              <label className={labelClass}>Service Types</label>
              <div className="rounded-xl border border-slate-300 bg-white p-2">
                {serviceTypes.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {serviceTypes.map((serviceType) => {
                      const checked = serviceTypeIds.includes(String(serviceType.id));
                      return (
                        <label
                          key={serviceType.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                            checked ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleServiceType(serviceType.id)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                          />
                          <span>{serviceType.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-500">No service types available</div>
                )}
              </div>
              {selectedServiceTypes.length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
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
            </div>
            <div>
              <label className={labelClass}>Address / Landmark *</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="E.g., near SM Mall of Asia" required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>City *</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} placeholder="Enter city name" required />
            </div>
            <div>
              <label className={labelClass}>Province *</label>
              <input value={province} onChange={(e) => setProvince(e.target.value)} className={inputClass} placeholder="Enter province name" required />
            </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Preferred Appointment Date *</label>
                <input
                  type="date"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  min={getLocalDateInputValue()}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Preferred Time Slot</label>
                <select
                  value={preferredTimeSlot}
                  onChange={(e) => setPreferredTimeSlot(e.target.value)}
                  className={inputClass}
                >
                  {TIME_SLOT_OPTIONS.map((option) => (
                    <option key={option.value || 'none'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>
                Request Details <span className="text-slate-400">(Optional)</span>
              </label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows="3" placeholder="Describe your request"  />
            </div>
            {submitError && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p>}
            {message && <p className={`rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm ${messageToneClassName}`}>{message}</p>}
          </div>
          <div className="flex justify-end border-t border-slate-200 px-5 py-4">
            <button
              type="submit"
              disabled={isSubmitting || serviceTypes.length === 0}
              className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isSubmitting ? 'Submitting...' : 'Create Service Request'}
            </button>
          </div>
        </form>

        <div className="self-start rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Location Pin</h3>
          <div className="mt-4">
            <div className="relative">
              <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                <FiSearch className="text-slate-400" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for address, city, or landmark..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  autoComplete="off"
                />
              </div>

              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-elevated">
                  {searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectSearchResult(result)}
                      className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-brand-50"
                    >
                      <div className="font-medium truncate">{result.display_name.split(',')[0]}</div>
                      <div className="text-xs text-slate-500 truncate">{result.display_name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="map-wrapper h-72 border border-slate-200 lg:h-[24rem]">
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
          <div className="mt-3 text-xs font-medium text-slate-500">
            Selected: {latitude != null ? latitude.toFixed(6) : 'unset'} , {longitude != null ? longitude.toFixed(6) : 'unset'}
          </div>
          <button type="button" onClick={() => {
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const rawLat = pos.coords.latitude;
      const rawLng = pos.coords.longitude;

      const [clat, clng] = clampToCalabarzon(
        rawLat,
        rawLng
      );

      setLatitude(clat);
      setLongitude(clng);
      setMapCenter([clat, clng]);

      await reverseGeocode(clat, clng);

      setSubmitError('');

      const moved =
        Math.abs(clat - rawLat) > 0.0005 ||
        Math.abs(clng - rawLng) > 0.0005;

      setMessage(
        moved
          ? 'Your position was outside Calabarzon; the pin was moved to the nearest point inside the service area.'
          : 'Using your current location.'
      );
    },
    () => {
      setMessage('')
      setSubmitError(
        'Could not get current location.'
      );
    }
  );
}} className="mt-2 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">Use My Location</button>
        </div>
      </div>
    </Layout>
  );
}
