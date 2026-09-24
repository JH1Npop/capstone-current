import { useEffect, useRef } from 'react';
import {
  FiAlertTriangle,
  FiCalendar,
  FiClock,
  FiExternalLink,
  FiMail,
  FiMapPin,
  FiPhone,
  FiTool,
  FiUser,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import { formatTicketId } from '../../utils/roleIds';

const Detail = ({ icon: Icon, label, value, wide = false }) => (
  <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 ${wide ? 'sm:col-span-2' : ''}`}>
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
      <Icon className="text-brand-600" /> {label}
    </div>
    <div className="mt-1.5 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">{value || 'Not provided'}</div>
  </div>
);

const formatWorkflow = (event) => {
  if (event?.entity_type === 'request') return 'Client request';
  if (event?.workflow_type === 'inspection' || event?.calendar_status === 'for_inspection') return 'Site inspection';
  if (event?.workflow_type === 'maintenance') return 'Maintenance visit';
  return 'Service job';
};

export default function CalendarEventDetailsModal({ event, statusLabel, timeLabel, hasConflict, onClose, onReschedule, onViewTickets, onOpenDispatch }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!event) return undefined;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('button')?.focus();
    const handleKeyDown = (keyboardEvent) => {
      if (keyboardEvent.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = priorOverflow;
    };
  }, [event, onClose]);

  if (!event) return null;

  const canReschedule = Boolean(event.ticket_id) && String(event.status || '').toLowerCase() === 'not started';
  const crew = Array.isArray(event.crew_members) && event.crew_members.length ? event.crew_members.join(', ') : 'No additional crew';
  const title = event.ticket_id ? formatTicketId(event.ticket_id) : `Request #${event.request_id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-5" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="calendar-event-title" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="calendar-event-title" className="text-xl font-bold text-slate-950">{title}</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{formatWorkflow(event)}</span>
              <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">{statusLabel}</span>
            </div>
            <p className="mt-1 truncate text-sm text-slate-600">{event.service_type || 'Service'} for {event.client || 'Client'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close event details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><FiX size={20} /></button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-6">
          {hasConflict && (
            <div className="mb-4 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <FiAlertTriangle className="mt-0.5 shrink-0" />
              <div><strong>Schedule conflict detected.</strong> A member of this team has another appointment that overlaps this time.</div>
            </div>
          )}
          {event.reschedule_requested && (
            <div className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <FiAlertTriangle className="mt-0.5 shrink-0" /> Client requested a schedule change. Review the request before confirming a new time.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Detail icon={FiCalendar} label="Schedule" value={`${event.date || 'Date TBD'} · ${timeLabel}`} />
            <Detail icon={FiTool} label="Priority" value={event.priority || 'Normal'} />
            <Detail icon={FiUser} label="Lead technician" value={event.assigned_technician || 'Unassigned'} />
            <Detail icon={FiUsers} label="Crew" value={crew} />
            <Detail icon={FiMapPin} label="Service location" value={event.location} wide />
            <Detail icon={FiPhone} label="Client phone" value={event.client_phone} />
            <Detail icon={FiMail} label="Client email" value={event.client_email} />
            <Detail icon={FiClock} label="Scheduling notes" value={event.scheduling_notes} wide />
            <Detail icon={FiTool} label="Work description" value={event.description} wide />
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
          <button type="button" onClick={onViewTickets} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <FiExternalLink /> {event.ticket_id ? 'Open ticket queue' : 'Open request approvals'}
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {event.ticket_id && (
              <button type="button" onClick={onOpenDispatch} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100">Open dispatch</button>
            )}
            {canReschedule && (
              <button type="button" onClick={onReschedule} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Reschedule</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
