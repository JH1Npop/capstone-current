import { useEffect, useState } from 'react';
import { FiCheckCircle, FiFileText, FiHome, FiXCircle } from 'react-icons/fi';
import { confirmTurnover, fetchTicketQuotation, fetchTicketTurnover, respondToQuotation } from '../../api/api';

const formatDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  : '');

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

// Client decisions on a job: accept/decline a sent quotation and confirm the finished handover.
export default function ClientJobDecisions({ ticketId, onChanged }) {
  const [quotation, setQuotation] = useState(null);
  const [turnover, setTurnover] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!ticketId) return;
    let active = true;
    Promise.allSettled([fetchTicketQuotation(ticketId), fetchTicketTurnover(ticketId)]).then(([quotationResult, turnoverResult]) => {
      if (!active) return;
      setQuotation(quotationResult.status === 'fulfilled' ? quotationResult.value : null);
      setTurnover(turnoverResult.status === 'fulfilled' ? turnoverResult.value : null);
    });
    return () => { active = false; };
  }, [ticketId]);

  const visibleQuotation = quotation && quotation.status !== 'Draft' ? quotation : null;
  const visibleTurnover = turnover && ['finalized', 'accepted'].includes(turnover.status) ? turnover : null;
  if (!visibleQuotation && !visibleTurnover) return null;

  const respond = async (decision) => {
    if (decision === 'decline' && !note.trim()) {
      setMessage({ tone: 'error', text: 'Please tell us why you are declining.' });
      return;
    }
    setBusy(decision);
    setMessage(null);
    try {
      const updated = await respondToQuotation(quotation.id, decision, note.trim());
      setQuotation(updated);
      setDeclining(false);
      setNote('');
      setMessage({ tone: 'success', text: decision === 'accept' ? 'Thank you. We will schedule your installation.' : 'Your response was sent to our office.' });
      onChanged?.();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  const confirmHandover = async () => {
    setBusy('handover');
    setMessage(null);
    try {
      setTurnover(await confirmTurnover(turnover.id));
      setMessage({ tone: 'success', text: 'Thank you for confirming the handover.' });
      onChanged?.();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  const materials = Array.isArray(visibleQuotation?.bill_of_materials) ? visibleQuotation.bill_of_materials : [];

  return (
    <div className="space-y-4">
      {message ? (
        <p role="status" className={`rounded-xl border px-4 py-3 text-sm font-medium ${message.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {message.text}
        </p>
      ) : null}

      {visibleQuotation ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="client-quotation-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700"><FiFileText aria-hidden="true" /></span>
              <div>
                <h3 id="client-quotation-title" className="text-base font-semibold text-slate-900">Quotation {visibleQuotation.quotation_number}</h3>
                <p className="text-xs text-slate-500">Valid for {visibleQuotation.validity_days} days from {formatDate(visibleQuotation.created_at)}</p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${{
              Sent: 'bg-amber-50 text-amber-700',
              Accepted: 'bg-emerald-50 text-emerald-700',
              Rejected: 'bg-red-50 text-red-700',
            }[visibleQuotation.status] || 'bg-slate-100 text-slate-600'}`}>
              {visibleQuotation.status === 'Sent' ? 'Waiting for your decision' : visibleQuotation.status === 'Rejected' ? 'Declined' : visibleQuotation.status}
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Total" value={visibleQuotation.total_amount} />
            <Field label="Down payment" value={visibleQuotation.downpayment_amount} />
            <Field label="Balance" value={visibleQuotation.balance_amount} />
          </div>
          {visibleQuotation.payment_terms ? <p className="mt-3 text-sm text-slate-600"><span className="font-medium text-slate-800">Payment terms:</span> {visibleQuotation.payment_terms}</p> : null}
          {visibleQuotation.warranty_terms ? <p className="mt-1 text-sm text-slate-600"><span className="font-medium text-slate-800">Warranty:</span> {visibleQuotation.warranty_terms}</p> : null}

          {materials.length ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2 font-semibold">Item</th><th className="px-3 py-2 text-right font-semibold">Qty</th><th className="px-3 py-2 text-right font-semibold">Amount</th></tr></thead>
                <tbody>{materials.map((row, index) => (
                  <tr key={`${row.description}-${index}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{row.description || row.name || 'Item'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{row.qty || row.quantity || ''} {row.unit || ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">{row.amount || ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}

          {visibleQuotation.status === 'Sent' ? (
            <div className="mt-5 border-t border-slate-100 pt-4">
              {declining ? (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Why are you declining?</span>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => respond('decline')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"><FiXCircle aria-hidden="true" /> {busy === 'decline' ? 'Sending...' : 'Send decline'}</button>
                    <button type="button" onClick={() => setDeclining(false)} disabled={Boolean(busy)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => respond('accept')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"><FiCheckCircle aria-hidden="true" /> {busy === 'accept' ? 'Accepting...' : 'Accept quotation'}</button>
                  <button type="button" onClick={() => setDeclining(true)} disabled={Boolean(busy)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Decline</button>
                  <p className="w-full text-xs text-slate-500 sm:w-auto">Accepting lets our office schedule your installation.</p>
                </div>
              )}
            </div>
          ) : null}
          {visibleQuotation.client_responded_at ? <p className="mt-3 text-xs text-slate-500">You responded on {formatDate(visibleQuotation.client_responded_at)}.</p> : null}
        </section>
      ) : null}

      {visibleTurnover ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="client-handover-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><FiHome aria-hidden="true" /></span>
              <div>
                <h3 id="client-handover-title" className="text-base font-semibold text-slate-900">Job handover</h3>
                <p className="text-xs text-slate-500">
                  Handed over {formatDate(visibleTurnover.turnover_date || visibleTurnover.finalized_at)}
                  {visibleTurnover.warranty_start_date ? ` · warranty starts ${formatDate(visibleTurnover.warranty_start_date)}` : ''}
                </p>
              </div>
            </div>
            {visibleTurnover.status === 'accepted' ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Confirmed {formatDate(visibleTurnover.client_confirmed_at)}</span>
            ) : (
              <button type="button" onClick={confirmHandover} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                <FiCheckCircle aria-hidden="true" /> {busy === 'handover' ? 'Confirming...' : 'Confirm handover'}
              </button>
            )}
          </div>
          {visibleTurnover.status !== 'accepted' ? <p className="mt-3 text-sm text-slate-600">Please confirm that the finished work was handed over to you. If something is wrong, contact our office before confirming.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
