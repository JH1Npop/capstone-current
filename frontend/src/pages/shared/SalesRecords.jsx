import { useEffect, useMemo, useState } from 'react';
import { FiCheckCircle, FiDownload, FiFileText, FiPackage, FiRefreshCw, FiSearch, FiSlash } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/ui/StatusBadge';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import { useAuth } from '../../context/AuthContext';
import { formatTicketId } from '../../utils/roleIds';
import SalesPaymentsPanel, { PaymentStatusBadge } from '../../components/sales/SalesPaymentsPanel';
import {
  confirmSalesRecord,
  fetchSalesRecord,
  fetchSalesRecords,
  fetchServiceTickets,
  prepareSalesRecord,
  updateSalesRecord,
  voidSalesRecord
} from '../../api/services';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatMoney = (value, currency = 'PHP') => {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

const activeRecordForTicket = (records, ticketId) => records.find((record) => (
  Number(record.ticket) === Number(ticketId) && ['draft', 'confirmed'].includes(record.status)
));

const valueSourceLabel = (source) => ({
  accepted_quotation: 'Accepted quotation',
  signed_contract: 'Signed installation contract',
  manual: 'Manual value',
  not_recorded: 'No connected value'
}[source] || 'No connected value');

// Quote every cell and neutralise spreadsheet formulas (client names and notes are typed by people).
const csvCell = (value) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const draftFormFor = (record) => ({
  agreed_total: record?.agreed_total ?? '',
  currency_code: record?.currency_code || 'PHP',
  notes: record?.notes || ''
});

export default function SalesRecords() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);
  const [records, setRecords] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(isAdmin ? 'all' : 'confirmed');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [draftForm, setDraftForm] = useState({ agreed_total: '', currency_code: 'PHP', notes: '' });
  const [voidReason, setVoidReason] = useState('');
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [confirmingRecord, setConfirmingRecord] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const eligibleTickets = tickets.filter((ticket) => ['completed', 'turned_over_/_accepted'].includes(ticket.status));
  const filteredRecords = useMemo(() => records.filter((record) => {
    if (statusFilter !== 'all' && record.status !== statusFilter) return false;
    if (paymentFilter === 'unpaid_or_partial') {
      if (!['unpaid', 'partial'].includes(record.payment_status)) return false;
    } else if (paymentFilter !== 'all' && record.payment_status !== paymentFilter) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [record.record_number, record.ticket_code, record.client_name, record.service_summary]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  }), [records, search, statusFilter, paymentFilter]);
  // The details panel always shows a record from the list on screen.
  const selected = filteredRecords.find((record) => record.id === selectedId) || filteredRecords[0] || null;
  const allowsManualValue = selected && ['manual', 'not_recorded'].includes(selected.agreed_total_source);
  const manualValueIncomplete = allowsManualValue && (
    draftForm.agreed_total === '' || !draftForm.notes.trim()
  );
  const draftHasChanges = Boolean(
    isAdmin && selected?.status === 'draft'
    && JSON.stringify(draftForm) !== JSON.stringify(draftFormFor(selected))
  );

  // Totals for the office: what was sold (confirmed), collected, and still owed.
  const summary = useMemo(() => {
    const confirmed = records.filter((record) => record.status === 'confirmed');
    const sum = (rows, key) => rows.reduce((total, record) => total + (Number(record[key]) || 0), 0);
    return {
      confirmedValue: sum(confirmed, 'agreed_total'),
      collected: sum(confirmed, 'amount_paid'),
      outstanding: sum(confirmed.filter((record) => Number(record.balance_due) > 0), 'balance_due'),
      unpaidCount: confirmed.filter((record) => ['unpaid', 'partial'].includes(record.payment_status)).length,
      draftCount: records.filter((record) => record.status === 'draft').length,
      currency: confirmed[0]?.currency_code || 'PHP',
    };
  }, [records]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [recordRows, ticketRows] = await Promise.all([
        fetchSalesRecords(),
        isAdmin ? fetchServiceTickets({ workspace: 'after_sales' }) : Promise.resolve([])
      ]);
      setRecords(recordRows);
      setTickets(ticketRows);
      setSelectedId((current) => (
        recordRows.some((record) => record.id === current) ? current : (recordRows[0]?.id || null)
      ));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load sales records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDraftForm(draftFormFor(selected));
    setVoidReason('');
    setShowVoidForm(false);
  }, [selected?.id, selected?.updated_at]);

  const replaceRecord = (updated) => {
    setRecords((current) => {
      const exists = current.some((record) => record.id === updated.id);
      return exists
        ? current.map((record) => (record.id === updated.id ? updated : record))
        : [updated, ...current];
    });
    setSelectedId(updated.id);
  };

  const refreshSelected = async (message) => {
    if (selected) replaceRecord(await fetchSalesRecord(selected.id));
    if (message) {
      setError('');
      setNotice(message);
    }
  };

  // Switching record with unsaved draft edits asks first.
  const requestSelect = (recordId) => {
    if (recordId === selected?.id) return;
    if (draftHasChanges) {
      setPendingSelection(recordId);
      return;
    }
    setSelectedId(recordId);
  };

  const prepareFor = async (ticketId) => {
    if (!ticketId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const record = await prepareSalesRecord(ticketId);
      // A new draft must be visible even under a status filter.
      if (statusFilter !== 'all' && record.status !== statusFilter) setStatusFilter('all');
      if (paymentFilter !== 'all') setPaymentFilter('all');
      replaceRecord(record);
      setNotice(record.status === 'draft' ? `${record.record_number} draft prepared from connected data.` : `${record.record_number} is already confirmed for this ticket.`);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  const saveDraftChanges = async () => {
    const updates = allowsManualValue
      ? {
          agreed_total: draftForm.agreed_total === '' ? null : draftForm.agreed_total,
          currency_code: draftForm.currency_code,
          notes: draftForm.notes
        }
      : { notes: draftForm.notes };
    const updated = await updateSalesRecord(selected.id, updates);
    replaceRecord(updated);
    return updated;
  };

  const handleSaveDraft = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await saveDraftChanges();
      setNotice('Draft saved. Connected source data will be refreshed at confirmation.');
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirmingRecord(false);
    setSaving(true);
    setError('');
    try {
      // Confirm what is on screen: save typed changes first, or the server confirms the older value.
      if (draftHasChanges) await saveDraftChanges();
      const confirmed = await confirmSalesRecord(selected.id);
      replaceRecord(confirmed);
      setNotice(`${confirmed.record_number} confirmed and made available to the client.`);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async () => {
    if (!selected || !voidReason.trim()) return;
    setSaving(true);
    setError('');
    try {
      const voided = await voidSalesRecord(selected.id, voidReason.trim());
      replaceRecord(voided);
      setNotice(`${voided.record_number} voided. Use Prepare replacement to start a new record for ${voided.ticket_code}.`);
      setShowVoidForm(false);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = ['Record', 'Status', 'Ticket', 'Client', 'Service', 'Record date', 'Currency', 'Contract value', 'Value source', 'Paid', 'Balance due', 'Payment status', 'Quotation'];
    const rows = filteredRecords.map((record) => [
      record.record_number,
      record.status,
      record.ticket_code,
      record.client_name,
      record.service_summary,
      record.sale_date || String(record.created_at || '').slice(0, 10),
      record.currency_code,
      record.agreed_total ?? '',
      valueSourceLabel(record.agreed_total_source),
      record.amount_paid ?? '',
      record.balance_due ?? '',
      record.payment_status || '',
      record.quotation_number || '',
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-records-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const canPrepareReplacement = Boolean(
    isAdmin && selected?.status === 'voided'
    && !activeRecordForTicket(records, selected.ticket)
    && eligibleTickets.some((ticket) => Number(ticket.id) === Number(selected.ticket))
  );

  const summaryCards = [
    { label: 'Confirmed sales value', value: formatMoney(summary.confirmedValue, summary.currency), onClick: () => { setStatusFilter('confirmed'); setPaymentFilter('all'); } },
    { label: 'Collected', value: formatMoney(summary.collected, summary.currency), onClick: () => { setStatusFilter('confirmed'); setPaymentFilter('paid'); } },
    { label: 'Outstanding balance', value: formatMoney(summary.outstanding, summary.currency), detail: `${summary.unpaidCount} record${summary.unpaidCount === 1 ? '' : 's'} not fully paid`, onClick: () => { setStatusFilter('confirmed'); setPaymentFilter('unpaid_or_partial'); } },
    { label: 'Drafts to confirm', value: String(summary.draftCount), onClick: () => { setStatusFilter('draft'); setPaymentFilter('all'); } },
  ];

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {!isAdmin ? (
              <p className="mt-1 text-sm text-slate-500">
                Products and services confirmed as delivered to your account. Payments are handled outside this portal.
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {isAdmin ? (
              <button type="button" onClick={exportCsv} disabled={!filteredRecords.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <FiDownload aria-hidden="true" /> Export CSV
              </button>
            ) : null}
            <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <FiRefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>

        {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
        {notice ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div> : null}

        {isAdmin ? (
          <section aria-label="Sales summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <button key={card.label} type="button" onClick={card.onClick} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-300 hover:bg-brand-50/40">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</span>
                <span className="mt-2 block text-xl font-bold tabular-nums text-slate-900">{card.value}</span>
                {card.detail ? <span className="mt-1 block text-xs text-slate-500">{card.detail}</span> : null}
              </button>
            ))}
          </section>
        ) : null}

        {isAdmin ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-900">Prepare from completed work</h2>
            <p className="mt-1 text-xs text-slate-500">The draft connects the ticket, client, accepted quotation, inventory issues, installed equipment, and warranty.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select aria-label="Completed ticket to prepare" value={selectedTicketId} onChange={(event) => setSelectedTicketId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Select a completed ticket</option>
                {eligibleTickets.map((ticket) => {
                  const active = activeRecordForTicket(records, ticket.id);
                  return <option key={ticket.id} value={ticket.id}>{formatTicketId(ticket.id)} - {ticket.clientFullname} - {ticket.service}{active ? ` (${active.status})` : ''}</option>;
                })}
              </select>
              <button type="button" onClick={() => prepareFor(selectedTicketId)} disabled={saving || !selectedTicketId} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                Prepare record
              </button>
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
          <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Sales record list">
            <div className="space-y-3 border-b border-slate-100 p-4">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search record, ticket, client or service" aria-label="Search sales records" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
              </div>
              {isAdmin ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <select aria-label="Record status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="all">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="voided">Voided</option>
                  </select>
                  <select aria-label="Payment status" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="all">Any payment status</option>
                    <option value="unpaid_or_partial">Not fully paid</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partly paid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              ) : null}
              <p className="text-xs text-slate-500">Showing {filteredRecords.length} of {records.length} record{records.length === 1 ? '' : 's'}</p>
            </div>
            <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">
              {loading ? <p className="p-6 text-center text-sm text-slate-500">Loading records...</p> : null}
              {!loading && filteredRecords.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No {isAdmin ? 'sales' : 'purchase'} records found.</p> : null}
              {filteredRecords.map((record) => (
                <button key={record.id} type="button" onClick={() => requestSelect(record.id)} aria-pressed={selected?.id === record.id} className={`w-full p-4 text-left transition ${selected?.id === record.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900">{record.record_number}</span>
                    <StatusBadge status={record.status} size="sm" />
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-600">{record.client_name} / {record.service_summary}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="flex flex-wrap items-center gap-2">{record.ticket_code} / {formatDate(record.sale_date || record.created_at)}{isAdmin ? <PaymentStatusBadge status={record.payment_status} /> : null}</span>
                    <span className="font-semibold tabular-nums text-slate-700">
                      {formatMoney(record.agreed_total, record.currency_code)}
                      {isAdmin && Number(record.balance_due) > 0 ? <span className="ml-1 font-medium text-red-700">· {formatMoney(record.balance_due, record.currency_code)} due</span> : null}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Sales record details">
            {!selected ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <div><FiFileText className="mx-auto mb-2" size={28} aria-hidden="true" /><p>Select a record to view its connected data.</p></div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{selected.ticket_code}</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">{selected.record_number}</h2>
                    <p className="mt-1 text-sm text-slate-500">{selected.client_name} / {selected.service_summary}</p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Record date</p><p className="mt-1 font-semibold text-slate-800">{formatDate(selected.sale_date || selected.created_at)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Recorded contract value</p><p className="mt-1 font-semibold text-slate-800">{formatMoney(selected.agreed_total, selected.currency_code)}</p><p className="mt-1 text-xs text-slate-500">Source: {valueSourceLabel(selected.agreed_total_source)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Quotation</p><p className="mt-1 font-semibold text-slate-800">{selected.quotation_number || 'Not connected'}</p></div>
                </div>

                {isAdmin && selected.status === 'draft' ? (
                  <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[1fr_110px]">
                    {allowsManualValue ? (
                      <>
                        <label className="text-sm font-medium text-slate-700">Recorded contract value (manual)<input type="number" min="0" step="0.01" value={draftForm.agreed_total} onChange={(event) => setDraftForm((current) => ({ ...current, agreed_total: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
                        <label className="text-sm font-medium text-slate-700">Currency<input maxLength={3} value={draftForm.currency_code} onChange={(event) => setDraftForm((current) => ({ ...current, currency_code: event.target.value.toUpperCase() }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
                        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Reason for manual value<textarea required rows={2} value={draftForm.notes} onChange={(event) => setDraftForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
                        <p className="text-xs text-slate-600 sm:col-span-2">No accepted quotation or signed-contract amount is connected. This reference value does not indicate payment received.</p>
                      </>
                    ) : (
                      <>
                        <div className="rounded-lg border border-amber-200 bg-white p-3 sm:col-span-2">
                          <p className="text-sm font-semibold text-slate-800">Value controlled by {valueSourceLabel(selected.agreed_total_source).toLowerCase()}</p>
                          <p className="mt-1 text-xs text-slate-600">The amount is read-only and will be refreshed from its connected source when confirmed. It does not indicate payment received.</p>
                        </div>
                        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Record notes (optional)<textarea rows={2} value={draftForm.notes} onChange={(event) => setDraftForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
                      </>
                    )}
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                      <button type="button" onClick={handleSaveDraft} disabled={saving || !draftHasChanges} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Save draft</button>
                      <button type="button" onClick={() => setConfirmingRecord(true)} disabled={saving || manualValueIncomplete} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FiCheckCircle aria-hidden="true" /> Confirm record</button>
                      {draftHasChanges ? <span className="text-xs font-medium text-amber-800">Unsaved changes</span> : null}
                    </div>
                  </div>
                ) : null}

                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-slate-900"><FiPackage aria-hidden="true" /> Delivered products and services</h3>
                  {selected.line_items?.length ? (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-[620px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Recorded value</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {selected.line_items.map((line) => <tr key={line.id}><td className="px-3 py-3 capitalize text-slate-500">{line.line_type}</td><td className="px-3 py-3 font-medium text-slate-800">{line.name}</td><td className="px-3 py-3 text-slate-500">{line.sku || '-'}</td><td className="px-3 py-3 text-right text-slate-700">{Number(line.quantity).toLocaleString()} {line.unit}</td><td className="px-3 py-3 text-right text-slate-700">{line.line_total == null ? '-' : formatMoney(line.line_total, selected.currency_code)}</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">No delivered products or services are connected to this record yet.</p>
                  )}
                </div>

                {isAdmin && selected.status === 'confirmed' ? (
                  <SalesPaymentsPanel record={selected} formatMoney={formatMoney} formatDate={formatDate} onChanged={refreshSelected} />
                ) : null}

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p><strong>Warranty:</strong> {selected.source_snapshot?.ticket?.warranty_status || 'not recorded'} {selected.source_snapshot?.ticket?.warranty_end_date ? `through ${formatDate(selected.source_snapshot.ticket.warranty_end_date)}` : ''}</p>
                  <p className="mt-1"><strong>Installed equipment:</strong> {selected.source_snapshot?.installed_equipment?.length || 0} registered item(s)</p>
                  <p className="mt-1"><strong>Inventory issues:</strong> {selected.source_snapshot?.inventory_issues?.length || 0} connected transaction(s)</p>
                  {selected.notes ? <p className="mt-2"><strong>Notes:</strong> {selected.notes}</p> : null}
                  <p className="mt-2 text-xs">This record documents what was sold or delivered. It is not a receipt, balance statement, or proof of payment.</p>
                </div>

                {isAdmin && selected.status === 'confirmed' ? (
                  <div className="border-t border-slate-100 pt-4">
                    {!showVoidForm ? <button type="button" onClick={() => setShowVoidForm(true)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><FiSlash aria-hidden="true" /> Void and replace</button> : (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <label className="text-sm font-medium text-red-800">Reason for voiding<textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-slate-800" /></label>
                        <div className="mt-2 flex gap-2"><button type="button" onClick={handleVoid} disabled={saving || !voidReason.trim()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm void</button><button type="button" onClick={() => setShowVoidForm(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Dismiss</button></div>
                      </div>
                    )}
                  </div>
                ) : null}

                {selected.status === 'voided' ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <span><strong>Void reason:</strong> {selected.void_reason}</span>
                    {canPrepareReplacement ? (
                      <button type="button" onClick={() => prepareFor(selected.ticket)} disabled={saving} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                        Prepare replacement
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      {confirmingRecord && selected ? (
        <ConfirmationDialog
          title={`Confirm ${selected.record_number}?`}
          message={`The client will be notified and can see this purchase record. The value (${formatMoney(allowsManualValue && draftForm.agreed_total !== '' ? draftForm.agreed_total : selected.agreed_total, allowsManualValue ? draftForm.currency_code : selected.currency_code)}) is locked; changing it later means voiding the record and preparing a replacement.${draftHasChanges ? ' Your unsaved changes will be saved first.' : ''}`}
          tone="success"
          icon="success"
          confirmLabel="Confirm record"
          cancelLabel="Keep as draft"
          onCancel={() => setConfirmingRecord(false)}
          onConfirm={handleConfirm}
        />
      ) : null}
      {pendingSelection ? (
        <ConfirmationDialog
          title="Discard unsaved draft changes?"
          message={`Your changes to ${selected?.record_number || 'this draft'} have not been saved.`}
          tone="warning"
          icon="warning"
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onCancel={() => setPendingSelection(null)}
          onConfirm={() => {
            setSelectedId(pendingSelection);
            setPendingSelection(null);
          }}
        />
      ) : null}
    </Layout>
  );
}
