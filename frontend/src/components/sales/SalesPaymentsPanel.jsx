import { useState } from 'react';
import { FiCreditCard, FiPlus, FiSlash } from 'react-icons/fi';
import { recordSalesPayment, voidSalesPayment } from '../../api/services';
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

export const PAYMENT_STATUS_STYLES = {
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700' },
  partial: { label: 'Partly paid', className: 'bg-amber-50 text-amber-700' },
  unpaid: { label: 'Unpaid', className: 'bg-red-50 text-red-700' },
};

export function PaymentStatusBadge({ status }) {
  const style = PAYMENT_STATUS_STYLES[status];
  if (!style) return null;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}>{style.label}</span>;
}

const emptyForm = () => ({ amount: '', paid_on: getLocalDateInputValue(), method: 'cash', reference: '', notes: '' });

// Office view of payments received outside the system for one confirmed sale.
export default function SalesPaymentsPanel({ record, formatMoney, formatDate, onChanged }) {
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const payments = Array.isArray(record.payments) ? record.payments : [];
  const balance = Number(record.balance_due);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await recordSalesPayment(record.id, { ...form, amount: form.amount });
      setForm(emptyForm());
      setShowForm(false);
      await onChanged();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmVoid = async () => {
    if (!voiding || !voidReason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await voidSalesPayment(record.id, voiding, voidReason.trim());
      setVoiding(null);
      setVoidReason('');
      await onChanged();
    } catch (voidError) {
      setError(voidError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 p-4" aria-labelledby="sales-payments-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="sales-payments-title" className="flex items-center gap-2 font-semibold text-slate-900"><FiCreditCard aria-hidden="true" /> Payments received</h3>
        <PaymentStatusBadge status={record.payment_status} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Contract value</p><p className="mt-1 font-semibold tabular-nums text-slate-900">{formatMoney(record.agreed_total, record.currency_code)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Paid</p><p className="mt-1 font-semibold tabular-nums text-emerald-700">{formatMoney(record.amount_paid, record.currency_code)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Balance due</p><p className={`mt-1 font-semibold tabular-nums ${balance > 0 ? 'text-red-700' : 'text-slate-900'}`}>{formatMoney(record.balance_due, record.currency_code)}</p></div>
      </div>

      {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {payments.length ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Method</th><th className="px-3 py-2 font-semibold">Reference</th><th className="px-3 py-2 text-right font-semibold">Amount</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={payment.id} className={payment.is_voided ? 'text-slate-400' : ''}>
                  <td className="px-3 py-2">{formatDate(payment.paid_on)}</td>
                  <td className="px-3 py-2">{payment.method_label}</td>
                  <td className="px-3 py-2">{payment.reference || '-'}{payment.is_voided ? <span className="ml-2 text-xs text-red-600">Voided: {payment.void_reason}</span> : null}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${payment.is_voided ? 'line-through' : 'font-semibold text-slate-900'}`}>{formatMoney(payment.amount, record.currency_code)}</td>
                  <td className="px-3 py-2 text-right">
                    {!payment.is_voided ? (
                      <button type="button" onClick={() => { setVoiding(payment.id); setVoidReason(''); }} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline" aria-label={`Void payment of ${payment.amount}`}><FiSlash aria-hidden="true" /> Void</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-3 text-sm text-slate-500">No payments recorded yet.</p>}

      {voiding ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <label className="text-sm font-medium text-red-800">Reason for voiding this payment<textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-slate-800" /></label>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={confirmVoid} disabled={busy || !voidReason.trim()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Void payment</button>
            <button type="button" onClick={() => setVoiding(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
          </div>
        </div>
      ) : null}

      {record.payment_status !== 'paid' ? (
        showForm ? (
          <form onSubmit={submit} className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Amount<input required type="number" min="0.01" step="0.01" max={Number.isFinite(balance) ? balance : undefined} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-700">Date received<input required type="date" max={getLocalDateInputValue()} value={form.paid_on} onChange={(event) => setForm((current) => ({ ...current, paid_on: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
            <label className="text-sm font-medium text-slate-700">Method<select value={form.method} onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Reference (optional)<input value={form.reference} maxLength={120} placeholder="Receipt or transaction no." onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Saving...' : 'Save payment'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              {Number.isFinite(balance) && balance > 0 ? <button type="button" onClick={() => setForm((current) => ({ ...current, amount: String(balance) }))} className="ml-auto text-sm font-semibold text-brand-700 hover:underline">Fill remaining balance</button> : null}
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setShowForm(true)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"><FiPlus aria-hidden="true" /> Record payment</button>
        )
      ) : null}
    </section>
  );
}
