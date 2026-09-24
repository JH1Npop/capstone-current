import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import StatusBadge, { formatStatusLabel } from '../../components/ui/StatusBadge';
import { useTechnicianJobs } from '../../hooks/useTechnicianJobs';
import { FiChevronDown, FiClipboard, FiClock, FiEye, FiMapPin, FiPackage, FiPhone, FiPlus, FiUpload, FiX } from 'react-icons/fi';
import { fetchTicketTimeline } from '../../api/api';
import { formatReservationId, formatTicketId } from '../../utils/roleIds';

const formatDateLabel = (value) => {
  if (!value) {
    return 'Schedule pending';
  }

  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return 'Schedule pending';
  }

  return parsedValue.toLocaleDateString();
};

const formatTimeLabel = (value, slot) => {
  if (value) {
    const [hourValue, minuteValue = '00'] = String(value).split(':');
    const hour = Number(hourValue);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      return `${hour % 12 || 12}:${minuteValue} ${hour >= 12 ? 'PM' : 'AM'}`;
    }
  }

  return slot ? `${formatStatusLabel(slot)} slot` : 'Time pending';
};

const formatDurationLabel = (minutes) => {
  const totalMinutes = Number(minutes || 0);
  if (totalMinutes <= 0) return 'Not specified';
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
};

const getReservationStatusClasses = (status) => {
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600';
  if (status === 'pending') return 'bg-amber-100 text-amber-800';
  if (['issued', 'approved'].includes(status)) return 'bg-emerald-100 text-emerald-800';
  return 'bg-blue-100 text-blue-800';
};

export default function TechnicianJobs() {
  const [timelineJob, setTimelineJob] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const {
    activeJob,
    actionMessage,
    closeJobDetails,
    completionJob,
    completionNotes,
    equipmentDropdownOpen,
    equipmentForm,
    equipmentSubmitting,
    error,
    handleCompleteJob,
    handleImageUpload,
    handleRequestEquipment,
    handleStatusUpdate,
    inventoryItems,
    isCompleting,
    isUpdatingStatus,
    jobs,
    loadJobs,
    materialUsage,
    openJobDetails,
    proofImages,
    removeImage,
    selectedInventoryItems,
    selectedJob,
    setCompletionJob,
    setCompletionNotes,
    setEquipmentDropdownOpen,
    setEquipmentForm,
    setMaterialUsage,
    setProofImages,
    toggleEquipmentItem,
    updateEquipmentQuantity
  } = useTechnicianJobs();

  const canRequestEquipment = ['not_started', 'navigating', 'arrived_on_site', 'in_progress', 'on_hold'].includes(selectedJob?.status);

  const selectedEquipmentLabel = selectedInventoryItems.length
    ? selectedInventoryItems.map((item) => item.name).join(', ')
    : 'Choose equipment';

  const requestAvailabilityLabel = selectedJob?.status === 'not_started'
    ? 'Can request before start'
    : selectedJob?.status === 'navigating'
      ? 'Can request while navigating'
      : selectedJob?.status === 'arrived_on_site'
        ? 'Can request before work starts'
    : selectedJob?.status === 'on_hold'
      ? 'Can add to hold request'
      : 'Requests go to admin';
  const activeJobs = jobs.filter((job) => !['completed', 'inspection completed', 'cancelled'].includes(job.status?.toLowerCase().replace('_', ' ')));
  const canCompleteSelectedJob = completionJob?.assignmentRole !== 'crew';
  const activeInventoryReservations = (selectedJob?.inventoryReservations || []).filter(
    (reservation) => reservation.status !== 'cancelled'
  );
  const cancelledInventoryReservations = (selectedJob?.inventoryReservations || []).filter(
    (reservation) => reservation.status === 'cancelled'
  );

  const openCompletionFromDetails = () => {
    const job = selectedJob;
    closeJobDetails();
    setCompletionJob(job);
  };

  const openTimeline = async (job) => {
    setTimelineJob(job);
    setTimelineEvents([]);
    setTimelineError('');
    setTimelineLoading(true);

    try {
      const events = await fetchTicketTimeline(job.ticketId || job.id);
      setTimelineEvents(events);
    } catch (loadError) {
      setTimelineError(loadError.message || 'Unable to load ticket timeline.');
    } finally {
      setTimelineLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Active assignments, job actions, checklists, and navigation links.</p>
        </div>
        <Link
          to="/technician/job-history"
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Job History
        </Link>
      </div>

      {/* Active Job Banner */}
      {activeJob && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Active Now</div>
              <div className="mt-1 text-lg font-bold text-blue-900">
                {formatTicketId(activeJob.ticketId || activeJob.id)} - {activeJob.client?.full_name || activeJob.client}
              </div>
              <div className="mt-1 text-sm text-blue-800">
                {activeJob.service} - <span className="font-semibold">{formatStatusLabel(activeJob.status)}</span>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <button
                onClick={() => openJobDetails(activeJob)}
                className="w-full rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 sm:w-auto"
              >
                View Details
              </button>
            </div>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="mb-4 rounded border-l-4 border-green-500 bg-green-100 p-3 text-green-800">
          {actionMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>
      )}

      {activeJobs.length === 0 ? (
        <div className="py-12 text-center">
          <FiClipboard className="mx-auto mb-4 h-12 w-12 text-slate-400" />
          <h3 className="mb-2 text-lg font-medium text-slate-900">No active jobs</h3>
          <p className="text-slate-500">Completed work is available in Job History.</p>
          <Link
            to="/technician/job-history"
            className="mt-4 inline-flex rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Open Job History
          </Link>
        </div>
      ) : (
        <>
          {/* Active / Pending Jobs - max 5 cards */}
          {(() => {
            const displayJobs = activeJobs.slice(0, 5);
            const hiddenCount = activeJobs.length - displayJobs.length;
            if (displayJobs.length === 0) return (
              <div className="mb-6 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No active jobs at the moment.
              </div>
            );
            return (
              <div className="mb-8">
                <h3 className="mb-3 text-lg font-semibold text-slate-800">
                  Active Jobs ({activeJobs.length})
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {displayJobs.map((job) => (
                    <div
                      key={job.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openJobDetails(job)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openJobDetails(job);
                        }
                      }}
                      className="flex cursor-pointer flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-100 sm:p-5"
                    >
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 text-base font-bold text-slate-900">{job.service}</h3>
                          <p className="text-xs text-slate-600">{formatTicketId(job.ticketId)}</p>
                        </div>
                        <StatusBadge status={job.status} size="sm" />
                      </div>

                      <div className="mb-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-700">{job.client?.full_name || job.client}</p>
                          <p className="mt-1 line-clamp-2 text-slate-500">{job.address || 'Location pending'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Scheduled</span>
                          <p className="mt-1 font-medium text-slate-900">{formatDateLabel(job.scheduledDate)}</p>
                        </div>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          job.assignmentRole === 'crew'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {job.assignmentRole === 'crew' ? 'Crew' : 'Lead'}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            job.priority === 'High'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {job.priority}
                        </span>
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                          {job.requestSourceLabel}
                        </span>
                      </div>

                      <div className="mt-auto flex flex-col gap-2">
                        {job.status === 'navigating' && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStatusUpdate(job.id, 'arrived');
                            }}
                            disabled={isUpdatingStatus || (activeJob && activeJob.id !== job.id)}
                            className={`rounded-lg px-3 py-2 text-xs font-medium text-white transition w-full ${
                              isUpdatingStatus || (activeJob && activeJob.id !== job.id)
                                ? 'bg-slate-300 cursor-not-allowed opacity-60'
                                : 'bg-emerald-500 hover:bg-emerald-600'
                            }`}
                            title={activeJob && activeJob.id !== job.id ? `Complete ${formatTicketId(activeJob.ticketId || activeJob.id)} first` : ''}
                          >
                            {isUpdatingStatus ? 'Marking...' : activeJob && activeJob.id !== job.id ? 'Complete Other Job First' : 'Mark Arrived'}
                          </button>
                        )}
                        {job.status === 'arrived_on_site' && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStatusUpdate(job.id, 'in_progress');
                            }}
                            disabled={isUpdatingStatus || (activeJob && activeJob.id !== job.id && activeJob.status !== 'on_hold')}
                            className={`rounded-lg px-3 py-2 text-xs font-medium text-white transition w-full ${
                              isUpdatingStatus || (activeJob && activeJob.id !== job.id && activeJob.status !== 'on_hold')
                                ? 'bg-slate-300 cursor-not-allowed opacity-60'
                                : 'bg-blue-500 hover:bg-blue-600'
                            }`}
                          >
                            {isUpdatingStatus ? 'Starting...' : activeJob && activeJob.id !== job.id && activeJob.status !== 'on_hold' ? 'Complete Other Job First' : 'Start Job'}
                          </button>
                        )}
                        {job.status === 'on_hold' && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStatusUpdate(job.id, 'in_progress');
                            }}
                            disabled={isUpdatingStatus || (activeJob && activeJob.id !== job.id && activeJob.status !== 'on_hold')}
                            className={`rounded-lg px-3 py-2 text-xs font-medium text-white transition w-full ${
                              isUpdatingStatus || (activeJob && activeJob.id !== job.id && activeJob.status !== 'on_hold')
                                ? 'bg-slate-300 cursor-not-allowed opacity-60'
                                : 'bg-orange-500 hover:bg-orange-600'
                            }`}
                          >
                            {isUpdatingStatus ? 'Starting...' : activeJob && activeJob.id !== job.id && activeJob.status !== 'on_hold' ? 'Complete Other Job First' : 'Resume Job'}
                          </button>
                        )}
                        {job.status === 'in_progress' && job.checklistCompleted && (
                          job.assignmentRole === 'crew' ? (
                            <div className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500">
                              Lead completes this job
                            </div>
                          ) : (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setCompletionJob(job);
                              }}
                              className="rounded-lg bg-green-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-600 w-full"
                            >
                              Finish Job
                            </button>
                          )
                        )}
                        {job.status === 'in_progress' && !job.checklistCompleted && (
                          <Link
                            to={job.ticketType === 'inspection' ? `/technician/inspection-checklist?ticketId=${job.ticketId}` : `/technician/checklist?ticketId=${job.ticketId}`}
                            onClick={(event) => event.stopPropagation()}
                            className="flex w-full items-center justify-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-amber-600"
                          >
                            <FiClipboard size={14} /> Complete Checklist First
                          </Link>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openJobDetails(job);
                            }}
                            className="flex items-center justify-center gap-1 rounded-lg bg-slate-200 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-300"
                          >
                            <FiEye size={14} /> Details
                          </button>
                          <Link
                            to={`/technician/map-navigation?ticketId=${job.ticketId}`}
                            onClick={(event) => event.stopPropagation()}
                            className="flex items-center justify-center gap-1 rounded-lg bg-emerald-500 px-2 py-2 text-xs font-medium text-white hover:bg-emerald-600"
                          >
                            <FiMapPin size={14} /> Navigate
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {hiddenCount > 0 && (
                  <p className="mt-3 text-center text-sm text-slate-500">
                    + {hiddenCount} more active job{hiddenCount > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            );
          })()}

        </>
      )}

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">{selectedJob.service}</h3>
                <p className="text-slate-600">
                  {formatTicketId(selectedJob.ticketId)} for {selectedJob.client?.full_name || selectedJob.client}
                </p>
              </div>
              <button
                type="button"
                onClick={closeJobDetails}
                className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Status</div>
                <StatusBadge status={selectedJob.status} size="sm" />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Priority</div>
                <div className="text-slate-900">{selectedJob.priority}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Request Source</div>
                <div className="text-slate-900">{selectedJob.requestSourceLabel}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Scheduled Date</div>
                <div className="text-slate-900">
                  {formatDateLabel(selectedJob.scheduledDate)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Scheduled Time</div>
                <div className="text-slate-900">
                  {formatTimeLabel(selectedJob.scheduledTime, selectedJob.scheduledTimeSlot)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Estimated Duration</div>
                <div className="text-slate-900">{formatDurationLabel(selectedJob.estimatedDurationMinutes)}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Address</div>
                <div className="text-slate-900">{selectedJob.address || 'Location pending'}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Lead Technician</div>
                <div className="text-slate-900">{selectedJob.leadTechnician || 'Unassigned'}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Assignment Role</div>
                <div className="text-slate-900">
                  {selectedJob.assignmentRole === 'crew' ? 'Crew Member' : 'Lead Technician'}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="mb-1 text-sm font-medium text-blue-700">Job Scope</div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {selectedJob.requestDescription || 'No additional work description was provided.'}
              </p>
              {selectedJob.client?.phone && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`tel:${selectedJob.client.phone}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm ring-1 ring-blue-200 hover:bg-blue-100"
                  >
                    <FiPhone size={15} /> Call Client
                  </a>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Checklist</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {selectedJob.checklistTotalSteps > 0
                      ? `${selectedJob.checklistCompletedSteps} of ${selectedJob.checklistTotalSteps} steps completed`
                      : selectedJob.checklistCompleted
                        ? 'Submitted and ready for final completion'
                        : 'Not submitted yet'}
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  selectedJob.checklistCompleted
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {selectedJob.checklistCompleted ? 'Complete' : 'Action needed'}
                </span>
              </div>
              {selectedJob.checklistTotalSteps > 0 && (
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label="Checklist completion"
                  aria-valuemin="0"
                  aria-valuemax={selectedJob.checklistTotalSteps}
                  aria-valuenow={selectedJob.checklistCompletedSteps}
                >
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(100, (selectedJob.checklistCompletedSteps / selectedJob.checklistTotalSteps) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            {selectedJob.crewMembers?.length > 0 && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-4">
                <div className="mb-1 text-sm font-medium text-emerald-700">Assigned Crew</div>
                <div className="text-sm text-emerald-900">
                  {selectedJob.crewMembers.map((member) => member.name).join(', ')}
                </div>
              </div>
            )}

            {selectedJob.ticketType !== 'inspection' && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FiPackage className="text-blue-500" />
                  Equipment to Bring
                </div>
                {canRequestEquipment && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    {requestAvailabilityLabel}
                  </span>
                )}
              </div>
              {activeInventoryReservations.length > 0 ? (
                <div className="space-y-2">
                  {activeInventoryReservations.map((reservation) => (
                    <div
                      key={reservation.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium text-slate-900">
                          {reservation.itemName} x{reservation.quantity}
                        </div>
                        <div className="text-xs text-slate-500">
                          {reservation.reservationCode || formatReservationId(reservation.id)} - {' '}
                          {reservation.itemSku ? `SKU: ${reservation.itemSku}` : 'No SKU'}
                          {reservation.requiredDate ? ` - Needed: ${formatDateLabel(reservation.requiredDate)}` : ''}
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getReservationStatusClasses(reservation.status)}`}>
                        {reservation.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No reserved equipment has been assigned for this ticket yet.
                </p>
              )}

              {cancelledInventoryReservations.length > 0 && (
                <details className="mt-3 border-t border-slate-200 pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-600">
                    Previous requests ({cancelledInventoryReservations.length} cancelled)
                  </summary>
                  <div className="mt-2 space-y-2">
                    {cancelledInventoryReservations.map((reservation) => (
                      <div
                        key={reservation.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium text-slate-700">
                            {reservation.itemName} x{reservation.quantity}
                          </div>
                          <div className="text-xs text-slate-500">
                            {reservation.reservationCode || formatReservationId(reservation.id)}
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getReservationStatusClasses(reservation.status)}`}>
                          {reservation.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {canRequestEquipment ? (
                <form onSubmit={handleRequestEquipment} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  <div className="space-y-3">
                    <div className="relative">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Additional equipment</span>
                      <button
                        type="button"
                        onClick={() => setEquipmentDropdownOpen((isOpen) => !isOpen)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                      >
                        <span className={selectedInventoryItems.length ? 'truncate' : 'text-slate-400'}>
                          {selectedEquipmentLabel}
                        </span>
                        <FiChevronDown className="shrink-0 text-slate-400" size={16} />
                      </button>
                      {equipmentDropdownOpen && (
                        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                          {inventoryItems.length === 0 ? (
                            <div className="px-3 py-2 text-slate-500">No available inventory equipment.</div>
                          ) : (
                            inventoryItems.map((item) => {
                              const itemId = String(item.id);
                              const isSelected = equipmentForm.itemIds.includes(itemId);
                              return (
                                <label
                                  key={item.id}
                                  className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-slate-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleEquipmentItem(itemId)}
                                    className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span>
                                    <span className="block font-medium text-slate-800">
                                      {item.name} {item.sku ? `(${item.sku})` : ''}
                                    </span>
                                    <span className="text-xs text-slate-500">{item.availableQuantity} available</span>
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    {selectedInventoryItems.length > 0 && (
                      <div className="space-y-2">
                        {selectedInventoryItems.map((item) => {
                          const itemId = String(item.id);
                          return (
                            <div
                              key={item.id}
                              className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_110px_32px]"
                            >
                              <div>
                                <div className="text-sm font-medium text-slate-900">
                                  {item.name} {item.sku ? `(${item.sku})` : ''}
                                </div>
                                <div className="text-xs text-slate-500">{item.availableQuantity} available</div>
                              </div>
                              <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-500">Quantity</span>
                                <input
                                  type="number"
                                  min="1"
                                  max={item.availableQuantity || 1}
                                  value={equipmentForm.quantities[itemId] || 1}
                                  onChange={(event) => updateEquipmentQuantity(itemId, event.target.value)}
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => toggleEquipmentItem(itemId)}
                                className="self-end rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title={`Remove ${item.name}`}
                              >
                                <FiX size={16} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={equipmentForm.notes}
                    onChange={(event) => setEquipmentForm((prev) => ({ ...prev, notes: event.target.value }))}
                    rows={2}
                    placeholder="Reason or details for admin"
                    className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={equipmentSubmitting || inventoryItems.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <FiPlus size={16} />
                    {equipmentSubmitting ? 'Sending...' : 'Request Equipment'}
                  </button>
                </form>
              ) : (
                <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
                  Additional equipment can be requested before work starts or while the job is active.
                </p>
              )}
            </div>
            )}

            {selectedJob.notes && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <div className="mb-1 text-sm font-medium text-slate-500">Work Notes</div>
                <div className="text-sm text-slate-700">{selectedJob.notes}</div>
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => openTimeline(selectedJob)}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                <FiClock size={16} /> View Timeline
              </button>
              <Link
                to={`/technician/map-navigation?ticketId=${selectedJob.ticketId}`}
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600"
              >
                <FiMapPin size={16} /> Open Navigation
              </Link>
              {['completed', 'cancelled'].includes(selectedJob.status) ? (
                <Link
                  to="/technician/job-history"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-center text-white hover:bg-blue-700"
                >
                  View Job History
                </Link>
              ) : selectedJob.status === 'in_progress' && selectedJob.checklistCompleted ? (
                selectedJob.assignmentRole === 'crew' ? (
                  <div className="rounded-lg bg-slate-100 px-4 py-2 text-center text-sm font-medium text-slate-600">
                    Lead technician finishes this job
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openCompletionFromDetails}
                    className="rounded-lg bg-green-600 px-4 py-2 text-center font-medium text-white hover:bg-green-700"
                  >
                    Finish Job
                  </button>
                )
              ) : (
                <Link
                  to={selectedJob.ticketType === 'inspection' ? `/technician/inspection-checklist?ticketId=${selectedJob.ticketId}` : `/technician/checklist?ticketId=${selectedJob.ticketId}`}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-center text-white hover:bg-blue-700"
                >
                  {selectedJob.status === 'in_progress' ? 'Complete Checklist' : 'Open Checklist'}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <TicketTimelineModal
        ticket={timelineJob}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => setTimelineJob(null)}
      />

      {completionJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">Finish Job</h3>
                <p className="text-slate-600">
                  {formatTicketId(completionJob.ticketId)} for {completionJob.client?.full_name || completionJob.client}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompletionJob(null);
                  setProofImages([]);
                  setCompletionNotes('');
                }}
                className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="space-y-6">
              {/* Proof Images Upload */}
              {completionJob.ticketType !== 'inspection' && (
                <div className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-6">
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  <FiUpload className="mr-2 inline" /> Completion Photo (Required)
                </label>
                <p className="mb-4 text-sm text-slate-600">
                  Add at least one clear photo showing the finished work. You can select more than one.
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="mb-4 block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-blue-500 file:px-4 file:py-2 file:text-white hover:file:bg-blue-600"
                />

                {proofImages.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700">
                      {proofImages.length} image(s) selected
                    </p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {proofImages.map((img, idx) => (
                        <div key={idx} className="relative">
                          <img
                            src={img}
                            alt={`Proof ${idx + 1}`}
                            className="h-24 w-full rounded-lg border border-slate-200 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Completion Notes */}
              <div>
                <label className="block mb-2 text-sm font-semibold text-slate-900">
                  Completion Notes (Optional)
                </label>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Describe the work completed, any issues encountered, recommendations for client, etc."
                  className="h-24 w-full rounded-lg border border-slate-300 p-3 text-slate-800 placeholder-slate-400"
                />
              </div>

              {completionJob.inventoryReservations?.filter((reservation) => reservation.status === 'pending').length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-slate-900">Materials Used</h4>
                    <p className="text-xs text-slate-500">
                      Confirm the quantity actually used. Unused reserved stock will be released.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {completionJob.inventoryReservations
                      .filter((reservation) => reservation.status === 'pending')
                      .map((reservation) => (
                        <div
                          key={reservation.id}
                          className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_120px]"
                        >
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {reservation.itemName} x{reservation.quantity}
                            </div>
                            <div className="text-xs text-slate-500">
                              {reservation.reservationCode || formatReservationId(reservation.id)} - {' '}
                              {reservation.itemSku ? `SKU: ${reservation.itemSku}` : 'No SKU'}
                            </div>
                          </div>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-500">Used</span>
                            <input
                              type="number"
                              min="0"
                              max={reservation.quantity}
                              value={materialUsage[String(reservation.id)] ?? reservation.quantity}
                              onChange={(event) => {
                                const value = Math.min(
                                  reservation.quantity,
                                  Math.max(0, Number(event.target.value || 0))
                                );
                                setMaterialUsage((currentUsage) => ({
                                  ...currentUsage,
                                  [String(reservation.id)]: value
                                }));
                              }}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                            />
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {!completionJob.checklistCompleted && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Submit the job checklist before completing this job.
                  <Link
                    to={completionJob.ticketType === 'inspection' ? `/technician/inspection-checklist?ticketId=${completionJob.ticketId}` : `/technician/checklist?ticketId=${completionJob.ticketId}`}
                    className="ml-2 font-semibold text-amber-900 underline"
                  >
                    Open checklist
                  </Link>
                </div>
              )}

              {!canCompleteSelectedJob && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Only the lead technician can submit the final completion for this team job.
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid gap-3 sm:flex">
                <button
                  type="button"
                  onClick={handleCompleteJob}
                  disabled={!canCompleteSelectedJob || (completionJob.ticketType !== 'inspection' && proofImages.length === 0) || !completionJob.checklistCompleted || isCompleting}
                  className={`flex-1 rounded-lg px-6 py-3 font-medium text-white transition flex items-center justify-center gap-2 ${
                    !canCompleteSelectedJob || (completionJob.ticketType !== 'inspection' && proofImages.length === 0) || !completionJob.checklistCompleted || isCompleting
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-green-500 hover:bg-green-600'
                  }`}
                >
                  {isCompleting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Completing...
                    </>
                  ) : (
                    completionJob.ticketType !== 'inspection' ? 'Finish Job' : 'Finish Inspection'
                  )}
                </button>
                <button
                  type="button"
                  disabled={isCompleting}
                  onClick={() => {
                    setCompletionJob(null);
                    setProofImages([]);
                    setCompletionNotes('');
                  }}
                  className="rounded-lg bg-slate-200 px-6 py-3 font-medium text-slate-700 transition hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>

              {completionJob.ticketType !== 'inspection' && proofImages.length === 0 && (
                <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                  At least one proof image is required to complete the job.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
