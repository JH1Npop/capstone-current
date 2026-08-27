import { useEffect, useRef, useState } from 'react';
import {
  FiRefreshCw,
} from 'react-icons/fi';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Layout from '../../components/layout/Layout';
import { PageSkeleton } from '../../components/ui/LoadingSkeleton';
import { fetchAdminAnalytics, fetchDashboardStats } from '../../api/api';
import { api } from '../../api/core';
import {
  AUTO_REFRESH_MS,
  formatCompactNumber,
  formatDateTime,
  demandTone
} from '../../utils/dashboardHelpers';
import { formatTechnicianId } from '../../utils/roleIds';

function toDateInputValue(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPresetStartDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(1, Number(days) || 30) + 1);
  return toDateInputValue(date);
}

function getInclusiveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 30;
  return Math.max(1, Math.min(1095, Math.round((end - start) / 86400000) + 1));
}

function formatTimelineLabel(value, mode = 'generic') {
  if (!value) return '';
  const text = String(value);

  if (mode === 'daily') {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  if (mode === 'monthly') {
    const parsed = new Date(`${text}-01`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  }

  return text;
}

function formatPeso(value, compact = false) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(Number(value || 0));
}

const TIMELINE_VIEW_CONFIG = {
  recent: {
    label: 'Recent',
    trendPeriods: 6,
    forecastDays: 3,
    busiestRows: 3,
  },
  balanced: {
    label: 'Balanced',
    trendPeriods: 12,
    forecastDays: 5,
    busiestRows: 4,
  },
  extended: {
    label: 'Extended',
    trendPeriods: 24,
    forecastDays: 7,
    busiestRows: 6,
  },
};

/* ───────────── Shared pill toggle ───────────── */
function PillToggle({ options, value, onChange }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
            value === opt.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── Charts ───────────────────────── */

function EmptyChart({ title, description }) {
  return (
    <div className="grid min-h-[180px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center sm:min-h-[220px] sm:px-5">
      <div>
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function ChartFrame({ title, description, children, right, chartHeightClass = 'h-[240px] sm:h-[260px]' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        {right}
      </div>
      <div className={`mt-4 min-w-0 ${chartHeightClass}`}>{children}</div>
    </div>
  );
}

function ChartContainer({ children }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full min-h-0 w-full min-w-0">
      {size.width > 0 && size.height > 0 ? (
        <ResponsiveContainer width={size.width} height={size.height} minWidth={0} debounce={1}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

function AnalyticsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-800">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <p key={entry.dataKey} style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{formatCompactNumber(entry.value)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

/* ─── Key Metrics horizontal bar chart (replaces stat cards) ─── */
function MiniTrendCard({
  label,
  value,
  helper,
  badge,
  data,
  color = '#0f172a',
  fill = '#e2e8f0',
  showAxes = false,
  axisMode = 'generic',
  axisLabel = 'Period',
}) {
  const gradientId = `mini-trend-${String(label).toLowerCase().replace(/\s+/g, '-')}`;
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.value))) : [];
  const chartHeightClass = showAxes ? 'h-32' : 'h-16';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold text-slate-900" title={String(value)}>
            {value}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500" title={helper}>
            {helper}
          </p>
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {badge}
          </span>
        ) : null}
      </div>

      <div className={`mt-4 min-w-0 rounded-lg bg-slate-50 px-1 ${chartHeightClass}`}>
        {chartData.length ? (
          <ChartContainer>
            <AreaChart
              data={chartData}
              margin={showAxes ? { top: 10, right: 8, left: -18, bottom: 24 } : { top: 4, right: 4, left: 4, bottom: 4 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={fill} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              {showAxes ? (
                <>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ee" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickFormatter={(tick) => formatTimelineLabel(tick, axisMode)}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={18}
                    label={{ value: axisLabel, position: 'insideBottom', offset: -14, fill: '#64748b', fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={28}
                  />
                </>
              ) : null}
              <Tooltip
                labelFormatter={(labelValue) => formatTimelineLabel(labelValue, axisMode)}
                content={<AnalyticsTooltip />}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={`url(#${gradientId})`}
                strokeWidth={2.5}
                fillOpacity={1}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="grid h-full place-items-center text-xs text-slate-400">Awaiting more trend data</div>
        )}
      </div>
    </div>
  );
}

function CompactDonutPanel({ title, description, centerLabel, centerValue, data, colors, showCenter = true }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number(item?.value || 0) > 0) : [];
  const total = chartData.reduce((sum, item) => sum + Number(item.value || 0), 0);

  if (!chartData.length) {
    return <EmptyChart title={title} description={description} />;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          Total {formatCompactNumber(total)}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
        <div className="relative h-[220px] min-w-0">
          <ChartContainer>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={54}
                outerRadius={86}
                paddingAngle={3}
              >
                {chartData.map((entry, index) => (
                  <Cell key={entry.name} fill={entry.color || colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip content={<AnalyticsTooltip />} />
            </PieChart>
          </ChartContainer>
          {showCenter ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-white px-4 py-3 text-center shadow-sm ring-1 ring-slate-200">
                <p className="text-[11px] font-medium text-slate-500">{centerLabel}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{centerValue}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2.5">
          {chartData.slice(0, 5).map((entry, index) => {
            const percentage = total ? Math.round((Number(entry.value || 0) / total) * 100) : 0;
            return (
              <div key={entry.name} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: entry.color || colors[index % colors.length] }}
                      />
                      <p className="truncate text-sm font-semibold text-slate-900">{entry.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{percentage}% of tracked volume</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-900">{formatCompactNumber(entry.value)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KeyMetricsBar({ data }) {
  const items = [
    { label: 'Requests', value: Number(data.total || 0), color: 'text-slate-900', helper: 'Created in period' },
    { label: 'Completed Requests', value: Number(data.completed || 0), color: 'text-emerald-600', helper: 'Requests closed in period' },
    { label: 'Pending', value: Number(data.pending || 0), color: 'text-amber-600', helper: 'Needs action' },
    { label: 'Technicians', value: Number(data.technicians || 0), color: 'text-blue-600', helper: 'Available field staff' }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
          <p className={`mt-2 text-3xl font-bold ${item.color}`}>{formatCompactNumber(item.value)}</p>
          <p className="mt-1 text-xs text-slate-500">{item.helper}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Operational Focus signals (counts can overlap) ─── */
function AnalyticsInsightStrip({ dailyForecast, serviceForecast, predictiveSummary, focusSegments }) {
  const forecastDays = Array.isArray(dailyForecast) ? dailyForecast.slice(0, 7) : [];
  const serviceRows = Array.isArray(serviceForecast) ? serviceForecast : [];
  const totalPredicted = forecastDays.reduce((sum, item) => sum + Number(item.predictedRequests || 0), 0);
  const busiestDay = [...forecastDays].sort((a, b) => Number(b.predictedRequests || 0) - Number(a.predictedRequests || 0))[0];
  const topService = [...serviceRows].sort((a, b) => Number(b.predictedNext7Days || 0) - Number(a.predictedNext7Days || 0))[0];
  const capacityGap = serviceRows.reduce((sum, item) => sum + Number(item.capacityGap || 0), 0);
  const openSignals = (focusSegments || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const pressure = predictiveSummary?.staffingPressure || (capacityGap > 0 ? 'attention needed' : 'stable');

  const insights = [
    { label: '7-day demand', value: formatCompactNumber(totalPredicted), helper: busiestDay ? `Forecasted requests next 7 days; highest on ${busiestDay.label}` : 'Forecasted requests for the next 7 days' },
    { label: 'Top service', value: topService?.serviceType || 'None yet', helper: topService ? `${topService.predictedNext7Days || 0} forecasted requests in the next 7 days` : 'Highest forecasted service will appear once enough history exists' },
    { label: 'Capacity gap', value: capacityGap, helper: capacityGap > 0 ? 'Additional technicians needed to meet forecasted demand' : `Staffing pressure status: ${pressure}` },
    { label: 'Open signals', value: openSignals, helper: 'Items flagged across SLA, stock, maintenance, and scheduling' },
  ];

  return (
    <section className="grid gap-3 lg:grid-cols-4">
      {insights.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
          <p className="mt-2 truncate text-lg font-bold text-slate-900" title={String(item.value)}>{item.value}</p>
          <p className="mt-1 truncate text-xs text-slate-500" title={item.helper}>{item.helper}</p>
        </div>
      ))}
    </section>
  );
}

function ServiceForecastTable({ data }) {
  const rows = Array.isArray(data) ? data.slice(0, 6) : [];

  if (!rows.length) {
    return <EmptyChart title="Service forecast unavailable" description="More service request history is needed before the system can rank forecasted service demand." />;
  }

  const riskTone = {
    high: 'bg-rose-100 text-rose-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-base font-semibold text-slate-900">Forecasted Demand by Service Type</h3>
        <p className="text-xs text-slate-500">Ranked next-7-day demand, staffing gap, and risk by service type.</p>
      </div>
      <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full table-fixed text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-[34%] px-4 py-3">Service</th>
            <th className="w-[16%] px-4 py-3">Forecast</th>
            <th className="w-[18%] px-4 py-3">Recent</th>
            <th className="w-[16%] px-4 py-3">Gap</th>
            <th className="w-[16%] px-4 py-3">Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.serviceType} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="truncate font-semibold text-slate-900" title={row.serviceType}>{row.serviceType}</div>
                <div className="mt-0.5 text-xs text-slate-500">Confidence {row.confidence ?? 0}%</div>
              </td>
              <td className="px-4 py-3 font-semibold text-slate-900">{row.predictedNext7Days ?? 0}</td>
              <td className="px-4 py-3 text-slate-600">{row.recentRequests ?? 0}</td>
              <td className="px-4 py-3 text-slate-600">{row.capacityGap ?? 0}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${riskTone[row.riskLevel] || riskTone.low}`}>
                  {row.riskLevel || 'low'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

function TopPerformerSummary({ topTech, overview, predictiveSummary }) {
  const avgResponse = Number(overview?.avgResponseTimeHours || 0);
  const avgCompletion = Number(overview?.avgCompletionTimeHours || 0);
  const staffingPressure = predictiveSummary?.staffingPressure || 'stable';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Response Time and Field Performance Summary</h3>
          <p className="mt-1 text-xs text-slate-500">Fast-read view of speed, capacity pressure, and top field performance.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
          Pressure: {staffingPressure}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Top Technician</p>
          <p className="mt-2 text-lg font-bold text-slate-900">{topTech?.techName || 'No leader yet'}</p>
          <p className="mt-1 text-xs text-slate-500">
            {topTech?.totalCompleted ? `${topTech.totalCompleted} completed job(s)` : 'Waiting for completed work in the selected period'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Avg Response</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{avgResponse ? `${avgResponse}h` : '-'}</p>
          <p className="mt-1 text-xs text-slate-500">Time from request creation to technician assignment</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Avg Completion</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{avgCompletion ? `${avgCompletion}h` : '-'}</p>
          <p className="mt-1 text-xs text-slate-500">Time from work start to recorded completion</p>
        </div>
      </div>
    </section>
  );
}

function BusiestPeriodsPanel({ busiestMonths, busiestWeeks, timelineView = 'balanced' }) {
  const timelineConfig = TIMELINE_VIEW_CONFIG[timelineView] || TIMELINE_VIEW_CONFIG.balanced;
  const months = Array.isArray(busiestMonths) ? busiestMonths.slice(0, timelineConfig.busiestRows) : [];
  const weeks = Array.isArray(busiestWeeks) ? busiestWeeks.slice(0, timelineConfig.busiestRows) : [];

  const renderList = (items, emptyText) => (
    <div className="space-y-2">
      {items.length ? items.map((item) => (
        <div key={item.monthStart || item.weekStart || item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="mt-1 text-xs text-slate-500">
                {Number(item.requestCount || 0)} request(s), {Number(item.completedCount || 0)} completed
              </p>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              {Number(item.completionRate || 0)}%
            </span>
        </div>
        </div>
      )) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          {emptyText}
        </div>
      )}
    </div>
  );

  return (
    <section className="grid gap-4 xl:grid-cols-2 xl:gap-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="text-lg font-semibold text-slate-900">Busiest Months</h3>
        <p className="mt-1 text-xs text-slate-500">Periods with the heaviest request volume and their closeout rate.</p>
        <div className="mt-4">{renderList(months, 'No monthly request activity available for this period.')}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="text-lg font-semibold text-slate-900">Busiest Weeks</h3>
        <p className="mt-1 text-xs text-slate-500">Useful for spotting short-term surges and dispatch pressure.</p>
        <div className="mt-4">{renderList(weeks, 'No weekly request activity available for this period.')}</div>
      </div>
    </section>
  );
}

function TimelineLensSummary({ timelineView, periodCount = 0, forecastCount = 0 }) {
  const timelineConfig = TIMELINE_VIEW_CONFIG[timelineView] || TIMELINE_VIEW_CONFIG.balanced;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {timelineConfig.label} Lens
      </span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        {periodCount} trend period{periodCount === 1 ? '' : 's'}
      </span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        {forecastCount} forecast day{forecastCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function RegionalCompletionTables({ cityTrends, provinceTrends }) {
  const cities = Array.isArray(cityTrends) ? cityTrends.slice(0, 5) : [];
  const provinces = Array.isArray(provinceTrends) ? provinceTrends.slice(0, 5) : [];

  const renderRows = (rows, labelKey) => {
    if (!rows.length) {
      return (
        <tr>
          <td colSpan="4" className="px-4 py-8 text-center text-sm text-slate-500">
            No regional completion trends yet.
          </td>
        </tr>
      );
    }

    return rows.map((row) => (
      <tr key={row[labelKey]} className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-4 py-3 font-medium text-slate-900">{row[labelKey]}</td>
        <td className="px-4 py-3 text-slate-600">{Number(row.completedCount || 0)}</td>
        <td className="px-4 py-3 text-slate-600">{Number(row.completionRate || 0)}%</td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
            row.trendDirection === 'up'
              ? 'bg-emerald-100 text-emerald-700'
              : row.trendDirection === 'down'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-slate-100 text-slate-700'
          }`}>
            {row.trendDirection || 'flat'}
          </span>
        </td>
      </tr>
    ));
  };

  return (
    <section className="grid gap-4 xl:grid-cols-2 xl:gap-5">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">City Completion Trends</h3>
          <p className="mt-1 text-xs text-slate-500">Where recent completions are trending up, down, or flat.</p>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-[420px] w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Trend</th>
            </tr>
          </thead>
          <tbody>{renderRows(cities, 'city')}</tbody>
        </table>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Province Completion Trends</h3>
          <p className="mt-1 text-xs text-slate-500">Higher-level view of completion strength across service areas.</p>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-[420px] w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Province</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Trend</th>
            </tr>
          </thead>
          <tbody>{renderRows(provinces, 'province')}</tbody>
        </table>
        </div>
      </div>
    </section>
  );
}

function SourceBreakdownPanel({ data }) {
  const chartData = Array.isArray(data)
    ? data.map((item) => ({
      name: item.label,
      value: Number(item.count || 0),
      percentage: Number(item.percentage || 0),
      color: null,
    }))
    : [];

  if (!chartData.length) {
    return <EmptyChart title="Request sources unavailable" description="Request source analytics will appear when request intake data is available." />;
  }

  const colors = ['#0ea5e9', '#14b8a6', '#f97316', '#8b5cf6', '#64748b', '#ef4444'];

  return (
    <CompactDonutPanel
      title="Service Request Count by Source"
      description="Where service requests are coming from in the selected period."
      centerLabel="Top Source"
      centerValue={chartData[0]?.name || 'None'}
      data={chartData}
      colors={colors}
      showCenter={false}
    />
  );
}

function PriorityDistributionPanel({ data }) {
  const requestRows = Array.isArray(data?.requests) ? data.requests : [];
  const ticketRows = Array.isArray(data?.tickets) ? data.tickets : [];
  const labels = Array.from(new Set([...requestRows, ...ticketRows].map((item) => item.label)));
  const chartData = labels.map((label) => ({
    label,
    Requests: Number(requestRows.find((item) => item.label === label)?.count || 0),
    Tickets: Number(ticketRows.find((item) => item.label === label)?.count || 0),
  }));

  if (!chartData.length) {
    return <EmptyChart title="Priority mix unavailable" description="Priority analytics will appear once requests or tickets are recorded." />;
  }

  return (
    <ChartFrame
      title="Request and Ticket Count by Priority"
      description="Compare urgency mix between incoming requests and operational tickets."
    >
      <ChartContainer>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} maxBarSize={48}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<AnalyticsTooltip />} />
          <Legend iconType="circle" />
          <Bar dataKey="Requests" fill="#2563eb" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Tickets" fill="#f97316" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartFrame>
  );
}

function TicketStatusBreakdownPanel({ data }) {
  const chartData = Array.isArray(data)
    ? data.map((item) => ({
      status: item.status,
      Count: Number(item.count || 0),
    }))
    : [];

  if (!chartData.length) {
    return <EmptyChart title="Ticket status mix unavailable" description="Ticket status analytics will appear once tickets are scheduled or completed." />;
  }

  return (
    <ChartFrame
      title="Ticket Count by Workflow Status"
      description="Current workflow mix across tickets touched during the selected period."
    >
      <ChartContainer>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="status" width={140} tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip content={<AnalyticsTooltip />} />
          <Bar dataKey="Count" fill="#14b8a6" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartFrame>
  );
}

function SchedulingInsightsPanel({ data }) {
  const preferredSlots = Array.isArray(data?.preferredRequestSlots) ? data.preferredRequestSlots : [];
  const scheduledSlots = Array.isArray(data?.scheduledTicketSlots) ? data.scheduledTicketSlots : [];
  const ticketTypes = Array.isArray(data?.ticketTypes) ? data.ticketTypes : [];
  const warrantyStatuses = Array.isArray(data?.warrantyStatuses) ? data.warrantyStatuses : [];
  const rescheduleCount = Number(data?.rescheduleRequests?.count || 0);
  const totalTickets = Number(data?.rescheduleRequests?.totalTickets || 0);

  const renderPills = (items, emptyText, colorClass) => (
    <div className="flex flex-wrap gap-2">
      {items.length ? items.map((item) => (
        <span key={`${item.label}-${item.value}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${colorClass}`}>
          {item.label}: {item.count}
        </span>
      )) : (
        <span className="text-sm text-slate-500">{emptyText}</span>
      )}
    </div>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Scheduling, Ticket Type, and Warranty Counts</h3>
          <p className="mt-1 text-xs text-slate-500">Time-slot demand, ticket types, warranty coverage, and reschedule pressure.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reschedules</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{rescheduleCount}</p>
          <p className="text-xs text-slate-500">{totalTickets ? `${Math.round((rescheduleCount / totalTickets) * 100)}% of tracked tickets` : 'No tracked tickets yet'}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2 xl:gap-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Preferred Request Slots</h4>
          <div className="mt-3">{renderPills(preferredSlots, 'No preferred time-slot data yet.', 'bg-blue-100 text-blue-700')}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Scheduled Ticket Slots</h4>
          <div className="mt-3">{renderPills(scheduledSlots, 'No scheduled time-slot data yet.', 'bg-cyan-100 text-cyan-700')}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Ticket Types</h4>
          <div className="mt-3">{renderPills(ticketTypes, 'No ticket type data yet.', 'bg-violet-100 text-violet-700')}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Warranty Status</h4>
          <div className="mt-3">{renderPills(warrantyStatuses, 'No warranty status data yet.', 'bg-amber-100 text-amber-700')}</div>
        </div>
      </div>
    </section>
  );
}

function FiveAnalyticsCards({ keyMetrics, dailyForecast, serviceForecast, focusSegments, monthlyServiceTrend, ticketStatusBreakdown, completedServiceValue, timelineView = 'balanced' }) {
  const timelineConfig = TIMELINE_VIEW_CONFIG[timelineView] || TIMELINE_VIEW_CONFIG.balanced;
  const forecastDays = Array.isArray(dailyForecast) ? dailyForecast.slice(0, timelineConfig.forecastDays) : [];
  const serviceRows = Array.isArray(serviceForecast) ? serviceForecast : [];
  const totalPredicted = forecastDays.reduce((sum, item) => sum + Number(item.predictedRequests || 0), 0);
  const busiestDay = [...forecastDays].sort((a, b) => Number(b.predictedRequests || 0) - Number(a.predictedRequests || 0))[0];
  const topService = [...serviceRows].sort((a, b) => Number(b.predictedNext7Days || 0) - Number(a.predictedNext7Days || 0))[0];
  const capacityGap = serviceRows.reduce((sum, item) => sum + Number(item.capacityGap || 0), 0);
  const openSignals = (focusSegments || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const completionRate = Number(keyMetrics.total || 0)
    ? Math.round((Number(keyMetrics.completed || 0) / Number(keyMetrics.total || 0)) * 100)
    : 0;
  const completionSeries = Array.isArray(monthlyServiceTrend)
    ? monthlyServiceTrend.slice(-timelineConfig.trendPeriods).map((item) => ({
      label: item.label,
      value: Number(item.completedCount || 0),
    }))
    : [];
  const forecastSeries = forecastDays.map((item) => ({
    label: item.label,
    value: Number(item.predictedRequests || 0),
  }));
  const signalSeries = Array.isArray(focusSegments)
    ? focusSegments.map((item) => ({
      label: ({
        'Overdue SLA': 'Overdue',
        'Warning SLA': 'Warning',
        'Due Maintenance': 'Maintenance',
        'Pending Approvals': 'Approvals',
        'Scheduled Jobs': 'Scheduled',
      })[item.label] || item.label,
      value: Number(item.value || 0),
    }))
    : [];
  const statusChartData = Array.isArray(ticketStatusBreakdown)
    ? ticketStatusBreakdown
      .map((item, index) => ({
        name: item.status,
        value: Number(item.count || 0),
        color: ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'][index % 6],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
    : [];

  return (
    <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] 2xl:gap-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-sky-700">Core Metrics</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-[2rem]">Analytics overview</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Shows total requests, completed work, forecasted demand, and operational pressure for the selected date range.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">Completion Rate</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{completionRate}%</p>
            <p className="mt-1 text-xs text-slate-500">{formatCompactNumber(keyMetrics.completed || 0)} completed request(s)</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Total Requests</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatCompactNumber(keyMetrics.total || 0)}</p>
            <p className="mt-1 text-xs text-slate-500">Tracked within the selected date range</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Pending Requests</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatCompactNumber(keyMetrics.pending || 0)}</p>
            <p className="mt-1 text-xs text-slate-500">Requests still waiting for action or closure</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Available Technicians</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatCompactNumber(keyMetrics.technicians || 0)}</p>
            <p className="mt-1 text-xs text-slate-500">Field staff currently counted in operations</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Avg Response Time</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{Number(keyMetrics.avgResponse || 0).toFixed(1)}h</p>
            <p className="mt-1 text-xs text-slate-500">Request creation to technician assignment</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Avg Completion Time</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{Number(keyMetrics.avgCompletion || 0).toFixed(1)}h</p>
            <p className="mt-1 text-xs text-slate-500">Work start to completed ticket timestamp</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold text-emerald-700">Estimated Completed Service Value</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatPeso(completedServiceValue?.totalEstimatedValue, true)}</p>
            <p className="mt-1 text-xs text-slate-500">Completed tickets x configured service price; not payment received</p>
          </div>
        </div>

      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MiniTrendCard
          label="Completed Jobs"
          value={formatCompactNumber(keyMetrics.completed || 0)}
          helper="Completed service requests across the recent monthly periods shown below"
          badge={`${completionRate}% rate`}
          data={completionSeries}
          color="#10b981"
          fill="#bbf7d0"
          showAxes
          axisMode="monthly"
          axisLabel="Completion month"
        />
        <MiniTrendCard
          label="7-Day Forecast"
          value={formatCompactNumber(totalPredicted)}
          helper={busiestDay ? `Showing the next ${forecastDays.length} forecast day(s), with the highest on ${busiestDay.label}` : `Showing the next ${forecastDays.length} forecast day(s)`}
          badge={`${forecastDays.length}-day view`}
          data={forecastSeries}
          color="#2563eb"
          fill="#bfdbfe"
          showAxes
          axisMode="daily"
          axisLabel="Forecast date"
        />
        <MiniTrendCard
          label="Top Service"
          value={topService?.serviceType || 'None yet'}
          helper={topService ? `${topService.predictedNext7Days || 0} forecasted requests for this service in the next 7 days` : 'Highest-demand service forecast will appear once enough request history exists'}
          badge={capacityGap > 0 ? `${capacityGap} gap` : 'Balanced'}
          data={forecastSeries}
          color="#8b5cf6"
          fill="#ddd6fe"
          showAxes
          axisMode="daily"
          axisLabel="Forecast date"
        />
        <MiniTrendCard
          label="Action Signals"
          value={formatCompactNumber(openSignals)}
          helper={capacityGap > 0 ? `${capacityGap} technician capacity gap detected across forecasted workload` : 'Open items across SLA, stock, maintenance, and schedule monitoring'}
          badge={openSignals ? 'Watchlist' : 'Stable'}
          data={signalSeries}
          color={openSignals ? '#f59e0b' : '#10b981'}
          fill={openSignals ? '#fde68a' : '#bbf7d0'}
          showAxes
          axisLabel="Signal category"
        />
      </div>

      <div className="2xl:col-span-2">
        <CompactDonutPanel
          title="Ticket Count by Top Workflow Statuses"
          description="Ticket counts grouped by workflow status for tickets touched within the selected date range."
          centerLabel="Lead Status"
          centerValue={statusChartData[0]?.name || 'None'}
          data={statusChartData}
          colors={statusChartData.map((entry) => entry.color)}
          showCenter={false}
        />
      </div>
    </section>
  );
}

function MostActiveTechniciansRanking() {
  const [metric, setMetric] = useState('total');
  const [layout, setLayout] = useState('stacked');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Date filter state specifically for this component
  const [filterDays, setFilterDays] = useState(30);
  const [startDate, setStartDate] = useState(() => getPresetStartDate(30));
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));

  const handleDateRangeChange = (field, value) => {
    const nextStart = field === 'start' ? value : startDate;
    const nextEnd = field === 'end' ? value : endDate;
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setFilterDays(getInclusiveDays(nextStart, nextEnd));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get('/services/technician-performance/performance_breakdown/', {
      params: { days: filterDays, start_date: startDate, end_date: endDate },
    }).then((res) => {
      if (active) { setData(res.data); setLoading(false); }
    }).catch(() => {
      if (active) { setData([]); setLoading(false); }
    });
    return () => { active = false; };
  }, [filterDays, startDate, endDate]);

  const sortKey = metric === 'total' ? 'total_jobs' : metric === 'completed' ? 'completed_jobs' : 'active_jobs';

  const topTechnicians = Array.isArray(data)
    ? [...data]
      .sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0))
      .slice(0, 5)
      .map((tech, index) => ({
        ...tech,
        chartKey: `technician_${tech.technician_id || index}`,
        displayName: tech.display_name || tech.full_name || tech.name || tech.username || 'Technician',
      }))
    : [];

  const metricField = metric === 'total' ? 'total_jobs' : metric === 'completed' ? 'completed_jobs' : 'active_jobs';

  const monthLabels = Array.from(new Set(
    topTechnicians.flatMap((tech) => (tech.monthly_activity || []).map((month) => month.label))
  ));

  const chartData = monthLabels.map((label) => {
    const row = { label };
    topTechnicians.forEach((tech) => {
      const month = (tech.monthly_activity || []).find((entry) => entry.label === label);
      row[tech.chartKey] = Number(month?.[metricField] ?? month?.total_jobs ?? 0);
    });
    return row;
  });

  if (!loading && (!topTechnicians.length || !chartData.length)) {
    return <EmptyChart title="No technician activity yet" description="Monthly technician activity will appear once jobs are assigned or completed." />;
  }

  const colors = ['#2563eb', '#14b8a6', '#f97316', '#8b5cf6', '#64748b'];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Monthly Job Count for Most Active Technicians</h3>
          <p className="mt-1 text-xs text-slate-500">Monthly technician workload, showing total, completed, or active jobs for the most active technicians.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            From
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => handleDateRangeChange('start', event.target.value)}
              className="h-6 border-0 bg-transparent p-0 text-xs font-semibold normal-case tracking-normal text-slate-800 outline-none"
            />
          </label>
          <label className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            To
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              max={toDateInputValue(new Date())}
              onChange={(event) => handleDateRangeChange('end', event.target.value)}
              className="h-6 border-0 bg-transparent p-0 text-xs font-semibold normal-case tracking-normal text-slate-800 outline-none"
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {topTechnicians.map((tech, index) => (
            <span key={tech.chartKey} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              {tech.displayName}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PillToggle
            options={[
              { label: 'Total', value: 'total' },
              { label: 'Completed', value: 'completed' },
              { label: 'Active', value: 'active' },
            ]}
            value={metric}
            onChange={setMetric}
          />
          <PillToggle
            options={[
              { label: 'Stacked', value: 'stacked' },
              { label: 'Grouped', value: 'grouped' },
            ]}
            value={layout}
            onChange={setLayout}
          />
        </div>
      </div>
      <div className="mt-3 h-[300px] min-w-0">
        <ChartContainer>
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} maxBarSize={60}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<AnalyticsTooltip />} />
            {topTechnicians.map((tech, index) => (
              <Bar
                key={tech.chartKey}
                dataKey={tech.chartKey}
                name={tech.displayName}
                stackId={layout === 'stacked' ? 'technicians' : undefined}
                fill={colors[index % colors.length]}
                radius={layout === 'stacked' && index === topTechnicians.length - 1 ? [6, 6, 0, 0] : [4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </div>
    </section>
  );
}

function OperationalFocusPanel({ segments }) {
  const safe = Array.isArray(segments)
    ? segments
      .filter((segment) => Number(segment.value || 0) > 0)
      .sort((left, right) => Number(right.value || 0) - Number(left.value || 0))
    : [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-lg font-semibold text-slate-900">Operational Issue Counts Requiring Review</h3>
      <p className="mt-1 text-xs text-slate-500">
        Separate signals to review today. A single ticket can appear in more than one line.
      </p>

      <div className="mt-5 space-y-2">
        {safe.length ? safe.map((segment) => (
          <div
            key={segment.label}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{segment.label}</p>
                {segment.description ? (
                  <p className="mt-0.5 text-xs text-slate-500">{segment.description}</p>
                ) : null}
              </div>
            </div>
            <span
              className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: segment.color }}
            >
              {formatCompactNumber(segment.value)}
            </span>
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No priority signals right now.
          </div>
        )}
      </div>
    </div>
  );
}

function OperationalFocusDonut({ segments }) {
  const chartData = Array.isArray(segments)
    ? segments
      .filter((segment) => Number(segment.value || 0) > 0)
      .map((segment) => ({
        name: segment.label,
        value: Number(segment.value || 0),
        color: segment.color,
      }))
    : [];

  if (!chartData.length) {
    return <EmptyChart title="No active risk signals" description="SLA, inventory, maintenance, and schedule queues are currently clear." />;
  }

  return (
    <CompactDonutPanel
      title="Operational Issue Count by Category"
      description="Count share of active issues needing attention across SLA, inventory, maintenance, and scheduling."
      centerLabel="Priority"
      centerValue={chartData[0]?.name || 'Stable'}
      data={chartData}
      colors={chartData.map((entry) => entry.color)}
    />
  );
}

/* ─── Monthly Request Trend ─── */
function MonthlyServiceChart({ data, filterDays, timelineView = 'balanced' }) {
  const [chartType, setChartType] = useState('line');
  const timelineConfig = TIMELINE_VIEW_CONFIG[timelineView] || TIMELINE_VIEW_CONFIG.balanced;
  const chartData = Array.isArray(data)
    ? data.slice(-timelineConfig.trendPeriods).map((item) => ({
      label: item.label,
      'Requests Created': Number(item.requestCount || 0),
      'Requests Completed': Number(item.completedCount || 0),
      'Net Difference': Number(item.requestCount || 0) - Number(item.completedCount || 0),
    }))
    : [];
  const totalCreated = chartData.reduce((sum, item) => sum + item['Requests Created'], 0);
  const totalCompleted = chartData.reduce((sum, item) => sum + item['Requests Completed'], 0);
  const netDifference = totalCreated - totalCompleted;

  if (!chartData.length) {
    const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';
    return <EmptyChart title="Monthly trend unavailable" description={`No request history in the last ${periodLabel}.`} />;
  }

  return (
    <ChartFrame
      title="Demand vs Delivery Comparison by Period"
      description={`Compares requests created with tickets completed. Net Difference means created minus completed for each period; it is not a backlog count. Uses the ${timelineConfig.label.toLowerCase()} lens.`}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700">{totalCreated} created</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">{totalCompleted} completed</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">{netDifference >= 0 ? '+' : ''}{netDifference} net</span>
          <PillToggle
            options={[
              { label: 'Line', value: 'line' },
              { label: 'Bar', value: 'bar' },
            ]}
            value={chartType}
            onChange={setChartType}
          />
        </div>
      }
    >
      <ChartContainer>
        {chartType === 'line' ? (
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} label={{ value: 'Recorded month / period', position: 'insideBottom', offset: -14, fill: '#64748b', fontSize: 11 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend iconType="circle" />
            <Line type="monotone" dataKey="Requests Created" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="Requests Completed" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="Net Difference" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 24 }} maxBarSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} label={{ value: 'Recorded month / period', position: 'insideBottom', offset: -14, fill: '#64748b', fontSize: 11 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend iconType="circle" />
            <Bar dataKey="Requests Created" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Requests Completed" fill="#10b981" radius={[6, 6, 0, 0]} />
          </BarChart>
        )}
      </ChartContainer>
    </ChartFrame>
  );
}

/* ─── Top Services Bar ─── */
function ServiceBarChart({ data, filterDays }) {
  const [sortBy, setSortBy] = useState('requests');
  const rawData = Array.isArray(data)
    ? data.map((item) => ({
      service: item.serviceType || item.name || 'Unknown',
      'Request Count': Number(item.requestCount ?? item.count ?? 0),
      'Completed Jobs': Number(item.completedCount ?? item.completedRequests ?? 0),
      Rate: Number(item.requestCount ?? item.count ?? 0)
        ? Math.round((Number(item.completedCount ?? item.completedRequests ?? 0) / Number(item.requestCount ?? item.count ?? 1)) * 100)
        : 0,
    }))
    : [];

  const sortedData = [...rawData].sort((a, b) =>
    sortBy === 'requests' ? b['Request Count'] - a['Request Count']
    : sortBy === 'completed' ? b['Completed Jobs'] - a['Completed Jobs']
    : b.Rate - a.Rate
  ).slice(0, 6);

  if (!sortedData.length) {
    const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';
    return <EmptyChart title="Top services unavailable" description={`No service requests in the last ${periodLabel}.`} />;
  }

  return (
    <ChartFrame
      title="Service Request Count by Service Type"
      description="Service types ranked by request count, with completed job count shown for comparison."
      right={
        <PillToggle
          options={[
            { label: 'Request Count', value: 'requests' },
            { label: 'Completed Jobs', value: 'completed' },
            { label: 'Completion Rate %', value: 'rate' },
          ]}
          value={sortBy}
          onChange={setSortBy}
        />
      }
    >
      <ChartContainer>
        <BarChart data={sortedData} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="service" width={140} tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip content={<AnalyticsTooltip />} />
          <Legend iconType="circle" />
          <Bar dataKey="Request Count" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
          <Bar dataKey="Completed Jobs" fill="#10b981" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartFrame>
  );
}

/* ─── 7-Day Demand Forecast ─── */
function CompletedServiceValuePanel({ data }) {
  const monthlyTrend = Array.isArray(data?.monthlyTrend) ? data.monthlyTrend : [];
  const byService = Array.isArray(data?.byService) ? data.byService : [];
  const period = data?.periodStartDate && data?.periodEndDate
    ? `${formatTimelineLabel(data.periodStartDate, 'daily')} - ${formatTimelineLabel(data.periodEndDate, 'daily')}`
    : 'Selected date range';

  if (!monthlyTrend.length && !byService.length) {
    return <EmptyChart title="No completed service value yet" description="This estimate appears when completed tickets have a service type with a configured estimated cost." />;
  }

  const serviceChart = byService.map((item) => ({
    service: item.serviceType,
    'Estimated Value': Number(item.estimatedValue || 0),
    'Completed Tickets': Number(item.completedTickets || 0),
  }));

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Service Value Estimate</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Estimated Completed Service Value</h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">{data?.definition}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">{period}</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-700">Total Estimated Value</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatPeso(data?.totalEstimatedValue)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-500">Completed Tickets Priced</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatCompactNumber(data?.completedTickets || 0)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-500">Average Value per Completed Ticket</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatPeso(data?.averageValuePerCompletedTicket)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Estimated value by completion month</p>
          <p className="mt-1 text-xs text-slate-500">X-axis: completion month. Y-axis: estimated service value in Philippine pesos.</p>
          <div className="mt-3 h-[260px] min-w-0">
            <ChartContainer>
              <AreaChart data={monthlyTrend} margin={{ top: 8, right: 12, left: 10, bottom: 24 }}>
                <defs>
                  <linearGradient id="serviceValueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Completion month', position: 'insideBottom', offset: -14, fill: '#64748b', fontSize: 10 }} />
                <YAxis tickFormatter={(value) => formatPeso(value, true)} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={68} />
                <Tooltip formatter={(value, name) => [name === 'estimatedValue' ? formatPeso(value) : value, name === 'estimatedValue' ? 'Estimated Value' : name]} labelFormatter={(label) => `Completion month: ${label}`} />
                <Area type="monotone" dataKey="estimatedValue" name="Estimated Value" stroke="#059669" strokeWidth={3} fill="url(#serviceValueFill)" dot={{ r: 4 }} />
              </AreaChart>
            </ChartContainer>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-900">Estimated value by completed service type</p>
          <p className="mt-1 text-xs text-slate-500">Service types ranked by completed-ticket value; hover to see the exact peso estimate.</p>
          <div className="mt-3 h-[260px] min-w-0">
            <ChartContainer>
              <BarChart data={serviceChart} layout="vertical" margin={{ top: 8, right: 18, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => formatPeso(value, true)} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="service" width={135} tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value, name) => [name === 'Estimated Value' ? formatPeso(value) : value, name]} />
                <Bar dataKey="Estimated Value" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        </div>
      </div>
    </section>
  );
}

function ForecastAreaChart({ data, serviceForecast, filterDays, timelineView = 'balanced' }) {
  const timelineConfig = TIMELINE_VIEW_CONFIG[timelineView] || TIMELINE_VIEW_CONFIG.balanced;
  const chartData = Array.isArray(data)
    ? data.slice(0, timelineConfig.forecastDays).map((item) => ({
      label: item.label,
      date: item.date,
      'Trend-Based Forecasted Requests': Number(item.predictedRequests || 0),
      demandLevel: item.demandLevel,
    }))
    : [];
  const serviceData = Array.isArray(serviceForecast) ? serviceForecast : [];

  if (!chartData.length) {
    const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';
    return <EmptyChart title="Forecast unavailable" description={`Forecast requires historical data from the last ${periodLabel}.`} />;
  }

  const busiest = [...chartData].sort((a, b) => Number(b['Trend-Based Forecasted Requests'] || 0) - Number(a['Trend-Based Forecasted Requests'] || 0))[0];

  // Calculate capacity info from service forecast
  const totalCapacityGap = serviceData.reduce((sum, s) => sum + (Number(s.capacityGap || 0)), 0);
  const highRiskServices = serviceData.filter((s) => s.riskLevel === 'high').length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">Trend-Based Demand Forecast</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${demandTone[busiest?.demandLevel] || 'bg-slate-100 text-slate-700'}`}>
          Highest forecast day: {busiest?.label || 'N/A'}
        </span>
      </div>

      <div className="mt-4">
        <p className="mb-3 text-xs text-slate-500">Trend-based forecasted request count for the next {chartData.length} day(s), using recent request history and short-term demand movement.</p>
        <div className="h-[220px] min-w-0 sm:h-[260px]">
          <ChartContainer>
            <AreaChart data={chartData} margin={{ top: 8, right: 18, left: -20, bottom: 24 }}>
              <defs>
                <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} label={{ value: 'Forecast date', position: 'insideBottom', offset: -14, fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<AnalyticsTooltip />} />
              <Area type="monotone" dataKey="Trend-Based Forecasted Requests" stroke="#2563eb" strokeWidth={3} fill="url(#forecastFill)" />
              {busiest ? <ReferenceDot x={busiest.label} y={busiest['Trend-Based Forecasted Requests']} r={6} fill="#f97316" stroke="#fff" strokeWidth={2} /> : null}
            </AreaChart>
          </ChartContainer>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {chartData.slice(0, Math.min(3, chartData.length)).map((item) => (
          <div key={item.date || item.label} className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-xs font-medium text-slate-600">{item.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{item['Trend-Based Forecasted Requests'] || 0}</p>
            <p className="text-[11px] text-slate-400">trend-based forecasted service requests</p>
          </div>
        ))}
      </div>

      {(totalCapacityGap > 0 || highRiskServices > 0) && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-semibold text-amber-900">Capacity Alert</p>
          <div className="mt-2 space-y-1 text-xs text-amber-800">
            {totalCapacityGap > 0 && (
              <p><strong>{totalCapacityGap} technician{totalCapacityGap !== 1 ? 's' : ''} needed</strong> to handle forecasted demand</p>
            )}
            {highRiskServices > 0 && (
              <p><strong>{highRiskServices} service type{highRiskServices !== 1 ? 's' : ''}</strong> at high risk of insufficient capacity</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Seasonal Inventory Demand ─── */
function LocationDemandForecast({ data }) {
  const chartData = Array.isArray(data?.hotspots)
    ? data.hotspots.slice(0, 6).map((spot) => ({
      location: spot.label || 'Unknown',
      'Projected 7-Day Requests': Number(spot.projectedNext7Days || 0),
      'Recent Request Count': Number(spot.recentRequests || 0),
      Heatmap: Number(spot.completedHeatmapCount || 0),
      riskLevel: spot.riskLevel || 'low',
    }))
    : [];

  if (!chartData.length) {
    return <EmptyChart title="Location demand forecast unavailable" description="The system needs service requests with mapped locations before it can forecast location demand." />;
  }

  return (
    <ChartFrame
      title="Projected Request Count by Location"
      description={`Trend-based projected request count by location for the next ${data?.forecastWindowDays || 7} days, using request history and completed-job density.`}
      right={
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          {data?.totalProjectedRequests || 0} projected 7-day requests
        </span>
      }
    >
      <ChartContainer>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="location" width={230} tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip content={<AnalyticsTooltip />} />
          <Legend iconType="circle" />
          <Bar dataKey="Projected 7-Day Requests" fill="#2563eb" radius={[0, 6, 6, 0]} />
          <Bar dataKey="Recent Request Count" fill="#14b8a6" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartFrame>
  );
}

function SeasonalInventoryDemand({ data, filterDays }) {
  const topItems = Array.isArray(data?.topItems) ? data.topItems : [];
  const categories = Array.isArray(data?.categoryDemand) ? data.categoryDemand : [];
  const totalTransactions = data?.totalTransactions ?? 0;
  const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';

  const hasData = (topItems.length > 0 || categories.length > 0) && totalTransactions > 0;

  if (!hasData) {
    return <EmptyChart title="Inventory analysis unavailable" description={`No inventory transactions in the last ${periodLabel}. Usage data will appear when items are consumed.`} />;
  }

  const demandColors = {
    High: '#ef4444',
    Medium: '#f59e0b',
    Low: '#10b981',
  };

  const demandBgColors = {
    High: 'bg-red-50 border-red-200',
    Medium: 'bg-amber-50 border-amber-200',
    Low: 'bg-green-50 border-green-200',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-lg font-semibold text-slate-900">Seasonal Inventory Demand</h3>
      <p className="mt-1 text-xs text-slate-500">Inventory quantities consumed in the last {periodLabel}, showing which items and categories may need replenishment.</p>

      <div className="mt-5 h-[220px] min-w-0 sm:h-[240px]">
        <ChartContainer>
          <BarChart
            data={categories.slice(0, 6).map((cat) => ({
              category: cat.category,
              Quantity: Number(cat.quantity || 0),
            }))}
            margin={{ top: 4, right: 16, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="category" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<AnalyticsTooltip />} />
            <Bar dataKey="Quantity" fill="#14b8a6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 lg:gap-5">
        {/* Top Items */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Top Items in Demand</h4>
          <div className="space-y-2">
            {topItems.slice(0, 5).map((item) => (
              <div key={item.item} className={`rounded-lg border p-3 ${demandBgColors[item.demand]}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{item.item}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{item.category}</p>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: demandColors[item.demand] }}
                  >
                    {item.demand}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  <strong>{item.quantity}</strong> units used (<strong>{item.transactions}</strong> transactions)
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* By Category */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Demand by Category</h4>
          <div className="space-y-2">
            {categories.slice(0, 5).map((cat) => (
              <div key={cat.category} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{cat.category}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{cat.itemCount} items</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{cat.quantity}</p>
                    <p className="text-xs text-slate-500">units</p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                  <div
                    className="h-1.5 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(100, (cat.quantity / Math.max(...categories.map(c => c.quantity), 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Technician Performance Table ─── */
function TechnicianPerformanceTable({ data, filterDays }) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('total_jobs');
  const [sortDir, setSortDir] = useState('desc');
  const hasData = Array.isArray(data) && data.length > 0;

  if (!hasData) {
    const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';
    return <EmptyChart title="No performance data" description={`No completed jobs in the last ${periodLabel}. Data will appear once technicians complete work.`} />;
  }

  const toggleSort = (col) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const filtered = data
    .filter((tech) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (tech.username || '').toLowerCase().includes(q) ||
        (tech.display_name || '').toLowerCase().includes(q) ||
        (tech.skills || []).some((s) => s.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      const av = Number(a[sortCol] || 0);
      const bv = Number(b[sortCol] || 0);
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  const chartData = filtered.slice(0, 8).map((tech) => ({
    technician: tech.username,
    Active: Number(tech.active_jobs || 0),
    Completed: Number(tech.completed_jobs || 0),
    Total: Number(tech.total_jobs || 0),
  }));

  const sortIcon = (col) => {
    if (sortCol !== col) return '';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Technician Performance Monitoring</h3>
          <p className="mt-1 text-xs text-slate-500">Per-technician completed jobs, response time, completion time, satisfaction, and travel efficiency in the selected period.</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search technician or skill…"
          className="h-9 w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>
      <div className="mt-4 h-[220px] min-w-0 sm:h-[260px]">
        <ChartContainer>
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} maxBarSize={48}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="technician" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend iconType="circle" />
            <Bar dataKey="Active" stackId="jobs" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Completed" stackId="jobs" fill="#10b981" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>
      <div className="mt-4 grid gap-3 lg:hidden">
        {filtered.map((tech) => (
          <div key={tech.technician_id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900">{tech.username}</div>
                <div className="text-xs font-semibold text-slate-400">{formatTechnicianId(tech.technician_id)}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                tech.is_available ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {tech.is_available ? 'Available' : 'Busy'}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Active</p>
                <p className="mt-1 font-semibold text-slate-900">{tech.active_jobs}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Completed</p>
                <p className="mt-1 font-semibold text-slate-900">{tech.completed_jobs}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Avg Duration</p>
                <p className="mt-1 font-semibold text-slate-900">{tech.avg_duration_hours ? `${tech.avg_duration_hours}h` : '-'}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Avg Response</p>
                <p className="mt-1 font-semibold text-slate-900">{tech.avg_response_hours ? `${tech.avg_response_hours}h` : '-'}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {(tech.skills || []).slice(0, 4).map((skill) => (
                <span key={skill} className="rounded bg-white px-2 py-0.5 text-[10px] text-slate-600">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 hidden overflow-x-auto lg:block">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Technician</th>
              <th className="px-3 py-2.5 cursor-pointer select-none hover:text-slate-800" onClick={() => toggleSort('active_jobs')}>Active{sortIcon('active_jobs')}</th>
              <th className="px-3 py-2.5 cursor-pointer select-none hover:text-slate-800" onClick={() => toggleSort('completed_jobs')}>Completed{sortIcon('completed_jobs')}</th>
              <th className="px-3 py-2.5 cursor-pointer select-none hover:text-slate-800" onClick={() => toggleSort('total_jobs')}>Total{sortIcon('total_jobs')}</th>
              <th className="px-3 py-2.5 cursor-pointer select-none hover:text-slate-800" onClick={() => toggleSort('avg_duration_hours')}>Avg Duration{sortIcon('avg_duration_hours')}</th>
              <th className="px-3 py-2.5 cursor-pointer select-none hover:text-slate-800" onClick={() => toggleSort('avg_response_hours')}>Avg Response{sortIcon('avg_response_hours')}</th>
              <th className="px-3 py-2.5 cursor-pointer select-none hover:text-slate-800" onClick={() => toggleSort('avg_rating')}>Rating{sortIcon('avg_rating')}</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Skills</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tech) => (
              <tr key={tech.technician_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-slate-900">{tech.username}</div>
                  <div className="text-xs font-semibold text-slate-400">{formatTechnicianId(tech.technician_id)}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    {tech.active_jobs}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {tech.completed_jobs}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{tech.total_jobs}</td>
                <td className="px-3 py-2.5 text-slate-600">{tech.avg_duration_hours ? `${tech.avg_duration_hours}h` : '-'}</td>
                <td className="px-3 py-2.5 text-slate-600">{tech.avg_response_hours ? `${tech.avg_response_hours}h` : '-'}</td>
                <td className="px-3 py-2.5">
                  {tech.avg_rating ? (
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      tech.avg_rating >= 4 ? 'bg-emerald-100 text-emerald-700' :
                      tech.avg_rating >= 3 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      ★ {tech.avg_rating}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    tech.is_available ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tech.is_available ? 'Available' : 'Busy'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {(tech.skills || []).slice(0, 3).map((skill) => (
                      <span key={skill} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {skill}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [techPerformance, setTechPerformance] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState('overview');
  const [timelineView, setTimelineView] = useState('balanced');

  // Date filter state
  const [filterDays, setFilterDays] = useState(30);
  const [startDate, setStartDate] = useState(() => getPresetStartDate(30));
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));

  const handleDateRangeChange = (field, value) => {
    const nextStart = field === 'start' ? value : startDate;
    const nextEnd = field === 'end' ? value : endDate;
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setFilterDays(getInclusiveDays(nextStart, nextEnd));
  };

  const loadAnalytics = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setError('');
      const [analyticsData, dashboardData, techPerformanceResponse] = await Promise.all([
        fetchAdminAnalytics({ days: filterDays, startDate, endDate }),
        fetchDashboardStats('admin'),
        api.get('/services/technician-performance/performance_breakdown/', {
          params: { days: filterDays, start_date: startDate, end_date: endDate },
        }),
      ]);
      setAnalytics(analyticsData || {});
      setDashboardStats(dashboardData || {});
      setTechPerformance(Array.isArray(techPerformanceResponse?.data) ? techPerformanceResponse.data : []);
      setLastUpdated(analyticsData?.generatedAt || new Date().toISOString());

    } catch (err) {
      setError(err.message || 'Unable to load admin analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalytics();

    const intervalId = window.setInterval(() => {
      loadAnalytics({ silent: true });
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [filterDays, startDate, endDate]);

  const overview = analytics?.overview || {};
  const monthlyServiceTrend = Array.isArray(analytics?.monthlyServiceTrend) ? analytics.monthlyServiceTrend : [];
  const topServices = Array.isArray(analytics?.topRequestedServiceTypes) && analytics.topRequestedServiceTypes.length
    ? analytics.topRequestedServiceTypes
    : (Array.isArray(analytics?.jobCountByService) ? analytics.jobCountByService : []);
  const dailyForecast = Array.isArray(analytics?.dailyForecast) ? analytics.dailyForecast : [];
  const serviceForecast = Array.isArray(analytics?.serviceForecasts) ? analytics.serviceForecasts : [];
  const busiestMonths = Array.isArray(analytics?.busiestMonths) ? analytics.busiestMonths : [];
  const busiestWeeks = Array.isArray(analytics?.busiestWeeks) ? analytics.busiestWeeks : [];
  const cityCompletionTrends = Array.isArray(analytics?.cityCompletionTrends) ? analytics.cityCompletionTrends : [];
  const provinceCompletionTrends = Array.isArray(analytics?.provinceCompletionTrends) ? analytics.provinceCompletionTrends : [];
  const requestSourceBreakdown = Array.isArray(analytics?.requestSourceBreakdown) ? analytics.requestSourceBreakdown : [];
  const priorityDistribution = analytics?.priorityDistribution || {};
  const ticketStatusBreakdown = Array.isArray(analytics?.ticketStatusBreakdown) ? analytics.ticketStatusBreakdown : [];
  const schedulingInsights = analytics?.schedulingInsights || {};
  const predictiveSummary = analytics?.predictiveSummary || {};
  const locationDemandForecast = analytics?.locationDemandForecast || {};
  const seasonalInventoryDemand = analytics?.seasonalInventoryDemand || {};
  const completedServiceValue = analytics?.completedServiceValue || {};
  const topTech = analytics?.topTech || null;
  const pendingRequests = Array.isArray(dashboardStats?.pending_requests) ? dashboardStats.pending_requests : [];
  const clientSchedule = Array.isArray(dashboardStats?.client_schedule) ? dashboardStats.client_schedule : [];
  const slaOverview = dashboardStats?.sla_overview || {};
  const dashOverview = dashboardStats?.overview || {};
  const pendingApprovalsCount = Number(dashOverview.pending_approvals ?? pendingRequests.length ?? 0);
  const scheduledJobsCount = Number(dashOverview.scheduled_jobs ?? clientSchedule.length ?? 0);

  /* Data for the new Key Metrics bar chart */
  const keyMetricsData = {
    total: analytics?.totalRequests ?? overview.totalRequests ?? 0,
    completed: analytics?.completedRequests ?? overview.completedRequests ?? 0,
    pending: analytics?.pendingRequests ?? overview.pendingRequests ?? 0,
    technicians:
      analytics?.availableTechnicians
      ?? overview.availableTechnicians
      ?? dashOverview.active_technicians
      ?? analytics?.activeTechnicians
      ?? overview.activeTechnicians
      ?? 0,
    avgResponse: analytics?.avgResponseTime ?? overview.avgResponseTimeHours ?? 0,
    avgCompletion: analytics?.avgCompletionTime ?? overview.avgCompletionTimeHours ?? 0,
  };

  /* Data for Operational Focus signals */
  const focusSegments = [
    {
      label: 'Overdue SLA',
      value: Number(slaOverview.overdue_count || 0),
      color: '#ef4444',
      description: 'Requests or tickets already outside their tracked SLA window.'
    },
    {
      label: 'Warning SLA',
      value: Number(slaOverview.warning_count || 0),
      color: '#f97316',
      description: 'Items approaching an SLA breach soon.'
    },
    {
      label: 'Low Stock',
      value: Number(dashOverview.low_stock_items || 0),
      color: '#f59e0b',
      description: 'Inventory items at or below the minimum stock threshold.'
    },
    {
      label: 'Due Maintenance',
      value: Number(dashOverview.due_maintenance || 0),
      color: '#8b5cf6',
      description: 'Maintenance records currently marked due.'
    },
    {
      label: 'Pending Approvals',
      value: pendingApprovalsCount,
      color: '#0ea5e9',
      description: 'Service requests still waiting for admin approval.'
    },
    {
      label: 'Scheduled Jobs',
      value: scheduledJobsCount,
      color: '#06b6d4',
      description: 'Active tickets with a scheduled visit date on the admin board.'
    }
  ];

  const workspaceOptions = [
    { label: 'Demand & Value', value: 'overview' },
    { label: 'Operations & Risk', value: 'operations' },
    { label: 'Coverage & Team', value: 'coverage' },
  ];
  const timelineOptions = [
    { label: 'Recent', value: 'recent' },
    { label: 'Balanced', value: 'balanced' },
    { label: 'Extended', value: 'extended' },
  ];

  const workspaceMeta = {
    overview: {
      title: 'Demand, completed service value, and forecast',
      description: 'Explains what customers requested, what work was completed, its estimated configured value, and what demand is expected next.',
    },
    operations: {
      title: 'Workflow status and operational pressure',
      description: 'Shows ticket status, schedule pressure, risk signals, and operational bottlenecks in the selected date range.',
    },
    coverage: {
      title: 'Geographic demand and technician performance',
      description: 'Shows regional demand, completion trends by location, and technician workload and performance output.',
    },
  };
  const timelineConfig = TIMELINE_VIEW_CONFIG[timelineView] || TIMELINE_VIEW_CONFIG.balanced;
  const visibleTrendPeriods = Math.min(monthlyServiceTrend.length || 0, timelineConfig.trendPeriods);
  const visibleForecastDays = Math.min(dailyForecast.length || 0, timelineConfig.forecastDays);

  return (
    <Layout>
      <div className="space-y-4 pb-4 lg:space-y-5">
        {/* ── Header with date filters ── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">

        {/* ── Date Filter Bar ── */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <label className="flex h-10 min-w-[152px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:flex-none">
                From
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(event) => handleDateRangeChange('start', event.target.value)}
                  className="h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none"
                />
              </label>
              <label className="flex h-10 min-w-[152px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:flex-none">
                To
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  max={toDateInputValue(new Date())}
                  onChange={(event) => handleDateRangeChange('end', event.target.value)}
                  className="h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none"
                />
              </label>
              {/* Quick preset buttons */}
              <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1">
                {[
                  { label: '7D', days: 7 },
                  { label: '30D', days: 30 },
                  { label: '90D', days: 90 },
                  { label: '1Y', days: 365 },
                  { label: '3Y', days: 1095 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const newStart = getPresetStartDate(preset.days);
                      const newEnd = toDateInputValue(new Date());
                      setStartDate(newStart);
                      setEndDate(newEnd);
                      setFilterDays(preset.days);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                      filterDays === preset.days
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Timeline</span>
                <PillToggle options={timelineOptions} value={timelineView} onChange={setTimelineView} />
              </div>
              <button
                type="button"
                onClick={() => loadAnalytics({ silent: true })}
                disabled={refreshing}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FiRefreshCw className={refreshing ? 'animate-spin' : ''} size={14} />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <FiveAnalyticsCards
          keyMetrics={keyMetricsData}
          dailyForecast={dailyForecast}
          serviceForecast={serviceForecast}
          focusSegments={focusSegments}
          monthlyServiceTrend={monthlyServiceTrend}
          ticketStatusBreakdown={ticketStatusBreakdown}
          completedServiceValue={completedServiceValue}
          timelineView={timelineView}
        />

        <AnalyticsInsightStrip
          dailyForecast={dailyForecast}
          serviceForecast={serviceForecast}
          predictiveSummary={predictiveSummary}
          focusSegments={focusSegments}
        />

        {/* ── Row 1: Key Metrics bar + Operational Focus signals ── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">Analytics Workspace</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{workspaceMeta[activeWorkspace].title}</h3>
              <p className="mt-1 text-sm text-slate-500">{workspaceMeta[activeWorkspace].description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <TimelineLensSummary
                timelineView={timelineView}
                periodCount={visibleTrendPeriods}
                forecastCount={visibleForecastDays}
              />
              <PillToggle options={workspaceOptions} value={activeWorkspace} onChange={setActiveWorkspace} />
            </div>
          </div>
        </section>

        {activeWorkspace === 'overview' ? (
        <>
        <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
          <MonthlyServiceChart data={monthlyServiceTrend} filterDays={filterDays} timelineView={timelineView} />
          <ServiceBarChart data={topServices} filterDays={filterDays} />
        </div>

        <CompletedServiceValuePanel data={completedServiceValue} />

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)] 2xl:gap-5">
          <ForecastAreaChart data={dailyForecast} serviceForecast={serviceForecast} filterDays={filterDays} timelineView={timelineView} />
          <ServiceForecastTable data={serviceForecast} />
        </div>

        <TopPerformerSummary
          topTech={topTech}
          overview={overview}
          predictiveSummary={predictiveSummary}
        />

        <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
          <SourceBreakdownPanel data={requestSourceBreakdown} />
          <PriorityDistributionPanel data={priorityDistribution} />
        </div>

        </>
        ) : null}

        {activeWorkspace === 'operations' ? (
        <>
        <div className="grid gap-4 2xl:grid-cols-[minmax(22rem,0.8fr)_minmax(0,1.2fr)] 2xl:gap-5">
          <OperationalFocusPanel segments={focusSegments} />
          <OperationalFocusDonut segments={focusSegments} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
          <TicketStatusBreakdownPanel data={ticketStatusBreakdown} />
          <SchedulingInsightsPanel data={schedulingInsights} />
        </div>

        <BusiestPeriodsPanel
          busiestMonths={busiestMonths}
          busiestWeeks={busiestWeeks}
          timelineView={timelineView}
        />

        <SeasonalInventoryDemand data={seasonalInventoryDemand} filterDays={filterDays} />

        </>
        ) : null}

        {activeWorkspace === 'coverage' ? (
        <>

        <LocationDemandForecast data={locationDemandForecast} />

        <RegionalCompletionTables
          cityTrends={cityCompletionTrends}
          provinceTrends={provinceCompletionTrends}
        />

        <MostActiveTechniciansRanking />

        <TechnicianPerformanceTable data={techPerformance} filterDays={filterDays} />
        </>
        ) : null}


        {/* ── Row 2: Monthly trend + Top services ── */}

        {/* ── Row 3: Forecast (full width) ── */}


        {/* ── Row 4: Technician Performance Monitoring ── */}

        {/* ── Row 5: Seasonal Inventory Demand ── */}

        {loading && !analytics ? (
          <PageSkeleton rows={6} />
        ) : null}
      </div>
    </Layout>
  );
}

