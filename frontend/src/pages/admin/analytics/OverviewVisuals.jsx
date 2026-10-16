import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { placeLabel, plural } from './analyticsFormat';

const tooltipStyle = { border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)', fontSize: 12 };

const STATUS_COLORS = {
  'not started': '#64748b',
  pending: '#64748b',
  'for inspection': '#8b5cf6',
  inspection: '#8b5cf6',
  'ready for service': '#0ea5e9',
  scheduled: '#6366f1',
  assigned: '#6366f1',
  'in progress': '#2563eb',
  'on hold': '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
};
const FALLBACK_COLORS = ['#2563eb', '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#64748b'];
const LOCATION_COLORS = ['#4f46e5', '#2563eb', '#7c3aed', '#0891b2', '#0f766e', '#4338ca', '#0369a1', '#6d28d9'];

function statusColor(row, index) {
  const key = String(row.label || row.status || '').trim().toLowerCase();
  return STATUS_COLORS[key] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function EmptyState({ children }) {
  return <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">{children}</p>;
}

// Totals strip shown above the requests/completions trend.
export function TrendTotals({ rows = [] }) {
  const requests = rows.reduce((sum, row) => sum + Number(row.requests || 0), 0);
  const completions = rows.reduce((sum, row) => sum + Number(row.completions || 0), 0);
  const gap = requests - completions;
  const items = [
    { label: 'Requests', value: requests, color: 'bg-blue-600' },
    { label: 'Completions', value: completions, color: 'bg-emerald-500' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} aria-hidden="true" />
          {item.label}
          <strong className="text-sm font-bold tabular-nums text-slate-900">{item.value.toLocaleString('en-PH')}</strong>
        </span>
      ))}
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${gap > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
        {gap > 0 ? `${plural(gap, 'more request')} than completions` : 'Completions kept pace'}
      </span>
    </div>
  );
}

// Workflow pipeline: one segmented bar for the current share, then a ranked stage list.
export function StatusPipeline({ data = [] }) {
  if (!data.length) return <EmptyState>No tickets match these filters.</EmptyState>;
  const rows = data.map((row, index) => ({ ...row, color: statusColor(row, index), count: Number(row.count || 0) }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const hasPrevious = rows.some((row) => row.previous_count != null);
  const previousTotal = hasPrevious ? rows.reduce((sum, row) => sum + Number(row.previous_count || 0), 0) : null;
  const closed = rows.filter((row) => ['completed', 'cancelled'].includes(String(row.label || '').toLowerCase())).reduce((sum, row) => sum + row.count, 0);
  const summary = [
    { label: 'Still open', value: total - closed },
    { label: 'Closed', value: closed },
    { label: 'Last period', value: previousTotal },
  ];
  return (
    <div role="img" aria-label="Current ticket status proportions with previous-period counts" className="flex flex-1 flex-col">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{total.toLocaleString('en-PH')}</span>
        <span className="text-sm text-slate-500">current tickets</span>
      </div>
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100">
        {rows.filter((row) => row.count > 0).map((row) => (
          <div key={row.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(row.count / Math.max(total, 1)) * 100}%`, backgroundColor: row.color }} title={`${row.label}: ${row.count}`} />
        ))}
      </div>
      <ul className="mt-4 divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">{row.label || 'Unspecified'}</span>
            {hasPrevious ? <span className="text-xs tabular-nums text-slate-400">prev. {Number(row.previous_count || 0).toLocaleString('en-PH')}</span> : null}
            <span className="w-10 text-right text-xs tabular-nums text-slate-500">{total ? `${Math.round((row.count / total) * 100)}%` : '—'}</span>
            <strong className="w-8 text-right text-sm font-bold tabular-nums text-slate-900">{row.count.toLocaleString('en-PH')}</strong>
          </li>
        ))}
      </ul>
      <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
        {summary.map((item) => (
          <div key={item.label} className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className="text-lg font-bold tabular-nums text-slate-900">{item.value == null ? '—' : item.value.toLocaleString('en-PH')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?';
}

// One row per technician: completed share drawn inside the assigned bar, scheduled hours on the side.
export function WorkloadList({ rows = [] }) {
  if (!rows.length) return <EmptyState>No lead assignments in this period.</EmptyState>;
  const max = Math.max(1, ...rows.map((row) => Math.max(Number(row.assigned_jobs || 0), Number(row.previous_assigned_jobs || 0))));
  const hasPrevious = rows.some((row) => row.previous_assigned_jobs != null);
  return (
    <div className="flex flex-1 flex-col" aria-label="Technician workload comparison">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />Completed</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-200" aria-hidden="true" />Assigned</span>
        {hasPrevious ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" aria-hidden="true" />Previous assigned</span> : null}
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {rows.slice(0, 8).map((row) => {
          const assigned = Number(row.assigned_jobs || 0);
          const completed = Number(row.completed_jobs || 0);
          const previous = row.previous_assigned_jobs == null ? null : Number(row.previous_assigned_jobs);
          return (
            <li key={row.technician_id || row.technician} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700" aria-hidden="true">{initials(row.technician)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-semibold text-slate-900">{row.technician}</p>
                  <p className="text-xs tabular-nums text-slate-500"><strong className="text-sm text-slate-900">{completed}</strong> completed · {assigned} assigned</p>
                </div>
                <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-blue-200" style={{ width: `${(assigned / max) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${(Math.min(completed, assigned || completed) / max) * 100}%` }} />
                </div>
                {previous != null ? <div className="mt-1 h-1 overflow-hidden rounded-full"><div className="h-full rounded-full bg-slate-300" style={{ width: `${(previous / max) * 100}%` }} /></div> : null}
              </div>
              <span className="shrink-0 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold tabular-nums text-amber-700" title="Scheduled hours in the selected period">{row.scheduled_hours ?? 0}h</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-auto pt-2 text-xs text-slate-400">Amber chip = scheduled hours in the selected period.</p>
    </div>
  );
}

function shorten(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, Math.max(max - 1, 1))}…` : text;
}

function TreemapTile(props) {
  const { x, y, width, height, depth, name, value, color } = props;
  if (depth !== 1 || !(width > 4) || !(height > 4)) return <g />;
  const showName = width > 70 && height > 36;
  const showValue = width > 70 && height > 54;
  return (
    <g>
      <rect x={x + 2} y={y + 2} width={width - 4} height={height - 4} rx={10} fill={color || '#4f46e5'} />
      {showName ? <text x={x + 12} y={y + 24} fill="#fff" fontSize={13} fontWeight={600}>{shorten(name, Math.floor((width - 20) / 7.5))}</text> : null}
      {showValue ? <text x={x + 12} y={y + 42} fill="rgba(255,255,255,0.85)" fontSize={12}>{plural(value, 'request')}</text> : null}
    </g>
  );
}

// Treemap for share of demand, with a compact ranked list keeping exact and previous counts visible.
export function LocationTreemap({ rows = [] }) {
  const items = rows
    .map((row, index) => ({ name: placeLabel(row.city, row.province), size: Number(row.requests || 0), previous: row.previous_requests, color: LOCATION_COLORS[index % LOCATION_COLORS.length] }))
    .filter((row) => row.size > 0 || Number(row.previous || 0) > 0);
  const current = items.filter((row) => row.size > 0);
  if (!items.length) return <EmptyState>No saved city or province in this period.</EmptyState>;
  const total = current.reduce((sum, row) => sum + row.size, 0);
  return (
    <div className="flex flex-1 flex-col">
      {current.length ? (
        <div role="img" aria-label="Current and previous demand by location" className="h-48">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 192 }}>
            <Treemap data={current} dataKey="size" nameKey="name" isAnimationActive={false} content={<TreemapTile />}>
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [plural(value, 'request'), 'Demand']} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      ) : <EmptyState>No current requests; previous-period locations are listed below.</EmptyState>}
      <ul className="mt-3 divide-y divide-slate-100">
        {items.slice(0, 6).map((row) => (
          <li key={row.name} className="flex items-center gap-2 py-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-slate-700">{row.name}</span>
            <span className="text-xs tabular-nums text-slate-400">{total ? `${Math.round((row.size / total) * 100)}%` : ''}</span>
            <strong className="text-right font-semibold tabular-nums text-slate-900">{row.size}</strong>
            {row.previous != null ? <span className="w-12 text-right text-xs tabular-nums text-slate-400">prev. {row.previous}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProgressRing({ percent = 0, label, detail, color = '#2563eb' }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(Number(percent) || 0, 0), 100);
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90" aria-hidden="true">
          <circle cx="36" cy="36" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="7" />
          <circle cx="36" cy="36" r={radius} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped / 100)} />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-sm font-bold tabular-nums text-slate-900">{Math.round(clamped)}%</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="text-base font-bold tabular-nums text-slate-900">{detail}</p>
      </div>
    </div>
  );
}
