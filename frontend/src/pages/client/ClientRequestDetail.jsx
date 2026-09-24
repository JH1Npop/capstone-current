import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { ListSkeleton, PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import { FiArrowLeft, FiClock, FiImage, FiStar, FiX } from 'react-icons/fi';
import { api, fetchRequestDetail, fetchTicketTimeline, requestTicketReschedule, submitRequestRating } from '../../api/api';
import { getLocalDateInputValue } from '../../utils/date';
import { clientTechnicianDisplayString } from '../../utils/clientTechnicianDisplay';
import { formatRequestId, formatTicketId } from '../../utils/roleIds';

const TIME_SLOT_LABELS = {
  morning: 'Morning (8 AM - 11 AM)',
  midday: 'Midday (11 AM - 2 PM)',
  afternoon: 'Afternoon (2 PM - 5 PM)',
  evening: 'Evening (5 PM - 8 PM)'
};

export default function ClientRequestDetail() {
  const { requestId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [proofImages, setProofImages] = useState([]);
  const [loadingProofImages, setLoadingProofImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [notice, setNotice] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const entityType = searchParams.get('entity') || 'request';

  useEffect(() => {
    loadRequest();
  }, [requestId, entityType]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        setSelectedImage(null);
      }
    };

    if (selectedImage) {
      window.addEventListener('keydown', handleEscKey);
      return () => window.removeEventListener('keydown', handleEscKey);
    }
  }, [selectedImage]);

  const loadRequest = async () => {
    setLoading(true);
    try {
      const data = await fetchRequestDetail(requestId, { entityType });
      setRequest(data);
      setRatingSubmitted(data.client_rating ? true : false);
      setRating(data.client_rating || 0);
      setFeedback(data.client_feedback || '');
      setRescheduleDate(data.preferred_date || data.scheduled_date || '');
      setRescheduleTimeSlot(data.preferred_time_slot || data.scheduled_time_slot || '');
      setRescheduleReason(data.reschedule_reason || data.scheduling_notes || '');
      setError(null);

      // Load proof images if ticket is completed
      if (data.status === 'completed' && data.ticket_id) {
        loadProofImages(data.ticket_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load request details');
    } finally {
      setLoading(false);
    }
  };

  const loadProofImages = async (ticketId) => {
    setLoadingProofImages(true);
    try {
      const response = await api.get(`/services/service-tickets/${ticketId}/proof_images/`);
      setProofImages(response.data.completion_proof_images || []);
    } catch {
      setProofImages([]);
    } finally {
      setLoadingProofImages(false);
    }
  };

  const handleRequestReschedule = async () => {
    setNotice(null);
    if (!request?.ticket_id) {
      setNotice({
        tone: 'warning',
        message: 'This request is still waiting for a linked service ticket before it can be rescheduled.'
      });
      return;
    }

    if (!rescheduleDate || !rescheduleTimeSlot || !rescheduleReason.trim()) {
      setNotice({
        tone: 'warning',
        message: 'Please choose a date, time slot, and reason for the schedule change.'
      });
      return;
    }

    setRescheduleSubmitting(true);
    try {
      await requestTicketReschedule(request.ticket_id, {
        preferred_date: rescheduleDate,
        preferred_time_slot: rescheduleTimeSlot,
        reason: rescheduleReason.trim()
      });
      setShowRescheduleForm(false);
      setNotice({ tone: 'success', message: 'Schedule change request sent.' });
      await loadRequest();
    } catch (err) {
      setNotice({
        tone: 'error',
        message: `Failed to request reschedule: ${err.message}`
      });
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  const handleSubmitRating = async () => {
    setNotice(null);
    if (!request?.ticket_id) {
      setNotice({
        tone: 'warning',
        message: 'Feedback becomes available after a service ticket has been completed.'
      });
      return;
    }

    if (rating === 0) {
      setNotice({ tone: 'warning', message: 'Please select a rating.' });
      return;
    }

    setSubmitting(true);
    try {
      await submitRequestRating(request.ticket_id, {
        rating,
        feedback
      });
      setRatingSubmitted(true);
      setShowRatingForm(false);
      setNotice({ tone: 'success', message: 'Thank you. Your rating was submitted.' });
      // Reload to show updated data
      await loadRequest();
    } catch (err) {
      setNotice({
        tone: 'error',
        message: `Failed to submit rating: ${err.message}`
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openTimeline = async () => {
    if (!request?.ticket_id) return;
    setTimelineOpen(true);
    setTimelineEvents([]);
    setTimelineError('');
    setTimelineLoading(true);

    try {
      const events = await fetchTicketTimeline(request.ticket_id);
      setTimelineEvents(events);
    } catch (loadError) {
      setTimelineError(loadError.message || 'Unable to load ticket timeline.');
    } finally {
      setTimelineLoading(false);
    }
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'text-blue-600 bg-blue-50',
      normal: 'text-gray-600 bg-gray-50',
      high: 'text-orange-600 bg-orange-50',
      urgent: 'text-red-600 bg-red-50'
    };
    return colors[priority?.toLowerCase()] || 'text-gray-600 bg-gray-50';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeSlot = (value) => TIME_SLOT_LABELS[value] || value || 'No specific window';

  if (loading) {
    return (
      <Layout>
        <PanelSkeleton rows={8} />
      </Layout>
    );
  }

  if (error || !request) {
    return (
      <Layout>
        <div className="rounded-lg bg-red-50 p-6 border border-red-200">
          <p className="text-red-700 font-medium mb-4">{error || 'Request not found'}</p>
          <button
            onClick={() => navigate('/client/requests')}
            className="text-red-600 hover:text-red-700 underline"
          >
            Back to requests
          </button>
        </div>
      </Layout>
    );
  }

  const isCompleted = request.status === 'completed';
  const canRequestReschedule = Boolean(request.ticket_id) && request.status !== 'completed' && request.status !== 'cancelled';
  const technicianLabel = clientTechnicianDisplayString(request);
  const noticeClassName = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-800'
  }[notice?.tone || 'warning'];

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        {notice && (
          <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${noticeClassName}`}>
            {notice.message}
          </div>
        )}

        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/client/requests')}
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            title="Back to requests"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">
                Service Request {formatRequestId(request.request_id || request.id)}
              </h1>
              <StatusBadge status={request.status} size="lg" />
              <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                {request.request_source_label}
              </span>
            </div>
            <p className="text-slate-600">
              {request.service_type_name || request.service_type}
              {request.ticket_id
                ? ` • ${formatTicketId(request.ticket_id)}`
                : request.status === 'pending'
                  ? ' • Pending review'
                  : ' • Awaiting dispatch'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={request.status} size="lg" />
                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
                  request.priority?.toLowerCase() === 'urgent'
                    ? 'bg-red-100 text-red-700'
                    : request.priority?.toLowerCase() === 'high'
                    ? 'bg-orange-100 text-orange-700'
                    : request.priority?.toLowerCase() === 'low'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {request.priority?.toUpperCase()} PRIORITY
                </span>
              </div>
              {request.operational_status && request.operational_status !== request.status && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-500">Stage:</span>
                  <StatusBadge status={request.operational_status} size="sm" />
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Progress</p>
              {request.has_ticket || request.progress > 0 ? (
                <div className="space-y-2">
                  <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-500"
                      style={{ width: `${request.progress}%` }}
                      role="progressbar"
                      aria-label={request.progress_label || 'Current workflow stage'}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={request.progress}
                    ></div>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    {request.progress_track_label && `${request.progress_track_label} · `}
                    {request.progress_label || 'Current workflow stage'} · {request.progress}%
                  </p>
                  {request.has_ticket && (
                    <p className="text-xs text-slate-500">This marker follows the recorded job status; 100% means the work is completed.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-700">Waiting for progress update</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket & Timeline</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">
                  {request.ticket_id ? formatTicketId(request.ticket_id) : 'Not linked yet'}
                </span>
                {request.ticket_id && (
                  <button
                    onClick={openTimeline}
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-brand-600"
                  >
                    <FiClock className="h-3.5 w-3.5 text-brand-500" />
                    View Timeline
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">{request.workflow_label || 'Request review'}</p>
              {request.sla && request.sla.state && request.sla.state !== 'inactive' && (
                <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-amber-50/70 border border-amber-200/80 px-2.5 py-1.5 text-xs font-medium text-amber-900">
                  <FiClock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>
                    <strong className="font-semibold">{request.sla.label}</strong>
                    {request.sla.due_at && ` • Due: ${formatDate(request.sla.due_at)}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Request Details</h3>
            </div>
            <div className="grid gap-x-8 gap-y-5 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
              <div className="md:col-span-2 xl:col-span-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Description</p>
                <p className="text-sm text-slate-800">{request.description || 'No description provided'}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Service Type</p>
                <p className="text-sm font-medium text-slate-900">{request.service_type_name || request.service_type}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Request Source</p>
                <p className="text-sm text-slate-800">{request.request_source_label || '-'}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Technician</p>
                <p className="text-sm text-slate-800">{technicianLabel || 'Not assigned yet'}</p>
                {request.technician_contact && <p className="mt-1 text-xs text-slate-500">{request.technician_contact}</p>}
              </div>
              <div className="md:col-span-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Address</p>
                <p className="text-sm text-slate-800">{request.address || 'Not specified'}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">City / Province</p>
                <p className="text-sm text-slate-800">{[request.city, request.province].filter(Boolean).join(', ') || 'N/A'}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Requested On</p>
                <p className="text-sm text-slate-800">{formatDate(request.request_date)}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Scheduled Date</p>
                <p className="text-sm text-slate-800">{request.scheduled_date ? formatDate(request.scheduled_date) : 'Not scheduled'}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Time Window</p>
                <p className="text-sm text-slate-800">{formatTimeSlot(request.scheduled_time_slot)}</p>
              </div>
              {(request.preferred_date || request.preferred_time_slot) && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Preferred Appointment</p>
                  <p className="text-sm text-slate-800">
                    {request.preferred_date ? formatDate(request.preferred_date) : 'No date selected'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{formatTimeSlot(request.preferred_time_slot)}</p>
                </div>
              )}
              {request.start_time && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Started</p>
                  <p className="text-sm text-slate-800">{formatTime(request.start_time)}</p>
                </div>
              )}
              {request.end_time && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Ended</p>
                  <p className="text-sm text-slate-800">{formatTime(request.end_time)}</p>
                </div>
              )}
              {request.completed_date && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Completed On</p>
                  <p className="text-sm font-medium text-emerald-700">{formatDate(request.completed_date)}</p>
                </div>
              )}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Warranty</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={request.warranty_status} size="sm" />
                  {request.warranty_end_date && <span className="text-xs text-slate-500">Ends {formatDate(request.warranty_end_date)}</span>}
                </div>
                {request.warranty_notes && <p className="mt-1 text-xs text-slate-500">{request.warranty_notes}</p>}
              </div>
              {request.latitude && request.longitude && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Coordinates</p>
                  <p className="text-sm text-slate-800">{request.latitude.toFixed(4)}, {request.longitude.toFixed(4)}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-4">
              {request.ticket_id ? (
                <button
                  type="button"
                  onClick={openTimeline}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <FiClock size={16} /> View Ticket Timeline
                </button>
              ) : (
                <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  This request is still waiting for a linked service ticket.
                </span>
              )}
            </div>
          </div>

            {canRequestReschedule && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-slate-900">Schedule Changes</h3>
                {request.reschedule_requested ? (
                  <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-medium">A schedule change request is already pending.</p>
                    {request.reschedule_reason && <p className="mt-2">{request.reschedule_reason}</p>}
                  </div>
                ) : !showRescheduleForm ? (
                  <button
                    onClick={() => setShowRescheduleForm(true)}
                    className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Request Reschedule
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">New Date</label>
                        <input
                          type="date"
                          value={rescheduleDate}
                          min={getLocalDateInputValue()}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">Time Window</label>
                        <select
                          value={rescheduleTimeSlot}
                          onChange={(e) => setRescheduleTimeSlot(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        >
                          <option value="">Select time window</option>
                          {Object.entries(TIME_SLOT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">Reason</label>
                      <textarea
                        value={rescheduleReason}
                        onChange={(e) => setRescheduleReason(e.target.value)}
                        rows="3"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        placeholder="Tell the team why you need another appointment window."
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleRequestReschedule}
                        disabled={rescheduleSubmitting}
                        className="flex-1 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
                      >
                        {rescheduleSubmitting ? 'Submitting...' : 'Send Request'}
                      </button>
                      <button
                        onClick={() => setShowRescheduleForm(false)}
                        className="flex-1 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isCompleted && (request.installed_equipment?.length > 0 || request.field_service_reports?.length > 0) && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Installed Equipment</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(request.installed_equipment || []).map((equipment) => (
                    <div key={`equipment-${equipment.id}`} className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                      <p className="font-semibold text-slate-900">{equipment.equipment_type || 'Equipment'}</p>
                      <p className="mt-1 text-slate-700">{equipment.brand_model || '-'}</p>
                      <p className="mt-2 text-xs text-slate-500">Serial Number</p>
                      <p className="font-semibold text-slate-900">{equipment.serial_number || '-'}</p>
                      <p className="mt-2 text-xs text-slate-500">Capacity</p>
                      <p className="font-semibold text-slate-900">{equipment.capacity || '-'}</p>
                    </div>
                  ))}
                  {(request.field_service_reports || [])
                    .filter((report) => report.serial_number || report.brand_model)
                    .map((report) => (
                      <div key={`fsr-${report.id}`} className="rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm">
                        <p className="font-semibold text-teal-950">Field Service Report</p>
                        <p className="mt-1 text-teal-800">{report.brand_model || '-'}</p>
                        <p className="mt-2 text-xs text-teal-700">Serial Number</p>
                        <p className="font-semibold text-teal-950">{report.serial_number || '-'}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Proof Images Section */}
            {isCompleted && request.ticket_id && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Proof of Work</h3>
                    <p className="mt-1 text-sm text-slate-500">Technician completion media</p>
                  </div>
                  <FiImage className="shrink-0 text-slate-400" size={20} />
                </div>

                {loadingProofImages ? (
                  <ListSkeleton rows={3} compact />
                ) : proofImages.length > 0 ? (
                  <div className="space-y-3">
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {proofImages.length} file{proofImages.length !== 1 ? 's' : ''} uploaded
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      {proofImages.map((imageUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedImage(imageUrl)}
                          className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition hover:border-brand-300"
                        >
                          {imageUrl.toLowerCase().includes('.mp4') || imageUrl.toLowerCase().includes('.webm') ? (
                            <div className="flex h-full w-full items-center justify-center bg-slate-900">
                              <div className="text-center">
                                <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                                  <span className="text-sm font-semibold text-white">Play</span>
                                </div>
                                <span className="text-xs font-semibold text-white">Video</span>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={imageUrl}
                              alt={`Proof ${idx + 1}`}
                              className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                              onError={(e) => {
                                e.currentTarget.style.backgroundColor = '#f1f5f9';
                                e.currentTarget.alt = 'Image failed to load';
                              }}
                            />
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-slate-950/60 px-2 py-1 text-center opacity-0 transition group-hover:opacity-100">
                            <span className="text-xs font-semibold text-white">View</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 py-8 text-center">
                    <p className="text-slate-600 font-medium">No proof images found</p>
                    <p className="mt-1 text-sm text-slate-500">No completion media was uploaded for this service.</p>
                  </div>
                )}

                {selectedImage && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
                    <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Proof preview</h3>
                          <p className="text-sm text-slate-500">Completion media</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={selectedImage}
                            download
                            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                          >
                            Download
                          </a>
                          <button
                            type="button"
                            onClick={() => setSelectedImage(null)}
                            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                            title="Close"
                          >
                            <FiX size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-center bg-slate-950 p-4">
                        {selectedImage.toLowerCase().includes('.mp4') || selectedImage.toLowerCase().includes('.webm') ? (
                          <video
                            src={selectedImage}
                            controls
                            className="max-h-[72vh] max-w-full rounded-lg"
                            autoPlay
                          />
                        ) : (
                          <img
                            src={selectedImage}
                            alt="Proof"
                            className="max-h-[72vh] max-w-full rounded-lg object-contain"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rating Section (for completed requests) */}
            {isCompleted && request.ticket_id && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-slate-900">Rate This Service</h3>

                {ratingSubmitted ? (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <p className="text-sm text-green-700 font-medium mb-2">Rating submitted</p>
                    <div className="flex items-center gap-1 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <FiStar
                          key={i}
                          className={`w-5 h-5 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`}
                        />
                      ))}
                    </div>
                    {feedback && (
                      <p className="text-sm text-slate-700 mt-2">{feedback}</p>
                    )}
                    <button
                      onClick={() => setShowRatingForm(true)}
                      className="mt-2 text-sm font-medium text-brand-600 hover:underline"
                    >
                      Edit Rating
                    </button>
                  </div>
                ) : (
                  <>
                    {!showRatingForm && (
                      <button
                        onClick={() => setShowRatingForm(true)}
                        className="w-full rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
                      >
                        Leave Feedback
                      </button>
                    )}

                    {showRatingForm && (
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-slate-600 mb-3">How would you rate this service?</p>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => setRating(star)}
                                className="transition"
                              >
                                <FiStar
                                  className={`w-8 h-8 ${
                                    star <= rating
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-slate-300 hover:text-yellow-400'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm text-slate-600 mb-2">
                            Additional Feedback (Optional)
                          </label>
                          <textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Share your experience..."
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                            rows="3"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleSubmitRating}
                            disabled={submitting || rating === 0}
                            className="flex-1 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting ? 'Submitting...' : 'Submit Rating'}
                          </button>
                          <button
                            onClick={() => {
                              setShowRatingForm(false);
                              setRating(0);
                              setFeedback('');
                            }}
                            className="flex-1 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      <TicketTimelineModal
        ticket={timelineOpen ? request : null}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => setTimelineOpen(false)}
      />
    </Layout>
  );
}
