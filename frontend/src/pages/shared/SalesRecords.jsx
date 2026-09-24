import { useEffect, useMemo, useState } from 'react';
import { FiCheckCircle, FiFileText, FiPackage, FiRefreshCw, FiSearch, FiSlash } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { formatTicketId } from '../../utils/roleIds';
import {
  confirmSalesRecord,
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

export default function SalesRecords() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);
  const [records, setRecords] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(isAdmin ? 'all' : 'confirmed');
  const [draftForm, setDraftForm] = useState({ agreed_total: '', currency_code: 'PHP', notes: '' });
  const [voidReason, setVoidReason] = useState('');
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const selected = records.find((record) => record.id === selectedId) || records[0] || null;
  const allowsManualValue = selected && ['manual', 'not_recorded'].includes(selected.agreed_total_source);
  const manualValueIncomplete = allowsManualValue && (
    draftForm.agreed_total === '' || !draftForm.notes.trim()
  );
  const eligibleTickets = tickets.filter((ticket) => ['completed', 'turned_over_/_accepted'].includes(ticket.status));
  const filteredRecords = useMemo(() => records.filter((record) => {
    if (statusFilter !== 'all' && record.status !== statusFilter) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [record.record_number, record.ticket_code, record.client_name, record.service_summary]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  }), [records, search, statusFilter]);

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
    setDraftForm({
      agreed_total: selected.agreed_total ?? '',
      currency_code: selected.currency_code || 'PHP',
      notes: selected.notes || ''
    });
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

  const handlePrepare = async () => {
    if (!selectedTicketId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const record = await prepareSalesRecord(selectedTicketId);
      replaceRecord(record);
      setNotice(record.status === 'draft' ? 'Sales record draft prepared from connected data.' : 'The active sales record is already confirmed.');
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const updates = allowsManualValue
        ? {
            agreed_total: draftForm.agreed_total === '' ? null : draftForm.agreed_total,
            currency_code: draftForm.currency_code,
            notes: draftForm.notes
          }
        : { notes: draftForm.notes };
      const updated = await updateSalesRecord(selected.id, updates);
      replaceRecord(updated);
      setNotice('Draft saved. Connected source data will be refreshed at confirmation.');
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const confirmed = await confirmSalesRecord(selected.id);
      replaceRecord(confirmed);
      setNotice('Sales record confirmed and made available to the client.');
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
      setNotice('Sales record voided. Prepare a replacement from the same ticket when ready.');
      setShowVoidForm(false);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mt-1 text-sm text-slate-500">
              {isAdmin
                ? 'Connected records of delivered products and services. This is not billing or payment processing.'
                : 'Products and services confirmed as delivered to your account. Payments are handled outside this portal.'}
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
        {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div> : null}

        {isAdmin ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-900">Prepare from completed work</h2>
            <p className="mt-1 text-xs text-slate-500">The draft connects the ticket, client, accepted quotation, inventory issues, installed equipment, and warranty.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select value={selectedTicketId} onChange={(event) => setSelectedTicketId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Select a completed ticket</option>
                {eligibleTickets.map((ticket) => {
                  const active = activeRecordForTicket(records, ticket.id);
                  return <option key={ticket.id} value={ticket.id}>{formatTicketId(ticket.id)} - {ticket.clientFullname} - {ticket.service}{active ? ` (${active.status})` : ''}</option>;
                })}
              </select>
              <button type="button" onClick={handlePrepare} disabled={saving || !selectedTicketId} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                Prepare record
              </button>
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
          <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 border-b border-slate-100 p-4">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" aria-label="Search sales records" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
              </div>
              {isAdmin ? (
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="all">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="voided">Voided</option>
                </select>
              ) : null}
            </div>
            <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">
              {loading ? <p className="p-6 text-center text-sm text-slate-500">Loading records...</p> : null}
              {!loading && filteredRecords.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No {isAdmin ? 'sales' : 'purchase'} records found.</p> : null}
              {filteredRecords.map((record) => (
                <button key={record.id} type="button" onClick={() => setSelectedId(record.id)} className={`w-full p-4 text-left transition ${selected?.id === record.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900">{record.record_number}</span>
                    <StatusBadge status={record.status} size="sm" />
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-600">{record.service_summary}</p>
                  <p className="mt-1 text-xs text-slate-500">{record.ticket_code} / {formatDate(record.sale_date || record.created_at)}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            {!selected ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <div><FiFileText className="mx-auto mb-2" size={28} /><p>Select a record to view its connected data.</p></div>
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
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button type="button" onClick={handleSaveDraft} disabled={saving} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Save draft</button>
                      <button type="button" onClick={handleConfirm} disabled={saving || manualValueIncomplete} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FiCheckCircle /> Confirm record</button>
                    </div>
                  </div>
                ) : null}

                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-slate-900"><FiPackage /> Delivered products and services</h3>
                  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-[620px] w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Recorded value</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {selected.line_items.map((line) => <tr key={line.id}><td className="px-3 py-3 capitalize text-slate-500">{line.line_type}</td><td className="px-3 py-3 font-medium text-slate-800">{line.name}</td><td className="px-3 py-3 text-slate-500">{line.sku || '-'}</td><td className="px-3 py-3 text-right text-slate-700">{Number(line.quantity).toLocaleString()} {line.unit}</td><td className="px-3 py-3 text-right text-slate-700">{line.line_total == null ? '-' : formatMoney(line.line_total, selected.currency_code)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p><strong>Warranty:</strong> {selected.source_snapshot?.ticket?.warranty_status || 'not recorded'} {selected.source_snapshot?.ticket?.warranty_end_date ? `through ${formatDate(selected.source_snapshot.ticket.warranty_end_date)}` : ''}</p>
                  <p className="mt-1"><strong>Installed equipment:</strong> {selected.source_snapshot?.installed_equipment?.length || 0} registered item(s)</p>
                  <p className="mt-1"><strong>Inventory issues:</strong> {selected.source_snapshot?.inventory_issues?.length || 0} connected transaction(s)</p>
                  {selected.notes ? <p className="mt-2"><strong>Notes:</strong> {selected.notes}</p> : null}
                  <p className="mt-2 text-xs">This record documents what was sold or delivered. It is not a receipt, balance statement, or proof of payment.</p>
                </div>

                {isAdmin && selected.status === 'confirmed' ? (
                  <div className="border-t border-slate-100 pt-4">
                    {!showVoidForm ? <button type="button" onClick={() => setShowVoidForm(true)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><FiSlash /> Void and replace</button> : (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <label className="text-sm font-medium text-red-800">Reason for voiding<textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-slate-800" /></label>
                        <div className="mt-2 flex gap-2"><button type="button" onClick={handleVoid} disabled={saving || !voidReason.trim()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm void</button><button type="button" onClick={() => setShowVoidForm(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button></div>
                      </div>
                    )}
                  </div>
                ) : null}

                {selected.status === 'voided' ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Void reason:</strong> {selected.void_reason}</div> : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
