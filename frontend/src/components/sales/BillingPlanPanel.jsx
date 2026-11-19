import { useEffect, useState } from 'react';
import { fetchBillingPlan, recordProgressPayment, saveBillingPlan, voidQuotationDepositPayment } from '../../api/services';
import { getLocalDateInputValue } from '../../utils/date';

// Progress billing: the quotation's payment schedule (e.g. 30% / 60% / 10%). The office sets the
// stages and records payments; the client sees the same table read-only. Amounts, due dates and
// paid status come from the server (services/billing.py).

const TRIGGERS = [
  ['acceptance', 'When the quotation is accepted'],
  ['work_start', 'When work starts'],
  ['completion', 'When the work is completed'],
  ['handover', 'At handover'],
  ['date', 'On a set date'],
];
const STATUS = {
  paid: ['Paid', 'bg-emerald-100 text-emerald-800'],
  overdue: ['Overdue', 'bg-red-100 text-red-800'],
  due: ['Due', 'bg-amber-100 text-amber-800'],
  upcoming: ['Upcoming', 'bg-slate-100 text-slate-700'],
  cancelled: ['Job cancelled', 'bg-slate-200 text-slate-700'],
};
const METHODS = [['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['gcash', 'GCash'], ['maya', 'Maya'], ['check', 'Check'], ['card', 'Card'], ['other', 'Other']];
const SUGGESTED = [
  { label: 'Downpayment', percent: '30', trigger: 'acceptance', due_date: '' },
  { label: 'On installation', percent: '60', trigger: 'work_start', due_date: '' },
  { label: 'At handover', percent: '10', trigger: 'handover', due_date: '' },
];
const money = (value) => Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
const today = () => getLocalDateInputValue();

export default function BillingPlanPanel({ quotation, canManage = false }) {
  const [plan, setPlan] = useState(null);
  const [rows, setRows] = useState(null);
  const [payment, setPayment] = useState({ amount: '', paid_on: today(), method: 'cash', reference: '' });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;
    setPlan(null);
    setRows(null);
    setMessage(null);
    if (!quotation?.id) return undefined;
    fetchBillingPlan(quotation.id)
      .then((data) => { if (active) setPlan(data); })
      .catch(() => { if (active) setPlan(null); });
    return () => { active = false; };
  }, [quotation?.id, quotation?.status, quotation?.deposit_paid_amount]);

  if (!quotation?.id || !plan) return null;
  if (!plan.has_plan && !canManage) return null;

  const editing = rows !== null;
  const percentTotal = (rows || []).reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  const canPay = canManage && plan.has_plan && quotation.status === 'Accepted' && Number(plan.balance) > 0
    && quotation.ticket_status !== 'Cancelled';

  const startEditing = () => {
    setMessage(null);
    setRows(plan.has_plan
      ? plan.milestones.map((row) => ({ label: row.label, percent: row.percent, trigger: row.trigger, due_date: row.due_date || '' }))
      : SUGGESTED.map((row) => ({ ...row })));
  };
  const updateRow = (index, field, value) => setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const save = async (event) => {
    event.preventDefault();
    setBusy('save');
    setMessage(null);
    try {
      setPlan(await saveBillingPlan(quotation.id, rows));
      setRows(null);
      setMessage({ tone: 'success', text: 'Payment schedule saved.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  const pay = async (event) => {
    event.preventDefault();
    setBusy('pay');
    setMessage(null);
    try {
      setPlan(await recordProgressPayment(quotation.id, { ...payment, amount: Number(payment.amount) }));
      setPayment({ amount: '', paid_on: today(), method: 'cash', reference: '' });
      setMessage({ tone: 'success', text: 'Payment recorded. The client was notified.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  const voidPayment = async (entry) => {
    const reason = window.prompt('Why is this payment being voided? (for example: wrong amount typed)');
    if (!reason?.trim()) return;
    setBusy(`void-${entry.id}`);
    setMessage(null);
    try {
      await voidQuotationDepositPayment(quotation.id, entry.id, reason.trim());
      setPlan(await fetchBillingPlan(quotation.id));
      setMessage({ tone: 'success', text: 'Payment voided. The balance was updated.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby={`billing-plan-${quotation.id}`} data-testid="billing-plan">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`billing-plan-${quotation.id}`} className="text-sm font-semibold text-slate-900">Payment schedule</h3>
          <p className="mt-1 text-xs text-slate-600">
            {plan.has_plan ? `Total ${money(plan.total)} · Paid ${money(plan.paid)} · Balance ${money(plan.balance)}` : 'No schedule yet: the client pays the balance after the work.'}
          </p>
        </div>
        {canManage && plan.editable && !editing ? (
          <button type="button" onClick={startEditing} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {plan.has_plan ? 'Edit schedule' : 'Set payment schedule'}
          </button>
        ) : null}
      </div>

      {message ? <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs ${message.tone === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{message.text}</p> : null}

      {plan.has_plan && !editing ? (
        <ul className="mt-3 space-y-2">
          {plan.milestones.map((row) => {
            const [label, tone] = STATUS[row.status] || [row.status, 'bg-slate-100 text-slate-700'];
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{row.label} · {Number(row.percent)}% · {money(row.amount)}</p>
                  <p className="text-slate-500">
                    {row.due_on ? `Due ${row.due_on}` : row.trigger_label}
                    {Number(row.paid) > 0 && row.status !== 'paid' ? ` · Paid ${money(row.paid)}, left ${money(row.remaining)}` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 font-semibold ${tone}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {editing ? (
        <form onSubmit={save} className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-slate-100 p-2 sm:grid-cols-[1fr_5rem_1fr_auto]">
              <label className="text-xs font-medium text-slate-700">Stage
                <input value={row.label} maxLength={120} onChange={(event) => updateRow(index, 'label', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-base sm:text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-700">%
                <input type="number" min="0.01" max="100" step="0.01" value={row.percent} onChange={(event) => updateRow(index, 'percent', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-base sm:text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-700">Due
                <select value={row.trigger} onChange={(event) => updateRow(index, 'trigger', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-base sm:text-sm">
                  {TRIGGERS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
                {row.trigger === 'date' ? <input type="date" value={row.due_date} onChange={(event) => updateRow(index, 'due_date', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-base sm:text-sm" aria-label={`Due date for ${row.label || 'stage'}`} /> : null}
              </label>
              <button type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} disabled={rows.length === 1} className="min-h-11 self-end rounded-lg px-2 text-xs font-semibold text-red-700 disabled:opacity-40">Remove</button>
            </div>
          ))}
          <p className={`text-xs ${Math.abs(percentTotal - 100) < 0.01 ? 'text-emerald-700' : 'text-amber-800'}`}>Stages add up to {percentTotal.toFixed(2)}% (must be 100%).</p>
          <div className="flex flex-wrap gap-2">
            {rows.length < 6 ? <button type="button" onClick={() => setRows((current) => [...current, { label: '', percent: '', trigger: 'completion', due_date: '' }])} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Add stage</button> : null}
            <button type="button" onClick={() => setRows(null)} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Cancel</button>
            <button type="submit" disabled={Boolean(busy)} className="min-h-11 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{busy === 'save' ? 'Saving...' : 'Save schedule'}</button>
          </div>
        </form>
      ) : null}

      {plan.has_plan && !editing && Array.isArray(plan.payments) && plan.payments.length ? (
        <div className="mt-4 border-t border-slate-100 pt-3" data-testid="billing-payments">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payments toward this schedule</p>
          <ul className="mt-2 space-y-2">
            {plan.payments.map((entry) => (
              <li key={entry.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs ${entry.is_voided ? 'opacity-60' : ''}`}>
                <span className="min-w-0">
                  <span className={`font-semibold text-slate-900 ${entry.is_voided ? 'line-through' : ''}`}>{money(entry.amount)} · {entry.method_label}</span>
                  <span className="block text-slate-500">
                    {entry.paid_on}
                    {entry.reference ? ` · Ref ${entry.reference}` : ''}
                    {canManage && entry.recorded_by_name ? ` · by ${entry.recorded_by_name}` : ''}
                    {entry.is_voided ? ` · Voided${entry.void_reason ? `: ${entry.void_reason}` : ''}` : (canManage && entry.notes ? ` · ${entry.notes}` : '')}
                  </span>
                </span>
                {canManage && !entry.is_voided && quotation.ticket_status !== 'Cancelled' ? (
                  <button type="button" onClick={() => voidPayment(entry)} disabled={Boolean(busy)} className="min-h-11 rounded-lg px-2 font-semibold text-red-700 hover:text-red-800 disabled:opacity-50">
                    {busy === `void-${entry.id}` ? 'Voiding...' : 'Void'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canPay && !editing ? (
        <form onSubmit={pay} className="mt-4 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
          <label className="text-xs font-medium text-slate-700">Amount
            <input required type="number" min="0.01" max={plan.balance} step="0.01" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-base sm:text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-700">Date received
            <input required type="date" max={today()} value={payment.paid_on} onChange={(event) => setPayment({ ...payment, paid_on: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-base sm:text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-700">Method
            <select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-base sm:text-sm">
              {METHODS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={Boolean(busy)} className="min-h-11 w-full rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{busy === 'pay' ? 'Recording...' : 'Record payment'}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
