import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiArrowRight, FiCheckCircle } from 'react-icons/fi';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { placeLabel } from './analyticsFormat';

const tooltipStyle = { border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 };

function asColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#2563eb';
}

function withAlpha(value, alpha) {
  const color = asColor(value);
  const integer = Number.parseInt(color.slice(1), 16);
  return `rgba(${integer >> 16}, ${(integer >> 8) & 255}, ${integer & 255}, ${alpha})`;
}

function VisualPanel({ title, note, children, className = '' }) {
  return <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{note}</p><div className="mt-4">{children}</div></section>;
}

function DemandFlowChart({ rows }) {
  if (!rows.length) return <p className="p-8 text-center text-sm text-slate-500">No demand flow exists for this period.</p>;
  return <div role="img" aria-label="Requests received and work completed over time" className="h-72"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 700, height: 288 }}><AreaChart data={rows} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}><defs><linearGradient id="request-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity="0.36" /><stop offset="100%" stopColor="#2563eb" stopOpacity="0.03" /></linearGradient><linearGradient id="completion-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.3" /><stop offset="100%" stopColor="#10b981" stopOpacity="0.02" /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={20} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} /><Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 12 }} /><Area type="monotone" dataKey="requests" name="Requests received" stroke="#2563eb" strokeWidth={3} fill="url(#request-fill)" isAnimationActive={false} /><Area type="monotone" dataKey="completions" name="Work completed" stroke="#10b981" strokeWidth={3} fill="url(#completion-fill)" isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>;
}

function ServiceDemandStack({ rows, services, periods }) {
  if (!rows.length) return <p className="p-8 text-center text-sm text-slate-500">No service demand exists for this period.</p>;
  const byPeriod = new Map((periods || []).map((row) => [row.period, { period: row.period, label: row.label }]));
  rows.forEach((row) => {
    const item = byPeriod.get(row.period) || { period: row.period, label: row.period };
    item[`service_${row.service_type_id}`] = Number(row.requests || 0);
    byPeriod.set(row.period, item);
  });
  services.forEach((service) => byPeriod.forEach((item) => { item[`service_${service.service_type_id}`] ??= 0; }));
  return <div role="img" aria-label="Stacked service demand by period" className="h-64 sm:h-72"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 700, height: 288 }}><BarChart data={[...byPeriod.values()]} margin={{ top: 8, right: 12, left: -18 }}><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} /><Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} />{services.map((service) => <Bar key={service.service_type_id} dataKey={`service_${service.service_type_id}`} name={service.service_type} stackId="demand" fill={asColor(service.color)} maxBarSize={42} isAnimationActive={false} />)}</BarChart></ResponsiveContainer></div>;
}

function ServiceOutcomeScatter({ rows }) {
  if (!rows.length) return <p className="p-8 text-center text-sm text-slate-500">No service outcomes exist for this period.</p>;
  const max = Math.max(1, ...rows.flatMap((row) => [Number(row.requests || 0), Number(row.completed || 0)]));
  return <><div role="img" aria-label="Service request and completion output scatter plot" className="h-72"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 700, height: 288 }}><ScatterChart margin={{ top: 10, right: 20, bottom: 28, left: 0 }}><CartesianGrid strokeDasharray="3 5" stroke="#e2e8f0" /><XAxis type="number" dataKey="requests" name="Requests" allowDecimals={false} domain={[0, max]} label={{ value: 'Requests received', position: 'bottom', offset: 8 }} /><YAxis type="number" dataKey="completed" name="Completed" allowDecimals={false} domain={[0, max]} /><ZAxis type="number" dataKey="requests" range={[80, 520]} /><ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="#94a3b8" strokeDasharray="5 5" /><Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.length ? <div className="rounded-xl border bg-white p-3 text-xs shadow-lg"><strong>{payload[0].payload.service_type}</strong><p>{payload[0].payload.requests} requests received</p><p>{payload[0].payload.completed} jobs completed</p></div> : null} /><Scatter data={rows} isAnimationActive={false}>{rows.map((row) => <Cell key={row.service_type_id} fill={asColor(row.color)} />)}</Scatter></ScatterChart></ResponsiveContainer></div><p className="text-xs leading-5 text-slate-500">Below the diagonal means completion output was lower than incoming requests in this period. These are period flows, not a conversion rate.</p></>;
}

function LocationTreemap({ rows }) {
  const locations = [...rows.reduce((map, row) => map.set(row.location, (map.get(row.location) || 0) + Number(row.requests || 0)), new Map())].map(([name, size]) => ({ name, size }));
  if (!locations.length) return <p className="p-8 text-center text-sm text-slate-500">No saved city or province is available.</p>;
  return <div role="img" aria-label="Demand share by location treemap" className="h-72"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 700, height: 288 }}><Treemap data={locations} dataKey="size" nameKey="name" stroke="#fff" fill="#2563eb" isAnimationActive={false}><Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} requests`, 'Demand']} /></Treemap></ResponsiveContainer></div>;
}

function ServiceLocationHeatmap({ rows }) {
  if (!rows.length) return <p className="p-8 text-center text-sm text-slate-500">No service-location combinations are available.</p>;
  const serviceTotals = new Map();
  const locationTotals = new Map();
  rows.forEach((row) => { serviceTotals.set(row.service_type_id, { id: row.service_type_id, name: row.service_type, color: row.color, total: (serviceTotals.get(row.service_type_id)?.total || 0) + Number(row.requests || 0) }); locationTotals.set(row.location, (locationTotals.get(row.location) || 0) + Number(row.requests || 0)); });
  const services = [...serviceTotals.values()].sort((a, b) => b.total - a.total).slice(0, 6);
  const locations = [...locationTotals].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name]) => name);
  const lookup = new Map(rows.map((row) => [`${row.service_type_id}:${row.location}`, Number(row.requests || 0)]));
  const max = Math.max(1, ...lookup.values());
  return <div className="overflow-x-auto"><table className="analytics-table min-w-[620px] border-separate border-spacing-1 text-xs"><thead><tr><th className="w-44 p-2 text-left text-slate-500">Service</th>{locations.map((location) => <th key={location} className="max-w-28 p-2 text-center font-semibold text-slate-500"><span className="block break-words">{location}</span></th>)}</tr></thead><tbody>{services.map((service) => <tr key={service.id}><th className="p-2 text-left"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: asColor(service.color) }} />{service.name}</th>{locations.map((location) => { const value = lookup.get(`${service.id}:${location}`) || 0; const alpha = value ? 0.18 + (value / max) * 0.72 : 0.04; return <td key={location} className="h-12 rounded-lg text-center font-bold" style={{ backgroundColor: withAlpha(service.color, alpha), color: value / max > 0.62 ? '#fff' : '#0f172a' }} title={`${service.name} in ${location}: ${value} requests`}>{value || '–'}</td>; })}</tr>)}</tbody></table></div>;
}

const ATTENTION_META = {
  overdue_tickets: { label: 'Overdue tickets', severity: 5, route: '/admin/service-tickets?focus=sla-overdue', action: 'Review SLA queue' },
  overdue_maintenance: { label: 'Overdue maintenance', severity: 5, route: '/admin/maintenance?status=overdue', action: 'Review maintenance' },
  unassigned_tickets: { label: 'Unassigned tickets', severity: 4, route: '/admin/service-tickets?focus=unassigned', action: 'Assign work' },
  low_stock_items: { label: 'Low-stock items', severity: 4, route: '/admin/inventory', action: 'Review stock' },
  open_after_sales_cases: { label: 'Open after-sales cases', severity: 3, route: '/admin/after-sales-cases', action: 'Review cases' },
  upcoming_scheduled_jobs: { label: 'Jobs in the next 7 days', severity: 2, route: '/admin/calendar', action: 'Open calendar' },
};

export function NeedsAttentionPanel({ attention = {} }) {
  const items = Object.entries(ATTENTION_META)
    .map(([key, meta]) => ({ ...meta, key, count: Number(attention[key] || 0) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.severity - a.severity || b.count - a.count);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-labelledby="needs-attention-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-amber-600">Action queue</p>
          <h2 id="needs-attention-title" className="text-base font-bold text-slate-900">Needs attention today</h2>
          <p className="mt-1 text-xs text-slate-500">Ranked live operational signals. These counts are not all limited by the historical date range.</p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{items.length} {items.length === 1 ? 'area' : 'areas'}</span>
      </div>
      {items.length ? <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {items.map((item) => (
          <Link key={item.key} to={item.route} className={`group flex min-w-0 items-center gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${item.severity >= 5 ? 'border-rose-200 bg-rose-50/70' : item.severity >= 4 ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50'}`}>
            <FiAlertTriangle className={`shrink-0 ${item.severity >= 5 ? 'text-rose-600' : 'text-amber-600'}`} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{item.label}</p><p className="text-xs text-slate-500">{item.action}</p></div>
            <strong className="text-lg font-bold tabular-nums text-slate-900">{item.count}</strong><FiArrowRight className="shrink-0 text-slate-400 group-hover:text-blue-600" />
          </Link>
        ))}
      </div> : <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><FiCheckCircle /> No current attention signals were found.</div>}
    </section>
  );
}

export function AnalyticsScopeGuide() {
  return <aside className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" aria-label="Dashboard and Analytics scope guide"><div className="grid gap-2 text-xs leading-4 md:grid-cols-2 md:gap-4"><div><strong className="mr-1 text-slate-900">Dashboard:</strong><span className="text-slate-600">live operations and today’s queues; not date-filtered.</span></div><div><strong className="mr-1 text-slate-900">Analytics:</strong><span className="text-slate-600">selected-period trends; live attention is explicitly marked.</span></div></div></aside>;
}

export function DemandWorkspace({ data }) {
  const charts = data?.charts || {};
  const trend = charts.requests_vs_completions || [];
  const requests = trend.reduce((sum, row) => sum + Number(row.requests || 0), 0);
  const completions = trend.reduce((sum, row) => sum + Number(row.completions || 0), 0);
  const outcomes = charts.service_outcomes || [];
  const matrix = (charts.service_location_matrix || []).map((row) => ({ ...row, location: placeLabel(row.location) }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Requests received', requests, 'Selected period'], ['Completed work', completions, 'Completed during selected period'], ['Open-work gap', Math.max(0, requests - completions), 'Requests minus completions']].map(([label, value, note]) => <article key={label} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1.5 text-3xl font-bold tabular-nums text-slate-900">{value}</p><p className="mt-auto pt-1 text-xs text-slate-500">{note}</p></article>)}
      </div>
      <VisualPanel title="Demand flow" note="Requests received and completed work are separate period flows; the shaded shapes make widening gaps visible."><DemandFlowChart rows={trend} /></VisualPanel>
      <div className="grid gap-4 xl:grid-cols-2">
        <VisualPanel title="Service mix over time" note="Stacked bars use each service color configured in Services; quiet periods remain visible as zero activity."><ServiceDemandStack rows={charts.service_demand_series || []} services={outcomes} periods={trend} /></VisualPanel>
        <VisualPanel title="Demand versus completion output" note="Each bubble is a service. Its configured service color stays consistent across Analytics."><ServiceOutcomeScatter rows={outcomes} /></VisualPanel>
        <VisualPanel title="Demand share by location" note="Larger rectangles represent more requests from the saved city/province."><LocationTreemap rows={matrix} /></VisualPanel>
        <VisualPanel title="Service-location concentration" note="Darker service-colored cells reveal combinations carrying more recorded demand."><ServiceLocationHeatmap rows={matrix} /></VisualPanel>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h2 className="text-sm font-bold text-slate-900">Measurement limits</h2><p className="mt-1 text-xs leading-5 text-slate-600">This workspace can show recorded demand, completion output, service mix, and location concentration. It does not claim a cause, future quantity, or staffing requirement unless the assistant has supporting data and the forecasting gates pass.</p></section>
    </div>
  );
}
