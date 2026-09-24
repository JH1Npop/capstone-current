import { useState } from 'react';
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiX, FiXCircle } from 'react-icons/fi';
import StatusBadge from '../ui/StatusBadge';
import { reviewInspectionDecision } from '../../api/admin';
import { formatTicketId } from '../../utils/roleIds';

const DecisionCard = ({ active, accent, icon: Icon, title, description, onSelect }) => (
  <label
    className={`flex cursor-pointer gap-4 rounded-2xl border p-4 transition ${
      active ? `${accent.border} ${accent.bg} ring-1 ring-inset ${accent.ring}` : 'border-surface-200 bg-white hover:border-surface-300 hover:bg-surface-50'
    }`}
  >
    <input
      type="radio"
      name="decision"
      className={`mt-1.5 h-4 w-4 border-slate-300 ${accent.input}`}
      checked={active}
      onChange={onSelect}
    />
    <div className="min-w-0">
      <div className="flex items-center gap-2 font-bold text-slate-900">
        <Icon className={accent.icon} />
        {title}
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  </label>
);

export default function InspectionReviewModal({ ticket, onClose, onSuccess }) {
  const [decision, setDecision] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!ticket) return null;

  const handleSubmit = async () => {
    if (!decision) {
      setError('Please select a decision.');
      return;
    }

    if (decision === 'approve_service' && !scheduledDate) {
      setError('Please select a scheduled date for the installation.');
      return;
    }

    if (['awaiting_materials', 'cancel'].includes(decision) && !notes.trim()) {
      setError('Add a reason for this exception decision.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await reviewInspectionDecision(ticket.id, {
        decision,
        notes,
        scheduledDate: decision === 'approve_service' ? scheduledDate : null
      });
      onSuccess();
    } catch (err) {
      setError(err.message || 'Unable to save decision.');
      setSubmitting(false);
    }
  };

  const ticketLabel = ticket.id ? formatTicketId(ticket.id) : 'Inspection';
  const clientLabel = ticket.clientFullname || 'Client';

  const optionAccent = {
    approve_service: {
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      ring: 'ring-emerald-200',
      input: 'text-emerald-600 focus:ring-emerald-600',
      icon: 'text-emerald-500'
    },
    awaiting_materials: {
      border: 'border-amber-200',
      bg: 'bg-amber-50',
      ring: 'ring-amber-200',
      input: 'text-amber-600 focus:ring-amber-600',
      icon: 'text-amber-500'
    },
    cancel: {
      border: 'border-rose-200',
      bg: 'bg-rose-50',
      ring: 'ring-rose-200',
      input: 'text-rose-600 focus:ring-rose-600',
      icon: 'text-rose-500'
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-slate-900">{ticketLabel}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {ticket.service || ticket.service_type || 'Service'} for {clientLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Close inspection review dialog"
          >
            <FiX size={20} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-6">
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <FiAlertTriangle className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review Scope</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Choose the next system action</div>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ticket</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{ticketLabel}</div>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Client</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{clientLabel}</div>
            </div>
          </div>

          <div className="space-y-3">
            <DecisionCard
              active={decision === 'approve_service'}
              accent={optionAccent.approve_service}
              icon={FiCheckCircle}
              title="Ready for Service"
              description="The inspection passed. Approve the job and create the installation ticket."
              onSelect={() => setDecision('approve_service')}
            />
            <DecisionCard
              active={decision === 'awaiting_materials'}
              accent={optionAccent.awaiting_materials}
              icon={FiAlertTriangle}
              title="Awaiting Materials"
              description="The site is acceptable, but parts or equipment still need to be sourced."
              onSelect={() => setDecision('awaiting_materials')}
            />
            <DecisionCard
              active={decision === 'cancel'}
              accent={optionAccent.cancel}
              icon={FiXCircle}
              title="Cancel Service"
              description="The request cannot move forward at this site."
              onSelect={() => setDecision('cancel')}
            />
          </div>

          {decision === 'approve_service' && (
            <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5">
              <label className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-950">
                <FiCalendar /> Schedule Installation Date
              </label>
              <p className="mb-3 text-xs leading-5 text-emerald-800">
                Pick the date the installation team should be dispatched.
              </p>
              <input
                type="date"
                value={scheduledDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          )}

          <div className="mt-6">
            <label className="mb-2 block text-sm font-bold text-slate-900">Admin Notes{['awaiting_materials', 'cancel'].includes(decision) ? ' (required)' : ''}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded-2xl border border-surface-200 bg-white p-4 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              rows={4}
              placeholder="Add internal notes about this decision..."
            />
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-xl border border-surface-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-surface-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !decision}
              className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Submit Decision'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
