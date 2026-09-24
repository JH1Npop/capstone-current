import { FiClock, FiX } from 'react-icons/fi';
import StatusBadge from '../ui/StatusBadge';
import { ListSkeleton } from '../ui/LoadingSkeleton';
import { formatTicketId } from '../../utils/roleIds';

const formatTimelineDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const displayText = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => displayText(item, '')).filter(Boolean).join(', ') || fallback;
  if (typeof value === 'object') {
    return value.full_name || value.name || value.username || value.email || fallback;
  }
  return fallback;
};

const SummaryPill = ({ label, value }) => (
  <div className="rounded-2xl border border-surface-200 bg-white px-3 py-2 shadow-sm">
    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
    <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
  </div>
);

export default function TicketTimelineModal({ ticket, events = [], loading = false, error = '', onClose }) {
  if (!ticket) return null;

  const ticketId = ticket.ticket_id || ticket.ticketId || ticket.id;
  const serviceName = displayText(ticket.service_type_name || ticket.service || ticket.service_type, 'Service');
  const clientName = displayText(ticket.clientFullname || ticket.client, 'Client');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900">{formatTicketId(ticketId)}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {serviceName} for {clientName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Close timeline dialog"
          >
            <FiX size={20} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <SummaryPill label="Ticket" value={formatTicketId(ticketId)} />
            <SummaryPill label="Client" value={clientName} />
            <SummaryPill label="Service" value={serviceName} />
          </div>

          {loading ? (
            <ListSkeleton rows={4} compact />
          ) : events.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-8 text-center text-sm text-slate-500">
              No timeline events have been recorded for this ticket yet.
            </div>
          ) : (
            <ol className="space-y-4">
              {events.map((event, index) => (
                <li key={event.id || `${event.status}-${event.timestamp}-${index}`} className="relative pl-10">
                  <span className="absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <FiClock size={13} />
                  </span>
                  {index < events.length - 1 && (
                    <span className="absolute left-[13px] top-8 h-[calc(100%+0.5rem)] w-px bg-surface-200" />
                  )}
                  <article className="rounded-3xl border border-surface-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge status={event.status} size="sm" />
                      <span className="text-xs font-medium text-slate-500">{formatTimelineDate(event.timestamp)}</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{event.actor}</p>
                    {event.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{event.notes}</p>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
