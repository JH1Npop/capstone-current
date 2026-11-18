import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiMail, FiMapPin, FiPhone, FiSearch } from 'react-icons/fi';
import StatusBadge from '../../components/ui/StatusBadge';
import { fetchWarranties } from '../../api/services';
import { formatDate } from '../../utils/dashboardHelpers';

const WARRANTY_FILTERS = [
  ['active', 'Active'],
  ['ending_soon', 'Ending in 30 days'],
  ['expired', 'Expired'],
  ['void', 'Void'],
  ['all', 'All'],
];

const daysLeftLabel = (row) => {
  if (row.warranty_status === 'void') return 'Void';
  if (row.days_left < 0) return `Ended ${Math.abs(row.days_left)} day${Math.abs(row.days_left) === 1 ? '' : 's'} ago`;
  if (row.days_left === 0) return 'Ends today';
  return `${row.days_left} day${row.days_left === 1 ? '' : 's'} left`;
};

const daysLeftTone = (row) => {
  if (row.warranty_status !== 'active') return 'text-slate-500';
  if (row.days_left <= 30) return 'text-amber-700';
  return 'text-emerald-700';
};

// Every job with a warranty and when it ends. The daily automations remind the client and the office
// once when a warranty is 30 days or less from its end date.
export default function MaintenanceWarranties() {
  const [searchParams, setSearchParams] = useSearchParams();
  const warrantyStatus = searchParams.get('warranty_status') || 'active';
  const appliedSearch = searchParams.get('search') || '';
  const [search, setSearch] = useState(appliedSearch);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setSearch(appliedSearch); }, [appliedSearch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (search.trim() === appliedSearch) return;
      const next = new URLSearchParams(searchParams);
      if (search.trim()) next.set('search', search.trim());
      else next.delete('search');
      setSearchParams(next);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search, appliedSearch]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchWarranties({ warrantyStatus, search: appliedSearch })
      .then((results) => { if (active) setRows(results); })
      .catch((requestError) => { if (active) setError(requestError.message || 'Unable to load warranties.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [warrantyStatus, appliedSearch]);

  const changeFilter = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'active') next.delete('warranty_status');
    else next.set('warranty_status', value);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {WARRANTY_FILTERS.map(([value, label]) => (
              <button key={value} type="button" onClick={() => changeFilter(value)} aria-pressed={warrantyStatus === value} className={`rounded-lg px-3 py-2 text-sm font-semibold ${warrantyStatus === value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
            ))}
          </div>
          <label className="relative block w-full lg:max-w-sm">
            <FiSearch className="pointer-events-none absolute left-3 top-3 text-slate-400" />
            <span className="sr-only">Search warranties</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, service, address or TKT code" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">The client and the office are reminded once when a warranty has 30 days or less left.</p>
      </section>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">Warranties</h2></div>
        {loading ? <p className="p-10 text-center text-sm text-slate-500">Loading warranties...</p> : rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.ticket_id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.3fr_1fr_1.2fr_auto] md:items-center">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{row.client_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{row.ticket_code} · {row.service_type_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Ends {formatDate(row.warranty_end_date)}</p>
                  <p className={`mt-1 text-xs font-semibold ${daysLeftTone(row)}`}>{daysLeftLabel(row)}</p>
                </div>
                <div className="min-w-0 space-y-1 text-xs text-slate-500">
                  <p>{row.warranty_period_days}-day warranty{row.warranty_start_date ? ` from ${formatDate(row.warranty_start_date)}` : ''}</p>
                  {row.client_email ? <p className="flex items-center gap-1.5 break-all"><FiMail className="shrink-0" />{row.client_email}</p> : null}
                  {row.client_phone ? <p className="flex items-center gap-1.5"><FiPhone className="shrink-0" />{row.client_phone}</p> : null}
                  {row.service_address ? <p className="flex items-start gap-1.5"><FiMapPin className="mt-0.5 shrink-0" />{row.service_address}</p> : null}
                </div>
                <StatusBadge status={row.warranty_status} size="sm" />
              </li>
            ))}
          </ul>
        ) : <p className="p-10 text-center text-sm text-slate-500">No warranties match these filters.</p>}
      </section>
    </div>
  );
}
