import { useEffect, useState } from 'react';
import { fetchTicketQuotation } from '../../api/services';
import QuotationDepositPanel from './QuotationDepositPanel';

// For a cancelled job: the deposit panel when money was received (to record Refunded or Kept) or
// when that decision is already recorded. Nothing otherwise.
export default function CancelledJobDeposit({ ticketId }) {
  const [quotation, setQuotation] = useState(null);

  useEffect(() => {
    if (!ticketId) return undefined;
    let active = true;
    fetchTicketQuotation(ticketId)
      .then((row) => { if (active) setQuotation(row || null); })
      .catch(() => { if (active) setQuotation(null); });
    return () => { active = false; };
  }, [ticketId]);

  if (!quotation || quotation.deposit_policy === 'none') return null;
  if (!quotation.deposit_outcome && !quotation.deposit_decision_needed) return null;
  return (
    <div className="mb-3">
      <QuotationDepositPanel quotation={quotation} onUpdated={setQuotation} />
    </div>
  );
}
