import { useEffect, useState } from 'react';
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiClock, FiX, FiXCircle } from 'react-icons/fi';
import StatusBadge from '../ui/StatusBadge';
import QuotationDepositPanel from '../sales/QuotationDepositPanel';
import { reviewInspectionDecision } from '../../api/admin';
import { fetchTicketQuotation, recordQuotationAcceptance } from '../../api/services';
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

const localDateValue = () => {
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localNow.toISOString().split('T')[0];
};

const localTimeValue = () => new Date().toLocaleTimeString('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

export default function InspectionReviewModal({ ticket, onClose, onSuccess }) {
  const [decision, setDecision] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [quotation, setQuotation] = useState(undefined);
  const [recordingAcceptance, setRecordingAcceptance] = useState(false);

  useEffect(() => {
    if (!ticket?.id) return undefined;
    let active = true;
    fetchTicketQuotation(ticket.id)
      .then((row) => { if (active) setQuotation(row); })
      .catch(() => { if (active) setQuotation(null); });
    return () => { active = false; };
  }, [ticket?.id]);

  if (!ticket) return null;

  const recordOfflineAcceptance = async () => {
    if (!quotation) return;
    setRecordingAcceptance(true);
    setError('');
    try {
      setQuotation(await recordQuotationAcceptance(quotation.id));
    } catch (acceptError) {
      setError(acceptError.message);
    } finally {
      setRecordingAcceptance(false);
    }
  };

  const handleSubmit = async () => {
    if (!decision) {
      setError('Please select a decision.');
      return;
    }

    if (decision === 'approve_service' && !scheduledDate) {
      setError('Please select a scheduled date for the installation.');
      return;
    }

    if (decision === 'approve_service' && scheduledDate === localDateValue() && !scheduledTime) {
      setError('Please select an installation time for same-day service.');
      return;
    }

    if (decision === 'approve_service' && scheduledTime && (scheduledTime < '08:00' || scheduledTime >= '17:00')) {
      setError('Choose an installation start time from 8:00 AM through 4:59 PM.');
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
        scheduledDate: decision === 'approve_service' ? scheduledDate : null,
        scheduledTime: decision === 'approve_service' ? scheduledTime : null
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
          {quotation !== undefined ? (
            <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm ${
              quotation?.status === 'Accepted' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : quotation?.status === 'Rejected' ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              <p className="min-w-0 flex-1">
                <strong>Quotation: </strong>
                {!quotation ? 'none sent yet. Create it in Documents > Quotation Proposal; the client accepts it in their portal.'
                  : quotation.status === 'Accepted' ? `${quotation.quotation_number} accepted${quotation.client_responded_at ? ' by the client' : ''}.${Number(quotation.deposit_remaining_amount || 0) > 0 ? ' The required deposit must still be recorded before service dispatch.' : ' Service can be dispatched.'}`
                    : quotation.status === 'Rejected' ? `${quotation.quotation_number} declined${quotation.client_response_note ? `: "${quotation.client_response_note}"` : ''}.`
                      : `${quotation.quotation_number} is waiting for the client's decision.`}
              </p>
              {quotation && ['Sent', 'Draft'].includes(quotation.status) ? (
                <button type="button" onClick={recordOfflineAcceptance} disabled={recordingAcceptance} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60">
                  {recordingAcceptance ? 'Saving...' : 'Client accepted offline'}
                </button>
              ) : null}
            </div>
          ) : null}
          {quotation?.deposit_policy && quotation.deposit_policy !== 'none' ? (
            <div className="mb-5">
              <QuotationDepositPanel quotation={quotation} onUpdated={setQuotation} />
            </div>
          ) : null}
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <FiAlertTriangle className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Review Scope</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Choose the next system action</div>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ticket</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{ticketLabel}</div>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Client</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{clientLabel}</div>
            </div>
          </div>

          <div className="space-y-3">
            <DecisionCard
              active={decision === 'approve_service'}
              accent={optionAccent.approve_service}
              icon={FiCheckCircle}
              title="Ready for Service"
              description="The inspection passed. Continue this same ticket as an installation job."
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-bold text-emerald-950">
                  <FiCalendar /> Schedule Installation
                </label>
                <button
                  type="button"
                  onClick={() => setScheduledDate(localDateValue())}
                  className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                >
                  Same-day installation
                </button>
              </div>
              <p className="mb-3 mt-2 text-xs leading-5 text-emerald-800">
                This keeps the same ticket. Dispatch will still select the lead, crew, and installation equipment separately.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="installation-date" className="mb-1.5 block text-xs font-semibold text-emerald-950">Installation date</label>
                  <input
                    id="installation-date"
                    type="date"
                    value={scheduledDate}
                    min={localDateValue()}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <div>
                  <label htmlFor="installation-time" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
                    <FiClock /> Installation time {scheduledDate === localDateValue() ? '(required)' : '(optional)'}
                  </label>
                  <input
                    id="installation-time"
                    type="time"
                    value={scheduledTime}
                    min={scheduledDate === localDateValue() && localTimeValue() > '08:00' ? localTimeValue() : '08:00'}
                    max="16:59"
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  <p className="mt-1 text-xs text-emerald-800">Installation must start during business hours (8 AM to 5 PM).</p>
                </div>
              </div>
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
