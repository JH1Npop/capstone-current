import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiCalendar, FiCheckCircle, FiClock, FiMail, FiMapPin, FiPhone, FiSearch, FiTool, FiX } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/ui/StatusBadge';
import { fetchMaintenanceSchedules, fetchMaintenanceSummary } from '../../api/services';
import { formatDate, formatDateTime } from '../../utils/dashboardHelpers';

const FILTERS = [
  ['all', 'All'],
  ['upcoming', 'Upcoming'],
  ['due', 'Due'],
  ['overdue', 'Overdue'],
  ['completed', 'Completed'],
  ['dismissed', 'Dismissed'],
];

const timingLabel = (days) => {
  if (days === 0) return 'Due today';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
};

const ReminderStage = ({ label, sentAt }) => (
  <div className={`rounded-lg border p-3 ${sentAt ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
    <div className="flex items-center gap-2">
      {sentAt ? <FiCheckCircle className="text-emerald-600" /> : <FiClock className="text-slate-400" />}
      <span className="text-sm font-semibold text-slate-800">{label}</span>
    </div>
    <p className="mt-1 text-xs text-slate-500">{sentAt ? `Sent ${formatDateTime(sentAt)}` : 'Not sent yet'}</p>
  </div>
);

export default function AdminMaintenance() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') || 'all';
  const appliedSearch = searchParams.get('search') || '';
  const [search, setSearch] = useState(appliedSearch);
  const [schedules, setSchedules] = useState([]);
  const [summary, setSummary] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setSearch(appliedSearch);
  }, [appliedSearch]);

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
    Promise.all([
      fetchMaintenanceSchedules({ status, search: appliedSearch, ordering: 'next_due_date' }),
      fetchMaintenanceSummary(),
    ]).then(([page, counts]) => {
      if (!active) return;
      setSchedules(page.results);
      setSummary(counts);
    }).catch((requestError) => {
      if (active) setError(requestError.message || 'Unable to load maintenance schedules.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [status, appliedSearch]);

  const changeStatus = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setSearchParams(next);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <header className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700"><FiTool /></span>
            <div>
              <h1 className="text-xl font-bold text-slate-950">Maintenance Management</h1>
              <p className="mt-1 text-sm text-slate-600">Track reminders and clients who need recurring maintenance.</p>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Upcoming', summary.upcoming || 0, 'text-blue-700'],
            ['Due today', summary.due_today || 0, 'text-amber-700'],
            ['Overdue', summary.overdue || 0, 'text-rose-700'],
            ['Completed', summary.completed || 0, 'text-emerald-700'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => changeStatus(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${status === value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
              ))}
            </div>
            <label className="relative block w-full lg:max-w-sm">
              <FiSearch className="pointer-events-none absolute left-3 top-3 text-slate-400" />
              <span className="sr-only">Search maintenance</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, service, or address" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </label>
          </div>
        </section>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">Maintenance schedules</h2></div>
          {loading ? <p className="p-10 text-center text-sm text-slate-500">Loading maintenance schedules...</p> : schedules.length ? (
            <div className="divide-y divide-slate-100">
              {schedules.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelected(item)} className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-brand-50/60 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-center">
                  <div><p className="font-semibold text-slate-950">{item.client_name}</p><p className="mt-1 text-xs text-slate-500">{item.ticket_code} · {item.service_type_name}</p></div>
                  <div><p className="text-sm font-medium text-slate-800">{formatDate(item.next_due_date)}</p><p className={`mt-1 text-xs font-semibold ${item.days_until_due < 0 ? 'text-rose-600' : item.days_until_due === 0 ? 'text-amber-700' : 'text-slate-500'}`}>{timingLabel(item.days_until_due)}</p></div>
                  <div className="text-xs text-slate-500"><p>{item.maintenance_profile_label}</p><p className="mt-1">Reminder starts {formatDate(item.notify_on_date)}</p></div>
                  <StatusBadge status={item.status} size="sm" />
                </button>
              ))}
            </div>
          ) : <p className="p-10 text-center text-sm text-slate-500">No maintenance schedules match these filters.</p>}
        </section>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Maintenance details" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div><p className="text-xs font-bold uppercase tracking-wider text-brand-600">{selected.ticket_code}</p><h2 className="mt-1 text-xl font-bold text-slate-950">{selected.client_name}</h2><p className="mt-1 text-sm text-slate-500">{selected.service_type_name}</p></div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><FiX /></button>
            </div>
            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Maintenance date</p><p className="mt-2 font-semibold text-slate-900">{formatDate(selected.next_due_date)}</p><p className={`mt-1 text-sm ${selected.days_until_due < 0 ? 'text-rose-700' : selected.days_until_due === 0 ? 'text-amber-700' : 'text-slate-600'}`}>{timingLabel(selected.days_until_due)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Maintenance plan</p><p className="mt-2 font-semibold text-slate-900">{selected.maintenance_profile_label}</p><p className="mt-1 text-sm text-slate-500">Every {selected.interval_days} days</p></div>
              </div>
              <div className="space-y-2 text-sm text-slate-700">
                {selected.client_email ? <p className="flex items-center gap-2"><FiMail className="text-slate-400" />{selected.client_email}</p> : null}
                {selected.client_phone ? <p className="flex items-center gap-2"><FiPhone className="text-slate-400" />{selected.client_phone}</p> : null}
                {selected.service_address ? <p className="flex items-start gap-2"><FiMapPin className="mt-0.5 text-slate-400" />{selected.service_address}</p> : null}
              </div>
              <div><h3 className="mb-3 font-semibold text-slate-900">Client reminder history</h3><div className="grid gap-3 sm:grid-cols-3"><ReminderStage label="Early reminder" sentAt={selected.client_notified_at} /><ReminderStage label="3-day reminder" sentAt={selected.client_three_day_notified_at} /><ReminderStage label="Due-date reminder" sentAt={selected.client_due_notified_at} /></div></div>
              {selected.maintenance_notes ? <div><h3 className="font-semibold text-slate-900">Technician notes</h3><p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{selected.maintenance_notes}</p></div> : null}
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                <button type="button" onClick={() => navigate(`/admin/after-sales-cases?case_type=maintenance`)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Open after-sales</button>
                <button type="button" onClick={() => navigate('/admin/job-history')} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><FiCalendar />Open job history</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
