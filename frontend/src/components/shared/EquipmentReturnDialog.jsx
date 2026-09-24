import { useEffect, useMemo, useRef, useState } from 'react';
import { FiCheckCircle, FiPackage, FiRefreshCw, FiX } from 'react-icons/fi';
import { fetchTicketEquipmentReconciliation, returnTicketEquipment } from '../../api/api';
import { formatTicketId } from '../../utils/roleIds';

const CONDITIONS = [
  { value: 'sealed', label: 'Sealed / unused' },
  { value: 'usable', label: 'Opened but usable' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'incomplete', label: 'Incomplete' },
];

const conditionLabel = (value) => CONDITIONS.find((item) => item.value === value)?.label || value;

export default function EquipmentReturnDialog({ ticketId, mode = 'submit', onClose, onChanged }) {
  const closeButtonRef = useRef(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [reviewedCondition, setReviewedCondition] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadReconciliation = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchTicketEquipmentReconciliation(ticketId);
      setReconciliation(data);
      const firstPending = (data.return_requests || []).find((item) => item.status === 'pending');
      setSelectedRequestId((current) => (
        (data.return_requests || []).some((item) => item.id === current && item.status === 'pending')
          ? current
          : firstPending?.id || null
      ));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReconciliation();
    closeButtonRef.current?.focus();
  }, [ticketId]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  const returnableItems = useMemo(
    () => (reconciliation?.items || []).filter((item) => item.returnable_quantity > 0),
    [reconciliation],
  );
  const pendingRequests = useMemo(
    () => (reconciliation?.return_requests || []).filter((item) => item.status === 'pending'),
    [reconciliation],
  );
  const selectedRequest = pendingRequests.find((item) => item.id === selectedRequestId) || pendingRequests[0];
  const selectedReturns = returnableItems
    .map((item) => ({ item_id: item.item_id, quantity: Number(quantities[item.item_id] || 0) }))
    .filter((item) => item.quantity > 0);
  const quantitiesValid = selectedReturns.every((entry) => {
    const item = returnableItems.find((candidate) => candidate.item_id === entry.item_id);
    return Number.isInteger(entry.quantity) && entry.quantity <= item.returnable_quantity;
  });
  const canSubmit = selectedReturns.length > 0 && quantitiesValid && condition && notes.trim().length >= 3 && !submitting;
  const canReview = selectedRequest && reviewedCondition && reviewNotes.trim().length >= 3 && !submitting;

  const submitReturn = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const data = await returnTicketEquipment(ticketId, {
        action: 'submit',
        returns: selectedReturns,
        condition,
        notes: notes.trim(),
      });
      setReconciliation(data);
      setQuantities({});
      setCondition('');
      setNotes('');
      setMessage('Return submitted. Stock will change only after warehouse verification.');
      onChanged?.(data);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const reviewReturn = async (decision) => {
    if (!canReview) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const data = await returnTicketEquipment(ticketId, {
        action: decision,
        return_request_id: selectedRequest.id,
        reviewed_condition: reviewedCondition,
        review_notes: reviewNotes.trim(),
      });
      setReconciliation(data);
      setReviewedCondition('');
      setReviewNotes('');
      const nextPending = (data.return_requests || []).find((item) => item.status === 'pending');
      setSelectedRequestId(nextPending?.id || null);
      setMessage(decision === 'verify'
        ? 'Return verified. Inventory is now available.'
        : 'Return rejected. Inventory was not changed.');
      onChanged?.(data);
    } catch (reviewError) {
      setError(reviewError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === 'review' ? 'Verify equipment returns' : 'Submit equipment return';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !submitting && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="equipment-return-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-emerald-100 text-emerald-700"><FiPackage /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Two-party inventory control</p>
              <h2 id="equipment-return-title" className="mt-1 text-lg font-semibold text-slate-950">{title} · {formatTicketId(ticketId)}</h2>
              <p className="mt-1 text-xs text-slate-500">Technician submission and warehouse verification are recorded separately.</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={submitting} aria-label="Close equipment return" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><FiX /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          {message && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><FiCheckCircle />{message}</div>}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><FiRefreshCw className="animate-spin" /> Loading equipment returns…</div>
          ) : mode === 'review' ? (
            pendingRequests.length ? (
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                  Pending return
                  <select value={selectedRequest?.id || ''} onChange={(event) => setSelectedRequestId(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                    {pendingRequests.map((item) => <option key={item.id} value={item.id}>{item.return_code} · {item.submitted_by_name}</option>)}
                  </select>
                </label>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-950">Technician declared: {conditionLabel(selectedRequest.condition)}</p>
                  <p className="mt-1 text-sm text-amber-900">{selectedRequest.notes}</p>
                  <div className="mt-3 space-y-1 text-sm text-amber-950">
                    {selectedRequest.items.map((item) => <p key={item.item_id}>{item.item_name} · {item.quantity}</p>)}
                  </div>
                </div>
                <label className="block text-sm font-semibold text-slate-700">
                  Condition observed by receiver
                  <select value={reviewedCondition} onChange={(event) => setReviewedCondition(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                    <option value="">Select observed condition</option>
                    {CONDITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Receiving note
                  <textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows="3" placeholder="Record the physical count, condition, and any discrepancy." className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal" />
                </label>
                {['damaged', 'incomplete'].includes(reviewedCondition) && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Damaged or incomplete equipment cannot be restored to available stock. Reject it and record the discrepancy.</p>}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                <FiCheckCircle className="mx-auto h-7 w-7 text-emerald-500" />
                <p className="mt-3 text-sm font-semibold text-slate-800">No returns await verification</p>
                <p className="mt-1 text-xs text-slate-500">Technician submissions will appear here before stock changes.</p>
              </div>
            )
          ) : (
            <form id="equipment-return-form" onSubmit={submitReturn} className="space-y-4">
              {returnableItems.length ? (
                <>
                  {(reconciliation.return_requests || []).some((item) => item.status === 'pending') && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">A previous return is pending warehouse verification. Its quantity is already excluded below.</p>}
                  {returnableItems.map((item) => {
                    const quantity = quantities[item.item_id] ?? '';
                    const invalid = Number(quantity || 0) > item.returnable_quantity;
                    return (
                      <div key={item.item_id} className={`rounded-xl border p-4 ${invalid ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="font-semibold text-slate-950">{item.item_name}</p>
                            <p className="mt-1 text-xs text-slate-500">{item.item_sku || 'No SKU'} · Issued {item.issued_quantity} · Verified returned {item.returned_quantity} · Pending {item.pending_quantity}</p>
                            <p className="mt-1 text-xs font-semibold text-emerald-700">Up to {item.returnable_quantity} available to submit</p>
                          </div>
                          <label className="w-full text-xs font-semibold text-slate-600 sm:w-36">
                            Quantity returned
                            <input type="number" min="0" max={item.returnable_quantity} step="1" value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [item.item_id]: event.target.value.replace(/[^\d]/g, '') }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                  <label className="block text-sm font-semibold text-slate-700">
                    Condition you observed
                    <select value={condition} onChange={(event) => setCondition(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                      <option value="">Select condition</option>
                      {CONDITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Technician return note
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="3" placeholder="State what you are returning and what happened to it." className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal" />
                  </label>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"><p className="text-sm font-semibold text-slate-800">No equipment is available to submit</p><p className="mt-1 text-xs text-slate-500">Nothing was issued, everything was already verified, or the remaining quantity is pending review.</p></div>
              )}
            </form>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Close</button>
          {mode === 'review' && pendingRequests.length > 0 ? (
            <>
              <button type="button" disabled={!canReview} onClick={() => reviewReturn('reject')} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50">Reject return</button>
              <button type="button" disabled={!canReview || ['damaged', 'incomplete'].includes(reviewedCondition)} onClick={() => reviewReturn('verify')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">Verify and add to stock</button>
            </>
          ) : mode === 'submit' && returnableItems.length > 0 ? (
            <button form="equipment-return-form" type="submit" disabled={!canSubmit} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">{submitting ? 'Submitting…' : 'Submit for verification'}</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
