import { useEffect, useState } from 'react';
import { recordQuotationDeposit, settleQuotationDeposit, voidQuotationDepositPayment } from '../../api/services';
import { getLocalDateInputValue } from '../../utils/date';

const METHODS = [
  ['cash', 'Cash'],
  ['bank_transfer', 'Bank transfer'],
  ['gcash', 'GCash'],
  ['maya', 'Maya'],
  ['check', 'Check'],
  ['card', 'Card'],
  ['other', 'Other'],
];

// Local calendar day (UTC would give yesterday before 8 AM in UTC+8).
const today = () => getLocalDateInputValue();
const money = (value) => Number(value || 0).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const statusLabel = {
  not_required: 'Not required',
  unpaid: 'Unpaid',
  partial: 'Partially paid',
  paid: 'Paid',
};

export default function QuotationDepositPanel({ quotation, onUpdated, canManage = true }) {
  const [form, setForm] = useState({ amount: '', paid_on: today(), method: 'cash', reference: '', notes: '' });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [settle, setSettle] = useState({ outcome: '', note: '' });

  useEffect(() => {
    setMessage(null);
    setForm((current) => ({ ...current, amount: '' }));
    setSettle({ outcome: '', note: '' });
  }, [quotation?.id]);

  if (!quotation || quotation.deposit_policy === 'none') return null;

  const jobCancelled = quotation.ticket_status === 'Cancelled';
  const outcome = quotation.deposit_outcome;
  const remaining = Number(quotation.deposit_remaining_amount || 0);
  // Progress-billing payments on the same quotation are shown in the Payment schedule panel.
  const payments = (Array.isArray(quotation.deposit_payments) ? quotation.deposit_payments : [])
    .filter((payment) => !payment.kind || payment.kind === 'deposit');
  const canRecord = canManage && !jobCancelled && quotation.status === 'Accepted' && remaining > 0;

  const submitSettlement = async (event) => {
    event.preventDefault();
    if (!settle.outcome) {
      setMessage({ tone: 'error', text: 'Choose Refunded or Kept.' });
      return;
    }
    setBusy('settle');
    setMessage(null);
    try {
      const updated = await settleQuotationDeposit(quotation.id, settle.outcome, settle.note.trim());
      setMessage({ tone: 'success', text: settle.outcome === 'refunded' ? 'Refund recorded. The client was notified.' : 'Kept deposit recorded. The client was notified.' });
      onUpdated?.(updated);
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    setBusy('record');
    setMessage(null);
    try {
      const updated = await recordQuotationDeposit(quotation.id, {
        ...form,
        amount: Number(form.amount),
      });
      setForm({ amount: '', paid_on: today(), method: 'cash', reference: '', notes: '' });
      setMessage({ tone: 'success', text: 'Deposit payment recorded.' });
      onUpdated?.(updated);
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  const voidPayment = async (payment) => {
    const reason = window.prompt('Why is this deposit payment being voided?');
    if (!reason?.trim()) return;
    setBusy(`void-${payment.id}`);
    setMessage(null);
    try {
      const updated = await voidQuotationDepositPayment(quotation.id, payment.id, reason.trim());
      setMessage({ tone: 'success', text: 'Deposit payment voided. Service dispatch is blocked until the requirement is paid again.' });
      onUpdated?.(updated);
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4" aria-labelledby="quotation-deposit-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="quotation-deposit-title" className="text-sm font-semibold text-slate-900">Pre-service deposit</h3>
          <p className="mt-1 text-xs text-slate-600">
            {jobCancelled ? 'This job was cancelled; no more deposit is collected.' : 'Service work stays blocked until the required amount is recorded.'}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${jobCancelled ? 'bg-slate-200 text-slate-700' : quotation.deposit_status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {jobCancelled ? 'Job cancelled' : statusLabel[quotation.deposit_status] || quotation.deposit_status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-slate-500">Required</dt><dd className="mt-1 font-semibold text-slate-900">{money(quotation.required_deposit_amount)}</dd></div>
        <div><dt className="text-slate-500">Received</dt><dd className="mt-1 font-semibold text-slate-900">{money(quotation.deposit_paid_amount)}</dd></div>
        {jobCancelled ? null : <div><dt className="text-slate-500">Remaining</dt><dd className="mt-1 font-semibold text-slate-900">{money(quotation.deposit_remaining_amount)}</dd></div>}
      </dl>

      {message ? <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs ${message.tone === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{message.text}</p> : null}

      {jobCancelled && outcome ? (
        <p role="status" className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <strong>Job cancelled.</strong> Deposit of {money(outcome.amount)} {outcome.outcome === 'refunded' ? 'refunded' : 'kept'}
          {outcome.recorded_by ? ` (recorded by ${outcome.recorded_by})` : ''}{outcome.note ? `: ${outcome.note}` : '.'}
        </p>
      ) : null}
      {jobCancelled && quotation.deposit_decision_needed && canManage ? (
        <form onSubmit={submitSettlement} className="mt-4 space-y-3 border-t border-blue-200 pt-4" aria-labelledby="deposit-settle-title">
          <p id="deposit-settle-title" className="text-sm font-semibold text-slate-900">
            This job was cancelled after {money(quotation.deposit_paid_amount)} was received. What happened to the money?
          </p>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Deposit outcome</legend>
            {[['refunded', 'Refunded to the client'], ['kept', 'Kept (for example a cancellation fee)']].map(([value, label]) => (
              <label key={value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${settle.outcome === value ? 'border-blue-600 bg-white font-semibold text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                <input type="radio" name={`deposit-outcome-${quotation.id}`} value={value} checked={settle.outcome === value} onChange={() => setSettle({ ...settle, outcome: value })} />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="block text-xs font-medium text-slate-700">Note
            <textarea required rows={2} value={settle.note} onChange={(event) => setSettle({ ...settle, note: event.target.value })} placeholder="Example: Refunded by GCash, reference 1234." className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base sm:text-sm" />
          </label>
          <button type="submit" disabled={Boolean(busy)} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
            {busy === 'settle' ? 'Saving...' : 'Save decision'}
          </button>
        </form>
      ) : null}
      {jobCancelled && !outcome && !quotation.deposit_decision_needed ? (
        <p className="mt-3 text-xs text-slate-600">Job cancelled. No deposit was received.</p>
      ) : null}

      {canRecord ? (
        <form onSubmit={submitPayment} className="mt-4 space-y-3 border-t border-blue-200 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">Amount
              <input required type="number" min="0.01" max={remaining} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-700">Date received
              <input required type="date" max={today()} value={form.paid_on} onChange={(event) => setForm({ ...form, paid_on: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-700">Method
              <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">Reference (optional)
              <input value={form.reference} maxLength={120} onChange={(event) => setForm({ ...form, reference: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-700">Notes (optional)
            <textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={Boolean(busy)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
            {busy === 'record' ? 'Recording...' : 'Record deposit'}
          </button>
        </form>
      ) : !jobCancelled && quotation.status !== 'Accepted' ? (
        <p className="mt-3 text-xs text-amber-800">The quotation must be accepted before a deposit can be recorded.</p>
      ) : null}

      {payments.length ? (
        <div className="mt-4 border-t border-blue-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment history</p>
          <div className="mt-2 space-y-2">
            {payments.map((payment) => (
              <div key={payment.id} className={`flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs ${payment.is_voided ? 'opacity-60' : ''}`}>
                <div>
                  <p className="font-semibold text-slate-900">{money(payment.amount)} · {payment.method_label}</p>
                  <p className="text-slate-500">{payment.paid_on}{payment.reference ? ` · ${payment.reference}` : ''}{payment.is_voided ? ` · Voided: ${payment.void_reason}` : ''}{!payment.is_voided && payment.notes ? ` · ${payment.notes}` : ''}</p>
                </div>
                {canManage && !payment.is_voided && !jobCancelled ? <button type="button" disabled={Boolean(busy)} onClick={() => voidPayment(payment)} className="font-semibold text-red-700 hover:text-red-800 disabled:opacity-50">{busy === `void-${payment.id}` ? 'Voiding...' : 'Void'}</button> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
