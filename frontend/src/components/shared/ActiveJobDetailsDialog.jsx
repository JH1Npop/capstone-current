import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertCircle,
  FiCalendar,
  FiChevronDown,
  FiClock,
  FiExternalLink,
  FiFileText,
  FiMail,
  FiMapPin,
  FiNavigation,
  FiPhone,
  FiRefreshCw,
  FiTool,
  FiUser,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import { fetchServiceTicket } from '../../api/api';
import { formatDate, formatDateTime } from '../../utils/dashboardHelpers';
import { formatClientId, formatTicketId } from '../../utils/roleIds';
import SLABadge, { formatSlaSummary } from '../ui/SLABadge';
import StatusBadge from '../ui/StatusBadge';

const formatTime = (value) => {
  if (!value) return '';
  const [hours = '0', minutes = '00'] = String(value).split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
};

const displayStatus = (value) => String(value || '').replace(/_/g, ' ');

const formatDistance = (meters) => {
  const value = Number(meters);
  if (!Number.isFinite(value) || value <= 0) return '';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
};

const formatDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '';
  const minutes = Math.round(value / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
};

const DisclosureSection = ({ title, summary, icon: Icon, defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <details
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-3 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="shrink-0 text-slate-500" />
          <span className="font-semibold text-slate-900">{title}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-right text-xs text-slate-500">
          <span className="hidden truncate sm:block">{summary}</span>
          <FiChevronDown className="shrink-0 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-slate-200 p-4">{children}</div>
    </details>
  );
};

export default function ActiveJobDetailsDialog({
  job,
  onClose,
  onOpenTickets,
  onOpenDispatch,
}) {
  const dialogRef = useRef(null);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFullTimeline, setShowFullTimeline] = useState(false);

  const loadTicket = async () => {
    setLoading(true);
    setError('');
    try {
      setTicket(await fetchServiceTicket(job.ticket_id || job.id));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load service ticket details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
  }, [job.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.querySelector('button')?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialog?.querySelectorAll(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
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
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const timeline = useMemo(() => {
    const events = Array.isArray(ticket?.status_history) ? ticket.status_history : [];
    return [...events].sort(
      (left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0),
    );
  }, [ticket]);

  const progress = ticket?.workflow_progress ?? job.progress ?? 0;
  const progressLabel = ticket?.workflow_progress_label || job.progress_label || 'Current workflow stage';
  const track = ticket?.workflow_progress_track || job.progress_track || 'service';
  const trackLabel = ticket?.workflow_progress_track_label || job.progress_track_label || 'Service job';
  const status = ticket?.status || job.status;
  const crew = Array.isArray(ticket?.crewMembers) ? ticket.crewMembers : [];
  const reservations = Array.isArray(ticket?.inventoryReservations) ? ticket.inventoryReservations : [];
  const schedule = ticket?.scheduledDate || ticket?.scheduled_date;
  const scheduledTime = ticket?.scheduledTime || ticket?.scheduled_time;
  const location = ticket?.locationDesc || job.location;
  const technician = ticket?.technicianFullname || job.technician || 'Unassigned';
  const client = ticket?.clientFullname || job.client || 'Not available';
  const service = ticket?.service || job.service_type || 'Service';
  const requestDetails = ticket?.request_details || {};
  const clientId = ticket?.clientId || requestDetails.client;
  const clientPhone = ticket?.clientPhone || requestDetails.client_phone || '';
  const clientEmail = ticket?.clientEmail || requestDetails.client_email || '';
  const clientAddress = ticket?.clientAddress || requestDetails.client_address || '';
  const serviceItems = Array.isArray(ticket?.serviceItems) ? ticket.serviceItems : [];
  const requestDescription = requestDetails.description || '';
  const schedulingNotes = ticket?.schedulingNotes || requestDetails.scheduling_notes || '';
  const routeDistance = formatDistance(ticket?.route_distance);
  const routeDuration = formatDuration(ticket?.route_duration);
  const routeSummary = [routeDistance, routeDuration].filter(Boolean).join(' · ');
  const visibleTimeline = showFullTimeline ? timeline : timeline.slice(0, 3);
  const normalizedStatus = String(status || '').toLowerCase().replace(/_/g, ' ');
  const slaNeedsAttention = ['warning', 'overdue'].includes(ticket?.sla?.state);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-3 sm:p-5"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-job-details-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${track === 'inspection' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                {trackLabel}
              </span>
              <StatusBadge status={status} size="sm" />
            </div>
            <h2 id="active-job-details-title" className="mt-2 text-xl font-semibold text-slate-900">
              {formatTicketId(job.ticket_id || job.id)} · {service}
            </h2>
            <p className="mt-1 text-sm text-slate-500">Live ticket details and recorded workflow evidence</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close job details" className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <FiX className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Workflow progress">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current checkpoint</p>
                <p className="mt-1 font-semibold text-slate-900">{progressLabel}</p>
              </div>
              <span className="text-lg font-bold text-slate-800">{progress}%</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${ticket?.workflow_progress_paused || job.progress_paused ? 'bg-amber-500' : 'bg-brand-600'}`}
                style={{ width: `${Math.min(Number(progress) || 0, 100)}%` }}
                role="progressbar"
                aria-label={progressLabel}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={progress}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${String(ticket?.priority || job.priority).toLowerCase() === 'urgent' ? 'bg-rose-100 text-rose-800' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
                {ticket?.priority || job.priority || 'Normal'} priority
              </span>
              <SLABadge sla={ticket?.sla} size="sm" />
            </div>
            <p className="mt-2 text-xs text-slate-500">Based on recorded ticket status, not elapsed time.</p>
          </section>

          {loading ? (
            <div className="space-y-3 py-6" aria-label="Loading job details">
              {[1, 2, 3].map((item) => <div key={item} className="skeleton h-16 w-full rounded-xl" />)}
            </div>
          ) : error ? (
            <div className="my-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="flex items-start gap-2"><FiAlertCircle className="mt-0.5 shrink-0" /><p>{error}</p></div>
              <button type="button" onClick={loadTicket} className="mt-3 inline-flex items-center gap-2 font-semibold text-rose-700 hover:text-rose-900">
                <FiRefreshCw /> Try again
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <section className="overflow-hidden rounded-xl border border-slate-200" aria-labelledby="job-client-title">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <h3 id="job-client-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FiUsers /> Client details</h3>
                </div>
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{client}</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">{formatClientId(clientId)}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{ticket?.requestSourceLabel || 'Client Portal'}</span>
                  </div>
                  {(clientPhone || clientEmail) ? (
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {clientPhone && <a href={`tel:${clientPhone}`} className="inline-flex items-center gap-2 font-medium text-brand-700 hover:underline"><FiPhone /> {clientPhone}</a>}
                      {clientEmail && <a href={`mailto:${clientEmail}`} className="inline-flex min-w-0 items-center gap-2 break-all font-medium text-brand-700 hover:underline"><FiMail className="shrink-0" /> {clientEmail}</a>}
                    </div>
                  ) : <p className="mt-3 text-sm text-slate-500">No direct contact information provided.</p>}
                </div>
              </section>

              <DisclosureSection title="Service details" summary={service} icon={FiFileText}>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Requested service</p>
                    <p className="mt-1 font-semibold text-slate-900">{service}</p>
                    {serviceItems.length > 1 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {serviceItems.map((item) => <span key={item.id || item.service_type} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{item.service_type_name}</span>)}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client description</p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">{requestDescription || 'No service description provided.'}</p>
                  </div>
                  {schedulingNotes && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Scheduling notes</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-amber-900">{schedulingNotes}</p>
                    </div>
                  )}
                  {ticket?.notes && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ticket notes</p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">{ticket.notes}</p>
                    </div>
                  )}
                  {clientAddress && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client account address</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{clientAddress}</p>
                    </div>
                  )}
                </div>
              </DisclosureSection>

              <section className="grid gap-3 sm:grid-cols-2" aria-label="Assignment and visit details">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FiUser /> Assignment</h3>
                  <dl className="mt-3 space-y-3 text-sm">
                    <div><dt className="text-xs font-medium text-slate-500">Lead technician</dt><dd className="mt-0.5 font-semibold text-slate-900">{technician}</dd></div>
                    <div><dt className="text-xs font-medium text-slate-500">Additional crew</dt><dd className="mt-0.5 text-slate-700">{crew.length ? crew.map((member) => member.name).join(', ') : 'None assigned'}</dd></div>
                    {(ticket?.assignedAdminName || ticket?.assignedByName) && <div><dt className="text-xs font-medium text-slate-500">Assignment control</dt><dd className="mt-0.5 text-slate-700">{ticket?.assignedAdminName ? `Owner: ${ticket.assignedAdminName}` : ''}{ticket?.assignedByName ? `${ticket?.assignedAdminName ? ' · ' : ''}Assigned by ${ticket.assignedByName}` : ''}{ticket?.assignedAt ? ` · ${formatDateTime(ticket.assignedAt)}` : ''}</dd></div>}
                    {ticket?.dispatchLabel && <div><dt className="text-xs font-medium text-slate-500">Dispatch state</dt><dd className="mt-0.5 text-slate-700">{ticket.dispatchLabel}</dd></div>}
                  </dl>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FiCalendar /> Visit details</h3>
                  <dl className="mt-3 space-y-3 text-sm">
                    <div><dt className="text-xs font-medium text-slate-500">Schedule</dt><dd className="mt-0.5 font-semibold text-slate-900">{schedule ? formatDate(schedule) : 'No date recorded'}{scheduledTime ? ` · ${formatTime(scheduledTime)}` : ticket?.scheduledTimeSlot ? ` · ${displayStatus(ticket.scheduledTimeSlot)}` : ''}</dd></div>
                    <div><dt className="flex items-center gap-1 text-xs font-medium text-slate-500"><FiMapPin /> Service location</dt><dd className="mt-0.5 whitespace-pre-line text-slate-700">{location || 'No service address recorded'}</dd></div>
                    {routeSummary && <div><dt className="flex items-center gap-1 text-xs font-medium text-slate-500"><FiNavigation /> Planned route</dt><dd className="mt-0.5 text-slate-700">{routeSummary}</dd></div>}
                    {ticket?.start_time && <div><dt className="flex items-center gap-1 text-xs font-medium text-slate-500"><FiClock /> Work started</dt><dd className="mt-0.5 text-slate-700">{formatDateTime(ticket.start_time)}</dd></div>}
                  </dl>
                </div>
              </section>

              {(ticket?.rescheduleRequested || normalizedStatus === 'on hold' || slaNeedsAttention) && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Needs attention">
                  <p className="text-sm font-semibold text-amber-950">Needs attention</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-900">
                    {normalizedStatus === 'on hold' && <li>Job is paused. Review the latest timeline reason.</li>}
                    {ticket?.rescheduleRequested && <li className="whitespace-pre-line">Reschedule requested{ticket.rescheduleReason ? `: ${ticket.rescheduleReason}` : '.'}</li>}
                    {slaNeedsAttention && <li>{formatSlaSummary(ticket.sla)}</li>}
                  </ul>
                </section>
              )}

              <DisclosureSection
                title="Equipment plan"
                summary={reservations.length ? `${reservations.length} reserved item${reservations.length === 1 ? '' : 's'}` : 'No reservations'}
                icon={FiTool}
              >
                {reservations.length ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {reservations.map((item) => (
                      <li key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <span className="font-medium text-slate-900">{item.item_name}</span> · Qty {item.quantity}
                        <span className="ml-1 text-xs capitalize text-slate-500">({displayStatus(item.status)})</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-500">No equipment reservations recorded.</p>}
              </DisclosureSection>

              <DisclosureSection
                title="Status timeline"
                summary={timeline.length ? `${timeline.length} recorded event${timeline.length === 1 ? '' : 's'}` : 'No events'}
                icon={FiClock}
                defaultOpen
              >
                {timeline.length ? (
                  <>
                  <ol className="space-y-4">
                    {visibleTimeline.map((event) => (
                      <li key={event.id} className="relative border-l-2 border-slate-200 pl-4">
                        <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-brand-500" />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{event.status}</p>
                          <time className="text-xs text-slate-500">{formatDateTime(event.timestamp)}</time>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">By {event.changed_by_name || 'System'}</p>
                        {event.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{event.notes}</p>}
                      </li>
                    ))}
                  </ol>
                  {timeline.length > 3 && (
                    <button type="button" onClick={() => setShowFullTimeline((current) => !current)} className="mt-4 text-sm font-semibold text-brand-700 hover:text-brand-800">
                      {showFullTimeline ? 'Show latest 3 events' : `Show full timeline (${timeline.length})`}
                    </button>
                  )}
                  </>
                ) : <p className="mt-2 text-sm text-slate-500">No status events have been recorded yet.</p>}
              </DisclosureSection>
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">Close</button>
          {onOpenTickets && <button type="button" onClick={onOpenTickets} className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"><FiExternalLink /> Open ticket queue</button>}
          {onOpenDispatch && <button type="button" onClick={onOpenDispatch} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"><FiExternalLink /> Open dispatch board</button>}
        </footer>
      </div>
    </div>
  );
}
