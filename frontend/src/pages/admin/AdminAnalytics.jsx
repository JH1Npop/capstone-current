import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertCircle,
  FiArrowDownRight,
  FiArrowUpRight,
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiFilter,
  FiMapPin,
  FiMinus,
  FiRefreshCw,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Layout from '../../components/layout/Layout';
import { fetchAdminAnalytics } from '../../api/api';
import {
  AfterSalesWorkspace,
  ForecastingWorkspace,
  InventoryWorkspace,
  SalesWorkspace,
  TechnicianWorkspace,
  WorkspaceLoading,
} from './analytics/AnalyticsWorkspacePanels';

const WORKSPACES = [
  { id: 'overview', label: 'Overview' },
  { id: 'technicians', label: 'Technicians' },
  { id: 'sales', label: 'Sales' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'after_sales', label: 'After-Sales & Maintenance' },
  { id: 'forecasting', label: 'Forecasting' },
];

const EMPTY_FILTERS = {
  serviceTypeId: '',
  technicianId: '',
  status: '',
  priority: '',
  city: '',
  province: '',
  assignmentState: '',
  salesStatus: '',
  clientType: '',
  currency: '',
  categoryId: '',
  transactionType: '',
  itemId: '',
  stockStatus: '',
  caseType: '',
  caseStatus: '',
  casePriority: '',
  creationSource: '',
  requiresRevisit: '',
  maintenanceStatus: '',
  riskLevel: '',
  maintenanceServiceTypeId: '',
  customComparisonStart: '',
  customComparisonEnd: '',
};

const tooltipStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
  fontSize: 12,
};

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function presetRange(days) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  return { startDate: localDate(start), endDate: localDate(end) };
}

function inclusiveDays(start, end) {
  if (!start || !end) return null;
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1;
}

function formatUpdated(value) {
  if (!value) return 'Not loaded';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

function compactDate(value) {
  if (!value) return 'All time';
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}

function topItem(items, valueKey) {
  return (items || []).reduce((best, item) => (!best || Number(item[valueKey]) > Number(best[valueKey]) ? item : best), null);
}

function ChartEmpty({ children = 'No records match these filters.' }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function ComparisonRows({ data, labelKey, series, ariaLabel }) {
  if (!data?.length) return <ChartEmpty />;
  const maximum = Math.max(1, ...data.flatMap((row) => series.map((item) => Number(row[item.key]) || 0)));
  return (
    <div role="img" aria-label={ariaLabel} className="space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-600">
        {series.map((item) => <span key={item.key} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>)}
      </div>
      <div className="space-y-4">
        {data.map((row, index) => (
          <div key={`${String(row[labelKey])}-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
            <p className="break-words text-sm font-bold leading-5 text-slate-800">{row[labelKey] || 'Unspecified'}</p>
            <div className="mt-2 space-y-2">
              {series.map((item) => {
                const value = Number(row[item.key]) || 0;
                return <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div className="h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full" style={{ width: `${(value / maximum) * 100}%`, minWidth: value ? 4 : 0, backgroundColor: item.color }} /></div><span className="min-w-8 text-right text-xs font-black tabular-nums text-slate-700">{value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span></div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, note, eyebrow, action, children, className = '' }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.45)] sm:p-6 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p> : null}
          <h2 className="text-base font-bold text-slate-950 sm:text-lg">{title}</h2>
          {note ? <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{note}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SelectFilter({ label, value, onChange, children }) {
  return (
    <label className="min-w-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">
      <span className="mb-1.5 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      >
        {children}
      </select>
    </label>
  );
}

function CompactSelect({ label, value, onChange, children }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
      {children}
    </select>
  );
}

function KpiCard({ label, value, helper, icon: Icon, tone = 'blue', meter, comparison }) {
  const tones = {
    blue: { icon: 'bg-blue-50 text-blue-700', line: 'bg-blue-500' },
    green: { icon: 'bg-emerald-50 text-emerald-700', line: 'bg-emerald-500' },
    amber: { icon: 'bg-amber-50 text-amber-700', line: 'bg-amber-500' },
    red: { icon: 'bg-rose-50 text-rose-700', line: 'bg-rose-500' },
  };
  const palette = tones[tone];

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.55)]">
      <span className={`absolute inset-x-0 top-0 h-1 ${palette.line}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
        </div>
        <span className={`rounded-xl p-2.5 ${palette.icon}`}><Icon className="h-5 w-5" /></span>
      </div>
      {meter != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${palette.line}`} style={{ width: `${Math.min(Math.max(Number(meter) || 0, 0), 100)}%` }} />
        </div>
      ) : null}
      {comparison ? <ComparisonBadge {...comparison} /> : null}
      <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
    </article>
  );
}

function ComparisonBadge({ delta, unit = '%', unavailable = false, favorable = 'neutral' }) {
  if (unavailable || delta == null) {
    return <p className="mt-3 text-[11px] font-semibold text-slate-400">No prior baseline</p>;
  }
  const number = Number(delta);
  const Icon = number > 0 ? FiArrowUpRight : number < 0 ? FiArrowDownRight : FiMinus;
  const isGood = favorable === 'up' ? number > 0 : favorable === 'down' ? number < 0 : false;
  const isBad = favorable === 'up' ? number < 0 : favorable === 'down' ? number > 0 : false;
  const color = isGood ? 'text-emerald-700' : isBad ? 'text-rose-700' : 'text-blue-700';
  const prefix = number > 0 ? '+' : '';
  return (
    <p className={`mt-3 flex items-center gap-1 text-[11px] font-bold ${color}`}>
      <Icon className="h-3.5 w-3.5" /> {prefix}{number}{unit} vs comparison period
    </p>
  );
}

function Insight({ icon: Icon, label, value, detail, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_10px_25px_-22px_rgba(15,23,42,0.65)]">
      <span className={`shrink-0 rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
        <p className="break-words text-sm font-bold leading-5 text-slate-900">{value}</p>
        <p className="break-words text-[11px] leading-4 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function AttentionItem({ label, value, tone }) {
  const styles = {
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl border px-3 py-3 ${styles[tone]}`}>
      <span className="text-sm font-semibold">{label}</span>
      <span className="min-w-8 rounded-lg bg-white/80 px-2 py-1 text-center text-sm font-black shadow-sm">{value ?? 0}</span>
    </div>
  );
}

export default function AdminAnalytics() {
  const initialRange = useMemo(() => presetRange(30), []);
  const [filters, setFilters] = useState({
    ...EMPTY_FILTERS,
    ...initialRange,
    groupBy: 'day',
    comparison: 'previous_period',
    workspace: 'overview',
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const requestId = useRef(0);
  const invalidRange = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);
  const customComparisonSelected = filters.comparison === 'custom';
  const invalidCustomComparison = customComparisonSelected && (
    !filters.customComparisonStart
    || !filters.customComparisonEnd
    || filters.customComparisonStart > filters.customComparisonEnd
    || filters.customComparisonEnd >= filters.startDate
    || inclusiveDays(filters.customComparisonStart, filters.customComparisonEnd) !== inclusiveDays(filters.startDate, filters.endDate)
  );
  const invalidSelection = invalidRange || invalidCustomComparison;
  const updateFilter = useCallback((key, value) => setFilters((current) => ({ ...current, [key]: value })), []);

  useEffect(() => {
    if (invalidSelection) return undefined;
    const controller = new AbortController();
    const id = ++requestId.current;
    setError('');
    if (data) setRefreshing(true); else setLoading(true);

    fetchAdminAnalytics(filters, { signal: controller.signal })
      .then((response) => { if (id === requestId.current) setData(response); })
      .catch((requestError) => {
        const cancelled = requestError?.name === 'CanceledError' || requestError?.name === 'AbortError';
        if (!cancelled && id === requestId.current) setError(requestError.message || 'Unable to load analytics.');
      })
      .finally(() => {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => controller.abort();
  }, [filters, invalidSelection, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = (days) => setFilters((current) => ({
    ...current,
    ...presetRange(days),
    groupBy: days <= 31 ? 'day' : days <= 120 ? 'week' : 'month',
  }));

  const charts = data?.charts || {};
  const kpis = data?.kpis || {};
  const options = data?.workspace === filters.workspace ? (data?.filter_options || {}) : {};
  const attention = data?.attention || {};
  const forecast = data?.forecast || {};
  const comparison = data?.comparison || {};
  const comparisonKpis = comparison.kpis || {};
  const nonZeroStatuses = (charts.ticket_statuses || []).filter((item) => item.count > 0 || item.previous_count > 0);
  const topService = topItem(charts.service_demand, 'requests');
  const busiestPeriod = topItem(charts.requests_vs_completions, 'requests');
  const leadTechnician = topItem(charts.technician_workload, 'assigned_jobs');
  const topLocation = topItem(charts.locations, 'requests');
  const completionRate = Number(kpis.completion_rate || 0);
  const forecastRequestProgress = forecast.required_request_count
    ? Math.min((Number(forecast.request_count || 0) / Number(forecast.required_request_count)) * 100, 100)
    : 0;
  const forecastHistoryProgress = forecast.required_history_months
    ? Math.min((Number(forecast.history_months || 0) / Number(forecast.required_history_months)) * 100, 100)
    : 0;
  const secondaryFilterCount = [
    filters.technicianId,
    filters.priority,
    filters.city,
    filters.province,
    filters.assignmentState,
  ].filter(Boolean).length;
  const thirtyDayRange = presetRange(30);
  const ninetyDayRange = presetRange(90);
  const activePreset = filters.startDate === thirtyDayRange.startDate && filters.endDate === thirtyDayRange.endDate
    ? 30
    : filters.startDate === ninetyDayRange.startDate && filters.endDate === ninetyDayRange.endDate ? 90 : null;
  const comparisonPeriod = comparison.enabled && comparison.period?.start_date && comparison.period?.end_date
    ? `${compactDate(comparison.period.start_date)} — ${compactDate(comparison.period.end_date)}`
    : 'no comparison period';
  const changeWorkspace = (workspace) => {
    setShowMoreFilters(false);
    setFilters((current) => ({ ...current, ...EMPTY_FILTERS, workspace }));
  };

  return (
    <Layout>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">Operations intelligence</p>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Analytics &amp; Forecasting</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Demand, delivery, workload, and risks from live system records.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-left sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last updated</p>
              <p className="text-xs font-semibold text-slate-600">{formatUpdated(data?.generated_at)}</p>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
            >
              <FiRefreshCw className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </header>

        <nav aria-label="Analytics workspaces" className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <div role="tablist" aria-label="Analytics workspaces" className="flex flex-wrap gap-1">
            {WORKSPACES.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                role="tab"
                aria-selected={filters.workspace === workspace.id}
                onClick={() => changeWorkspace(workspace.id)}
                className={`min-w-0 flex-auto rounded-xl px-3 py-2.5 text-sm font-bold leading-5 outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:flex-none sm:px-4 ${filters.workspace === workspace.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}
              >
                {workspace.label}
              </button>
            ))}
          </div>
        </nav>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.45)] sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="mr-1 inline-flex h-9 items-center gap-2 text-sm font-bold text-slate-800"><FiFilter className="text-blue-600" /> View</span>
              {filters.workspace === 'forecasting' ? <span className="inline-flex h-9 items-center rounded-lg bg-slate-50 px-3 text-xs font-medium text-slate-600">All genuine historical requests</span> : <>
                <button type="button" onClick={() => applyPreset(30)} className={`h-9 rounded-lg px-3 text-xs font-bold ${activePreset === 30 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>30 days</button>
                <button type="button" onClick={() => applyPreset(90)} className={`h-9 rounded-lg px-3 text-xs font-bold ${activePreset === 90 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>90 days</button>
                <span className="inline-flex h-9 items-center rounded-lg bg-slate-50 px-3 text-xs font-medium text-slate-600"><FiCalendar className="mr-2 text-blue-600" /> {compactDate(filters.startDate)} — {compactDate(filters.endDate)}</span>
              </>}
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto] xl:w-[560px]">
              {filters.workspace === 'overview' ? <>
                <CompactSelect label="Service" value={filters.serviceTypeId} onChange={(value) => updateFilter('serviceTypeId', value)}><option value="">All services</option>{(options.service_types || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</CompactSelect>
                <CompactSelect label="Status" value={filters.status} onChange={(value) => updateFilter('status', value)}><option value="">All statuses</option>{(options.statuses || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</CompactSelect>
              </> : null}
              {filters.workspace === 'technicians' ? <>
                <CompactSelect label="Service" value={filters.serviceTypeId} onChange={(value) => updateFilter('serviceTypeId', value)}><option value="">All services</option>{(options.service_types || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</CompactSelect>
                <CompactSelect label="Technician" value={filters.technicianId} onChange={(value) => updateFilter('technicianId', value)}><option value="">All technicians</option>{(options.technicians || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</CompactSelect>
              </> : null}
              {filters.workspace === 'sales' ? <>
                <CompactSelect label="Currency" value={filters.currency} onChange={(value) => updateFilter('currency', value)}><option value="">All currencies</option>{(options.currencies || []).map((item) => <option key={item} value={item}>{item}</option>)}</CompactSelect>
                <CompactSelect label="Sales status" value={filters.salesStatus} onChange={(value) => updateFilter('salesStatus', value)}><option value="">All sales statuses</option>{(options.sales_statuses || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</CompactSelect>
              </> : null}
              {filters.workspace === 'inventory' ? <>
                <CompactSelect label="Inventory category" value={filters.categoryId} onChange={(value) => updateFilter('categoryId', value)}><option value="">All categories</option>{(options.categories || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</CompactSelect>
                <CompactSelect label="Stock status" value={filters.stockStatus} onChange={(value) => updateFilter('stockStatus', value)}><option value="">All stock states</option>{(options.stock_statuses || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</CompactSelect>
              </> : null}
              {filters.workspace === 'after_sales' ? <>
                <CompactSelect label="Case status" value={filters.caseStatus} onChange={(value) => updateFilter('caseStatus', value)}><option value="">All case statuses</option>{(options.case_statuses || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</CompactSelect>
                <CompactSelect label="Maintenance status" value={filters.maintenanceStatus} onChange={(value) => updateFilter('maintenanceStatus', value)}><option value="">All maintenance statuses</option>{(options.maintenance_statuses || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</CompactSelect>
              </> : null}
              {filters.workspace === 'forecasting' ? <>
                <CompactSelect label="Service" value={filters.serviceTypeId} onChange={(value) => updateFilter('serviceTypeId', value)}><option value="">All services</option>{(options.service_types || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</CompactSelect>
                <span className="hidden sm:block" />
              </> : null}
              {filters.workspace !== 'forecasting' ? <button type="button" aria-expanded={showMoreFilters} onClick={() => setShowMoreFilters((value) => !value)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                More filters{secondaryFilterCount ? ` (${secondaryFilterCount})` : ''}
                {showMoreFilters ? <FiChevronUp /> : <FiChevronDown />}
              </button> : null}
            </div>
          </div>

          {showMoreFilters ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <span className="mb-1.5 block">Start date</span>
                  <input type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <span className="mb-1.5 block">End date</span>
                  <input type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </label>
                <SelectFilter label="Group by" value={filters.groupBy} onChange={(value) => updateFilter('groupBy', value)}>
                  {['day', 'week', 'month', 'quarter', 'year'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
                </SelectFilter>
                <SelectFilter label="Compare with" value={filters.comparison} onChange={(value) => updateFilter('comparison', value)}>
                  <option value="previous_period">Previous equal period</option>
                  <option value="previous_month">Previous month</option>
                  <option value="previous_quarter">Previous quarter</option>
                  <option value="previous_year">Previous year</option>
                  <option value="custom">Custom date or range</option>
                  <option value="none">No comparison</option>
                </SelectFilter>
                {customComparisonSelected ? <>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <span className="mb-1.5 block">Comparison start</span>
                    <input type="date" value={filters.customComparisonStart} onChange={(event) => updateFilter('customComparisonStart', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <span className="mb-1.5 block">Comparison end</span>
                    <input type="date" value={filters.customComparisonEnd} onChange={(event) => updateFilter('customComparisonEnd', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                  </label>
                </> : null}
                {filters.workspace === 'overview' || filters.workspace === 'technicians' ? <>
                  <SelectFilter label="Technician" value={filters.technicianId} onChange={(value) => updateFilter('technicianId', value)}><option value="">All technicians</option>{(options.technicians || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectFilter>
                  <SelectFilter label="Priority" value={filters.priority} onChange={(value) => updateFilter('priority', value)}><option value="">All priorities</option>{(options.priorities || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectFilter>
                  <SelectFilter label="City" value={filters.city} onChange={(value) => updateFilter('city', value)}><option value="">All cities</option>{(options.cities || []).map((item) => <option key={item} value={item}>{item}</option>)}</SelectFilter>
                  <SelectFilter label="Province" value={filters.province} onChange={(value) => updateFilter('province', value)}><option value="">All provinces</option>{(options.provinces || []).map((item) => <option key={item} value={item}>{item}</option>)}</SelectFilter>
                  <SelectFilter label="Assignment" value={filters.assignmentState} onChange={(value) => updateFilter('assignmentState', value)}><option value="">Assigned + unassigned</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></SelectFilter>
                </> : null}
                {filters.workspace === 'sales' ? <SelectFilter label="Client type" value={filters.clientType} onChange={(value) => updateFilter('clientType', value)}><option value="">All client types</option>{(options.client_types || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectFilter> : null}
                {filters.workspace === 'inventory' ? <>
                  <SelectFilter label="Transaction type" value={filters.transactionType} onChange={(value) => updateFilter('transactionType', value)}><option value="">All movements</option>{(options.transaction_types || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectFilter>
                  <SelectFilter label="Item" value={filters.itemId} onChange={(value) => updateFilter('itemId', value)}><option value="">All items</option>{(options.items || []).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}</SelectFilter>
                </> : null}
                {filters.workspace === 'after_sales' ? <>
                  <SelectFilter label="Case type" value={filters.caseType} onChange={(value) => updateFilter('caseType', value)}><option value="">All case types</option>{(options.case_types || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectFilter>
                  <SelectFilter label="Case priority" value={filters.casePriority} onChange={(value) => updateFilter('casePriority', value)}><option value="">All priorities</option>{(options.case_priorities || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectFilter>
                  <SelectFilter label="Creation source" value={filters.creationSource} onChange={(value) => updateFilter('creationSource', value)}><option value="">All sources</option>{(options.creation_sources || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectFilter>
                  <SelectFilter label="Requires revisit" value={filters.requiresRevisit} onChange={(value) => updateFilter('requiresRevisit', value)}><option value="">All cases</option><option value="true">Requires revisit</option><option value="false">No revisit</option></SelectFilter>
                  <SelectFilter label="Risk level" value={filters.riskLevel} onChange={(value) => updateFilter('riskLevel', value)}><option value="">All risk levels</option>{(options.risk_levels || []).map((item) => <option key={item} value={item}>{item}</option>)}</SelectFilter>
                  <SelectFilter label="Maintenance service" value={filters.maintenanceServiceTypeId} onChange={(value) => updateFilter('maintenanceServiceTypeId', value)}><option value="">All services</option>{(options.service_types || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectFilter>
                </> : null}
                <div className="flex items-end sm:col-span-2">
                  <button type="button" onClick={() => setFilters((current) => ({ ...current, ...EMPTY_FILTERS, groupBy: 'day', comparison: 'previous_period' }))} className="h-10 rounded-xl px-3 text-xs font-bold text-blue-700 hover:bg-blue-50">Reset filters</button>
                </div>
              </div>
            </div>
          ) : null}
          {invalidRange ? <p className="mt-3 text-sm font-semibold text-rose-600">Start date must be on or before end date.</p> : null}
          {!invalidRange && invalidCustomComparison ? <p className="mt-3 text-sm font-semibold text-rose-600">Choose an earlier comparison date or range with the same number of days.</p> : null}
        </section>

        {error ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="font-bold underline">Retry</button>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-200" />)}
          </div>
        ) : null}

        {data?.workspace === 'overview' && filters.workspace === 'overview' ? (
          <>
            <section>
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">Performance pulse</p>
                  <h2 className="text-lg font-black text-slate-950">The numbers that matter now</h2>
                  <p className="mt-1 text-xs text-slate-500">Compared with {comparisonPeriod}</p>
                </div>
                {refreshing ? <span className="text-xs font-semibold text-blue-600">Updating…</span> : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <KpiCard label="Total tickets" value={kpis.total_tickets ?? 0} helper="Created in selected range" icon={FiBriefcase} comparison={{ delta: comparisonKpis.total_tickets?.delta_percent }} />
                <KpiCard label="Completed" value={kpis.completed_tickets ?? 0} helper="Finished cohort tickets" icon={FiCheckCircle} tone="green" comparison={{ delta: comparisonKpis.completed_tickets?.delta_percent, favorable: 'up' }} />
                <KpiCard label="Completion rate" value={`${completionRate.toFixed(1)}%`} helper="Completed ÷ all cohort tickets" icon={FiTrendingUp} tone="green" meter={completionRate} comparison={{ delta: comparisonKpis.completion_rate?.delta_points, unit: ' pts', favorable: 'up' }} />
                <KpiCard label="Avg. completion" value={kpis.average_completion_hours == null ? '—' : `${kpis.average_completion_hours}h`} helper={`${kpis.average_completion_observations || 0} valid observations`} icon={FiClock} tone="amber" comparison={{ delta: comparisonKpis.average_completion_hours?.delta_hours, unit: 'h', favorable: 'down' }} />
                <KpiCard label="Current overdue" value={kpis.current_overdue ?? 0} helper="Live SLA; not date-filtered" icon={FiAlertCircle} tone="red" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Insight icon={FiBriefcase} label="Top service" value={topService?.service_type || 'No demand yet'} detail={`${topService?.requests || 0} requests`} />
                <Insight icon={FiCalendar} label="Busiest period" value={busiestPeriod?.label || 'No activity yet'} detail={`${busiestPeriod?.requests || 0} requests`} tone="green" />
                <Insight icon={FiUsers} label="Highest workload" value={leadTechnician?.technician || 'No assignments yet'} detail={`${leadTechnician?.assigned_jobs || 0} assigned jobs`} tone="violet" />
                <Insight icon={FiMapPin} label="Top location" value={topLocation?.city || 'No location yet'} detail={`${topLocation?.requests || 0} requests`} tone="amber" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Cross-domain operational attention">
                <AttentionItem label="Confirmed sales" value={attention.confirmed_sales} tone="blue" />
                <AttentionItem label="Unassigned tickets" value={attention.unassigned_tickets} tone="amber" />
                <AttentionItem label="Open after-sales" value={attention.open_after_sales_cases} tone="slate" />
                <AttentionItem label="Low-stock items" value={attention.low_stock_items} tone="violet" />
                <AttentionItem label="Overdue maintenance" value={attention.overdue_maintenance} tone="red" />
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
              <ChartCard title="Requests vs completions" eyebrow="Demand & delivery" note="Request arrivals and finished work across the selected period.">
                {(charts.requests_vs_completions || []).some((row) => row.requests || row.completions) ? (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 900, height: 320 }}>
                      <LineChart data={charts.requests_vs_completions} margin={{ left: -18, right: 12, top: 8 }}>
                        <CartesianGrid strokeDasharray="3 5" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        <Line type="monotone" dataKey="requests" name="Requests" stroke="#2563eb" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                        <Line type="monotone" dataKey="completions" name="Completions" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <ChartEmpty />}
              </ChartCard>

              <ChartCard title="Current attention" eyebrow="Action needed" note="Live counts; intentionally independent of the date range.">
                <div className="space-y-2.5">
                  <AttentionItem label="Overdue tickets" value={attention.overdue_tickets} tone="red" />
                  <AttentionItem label="Unassigned tickets" value={attention.unassigned_tickets} tone="amber" />
                  <AttentionItem label="Low-stock items" value={attention.low_stock_items} tone="violet" />
                  <AttentionItem label="Jobs in next 7 days" value={attention.upcoming_scheduled_jobs} tone="blue" />
                  <AttentionItem label="Open after-sales" value={attention.open_after_sales_cases} tone="slate" />
                </div>
              </ChartCard>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <ChartCard title="Primary service demand" eyebrow="What clients need" note="Current requests compared with the preceding equal period.">
                <ComparisonRows data={charts.service_demand || []} labelKey="service_type" ariaLabel="Current and previous service demand" series={[{ key: 'requests', name: 'Current', color: '#2563eb' }, { key: 'previous_requests', name: 'Previous', color: '#cbd5e1' }]} />
              </ChartCard>

              <ChartCard title="Ticket statuses" eyebrow="Work distribution" note="Current ticket states versus the preceding equal period.">
                <ComparisonRows data={nonZeroStatuses} labelKey="label" ariaLabel="Current and previous ticket statuses" series={[{ key: 'count', name: 'Current', color: '#7c3aed' }, { key: 'previous_count', name: 'Previous', color: '#cbd5e1' }]} />
              </ChartCard>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <ChartCard title="Technician workload" eyebrow="Capacity" note="Lead assignments only. Job counts and scheduled hours use separate views.">
                {(charts.technician_workload || []).length ? (
                  <>
                    <ComparisonRows data={charts.technician_workload} labelKey="technician" ariaLabel="Technician workload comparison" series={[{ key: 'assigned_jobs', name: 'Assigned jobs', color: '#2563eb' }, { key: 'completed_jobs', name: 'Completed jobs', color: '#10b981' }, { key: 'previous_assigned_jobs', name: 'Previous assigned', color: '#cbd5e1' }]} />
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Scheduled capacity</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(charts.technician_workload || []).slice(0, 6).map((item) => (
                          <div key={item.technician} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                            <span className="min-w-0 break-words text-xs font-semibold leading-4 text-slate-600">{item.technician}</span>
                            <span className="ml-3 whitespace-nowrap text-sm font-black text-amber-600">{item.scheduled_hours}h</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : <ChartEmpty />}
              </ChartCard>

              <ChartCard title="Demand by location" eyebrow="Service coverage" note="Top cities compared with the preceding equal period.">
                <ComparisonRows data={charts.locations || []} labelKey="city" ariaLabel="Current and previous demand by location" series={[{ key: 'requests', name: 'Current', color: '#7c3aed' }, { key: 'previous_requests', name: 'Previous', color: '#cbd5e1' }]} />
              </ChartCard>
            </div>

            <ChartCard
              title="Forecast readiness"
              eyebrow="Data confidence"
              note="This card checks history only. Forecasting also requires a fresh model that passes holdout validation."
              className="border-slate-300 bg-gradient-to-br from-white to-slate-50"
              action={<span className={`rounded-full px-3 py-1 text-xs font-bold ${forecast.available ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{forecast.available ? 'History ready' : 'Collecting history'}</span>}
            >
              <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr] lg:items-center">
                <div className={`rounded-2xl p-4 ${forecast.available ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  <p className="font-bold text-slate-900">{forecast.available ? 'History threshold met' : 'History threshold not met'}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{forecast.reason}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-end justify-between gap-3">
                      <span className="text-xs font-bold text-slate-600">Request volume</span>
                      <span className="text-sm font-black text-slate-950">{forecast.request_count || 0} / {forecast.required_request_count || 0}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${forecastRequestProgress}%` }} /></div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-end justify-between gap-3">
                      <span className="text-xs font-bold text-slate-600">History span</span>
                      <span className="text-sm font-black text-slate-950">{forecast.history_months || 0} / {forecast.required_history_months || 0} months</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-violet-600" style={{ width: `${forecastHistoryProgress}%` }} /></div>
                  </div>
                </div>
              </div>
            </ChartCard>
          </>
        ) : null}

        {data?.workspace === filters.workspace && filters.workspace === 'technicians' ? <TechnicianWorkspace data={data} /> : null}
        {data?.workspace === filters.workspace && filters.workspace === 'sales' ? <SalesWorkspace data={data} /> : null}
        {data?.workspace === filters.workspace && filters.workspace === 'inventory' ? <InventoryWorkspace data={data} /> : null}
        {data?.workspace === filters.workspace && filters.workspace === 'after_sales' ? <AfterSalesWorkspace data={data} /> : null}
        {data?.workspace === filters.workspace && filters.workspace === 'forecasting' ? <ForecastingWorkspace data={data} /> : null}
        {refreshing && data?.workspace !== filters.workspace ? <WorkspaceLoading /> : null}
      </div>
    </Layout>
  );
}
