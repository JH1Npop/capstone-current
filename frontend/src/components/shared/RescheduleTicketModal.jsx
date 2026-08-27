import { useEffect, useState } from 'react';
import { FiCalendar, FiClock, FiInfo, FiMapPin, FiX } from 'react-icons/fi';
import StatusBadge from '../ui/StatusBadge';
import { formatTicketId } from '../../utils/roleIds';

const timeSlotOptions = [
  { value: '', label: 'Time to be confirmed' },
  { value: 'morning', label: 'Morning' },
  { value: 'midday', label: 'Midday' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' }
];

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const normalizeTimeInput = (value) => {
  if (!value) return '';
  return String(value).slice(0, 5);
};

const SummaryPill = ({ label, value }) => (
  <div className="rounded-2xl border border-surface-200 bg-white px-3 py-2">
    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
    <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
  </div>
);

export default function RescheduleTicketModal({ ticket, onClose, onSubmit }) {
  const [form, setForm] = useState({
    scheduledDate: '',
    scheduledTimeSlot: '',
    scheduledTime: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ticket) return;
    setForm({
      scheduledDate: ticket.scheduledDate || ticket.date || getTodayKey(),
      scheduledTimeSlot: ticket.scheduledTimeSlot || ticket.time_slot || '',
      scheduledTime: normalizeTimeInput(ticket.scheduledTime || ticket.time),
      notes: ticket.schedulingNotes || ticket.scheduling_notes || ''
    });
    setError('');
    setSubmitting(false);
  }, [ticket]);

  if (!ticket) return null;

  const ticketId = ticket.ticket_id || ticket.id;
  const clientName = ticket.clientFullname || ticket.client || 'Client';
  const serviceName = ticket.service || ticket.service_type || 'Service';
  const canReschedule = (ticket.status || '').toString().toLowerCase().replace(/\s+/g, '_') === 'not_started';

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.scheduledDate) {
      setError('Choose the new scheduled date.');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(ticketId, form);
    } catch (submitError) {
      setError(submitError.message || 'Unable to reschedule ticket.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-lg">
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
            aria-label="Close reschedule dialog"
          >
            <FiX size={20} />
          </button>
        </div>

        {!canReschedule && (
          <div className="mx-6 mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <FiInfo className="mt-0.5 shrink-0 text-amber-600" />
            <p>Only tickets that have not started can be rescheduled.</p>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryPill label="Ticket" value={formatTicketId(ticketId)} />
            <SummaryPill label="Client" value={clientName} />
            <SummaryPill label="Service" value={serviceName} />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              <span className="flex items-center gap-2 font-semibold text-slate-900">
                <FiCalendar className="text-brand-600" /> New Date
              </span>
              <input
                type="date"
                min={getTodayKey()}
                value={form.scheduledDate}
                onChange={(event) => updateField('scheduledDate', event.target.value)}
                className="mt-2 w-full rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              <span className="flex items-center gap-2 font-semibold text-slate-900">
                <FiClock className="text-brand-600" /> Time Slot
              </span>
              <select
                value={form.scheduledTimeSlot}
                onChange={(event) => updateField('scheduledTimeSlot', event.target.value)}
                className="mt-2 w-full rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {timeSlotOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700">
              <span className="flex items-center gap-2 font-semibold text-slate-900">
                <FiClock className="text-brand-600" /> Exact Time
              </span>
              <input
                type="time"
                value={form.scheduledTime}
                onChange={(event) => updateField('scheduledTime', event.target.value)}
                className="mt-2 w-full rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
          </div>

          <div className="mt-4 rounded-3xl border border-surface-200 bg-surface-50 p-4">
            <label className="block text-sm font-medium text-slate-700">
              <span className="flex items-center gap-2 font-semibold text-slate-900">
                <FiMapPin className="text-brand-600" /> Notes
              </span>
              <textarea
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Optional scheduling note for the client and dispatch record."
              />
            </label>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-surface-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canReschedule || submitting}
              className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
