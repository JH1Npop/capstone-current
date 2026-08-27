import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FiCalendar, FiCheck, FiClipboard, FiClock, FiDownload, FiMap, FiPlus, FiRefreshCw, FiX, FiMoreVertical, FiCheckCircle, FiXCircle, FiCheckSquare, FiSearch } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  SERVICE_REQUEST_REVIEW_CAPABILITIES,
  SERVICE_TICKET_MANAGE_CAPABILITIES,
  SUPERVISOR_DISPATCH_CAPABILITIES,
  hasAnyCapability
} from '../../rbac';
import RescheduleTicketModal from '../../components/shared/RescheduleTicketModal';
import InspectionReviewModal from '../../components/shared/InspectionReviewModal';
import InspectionDetailsModal from '../../components/shared/InspectionDetailsModal';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import QuotationProposalModal from '../../components/shared/QuotationProposalModal';
import TurnoverAcceptanceModal from '../../components/shared/TurnoverAcceptanceModal';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/ui/StateDisplay';
import StatusBadge, { formatStatusLabel } from '../../components/ui/StatusBadge';
import SLABadge, { formatSlaSummary } from '../../components/ui/SLABadge';
import { formatClientId, formatTechnicianId, formatTicketId } from '../../utils/roleIds';
import {
  approveServiceRequest,
  createServiceRequest,
  fetchAdminClients,
  fetchServiceTicketSummary,
  fetchServiceTickets,
  fetchServiceTypes,
  fetchTicketTimeline,
  downloadTicketDocument,
  reverseGeocodeLocation,
  rejectServiceRequest,
  rescheduleServiceTicket,
  searchLocations
} from '../../api/api';
import { CALABARZON_BOUNDS, CALABARZON_CENTER, CALABARZON_MIN_ZOOM, clampToCalabarzon } from '../../utils/mapRegion';
import MapTileLayer from '../../components/maps/MapTileLayer';
import { queueActionLabel } from '../../utils/dashboardHelpers';

const initialWalkInForm = {
  client: '',
  serviceTypeIds: [],
  description: '',
  priority: 'Normal',
  preferredDate: '',
  preferredTimeSlot: '',
  schedulingNotes: '',
  address: '',
  city: '',
  province: '',
  latitude: '',
  longitude: '',
  approveNow: true
};

const priorityOptions = ['Low', 'Normal', 'High', 'Urgent'];

const timeSlotOptions = [
  { value: '', label: 'Any time' },
  { value: 'morning', label: 'Morning' },
  { value: 'midday', label: 'Midday' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' }
];

const getServiceTypeName = (serviceType) => serviceType?.name || serviceType?.service || `Service #${serviceType?.id}`;
const getClientLabel = (client) => {
  const mainLabel = client?.name || client?.full_name || client?.username || client?.email || `Client #${client?.id}`;
  return `${mainLabel}${client?.email ? ` (${client.email})` : ''}`;
};

const shortSourceLabel = (sourceLabel = '') =>
  String(sourceLabel).replace(/\s+Portal$/i, '').trim() || sourceLabel;

const normalizeStatus = (status) => String(status || '').toLowerCase().replace(/\s+/g, '_');
const CLOSED_QUEUE_STATUSES = new Set(['completed', 'cancelled']);
const isClosedTicket = (ticket) => CLOSED_QUEUE_STATUSES.has(normalizeStatus(ticket.status));
const ITEMS_PER_PAGE = 15;
const CALABARZON_PROVINCES = ['Cavite', 'Laguna', 'Batangas', 'Rizal', 'Quezon'];
const CITY_PROVINCE_OVERRIDES = {
  lucena: 'Quezon',
  'lucena city': 'Quezon',
};

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
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

function WalkInLocationPicker({ latitude, longitude, onChange }) {
  const map = useMapEvents({
    click(event) {
      const [clat, clng] = clampToCalabarzon(event.latlng.lat, event.latlng.lng);
      onChange(clat, clng);
    }
  });

  useEffect(() => {
    if (latitude == null || longitude == null || !map) return;
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);

  return latitude != null && longitude != null ? <Marker position={[latitude, longitude]} /> : null;
}

export default function AdminServiceTickets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canReviewRequests = hasAnyCapability(user, SERVICE_REQUEST_REVIEW_CAPABILITIES);
  const canManageTickets = hasAnyCapability(user, SERVICE_TICKET_MANAGE_CAPABILITIES);
  const canDispatch = hasAnyCapability(user, SUPERVISOR_DISPATCH_CAPABILITIES);
  const [tickets, setTickets] = useState([]);
  const [clients, setClients] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [walkInForm, setWalkInForm] = useState(initialWalkInForm);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [walkInMessage, setWalkInMessage] = useState('');
  const [walkInError, setWalkInError] = useState('');
  const [walkInSearchQuery, setWalkInSearchQuery] = useState('');
  const [walkInSearchResults, setWalkInSearchResults] = useState([]);
  const [walkInMapCenter, setWalkInMapCenter] = useState(CALABARZON_CENTER);
  const [rescheduleTicket, setRescheduleTicket] = useState(null);
  const [timelineTicket, setTimelineTicket] = useState(null);
  const [actionModalTicket, setActionModalTicket] = useState(null);
  const [quotationModalTicket, setQuotationModalTicket] = useState(null);
  const [turnoverModalTicket, setTurnoverModalTicket] = useState(null);
  const [inspectionReviewTicket, setInspectionReviewTicket] = useState(null);
  const [inspectionDetailsTicket, setInspectionDetailsTicket] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [rescheduleMessage, setRescheduleMessage] = useState('');
  const [ticketSummary, setTicketSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rejectDecision, setRejectDecision] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingTicket, setRejectingTicket] = useState(false);
  const [documentDownloadId, setDocumentDownloadId] = useState(null);
  const debouncedWalkInSearchQuery = useDebounce(walkInSearchQuery, 500);

  const loadData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const [ticketData, serviceTypeData, clientData, summaryData] = await Promise.all([
        fetchServiceTickets({ queue: 'active' }),
        fetchServiceTypes(),
        canReviewRequests ? fetchAdminClients() : Promise.resolve([]),
        fetchServiceTicketSummary()
      ]);
      setTickets(ticketData);
      setServiceTypes(serviceTypeData);
      setClients(clientData.filter((client) => client.active));
      setTicketSummary(summaryData);
      setError('');
    } catch (loadError) {
      setTickets([]);
      setTicketSummary(null);
      setError(loadError.message || 'Unable to load service tickets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(true); }, [canReviewRequests]);

  useEffect(() => {
    const searchWalkInLocation = async () => {
      if (!debouncedWalkInSearchQuery.trim()) {
        setWalkInSearchResults([]);
        return;
      }

      try {
        const sw = CALABARZON_BOUNDS.getSouthWest();
        const ne = CALABARZON_BOUNDS.getNorthEast();
        const viewbox = `${sw.lng},${ne.lat},${ne.lng},${sw.lat}`;
        const results = await searchLocations({ query: debouncedWalkInSearchQuery, viewbox, limit: 5 });
        setWalkInSearchResults(results);
      } catch (searchError) {
        setWalkInSearchResults([]);
        setWalkInError(searchError.message || 'Location search failed.');
      }
    };

    searchWalkInLocation();
  }, [debouncedWalkInSearchQuery]);

  const updateWalkInForm = (field, value) => {
    setWalkInForm((currentForm) => ({ ...currentForm, [field]: value }));
    setWalkInError('');
    setWalkInMessage('');
  };

  const reverseGeocodeWalkInLocation = async (lat, lng) => {
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
      const fullAddress = [houseNumber, road, barangay].filter(Boolean).join(', ');

      setWalkInForm((currentForm) => ({
        ...currentForm,
        address: fullAddress || result.display_name || currentForm.address,
        city: cityName || currentForm.city,
        province: provinceName || currentForm.province,
      }));
    } catch (geocodeError) {
      setWalkInError(geocodeError.message || 'Could not read address from selected location.');
    }
  };

  const handleWalkInLocationChange = async (lat, lng) => {
    const [clat, clng] = clampToCalabarzon(lat, lng);
    setWalkInMapCenter([clat, clng]);
    setWalkInForm((currentForm) => ({
      ...currentForm,
      latitude: String(clat),
      longitude: String(clng),
    }));
    setWalkInError('');
    await reverseGeocodeWalkInLocation(clat, clng);
  };

  const handleWalkInSearchSelect = async (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    await handleWalkInLocationChange(lat, lng);
    setWalkInSearchQuery('');
    setWalkInSearchResults([]);
  };

  const toggleServiceType = (serviceTypeId) => {
    setWalkInForm((currentForm) => {
      const exists = currentForm.serviceTypeIds.includes(serviceTypeId);
      return {
        ...currentForm,
        serviceTypeIds: exists
          ? currentForm.serviceTypeIds.filter((id) => id !== serviceTypeId)
          : [...currentForm.serviceTypeIds, serviceTypeId]
      };
    });
    setWalkInError('');
    setWalkInMessage('');
  };

  const resetWalkInForm = () => {
    setWalkInForm(initialWalkInForm);
    setWalkInSearchQuery('');
    setWalkInSearchResults([]);
    setWalkInMapCenter(CALABARZON_CENTER);
    setWalkInError('');
  };

  const openRescheduleModal = (ticket) => {
    setRescheduleTicket(ticket);
    setRescheduleMessage('');
    setError('');
  };

  const openTimelineModal = async (ticket) => {
    setTimelineTicket(ticket);
    setTimelineEvents([]);
    setTimelineError('');
    setTimelineLoading(true);

    try {
      const events = await fetchTicketTimeline(ticket.id);
      setTimelineEvents(events);
    } catch (timelineLoadError) {
      setTimelineError(timelineLoadError.message || 'Unable to load ticket timeline.');
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleApproveTicket = async (ticketId) => {
    try {
      await approveServiceRequest(ticketId);
      await loadData();
      setActionModalTicket(null);
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to approve ticket.');
    }
  };

  const handleRejectTicket = async (ticketId) => {
    setRejectDecision({ id: ticketId, label: formatTicketId(ticketId) });
    setRejectReason('');
  };

  const handleDownloadFieldServiceReport = async (ticket) => {
    setDocumentDownloadId(ticket.id);
    setError(null);
    try {
      await downloadTicketDocument(ticket.id, 'field_service_report');
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setDocumentDownloadId(null);
    }
  };

  const confirmRejectTicket = async () => {
    if (!rejectDecision) return;
    setRejectingTicket(true);
    try {
      await rejectServiceRequest(rejectDecision.id, rejectReason.trim() || 'Request rejected during admin review.');
      await loadData();
      setActionModalTicket(null);
      setRejectDecision(null);
      setRejectReason('');
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to reject ticket.');
    } finally {
      setRejectingTicket(false);
    }
  };

  const handleRescheduleSubmit = async (ticketId, schedulingData) => {
    await rescheduleServiceTicket(ticketId, schedulingData);
    await loadData();
    setRescheduleTicket(null);
    setRescheduleMessage(`${formatTicketId(ticketId)} schedule updated.`);
  };

  const handleWalkInSubmit = async (event) => {
    event.preventDefault();
    const latitude = Number(walkInForm.latitude);
    const longitude = Number(walkInForm.longitude);

    if (!walkInForm.client) {
      setWalkInError('Please select the walk-in client.');
      return;
    }
    if (walkInForm.serviceTypeIds.length === 0) {
      setWalkInError('Please select at least one service.');
      return;
    }
    if (!walkInForm.description.trim()) {
      setWalkInError('Please add a short request description.');
      return;
    }
    if (!walkInForm.preferredDate) {
      setWalkInError('Please choose the preferred service date.');
      return;
    }
    if (!walkInForm.address.trim() || !walkInForm.city.trim() || !walkInForm.province.trim()) {
      setWalkInError('Please complete the service address, city, and province.');
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setWalkInError('Please enter valid latitude and longitude for dispatch.');
      return;
    }

    try {
      setWalkInSubmitting(true);
      setWalkInError('');
      setWalkInMessage('');

      const serviceIds = walkInForm.serviceTypeIds.map(Number);
      const createdRequest = await createServiceRequest({
        client: Number(walkInForm.client),
        service_type: serviceIds[0],
        service_types: serviceIds,
        description: walkInForm.description.trim(),
        priority: walkInForm.priority,
        request_source: 'walk_in',
        preferred_date: walkInForm.preferredDate,
        preferred_time_slot: walkInForm.preferredTimeSlot || null,
        scheduling_notes: walkInForm.schedulingNotes.trim() || null,
        location_address: walkInForm.address.trim(),
        location_city: walkInForm.city.trim(),
        location_province: walkInForm.province.trim(),
        latitude,
        longitude
      });

      if (walkInForm.approveNow) {
        await approveServiceRequest(createdRequest.id);
      }

      await loadData();
      setWalkInForm(initialWalkInForm);
      setWalkInSearchQuery('');
      setWalkInSearchResults([]);
      setWalkInMapCenter(CALABARZON_CENTER);
      setWalkInMessage(
        walkInForm.approveNow
          ? `Walk-in request #${createdRequest.id} approved and added to dispatch.`
          : `Walk-in request #${createdRequest.id} saved for review.`
      );
    } catch (submitError) {
      setWalkInError(submitError.message || 'Unable to create walk-in request.');
    } finally {
      setWalkInSubmitting(false);
    }
  };

  const activeQueueTickets = tickets.filter((ticket) => !isClosedTicket(ticket));
  const completedTickets = tickets.filter((ticket) => normalizeStatus(ticket.status) === 'completed');
  const unassignedTickets = activeQueueTickets.filter((t) => !t.assignedTech);
  const missedDispatchTickets = activeQueueTickets.filter((t) => t.isMissedDispatch);
  const warningTickets = activeQueueTickets.filter((t) => t?.sla?.state === 'warning');
  const overdueTickets = activeQueueTickets.filter((t) => t?.sla?.state === 'overdue');
  const activeQueueCount = ticketSummary?.activeQueue ?? activeQueueTickets.length;
  const missedDispatchCount = ticketSummary?.missedDispatch ?? missedDispatchTickets.length;
  const slaRiskCount = ticketSummary?.slaRisk ?? (overdueTickets.length + warningTickets.length);
  const completedCount = ticketSummary?.completed ?? completedTickets.length;
  const sortedTickets = [...activeQueueTickets].sort((firstTicket, secondTicket) => {
    if (firstTicket.isMissedDispatch !== secondTicket.isMissedDispatch) {
      return firstTicket.isMissedDispatch ? -1 : 1;
    }
    return new Date(firstTicket.scheduledDate || 0) - new Date(secondTicket.scheduledDate || 0);
  });
  const totalPages = Math.max(1, Math.ceil(sortedTickets.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTickets = sortedTickets.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);
  const visibleStartIndex = sortedTickets.length ? pageStartIndex + 1 : 0;
  const visibleEndIndex = Math.min(pageStartIndex + ITEMS_PER_PAGE, sortedTickets.length);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  return (
    <Layout>
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-end">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
            {canReviewRequests && <button
              onClick={() => setShowWalkInForm((isVisible) => !isVisible)}
              className="inline-flex items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100"
            >
              {showWalkInForm ? <FiX className="mr-2" /> : <FiPlus className="mr-2" />}
              {showWalkInForm ? 'Close Walk-in Form' : 'Create Walk-in Request'}
            </button>}
            <button
              onClick={() => navigate('/admin/job-history')}
              className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
            >
              <FiCheck className="mr-2" /> Job History
            </button>
        </div>
      </section>

      {error && (
        <div className="mt-5">
          <ErrorState
            error={error}
            onRetry={loadData}
          />
        </div>
      )}

      {!canReviewRequests && !canManageTickets && (
        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          You have view-only access to the service queue. Request decisions and ticket changes require additional capabilities.
        </div>
      )}

      {rescheduleMessage && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          {rescheduleMessage}
        </div>
      )}

      {canReviewRequests && showWalkInForm && (
        <section className="mt-5">
          <form onSubmit={handleWalkInSubmit} className="card p-4 sm:p-5">
            <div className="flex flex-col gap-2 border-b border-surface-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create Walk-in Request</h2>
                <p className="text-sm text-slate-500">For clients who request service in person or by phone.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={walkInForm.approveNow}
                  onChange={(event) => updateWalkInForm('approveNow', event.target.checked)}
                  className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                Approve and create ticket now
              </label>
            </div>

            {walkInMessage && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                {walkInMessage}
              </div>
            )}
            {walkInError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {walkInError}
              </div>
            )}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Client
                <select
                  value={walkInForm.client}
                  onChange={(event) => updateWalkInForm('client', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{getClientLabel(client)}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Priority
                <select
                  value={walkInForm.priority}
                  onChange={(event) => updateWalkInForm('priority', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-slate-700">Services</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {serviceTypes.map((serviceType) => {
                  const serviceTypeId = String(serviceType.id);
                  const isSelected = walkInForm.serviceTypeIds.includes(serviceTypeId);
                  return (
                    <button
                      key={serviceType.id}
                      type="button"
                      onClick={() => toggleServiceType(serviceTypeId)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                        isSelected
                          ? 'border-brand-300 bg-brand-50 text-brand-800'
                          : 'border-surface-200 bg-white text-slate-700 hover:bg-surface-50'
                      }`}
                    >
                      <span className="font-medium">{getServiceTypeName(serviceType)}</span>
                      {isSelected && <FiCheck className="shrink-0 text-brand-600" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Request Details
              <textarea
                value={walkInForm.description}
                onChange={(event) => updateWalkInForm('description', event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Describe what the client needs."
              />
            </label>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Preferred Date
                <input
                  type="date"
                  value={walkInForm.preferredDate}
                  onChange={(event) => updateWalkInForm('preferredDate', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Time Slot
                <select
                  value={walkInForm.preferredTimeSlot}
                  onChange={(event) => updateWalkInForm('preferredTimeSlot', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  {timeSlotOptions.map((slot) => (
                    <option key={slot.value} value={slot.value}>{slot.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700">
                Search Location
                <div className="mt-1 rounded-lg border border-surface-200 bg-white px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FiSearch className="text-slate-400" />
                    <input
                      value={walkInSearchQuery}
                      onChange={(event) => setWalkInSearchQuery(event.target.value)}
                      className="w-full border-0 bg-transparent p-0 text-sm text-slate-800 focus:outline-none focus:ring-0"
                      placeholder="Search address, city, barangay, or landmark"
                    />
                  </div>
                </div>
              </label>
              {walkInSearchResults.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  {walkInSearchResults.map((result) => (
                    <button
                      key={`${result.place_id}-${result.lat}-${result.lon}`}
                      type="button"
                      onClick={() => handleWalkInSearchSelect(result)}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-slate-50"
                    >
                      {result.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <MapContainer
                center={walkInMapCenter}
                zoom={CALABARZON_MIN_ZOOM}
                minZoom={CALABARZON_MIN_ZOOM}
                maxBounds={CALABARZON_BOUNDS}
                maxBoundsViscosity={1}
                className="h-[22rem] w-full"
              >
                <MapTileLayer />
                <WalkInLocationPicker
                  latitude={walkInForm.latitude ? Number(walkInForm.latitude) : null}
                  longitude={walkInForm.longitude ? Number(walkInForm.longitude) : null}
                  onChange={handleWalkInLocationChange}
                />
              </MapContainer>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                Click the map to drop the service pin. The form will auto-fill the address, city, province, and coordinates.
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr_1fr]">
              <label className="block text-sm font-medium text-slate-700">
                Service Address
                <input
                  value={walkInForm.address}
                  onChange={(event) => updateWalkInForm('address', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="Street, barangay, landmark"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                City
                <input
                  value={walkInForm.city}
                  onChange={(event) => updateWalkInForm('city', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Province
                <input
                  value={walkInForm.province}
                  onChange={(event) => updateWalkInForm('province', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Latitude
                <input
                  type="number"
                  step="any"
                  value={walkInForm.latitude}
                  onChange={(event) => updateWalkInForm('latitude', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="14.5995"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Longitude
                <input
                  type="number"
                  step="any"
                  value={walkInForm.longitude}
                  onChange={(event) => updateWalkInForm('longitude', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="121.0364"
                />
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Scheduling Notes
              <textarea
                value={walkInForm.schedulingNotes}
                onChange={(event) => updateWalkInForm('schedulingNotes', event.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Optional notes for dispatch."
              />
            </label>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetWalkInForm}
                className="inline-flex items-center justify-center rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-surface-50"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={walkInSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {walkInSubmitting ? 'Saving...' : 'Save Walk-in Request'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="stat-card p-4">
          <p className="text-[13px] font-medium text-slate-500">Active Queue</p>
          <p className="mt-1 text-3xl font-bold text-slate-800">{activeQueueCount}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-[13px] font-medium text-slate-500">Needs Reschedule</p>
          <p className="mt-1 text-3xl font-bold text-rose-600">{missedDispatchCount}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-[13px] font-medium text-slate-500">SLA Risk</p>
          <p className="mt-1 text-3xl font-bold text-amber-600">{slaRiskCount}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-[13px] font-medium text-slate-500">Completed</p>
          <p className="mt-1 text-3xl font-bold text-emerald-600">{completedCount}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/job-history')}
            className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >
            View history
          </button>
        </div>
      </section>

      {/* Main content */}
      <section className="mt-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 sm:text-xl">
                <FiClipboard className="text-brand-500" />
                Ticket Queue
              </h2>
              <p className="text-sm text-slate-500">Showing {visibleStartIndex}-{visibleEndIndex} of {sortedTickets.length} active tickets.</p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <FiRefreshCw size={15} /> Refresh
            </button>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 px-3 pb-3 md:hidden">
            {loading && sortedTickets.length === 0 ? (
              <LoadingSkeleton type="list" rows={3} />
            ) : error && sortedTickets.length === 0 ? null : sortedTickets.length === 0 ? (
              <EmptyState
                title="No active tickets found"
                description="No active tickets match the current queue view or filters. Completed work is available in Job History."
                compact
              />
            ) : paginatedTickets.map((ticket) => (
              <div
                key={ticket.id}
                className={`rounded-xl border p-4 shadow-card ${
                  ticket.isMissedDispatch
                    ? 'border-rose-200 bg-rose-50'
                    : 'border-surface-200 bg-gradient-to-b from-white to-surface-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-brand-600">{formatTicketId(ticket.id)}</div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">Ticket ID</div>
                    <div className="font-semibold text-slate-900">{ticket.service} {ticket.ticket_type === 'inspection' && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded ml-1">Inspection</span>}</div>
                    <div className="text-sm text-slate-600">{ticket.clientFullname}</div>
                    <div className="mt-1 w-fit rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                      {ticket.requestSourceLabel}
                    </div>
                  </div>
                  <StatusBadge status={ticket.priority || 'low'} size="sm" />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={ticket.status} />
                  {ticket.isMissedDispatch && (
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                      Needs Reschedule
                    </span>
                  )}
                  <SLABadge sla={ticket.sla} />
                  <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {ticket.assignedTech || 'Unassigned'}
                    {ticket.crewMembers?.length ? ` + ${ticket.crewMembers.length} crew` : ''}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-700">
                  <div><span className="font-medium text-slate-900">Client(ID):</span> {formatClientId(ticket.clientId)}</div>
                  <div><span className="font-medium text-slate-900">Client(Fullname):</span> {ticket.clientFullname}</div>
                  <div><span className="font-medium text-slate-900">Source:</span> {ticket.requestSourceLabel}</div>
                  <div><span className="font-medium text-slate-900">Technician:</span> {formatTechnicianId(ticket.assignedTechnicianId)}</div>
                  <div><span className="font-medium text-slate-900">Technician Fullname:</span> {ticket.technicianFullname || 'Unassigned'}</div>
                  <div><span className="font-medium text-slate-900">Queue Step:</span> {queueActionLabel(ticket)}</div>
                  {ticket.isMissedDispatch && (
                    <div className="font-medium text-rose-700">
                      Scheduled date already passed without assignment.
                    </div>
                  )}
                  <div><span className="font-medium text-slate-900">Display Status:</span> {formatStatusLabel(ticket.status)}</div>
                  <div><span className="font-medium text-slate-900">SLA:</span> {formatSlaSummary(ticket.sla)}</div>
                  {ticket.crewMembers?.length > 0 && (
                    <div><span className="font-medium text-slate-900">Crew:</span> {ticket.crewSummary}</div>
                  )}
                  {ticket.status === 'completed' && (
                    <div>
                      <span className="font-medium text-slate-900">Completion Notes:</span>{' '}
                      {ticket.completionNotes || 'No completion notes captured.'}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setActionModalTicket(ticket)}
                    className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition"
                  >
                    <FiMoreVertical size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-[13%] border-b border-slate-200 px-3 py-3">Ticket</th>
                  <th className="w-[26%] border-b border-slate-200 px-3 py-3">Customer & Service</th>
                  <th className="w-[20%] border-b border-slate-200 px-3 py-3">Status & Schedule</th>
                  <th className="w-[18%] border-b border-slate-200 px-3 py-3">Technician</th>
                  <th className="w-[13%] border-b border-slate-200 px-3 py-3">SLA</th>
                  <th className="w-[10%] border-b border-slate-200 px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && sortedTickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-0 border-none">
                      <LoadingSkeleton type="table" rows={4} />
                    </td>
                  </tr>
                ) : error && sortedTickets.length === 0 ? null : sortedTickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4">
                      <EmptyState
                        title="No active tickets found"
                        description="No active tickets match the current queue view or filters. Completed work is available in Job History."
                      />
                    </td>
                  </tr>
                ) : paginatedTickets.map((ticket, idx) => (
                  <tr
                    key={ticket.id}
                    className={`border-b border-surface-200 transition hover:bg-brand-50/30 ${
                      ticket.isMissedDispatch
                        ? 'bg-rose-50'
                        : idx % 2 === 1
                          ? 'bg-surface-50/50'
                          : ''
                    }`}
                  >
                    <td className="border-b border-slate-100 px-3 py-2 align-middle">
                      <div className="font-bold text-brand-600">{formatTicketId(ticket.id)}</div>
                      <div className="mt-0.5 text-[11px] font-medium text-slate-500">{shortSourceLabel(ticket.requestSourceLabel)}</div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 align-middle">
                      <div className="truncate font-semibold text-slate-900" title={ticket.clientFullname || ''}>{ticket.clientFullname}</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-500">{formatClientId(ticket.clientId)}</div>
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <StatusBadge status={ticket.priority || 'low'} size="sm" />
                        <span className="truncate text-[11px] text-slate-600" title={ticket.service || ''}>{ticket.service}</span>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 align-middle">
                      <div className="flex flex-col gap-2">
                        <StatusBadge status={ticket.status} size="sm" />
                        {ticket.isMissedDispatch && (
                          <span className="w-fit rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                            Needs Reschedule
                          </span>
                        )}
                        <span className="line-clamp-2 text-xs leading-5 text-slate-500" title={ticket.schedulingNotes || ''}>
                          {ticket.status === 'completed'
                            ? (ticket.completionNotes || 'No completion notes captured.')
                            : (ticket.schedulingNotes || queueActionLabel(ticket))}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 align-middle font-medium">
                      <div className="truncate text-slate-900" title={ticket.technicianFullname || 'Unassigned'}>{ticket.technicianFullname || 'Unassigned'}</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-500">{formatTechnicianId(ticket.assignedTechnicianId)}</div>
                      {ticket.crewMembers?.length > 0 && (
                        <div className="truncate text-xs font-normal text-slate-500" title={ticket.crewSummary}>{ticket.crewSummary}</div>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 align-middle">
                      <div className="flex flex-col gap-1.5">
                        <SLABadge sla={ticket.sla} size="sm" />
                        <span className="line-clamp-2 text-xs text-slate-500" title={formatSlaSummary(ticket.sla)}>{formatSlaSummary(ticket.sla)}</span>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 align-middle text-right">
                      <button
                        onClick={() => setActionModalTicket(ticket)}
                        className="inline-flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-surface-100 hover:text-slate-700 transition"
                      >
                        <FiMoreVertical size={20} />
                      </button>
                    </td>
                  </tr>

                ))}
              </tbody>
            </table>
          </div>
          {sortedTickets.length > ITEMS_PER_PAGE && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 px-4 py-3 text-sm">
              <span className="text-slate-500">
                Showing {visibleStartIndex}-{visibleEndIndex} of {sortedTickets.length} tickets
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safeCurrentPage === 1}
                  className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-slate-500">Page {safeCurrentPage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <RescheduleTicketModal
        ticket={rescheduleTicket}
        onClose={() => setRescheduleTicket(null)}
        onSubmit={handleRescheduleSubmit}
      />
      <InspectionReviewModal
        ticket={inspectionReviewTicket}
        onClose={() => setInspectionReviewTicket(null)}
        onSuccess={() => {
          setInspectionReviewTicket(null);
          loadData();
        }}
      />
      <InspectionDetailsModal
        ticket={inspectionDetailsTicket}
        onClose={() => setInspectionDetailsTicket(null)}
      />
      <TurnoverAcceptanceModal ticket={turnoverModalTicket} onClose={() => setTurnoverModalTicket(null)} />
      <QuotationProposalModal ticket={quotationModalTicket} onClose={() => setQuotationModalTicket(null)} />
      <TicketTimelineModal
        ticket={timelineTicket}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => setTimelineTicket(null)}
      />

      {actionModalTicket && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-lg">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-slate-900">{formatTicketId(actionModalTicket.id)}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {actionModalTicket.service} for {actionModalTicket.clientFullname}
                </p>
              </div>
              <button
                onClick={() => setActionModalTicket(null)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                aria-label="Close ticket actions dialog"
              >
                <FiX size={20} />
              </button>
            </div>

            <div className="p-4">
              <div className="grid gap-3 rounded-2xl border border-surface-200 bg-surface-50 p-4 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">Queue status</span>
                  <span>{formatStatusLabel(actionModalTicket.status)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">Next step</span>
                  <span className="text-right">{queueActionLabel(actionModalTicket)}</span>
                </div>
                <div className="border-t border-surface-200 pt-3">
                  <p className="font-semibold text-slate-900">Client contact</p>
                  <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                    <p>{actionModalTicket.clientPhone || 'No phone provided'}</p>
                    <p className="break-words">{actionModalTicket.clientEmail || 'No email provided'}</p>
                    {actionModalTicket.clientAddress ? (
                      <p className="line-clamp-2">{actionModalTicket.clientAddress}</p>
                    ) : null}
                  </div>
                </div>
                {actionModalTicket.isMissedDispatch && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                    This ticket missed its dispatch window and needs a quick follow-up.
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <button
                  onClick={() => {
                    setActionModalTicket(null);
                    openTimelineModal(actionModalTicket);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-surface-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50"
                >
                  <span className="flex items-center gap-3">
                    <FiClock className="text-brand-600" size={18} /> View Timeline
                  </span>
                  <span className="text-xs font-medium text-slate-400">Audit trail</span>
                </button>

                <button
                  onClick={() => handleDownloadFieldServiceReport(actionModalTicket)}
                  disabled={documentDownloadId === actionModalTicket.id}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-surface-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="flex items-center gap-3">
                    <FiDownload className="text-brand-600" size={18} /> Field Service Report DOCX
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    {documentDownloadId === actionModalTicket.id ? 'Generating' : 'Download'}
                  </span>
                </button>

                {actionModalTicket.inspection?.id && (
                  <button
                    onClick={() => {
                      setActionModalTicket(null);
                      setInspectionDetailsTicket(actionModalTicket);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-surface-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50"
                  >
                    <span className="flex items-center gap-3">
                      <FiClipboard className="text-brand-600" size={18} /> View Inspection Details
                    </span>
                    <span className="text-xs font-medium text-slate-400">Site notes</span>
                  </button>
                )}

                {canManageTickets && (actionModalTicket.status === 'inspection_completed' || actionModalTicket.status === 'Inspection Completed') && (
                  <button
                    onClick={() => {
                      setActionModalTicket(null);
                      setInspectionReviewTicket(actionModalTicket);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-200 px-4 py-3 text-left text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    <span className="flex items-center gap-3">
                      <FiCheckSquare className="text-emerald-500" size={18} /> Review Inspection
                    </span>
                    <span className="text-xs font-medium text-emerald-500">Decision needed</span>
                  </button>
                )}

                {canManageTickets && (!actionModalTicket.assignedTech || actionModalTicket.status === 'not_started') && (
                  <button
                    onClick={() => {
                      setActionModalTicket(null);
                      openRescheduleModal(actionModalTicket);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-surface-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50"
                  >
                    <span className="flex items-center gap-3">
                      <FiCalendar className="text-brand-600" size={18} /> Reschedule Ticket
                    </span>
                    <span className="text-xs font-medium text-slate-400">Adjust schedule</span>
                  </button>
                )}

                {canDispatch && !actionModalTicket.assignedTech && (
                  <button
                    onClick={() => {
                      setActionModalTicket(null);
                      navigate('/admin/dispatch-board');
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-surface-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50"
                  >
                    <span className="flex items-center gap-3">
                      <FiMap className="text-brand-600" size={18} /> {actionModalTicket.isMissedDispatch ? 'Fix Needs Reschedule' : 'Assign in Dispatch'}
                    </span>
                    <span className="text-xs font-medium text-slate-400">Dispatch board</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectDecision && (
        <ConfirmationDialog
          title="Reject service request?"
          message={`${rejectDecision.label} will be rejected and the client can be notified with the reason below.`}
          tone="danger"
          icon="warning"
          confirmLabel="Reject request"
          cancelLabel="Keep request"
          loading={rejectingTicket}
          onCancel={() => {
            setRejectDecision(null);
            setRejectReason('');
          }}
          onConfirm={confirmRejectTicket}
        >
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Reason</span>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={3}
              maxLength={240}
              placeholder="Briefly explain why this request is being rejected."
              className="mt-2 w-full resize-none rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </ConfirmationDialog>
      )}
    </Layout>
  );
}
