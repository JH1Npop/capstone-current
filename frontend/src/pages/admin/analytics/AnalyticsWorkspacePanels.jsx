import { CapacityHeatmap, DataChart, TechnicianScatter } from './AnalyticsVisuals';
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FiAlertCircle, FiCheckCircle, FiClock, FiPackage, FiUsers } from 'react-icons/fi';
import { compactNumber, placeLabel, plural, shortDate } from './analyticsFormat';

const tooltipStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
  fontSize: 12,
};

function number(value, digits = 0) {
  if (value == null || value === '') return '—';
  return Number(value).toLocaleString('en-PH', { maximumFractionDigits: digits });
}

function money(value, currency) {
  if (value == null || !currency) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(Number(value));
}

function Panel({ title, note, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      {note ? <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const METRIC_TONES = {
  blue: { dot: 'bg-blue-500', flagged: 'border-blue-200 bg-blue-50/70' },
  green: { dot: 'bg-emerald-500', flagged: 'border-emerald-200 bg-emerald-50/70' },
  amber: { dot: 'bg-amber-500', flagged: 'border-amber-200 bg-amber-50/70' },
  red: { dot: 'bg-rose-500', flagged: 'border-rose-200 bg-rose-50/70' },
  violet: { dot: 'bg-violet-500', flagged: 'border-violet-200 bg-violet-50/70' },
  slate: { dot: 'bg-slate-400', flagged: 'border-slate-300 bg-slate-50' },
};

// `flag` tints the tile only when the risk count is above zero, so healthy zeros stay calm.
function Metric({ label, value, note, tone = 'blue', current = false, flag }) {
  const palette = METRIC_TONES[tone] || METRIC_TONES.blue;
  const flagged = flag != null && Number(flag) > 0;
  return (
    <article className={`flex h-full min-w-0 flex-col rounded-2xl border p-4 shadow-sm ${flagged ? palette.flagged : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${palette.dot}`} aria-hidden="true" />
        <p className="min-w-0 text-sm font-medium leading-5 text-slate-600">{label}</p>
      </div>
      <p className="mt-2 break-words text-xl font-bold leading-tight tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      {note || current ? <p className="mt-auto pt-1.5 text-xs leading-4 text-slate-500">{note || 'Live snapshot'}</p> : null}
    </article>
  );
}

function Metrics({ children, columns = 'xl:grid-cols-5' }) {
  return <div className={`grid grid-cols-2 gap-3 lg:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 ${columns}`}>{children}</div>;
}

function SectionLabel({ children, tone = 'blue' }) {
  const bar = tone === 'amber' ? 'border-amber-500' : 'border-blue-500';
  return <p className={`mb-3 border-l-4 pl-2.5 text-sm font-bold text-slate-800 ${bar}`}>{children}</p>;
}

function Empty({ title = 'No records in this period', detail }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
      <FiAlertCircle className="h-6 w-6 text-slate-400" />
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {detail ? <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function ComparisonBars(props) {
  return <DataChart {...props} />;
}

function RankingCard({ item }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-sm font-medium text-slate-500">{item.category}</p>
      {item.available ? (
        <>
          <p className="mt-2 font-bold text-slate-900">{item.technician}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">{number(item.value, 2)}</p>
          <p className="mt-auto pt-1 text-xs text-slate-500">{plural(item.observations, 'observation')} · {item.qualified_technicians} qualified</p>
        </>
      ) : <p className="mt-2 text-xs leading-5 text-slate-500">{item.reason}</p>}
    </article>
  );
}

export function TechnicianWorkspace({ data }) {
  const summary = data.summary || {};
  const leaderboard = data.leaderboard || [];
  return (
    <div className="space-y-4">
      <Metrics>
        <Metric label="Active technicians" value={number(summary.active_technicians)} current />
        <Metric label="Available" value={number(summary.available_technicians)} tone="green" current />
        <Metric label="Currently on jobs" value={number(summary.technicians_on_jobs)} tone="amber" current />
        <Metric label="Scheduled hours" value={`${number(summary.estimated_scheduled_hours, 1)}h`} note="Estimated from configured service duration" />
        <Metric label="Over capacity" value={number(summary.technicians_over_capacity)} tone="red" flag={summary.technicians_over_capacity} note="Any selected day above the 8-hour reference" />
      </Metrics>

      <Panel title="Top technician categories" note={`Separate rankings with minimum sample rules; no simplistic combined score. Selected period: ${shortDate(data.period?.start_date)} to ${shortDate(data.period?.end_date)}.`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(data.rankings || []).map((item) => <RankingCard key={item.category} item={item} />)}</div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Lead workload comparison" note="Lead assignments and completions only; crew work is reported separately.">
          <ComparisonBars data={leaderboard} category="technician" currentKey="assigned_lead_jobs" previousKey="previous_assigned_lead_jobs" ariaLabel="Current and previous lead assignments by technician" />
        </Panel>
        <Panel title="Skill coverage" note="Active service types and the number of technicians with an explicit matching skill.">
          <ComparisonBars data={data.skills_coverage || []} category="name" currentKey="technician_count" previousKey="unused" currentName="Skilled technicians" ariaLabel="Technician skill coverage by service" color="#2563eb" />
        </Panel>
        <Panel title="Completion-rate comparison" note="Completed lead jobs divided by assigned lead jobs in each period.">
          <ComparisonBars data={leaderboard} category="technician" currentKey="completion_rate" previousKey="previous_completion_rate" currentName="Current rate %" previousName="Previous rate %" ariaLabel="Current and previous lead job completion rate by technician" color="#10b981" />
        </Panel>
        <Panel title="Average completion-time comparison" note="Valid non-negative completed-date minus start-time observations only; lower is faster.">
          <ComparisonBars data={leaderboard.filter((row) => row.average_completion_hours != null || row.previous_average_completion_hours != null)} category="technician" currentKey="average_completion_hours" previousKey="previous_average_completion_hours" currentName="Current hours" previousName="Previous hours" ariaLabel="Current and previous average completion hours by technician" color="#f59e0b" />
        </Panel>
      </div>

      <Panel title="Workload and completion" note="Compare assignment volume with completion percentage for each technician.">
        <TechnicianScatter data={leaderboard} />
      </Panel>

      <Panel title="Daily capacity" note="Estimated duration only. This is not claimed as true utilization or attended work time.">
        <CapacityHeatmap data={data.daily_capacity || []} />
      </Panel>

      <Panel title="Technician leaderboard" note="Exact metrics remain visible without hovering. Coordinates are never included.">
        {leaderboard.length ? <div className="overflow-x-auto"><table className="analytics-table min-w-[1180px] w-full text-left text-xs">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            {['Rank', 'Technician', 'Assigned', 'Completed', 'Pending', 'Completion', 'Avg. hours', 'Actual work', 'Scheduled', 'Rating', 'Checklist', 'Arrival', 'Crew'].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2.5 font-semibold">{label}</th>)}
          </tr></thead>
          <tbody className="tabular-nums">{leaderboard.map((row, index) => <tr key={row.technician_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
            <td className="px-3 py-3 font-semibold text-slate-400">{index + 1}</td><td className="px-3 py-3 font-semibold text-slate-900">{row.technician}</td>
            <td className="px-3 py-3">{row.assigned_lead_jobs}</td><td className="px-3 py-3">{row.completed_lead_jobs}</td><td className="px-3 py-3">{row.pending_lead_jobs}</td>
            <td className="px-3 py-3">{number(row.completion_rate, 1)}%</td><td className="px-3 py-3">{row.average_completion_hours == null ? '—' : `${row.average_completion_hours}h`}</td>
            <td className="px-3 py-3">{row.actual_valid_work_hours == null ? 'Unavailable' : `${row.actual_valid_work_hours}h`}</td><td className="px-3 py-3">{row.estimated_scheduled_hours}h</td><td className="px-3 py-3">{number(row.client_rating, 2)} ({row.rating_count})</td>
            <td className="px-3 py-3">{row.checklist_compliance == null ? '—' : `${row.checklist_compliance}%`}</td><td className="px-3 py-3">{row.arrival_validation_success == null ? '—' : `${row.arrival_validation_success}%`}</td><td className="px-3 py-3">{row.crew_participation}</td>
          </tr>)}</tbody>
        </table></div> : <Empty />}
      </Panel>
    </div>
  );
}

function SalesTrendChart({ rows, currency }) {
  if (!rows.some((row) => Number(row.count) > 0)) return <Empty title="No confirmed sales in this period" />;
  const byAmount = rows.some((row) => row.amount != null);
  const series = rows.map((row) => ({ ...row, value: byAmount ? Number(row.amount || 0) : Number(row.count || 0) }));
  const valueLabel = (value) => (byAmount ? money(value, currency || 'PHP') : plural(value, 'sale'));
  return (
    <div role="img" aria-label="Confirmed sales per period" className="h-64">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 900, height: 256 }}>
        <AreaChart data={series} margin={{ left: 4, right: 12, top: 8 }}>
          <defs><linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#059669" stopOpacity={0.28} /><stop offset="100%" stopColor="#059669" stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 5" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis allowDecimals={!byAmount ? false : undefined} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={byAmount ? 72 : 32} tickFormatter={(value) => (byAmount ? compactNumber(value) : value)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [valueLabel(value), byAmount ? 'Sales amount' : 'Confirmed sales']} />
          <Area type="monotone" dataKey="value" stroke="#059669" strokeWidth={2.5} fill="url(#salesArea)" dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SalesWorkspace({ data }) {
  const kpis = data.kpis || {};
  const amount = kpis.confirmed_sales_amount || {};
  const count = kpis.confirmed_sales_count || {};
  const average = kpis.average_sale_value || {};
  const conversion = kpis.quotation_conversion_rate || {};
  const voided = kpis.voided_sales_amount || {};
  const hasSales = Number(count.current || 0) > 0;
  const salesTrend = data.charts?.sales_trend || [];
  return (
    <div className="space-y-4">
      <Metrics>
        <Metric label="Confirmed sales amount" value={money(amount.current, amount.currency)} tone="green" note={data.data_quality?.multiple_currencies ? 'Multiple currencies are separated below' : 'Confirmed, non-voided records only'} />
        <Metric label="Confirmed sales count" value={number(count.current)} />
        <Metric label="Average sale value" value={money(average.current, average.currency)} />
        <Metric label="Quotation conversion" value={conversion.current == null ? '—' : `${number(conversion.current, 1)}%`} note={conversion.current == null ? 'No accepted or rejected quotations yet' : 'Accepted ÷ accepted plus rejected'} />
        <Metric label="Voided sales amount" value={money(voided.current, voided.currency)} tone="red" flag={voided.count} note={plural(voided.count, 'voided record')} />
      </Metrics>
      {!hasSales ? <Empty title="No confirmed Sales Records in this period" detail="The system has no eligible confirmed, non-voided Sales Records with a valid sale date and agreed total. Estimated service costs are intentionally excluded." /> : null}
      {hasSales ? <Panel title="Sales over time" note={salesTrend.some((row) => row.amount != null) ? 'Confirmed, non-voided sales amount per period.' : 'Records use more than one currency, so the number of confirmed sales is shown instead of an amount.'}>
        <SalesTrendChart rows={salesTrend} currency={amount.currency} />
      </Panel> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Sales by currency" note="Currencies are never combined without conversion data.">
          <ComparisonBars data={data.charts?.sales_by_currency || []} category="currency_code" currentKey="amount" previousKey="previous_amount" ariaLabel="Current and previous confirmed sales by currency" color="#059669" />
        </Panel>
        <Panel title="Sales by service" note="One confirmed Sales Record is counted once by its ticket's primary service.">
          <ComparisonBars data={(data.charts?.sales_by_service || []).map((row) => ({ ...row, service: row.ticket__request__service_type__name }))} category="service" currentKey="amount" previousKey="unused" currentName="Confirmed amount" ariaLabel="Confirmed sales amount by primary service" />
        </Panel>
        <Panel title="Sales by client type"><ComparisonBars data={(data.charts?.sales_by_client_type || []).map((row) => ({ ...row, type: row.client__client_profile__client_type ? row.client__client_profile__client_type[0].toUpperCase() + row.client__client_profile__client_type.slice(1) : 'Unspecified' }))} category="type" currentKey="amount" previousKey="unused" currentName="Confirmed amount" ariaLabel="Confirmed sales by client type" color="#059669" /></Panel>
        <Panel title="Sales composition" note="Uses valid SalesRecordLine totals; record totals are not duplicated across lines."><ComparisonBars data={(data.charts?.line_composition || []).map((row) => ({ ...row, type: row.line_type }))} category="type" currentKey="amount" previousKey="unused" currentName="Line amount" ariaLabel="Confirmed sales line composition" color="#2563eb" /></Panel>
      </div>
      <Panel title="Financial data quality" note="Unavailable values remain unavailable rather than being inferred from text fields.">
        <div className="grid gap-3 sm:grid-cols-3"><Metric label="Missing confirmed total" value={number(data.data_quality?.confirmed_missing_total)} tone="amber" flag={data.data_quality?.confirmed_missing_total} /><Metric label="Missing sale date" value={number(data.data_quality?.confirmed_missing_sale_date)} tone="amber" flag={data.data_quality?.confirmed_missing_sale_date} /><Metric label="Quotation money" value="Unavailable" tone="slate" note={data.data_quality?.quotation_money_reason} /></div>
      </Panel>
    </div>
  );
}

export function InventoryWorkspace({ data }) {
  const summary = data.summary || {};
  const quality = data.data_quality || {};
  return (
    <div className="space-y-4">
      <Metrics columns="xl:grid-cols-3 2xl:grid-cols-6">
        <Metric label="Inventory value" value={money(summary.total_inventory_value, 'PHP')} tone="green" current />
        <Metric label="Available quantity" value={number(summary.available_quantity)} current />
        <Metric label="Reserved quantity" value={number(summary.reserved_quantity)} tone="blue" current />
        <Metric label="Low stock" value={number(summary.low_stock_items)} tone="amber" flag={summary.low_stock_items} current />
        <Metric label="Out of stock" value={number(summary.out_of_stock_items)} tone="red" flag={summary.out_of_stock_items} current />
        <Metric label="Pending returns" value={number(summary.pending_equipment_returns)} tone="violet" current />
      </Metrics>
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-900">
        <FiPackage className="mt-1 shrink-0 text-blue-600" aria-hidden="true" />
        <p><strong>{number(quality.ticket_linked_issue_transactions)} of {number(quality.issue_transactions)}</strong> issue transactions are linked to tickets ({quality.ticket_linkage_rate == null ? 'no coverage rate' : `${quality.ticket_linkage_rate}% coverage`}). Unlinked issues are not assigned to a service type.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Inventory movement" note="Current quantities versus the selected comparison period."><ComparisonBars data={data.charts?.movement_summary || []} category="label" currentKey="quantity" previousKey="previous_quantity" ariaLabel="Current and previous inventory movement by transaction type" color="#2563eb" /></Panel>
        <Panel title="Most-issued items"><ComparisonBars data={(data.charts?.most_issued_items || []).map((row) => ({ ...row, item: row.item__name }))} category="item" currentKey="quantity" previousKey="unused" currentName="Issued quantity" ariaLabel="Most issued inventory items" color="#2563eb" /></Panel>
        <Panel title="Stock by category"><ComparisonBars data={(data.charts?.stock_by_category || []).map((row) => ({ ...row, category: row.category__name }))} category="category" currentKey="available" previousKey="reserved" currentName="Available" previousName="Reserved" ariaLabel="Available and reserved inventory by category" color="#10b981" /></Panel>
        <Panel title="Ticket-linked usage by service"><ComparisonBars data={(data.charts?.usage_by_service_type || []).map((row) => ({ ...row, service: row.service_ticket__request__service_type__name }))} category="service" currentKey="quantity" previousKey="unused" currentName="Issued quantity" ariaLabel="Ticket linked inventory usage by service type" color="#2563eb" /></Panel>
      </div>
      <Panel title="Operational shortage risk" note="Deterministic warning from available stock, reservations, scheduled tickets, and configured service requirements—not an AI forecast.">
        {(data.shortage_risk || []).length ? <div className="overflow-x-auto"><table className="analytics-table min-w-[850px] w-full text-left text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">{['Item', 'Service', 'Available', 'Reserved', 'Expected', 'Shortage', 'Required', 'Tickets'].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2.5 font-semibold">{label}</th>)}</tr></thead><tbody className="tabular-nums">{data.shortage_risk.map((row) => <tr key={`${row.item_id}-${row.service_type_id}`} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3 font-bold">{row.item}</td><td className="px-3 py-3">{row.service_type}</td><td className="px-3 py-3">{row.available_quantity}</td><td className="px-3 py-3">{row.reserved_quantity}</td><td className="px-3 py-3">{row.expected_required_quantity}</td><td className={`px-3 py-3 font-bold ${row.projected_shortage ? 'text-rose-700' : 'text-emerald-700'}`}>{row.projected_shortage}</td><td className="whitespace-nowrap px-3 py-3">{shortDate(row.required_date)}</td><td className="px-3 py-3">{row.affected_ticket_count}</td></tr>)}</tbody></table></div> : <Empty title="No configured shortage risk in this period" />}
      </Panel>
    </div>
  );
}

export function AfterSalesWorkspace({ data }) {
  const cases = data.case_kpis || {};
  const maintenance = data.maintenance_summary || {};
  return (
    <div className="space-y-4">
      <div><SectionLabel>After-sales cases</SectionLabel><Metrics columns="xl:grid-cols-6">
        <Metric label="New cases" value={number(cases.new_cases?.current)} />
        <Metric label="Open cases" value={number(cases.open_cases?.current)} tone="amber" current />
        <Metric label="Overdue cases" value={number(cases.overdue_cases?.current)} tone="red" flag={cases.overdue_cases?.current} current />
        <Metric label="Resolved cases" value={number(cases.resolved_cases?.current)} tone="green" />
        <Metric label="Avg. resolution" value={cases.average_resolution_hours?.current == null ? '—' : `${number(cases.average_resolution_hours.current, 1)}h`} />
        <Metric label="Requires revisit" value={number(cases.cases_requiring_revisit?.current)} tone="amber" flag={cases.cases_requiring_revisit?.current} note="Not automatically classified as rework" />
      </Metrics></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Cases by type"><DataChart mode="donut" data={data.case_charts?.by_type || []} category="value" currentKey="count" previousKey="previous_count" ariaLabel="Case type proportions and period counts" /></Panel>
        <Panel title="Cases by status"><ComparisonBars data={data.case_charts?.by_status || []} category="value" currentKey="count" previousKey="previous_count" ariaLabel="Current and previous after sales cases by status" color="#2563eb" /></Panel>
        <Panel title="Cases by priority"><ComparisonBars data={data.case_charts?.by_priority || []} category="value" currentKey="count" previousKey="previous_count" ariaLabel="Current and previous after sales cases by priority" color="#f59e0b" /></Panel>
        <Panel title="Cases by source"><DataChart mode="donut" data={data.case_charts?.by_creation_source || []} category="value" currentKey="count" previousKey="previous_count" ariaLabel="Case source proportions and period counts" /></Panel>
      </div>
      <div><SectionLabel tone="amber">Maintenance</SectionLabel><Metrics>
        <Metric label="Active schedules" value={number(maintenance.active_schedules)} current />
        <Metric label="Due soon" value={number(maintenance.due_soon)} tone="amber" current />
        <Metric label="Due today" value={number(maintenance.due_today)} tone="amber" flag={maintenance.due_today} current />
        <Metric label="Overdue" value={number(maintenance.overdue)} tone="red" flag={maintenance.overdue} current />
        <Metric label="High risk" value={number(maintenance.high_risk)} tone="red" flag={maintenance.high_risk} current note="Stored operational risk—not described as AI" />
      </Metrics></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Maintenance by service"><ComparisonBars data={(data.maintenance_charts?.by_service_type || []).map((row) => ({ ...row, service: row.service_type__name }))} category="service" currentKey="count" previousKey="unused" currentName="Schedules" ariaLabel="Maintenance schedules by service type" /></Panel>
        <Panel title="Maintenance by risk level"><ComparisonBars data={(data.maintenance_charts?.by_risk_level || []).map((row) => ({ ...row, risk: row.risk_level ? row.risk_level[0].toUpperCase() + row.risk_level.slice(1) : 'Unspecified' }))} category="risk" currentKey="count" previousKey="unused" currentName="Schedules" ariaLabel="Maintenance schedules by risk level" color="#ef4444" /></Panel>
      </div>
      <Panel title="Data coverage"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Resolution observations" value={number(data.data_quality?.resolution_observations)} /><Metric label="Satisfaction responses" value={`${number(data.data_quality?.satisfaction_responses)} / ${number(data.data_quality?.satisfaction_population)}`} /><Metric label="Maintenance technician" value="Not applicable" tone="slate" note="Maintenance has no direct technician relationship" /></div></Panel>
    </div>
  );
}

export function ForecastingWorkspace({ data }) {
  const forecast = data.forecast || {};
  const demandForecast = data.demand_forecast || {};
  const modelStatus = data.model_status || {};
  const monthlyDemand = data.historical_charts?.monthly_demand || [];
  const serviceMix = (data.historical_charts?.service_mix || []).map((row) => ({
    ...row,
    service: row.service_type__name || 'Unspecified',
  }));
  const locationDensity = (data.historical_charts?.service_location_density || []).map((row) => ({
    ...row,
    location_service: `${placeLabel(row.location__city, row.location__province)} · ${row.service_type__name || 'Unspecified'}`,
  }));
  const itemUsage = (data.historical_charts?.historical_item_usage || []).map((row) => ({
    ...row,
    item: row.item__name || row.item__sku || 'Unspecified item',
  }));
  const itemReadiness = data.item_demand_readiness || {};
  const publishedModels = (demandForecast.service_models || []).filter((row) => row.published);
  const validationWapes = publishedModels.map((row) => Number(row.metrics?.wape_percent)).filter(Number.isFinite);
  const averageWape = validationWapes.length ? validationWapes.reduce((total, value) => total + value, 0) / validationWapes.length : null;
  const forecastMonthly = demandForecast.monthly || [];
  const combinedMonthly = [
    ...monthlyDemand.slice(-12).map((row) => ({ label: row.label, actual: row.requests, predicted: null })),
    ...forecastMonthly.map((row) => ({ label: row.label, actual: null, predicted: row.predicted_requests })),
  ];
  const validationPoints = (demandForecast.validation_points || []).slice(-12);
  const locationOutlook = (demandForecast.location_outlook || []).map((row) => ({
    ...row,
    location_service: `${placeLabel(row.city, row.province)} · ${row.service_type || 'Unspecified'}`,
  }));
  const itemPredictions7 = itemReadiness.predictions?.next_7_days || [];
  const itemPredictions30 = itemReadiness.predictions?.next_30_days || [];
  const requestProgress = forecast.required_request_count ? Math.min((forecast.request_count / forecast.required_request_count) * 100, 100) : 0;
  const historyProgress = forecast.required_history_months ? Math.min((forecast.history_months / forecast.required_history_months) * 100, 100) : 0;
  return (
    <div className="space-y-4">
      <Metrics columns="xl:grid-cols-4">
        <Metric label="Next 7 days" value={demandForecast.available ? number(demandForecast.next_7_days, 1) : 'Unavailable'} note={demandForecast.available ? 'Expected service requests' : 'Requires a validated model'} tone={demandForecast.available ? 'violet' : 'amber'} />
        <Metric label="Next 30 days" value={demandForecast.available ? number(demandForecast.next_30_days, 1) : 'Unavailable'} note={demandForecast.available ? 'Expected service requests' : 'No fabricated quantity'} tone={demandForecast.available ? 'violet' : 'amber'} />
        <Metric label="Published services" value={`${number(modelStatus.published_service_count)} / ${number(modelStatus.evaluated_service_count)}`} note="Each service is validated separately" tone="violet" />
        <Metric label="Holdout WAPE" value={averageWape == null ? 'Unavailable' : `${number(averageWape, 1)}%`} note="Lower is better; calculated from unseen historical months" />
      </Metrics>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Forecast readiness" note="Predictions remain hidden until genuine history and a validated model are both available.">
        <div className={`rounded-2xl p-5 ${demandForecast.available ? 'bg-emerald-50' : 'bg-amber-50'}`}><p className="font-bold text-slate-900">{demandForecast.available ? 'Validated forecast available' : forecast.history_threshold_met ? 'History ready; model not publishable yet' : 'Insufficient historical data'}</p><p className="mt-2 text-sm leading-6 text-slate-600">{demandForecast.available ? `${demandForecast.method}. Generated ${demandForecast.generated_at ? new Date(demandForecast.generated_at).toLocaleString('en-PH') : 'recently'}.` : forecast.reason}</p></div>
        <div className="mt-5 space-y-5">
          {[['Genuine requests', forecast.request_count, forecast.required_request_count, requestProgress], ['History months', forecast.history_months, forecast.required_history_months, historyProgress]].map(([label, value, required, progress]) => <div key={label}><div className="mb-2 flex justify-between text-xs font-semibold text-slate-600"><span>{label}</span><span className="tabular-nums text-slate-900">{number(value)} / {number(required)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${progress}%` }} /></div></div>)}
        </div>
        </Panel>
        <Panel title="Evidence and model status">
        <div className="divide-y divide-slate-100">
          {[['Earliest request', shortDate(forecast.earliest_request_date)], ['Latest request', shortDate(forecast.latest_request_date)], ['Active months', number(forecast.active_months)], ['Missing months', number(forecast.missing_months)], ['Model exists', modelStatus.exists ? 'Yes' : 'No'], ['Validated and backtested', modelStatus.validated && modelStatus.backtested ? 'Yes' : 'No']].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 px-1 py-2.5 text-sm"><span className="text-slate-600">{label}</span><strong className="break-words text-right font-semibold tabular-nums text-slate-900">{value}</strong></div>)}
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-xs leading-5 text-slate-600"><FiCheckCircle className="mt-0.5 shrink-0 text-emerald-600" /> Forecasts use genuine records only. Synthetic historical seeds, weather factors, hardcoded confidence, and models that fail holdout validation are excluded.</div>
        </Panel>
      </div>

      {demandForecast.available ? <>
        <Panel title="Historical demand and six-month outlook" note="Solid blue is recorded demand. Dashed purple is the published seasonal-trend forecast; it is an estimate, not a guaranteed count.">
          <div role="img" aria-label="Historical monthly requests and validated future demand forecast" className="h-80">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1000, height: 320 }}>
              <LineChart data={combinedMonthly} margin={{ left: -14, right: 22, top: 18 }}>
                <CartesianGrid strokeDasharray="3 5" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="actual" name="Recorded requests" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="predicted" name="Forecast requests" stroke="#7c3aed" strokeWidth={3} strokeDasharray="8 5" dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Holdout backtest" note="Historical months are predicted without letting the model see their actual results first.">
            {validationPoints.length ? <div role="img" aria-label="Holdout actual versus predicted request counts" className="h-72">
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 700, height: 288 }}>
                <LineChart data={validationPoints} margin={{ left: -14, right: 18, top: 14 }}>
                  <CartesianGrid strokeDasharray="3 5" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke="#2563eb" strokeWidth={3} isAnimationActive={false} />
                  <Line type="monotone" dataKey="predicted" name="Backtest prediction" stroke="#7c3aed" strokeWidth={3} strokeDasharray="8 5" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div> : <Empty title="No backtest points available" detail="A publishable model always includes stored holdout evidence." />}
          </Panel>
          <Panel title="Forecast by service" note="Each service must pass the evidence and backtesting rules independently.">
            {(demandForecast.by_service || []).length ? <div className="space-y-3">{demandForecast.by_service.map((row) => <div key={row.service_type_id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><p className="break-words font-bold text-slate-900">{row.service_type}</p><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><p className="text-xs text-slate-500">7 days</p><strong>{number(row.next_7_days, 1)}</strong></div><div><p className="text-xs text-slate-500">30 days</p><strong>{number(row.next_30_days, 1)}</strong></div><div><p className="text-xs text-slate-500">WAPE</p><strong>{row.wape_percent == null ? '—' : `${number(row.wape_percent, 1)}%`}</strong></div></div></div>)}</div> : <Empty />}
          </Panel>
        </div>

        <Panel title="Service-location demand allocation" note={demandForecast.location_method}>
          <ComparisonBars data={locationOutlook} category="location_service" currentKey="allocated_30_day_requests" previousKey="unused" currentName="Allocated 30-day requests" ariaLabel="Thirty day forecast allocated using historical service location density" color="#7c3aed" />
        </Panel>
      </> : null}

      <Panel title="Historical monthly demand" note="Actual genuine service requests by month. Zero-height points reveal gaps in the stored history; this is not a forecast.">
        {monthlyDemand.length ? <div role="img" aria-label="Historical genuine service requests by month" className="h-80">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1000, height: 320 }}>
            <LineChart data={monthlyDemand} margin={{ left: -14, right: 22, top: 18 }}>
              <CartesianGrid strokeDasharray="3 5" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="requests" name="Genuine requests" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false}>
                <LabelList dataKey="requests" position="top" className="fill-slate-600 text-xs font-bold" />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div> : <Empty title="No genuine request history" detail="Historical seed descriptions are excluded from forecast evidence." />}
        {monthlyDemand.length ? <div className="mt-4 flex flex-wrap gap-2" aria-label="Monthly data continuity">
          {monthlyDemand.map((row) => <span key={row.month} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${row.has_data ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{row.label}: {row.has_data ? plural(row.requests, 'request') : 'Missing'}</span>)}
        </div> : null}
      </Panel>

      <Panel title="Historical demand by service" note="All genuine request history, separated by primary service. Use the Service filter above to inspect one service.">
        <ComparisonBars data={serviceMix} category="service" currentKey="requests" previousKey="unused" currentName="Genuine requests" ariaLabel="Historical genuine request count by service type" color="#2563eb" />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Service-location density" note="Historical request concentration by primary service and city/province. Exact coordinates and client addresses are not exposed.">
          <ComparisonBars data={locationDensity} category="location_service" currentKey="requests" previousKey="unused" currentName="Historical requests" ariaLabel="Historical service request density by service and location" color="#2563eb" />
        </Panel>
        <Panel title="Ticket-linked item consumption" note="Actual issued quantities with a service-ticket link. Unlinked inventory issues are excluded from service-demand evidence.">
          <ComparisonBars data={itemUsage} category="item" currentKey="quantity" previousKey="unused" currentName="Issued quantity" ariaLabel="Historical ticket linked inventory item consumption" color="#2563eb" />
        </Panel>
      </div>

      <Panel title={itemReadiness.available ? 'Projected item demand' : 'Projected item demand readiness'} note="Validated service demand → configured service-item mapping → genuine ticket-linked consumption → 7/30-day stock outlook.">
        <div className={`rounded-2xl border p-5 ${itemReadiness.available ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-bold text-slate-900">{itemReadiness.available ? 'Projected item demand available' : 'Projected item demand not ready'}</p><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">{itemReadiness.reason}</p></div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">7-day / 30-day outlook</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Ticket-linked issues" value={`${number(itemReadiness.ticket_linked_issue_transactions)} / ${number(itemReadiness.required_linked_issue_transactions)}`} note={`${itemReadiness.ticket_linkage_rate == null ? 'No' : `${itemReadiness.ticket_linkage_rate}%`} linkage coverage`} />
          <Metric label="Usage history" value={plural(itemReadiness.linked_issue_active_months, 'month')} note={`${plural(itemReadiness.required_issue_history_months, 'month')} required`} tone="blue" />
          <Metric label="Requirement mappings" value={number(itemReadiness.requirement_mappings)} note={`${number(itemReadiness.mapped_service_types)} mapped services`} tone="green" />
          <Metric label="Future quantities" value={itemReadiness.available ? number(itemPredictions30.reduce((total, row) => total + Number(row.expected_quantity || 0), 0), 1) : 'Unavailable'} note={itemReadiness.available ? 'Expected 30-day issued quantity' : 'No validated model; no fabricated item forecast'} tone={itemReadiness.available ? 'violet' : 'amber'} />
        </div>
        {itemReadiness.available ? <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200"><table className="analytics-table min-w-[760px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Item', '7-day expected', '30-day expected', 'Available', '30-day shortage', 'Evidence'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{itemPredictions30.map((row) => { const sevenDay = itemPredictions7.find((item) => item.item_id === row.item_id); return <tr key={row.item_id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="max-w-xs break-words font-bold text-slate-900">{row.item}</p><p className="text-xs text-slate-500">{row.sku}</p></td><td className="px-4 py-3">{number(sevenDay?.expected_quantity, 1)}</td><td className="px-4 py-3">{number(row.expected_quantity, 1)} {row.unit}</td><td className="px-4 py-3">{number(row.available_quantity)}</td><td className={`px-4 py-3 font-bold ${row.projected_shortage ? 'text-rose-700' : 'text-emerald-700'}`}>{number(row.projected_shortage)}</td><td className="px-4 py-3">{plural(row.usage_ticket_observations, 'linked ticket')}</td></tr>; })}</tbody></table></div> : null}
        <p className="mt-4 text-xs leading-5 text-slate-500">Method: {itemReadiness.method}</p>
      </Panel>
    </div>
  );
}

export function WorkspaceLoading() {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div>;
}

export function WorkspaceIcon({ workspace }) {
  const icons = { technicians: FiUsers, sales: FiCheckCircle, inventory: FiPackage, after_sales: FiAlertCircle, forecasting: FiClock };
  const Icon = icons[workspace] || FiCheckCircle;
  return <Icon />;
}
