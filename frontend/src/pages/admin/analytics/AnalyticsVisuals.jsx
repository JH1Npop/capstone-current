import { CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { shortDate } from './analyticsFormat';

const palette = ['#2563eb', '#0891b2', '#10b981', '#f59e0b', '#7c3aed', '#64748b'];
const format = (value) => value == null ? 'Unavailable' : Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)', fontSize: 12 };
const axisTick = { fontSize: 12, fill: '#64748b' };

function toNumber(value) {
  return value == null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);
}

export function withAlpha(hex, alpha) {
  const color = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#2563eb';
  const value = Number.parseInt(color.slice(1), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function barWidth(value, max) {
  if (!value || value <= 0) return '0%';
  return `${Math.max((value / max) * 100, 3)}%`;
}

// Ranked bar list: the label sits on its own bar, the exact value is always visible,
// and an optional thin grey bar underneath shows the comparison period.
export function BarList({ rows = [], labelKey, valueKey, previousKey, color = '#2563eb', currentName = 'Current', previousName = 'Previous', ariaLabel, valueFormat = format, showTotals = false }) {
  const items = rows.map((row, index) => ({
    key: `${row[labelKey] ?? 'unspecified'}-${index}`,
    label: row[labelKey] || 'Unspecified',
    value: toNumber(row[valueKey]),
    previous: previousKey ? toNumber(row[previousKey]) : null,
  }));
  if (!items.length) return <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No records match this period.</p>;
  const hasPrevious = items.some((item) => item.previous != null);
  const max = Math.max(1, ...items.flatMap((item) => [item.value || 0, item.previous || 0]));
  const total = items.reduce((sum, item) => sum + (item.value || 0), 0);
  const previousTotal = items.reduce((sum, item) => sum + (item.previous || 0), 0);
  const change = total - previousTotal;
  return (
    <div aria-label={ariaLabel} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span>{currentName}</span>
          {showTotals ? <strong className="ml-0.5 text-sm font-bold tabular-nums text-slate-900">{valueFormat(total)}</strong> : null}
        </span>
        {hasPrevious ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" aria-hidden="true" />
            <span>{previousName}</span>
            {showTotals ? <strong className="ml-0.5 text-sm font-bold tabular-nums text-slate-600">{valueFormat(previousTotal)}</strong> : null}
            {showTotals ? <span className={`ml-1 rounded-full px-1.5 py-0.5 font-semibold tabular-nums ${change > 0 ? 'bg-emerald-50 text-emerald-700' : change < 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{change > 0 ? '+' : ''}{valueFormat(change)}</span> : null}
          </span>
        ) : null}
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
            <div className="min-w-0">
              <div className="relative min-h-8 overflow-hidden rounded-lg bg-slate-50">
                <div className="absolute inset-y-0 left-0 rounded-lg" style={{ width: barWidth(item.value, max), backgroundColor: withAlpha(color, 0.18), boxShadow: `inset 3px 0 0 ${color}` }} />
                <p className="relative px-3 py-1.5 text-sm font-medium leading-5 text-slate-800">{item.label}</p>
              </div>
              {hasPrevious ? <div className="mt-1 h-1"><div className="h-full rounded-full bg-slate-300" style={{ width: barWidth(item.previous, max) }} /></div> : null}
            </div>
            <div className="min-w-12 text-right tabular-nums">
              <p className="text-sm font-semibold text-slate-900">{item.value == null ? '—' : valueFormat(item.value)}</p>
              {hasPrevious ? <p className="text-xs text-slate-400">prev. {item.previous == null ? '—' : valueFormat(item.previous)}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DataChart({ data = [], category, currentKey, previousKey, currentName = 'Current', previousName = 'Previous', color = '#2563eb', ariaLabel, mode = 'bar' }) {
  if (mode !== 'donut') {
    return <BarList rows={data} labelKey={category} valueKey={currentKey} previousKey={previousKey} color={color} currentName={currentName} previousName={previousName} ariaLabel={ariaLabel} />;
  }
  const rows = data.map((row, index) => ({ ...row, chartLabel: row[category] || 'Unspecified', chartIndex: index + 1, [currentKey]: toNumber(row[currentKey]), [previousKey]: toNumber(row[previousKey]) }));
  const total = rows.reduce((sum, row) => sum + (row[currentKey] || 0), 0);
  const slices = rows.filter((row) => row[currentKey] > 0);
  if (!rows.length) return <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No records match this period.</p>;
  return <div aria-label={ariaLabel} className="min-w-0">
    {total > 0 ? <div className="grid items-center gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="relative h-48">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 192, height: 192 }}><PieChart><Pie data={slices} dataKey={currentKey} nameKey="chartLabel" innerRadius={56} outerRadius={84} paddingAngle={2} stroke="#fff" strokeWidth={3} isAnimationActive={false}>{slices.map((row) => <Cell key={row.chartIndex} fill={palette[(row.chartIndex - 1) % palette.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} formatter={(value) => format(value)} /></PieChart></ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl font-bold tabular-nums text-slate-900">{format(total)}</strong><span className="text-xs text-slate-500">Current total</span></div>
      </div>
      <ul className="space-y-1.5">{rows.map((row) => <li key={row.chartIndex} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette[(row.chartIndex - 1) % palette.length] }} aria-hidden="true" /><span className="min-w-0 flex-1 font-medium text-slate-700">{row.chartLabel}</span><span className="text-xs tabular-nums text-slate-400">{total > 0 ? `${(100 * (row[currentKey] || 0) / total).toFixed(0)}%` : ''}</span><strong className="min-w-6 text-right font-semibold tabular-nums text-slate-900">{format(row[currentKey])}</strong></li>)}</ul>
    </div> : <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No current records to show as proportions.</p>}
  </div>;
}

export function CapacityHeatmap({ data = [] }) {
  if (!data.length) return <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">No scheduled capacity in this period.</p>;
  const dates = [...new Set(data.map((row) => row.date))].sort();
  const people = [...new Map(data.map((row) => [row.technician_id, row.technician])).entries()];
  const cells = new Map(data.map((row) => [`${row.technician_id}:${row.date}`, row]));
  return <>
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-blue-100" />Light load</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-blue-300" />40%+</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-blue-700" />75%+</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-rose-600" />Over capacity</span>
      <span>— no reported entry</span>
    </div>
    <div className="overflow-x-auto"><table className="analytics-table analytics-table-auto border-separate border-spacing-1 text-xs"><thead><tr><th className="min-w-32 text-left font-semibold text-slate-500">Technician</th>{dates.map((date) => <th key={date} className="min-w-16 whitespace-nowrap p-2 font-medium text-slate-500">{shortDate(date, { withYear: false })}</th>)}</tr></thead><tbody>{people.map(([id, name]) => <tr key={id}><th className="pr-3 text-left font-medium text-slate-700">{name}</th>{dates.map((date) => { const row = cells.get(`${id}:${date}`); const ratio = row && Number(row.capacity_hours) > 0 ? Number(row.hours) / Number(row.capacity_hours) : null; const style = !row ? 'bg-slate-50 text-slate-400' : row.over_capacity ? 'bg-rose-600 text-white' : ratio >= .75 ? 'bg-blue-700 text-white' : ratio >= .4 ? 'bg-blue-300 text-blue-950' : 'bg-blue-100 text-blue-900'; return <td key={date} className={`rounded-lg p-2.5 text-center font-semibold tabular-nums ${style}`} title={row ? `${name}: ${row.hours}h scheduled / ${row.capacity_hours}h capacity` : `${name}: no reported entry`} >{row ? `${format(row.hours)}h` : '—'}</td>; })}</tr>)}</tbody></table></div>
  </>;
}

export function TechnicianScatter({ data = [] }) {
  const rows = data.filter((row) => Number(row.assigned_lead_jobs) > 0 && row.completion_rate != null);
  if (!rows.length) return <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Assigned jobs and completion rates are needed for this comparison.</p>;
  return <><div className="h-72"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 15, right: 20, bottom: 28, left: 0 }}><CartesianGrid strokeDasharray="3 4" stroke="#e2e8f0" /><XAxis type="number" dataKey="assigned_lead_jobs" name="Assigned jobs" allowDecimals={false} tick={axisTick} tickLine={false} label={{ value: 'Assigned lead jobs', position: 'bottom', offset: 8, fontSize: 12, fill: '#64748b' }} /><YAxis type="number" dataKey="completion_rate" name="Completion" unit="%" domain={[0, 100]} tick={axisTick} tickLine={false} /><Tooltip contentStyle={tooltipStyle} content={({ active, payload }) => active && payload?.length ? <div className="rounded-xl border bg-white p-3 text-xs shadow-lg"><strong>{payload[0].payload.technician}</strong><p>{payload[0].payload.assigned_lead_jobs} assigned jobs</p><p>{format(payload[0].payload.completion_rate)}% completed</p></div> : null} /><Scatter data={rows} fill="#2563eb" isAnimationActive={false} /></ScatterChart></ResponsiveContainer></div><p className="text-xs leading-5 text-slate-500">Each point is a technician with assignments. Higher points have a larger completed share; farther right means more assignments. Exact values are in the leaderboard below.</p></>;
}
