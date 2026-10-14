import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';

const palette = ['#2563eb', '#0891b2', '#60a5fa', '#334155', '#94a3b8', '#bae6fd'];
const format = (value) => value == null ? 'Unavailable' : Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 };

export function DataChart({ data = [], category, currentKey, previousKey, currentName = 'Current', previousName = 'Previous', color = '#2563eb', ariaLabel, mode = 'bar' }) {
  const rows = data.map((row, index) => ({ ...row, chartLabel: row[category] || 'Unspecified', chartIndex: index + 1, [currentKey]: row[currentKey] == null ? null : Number(row[currentKey]), [previousKey]: row[previousKey] == null ? null : Number(row[previousKey]) }));
  const previous = rows.some((row) => row[previousKey] != null);
  const total = rows.reduce((sum, row) => sum + (row[currentKey] || 0), 0);
  const slices = rows.filter((row) => row[currentKey] > 0);
  if (!rows.length) return <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">No records match this period.</p>;
  return <div aria-label={ariaLabel} className="min-w-0 space-y-3">
    {mode === 'donut' ? <>
      <p className="text-xs text-slate-500">Share of current records · colors identify categories below</p>
      {total > 0 ? <div className="relative h-60">
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={slices} dataKey={currentKey} nameKey="chartLabel" innerRadius={65} outerRadius={98} paddingAngle={2} isAnimationActive={false}>{slices.map((row) => <Cell key={row.chartIndex} fill={palette[(row.chartIndex - 1) % palette.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} formatter={(value) => format(value)} /></PieChart></ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-3xl text-slate-900">{format(total)}</strong><span className="text-xs text-slate-500">Current total</span></div>
      </div> : <p className="p-8 text-center text-sm text-slate-500">No current records to show as proportions.</p>}
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">{rows.map((row) => <span key={row.chartIndex} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette[(row.chartIndex - 1) % palette.length] }} />{row.chartLabel} {total > 0 ? `${(100 * (row[currentKey] || 0) / total).toFixed(1)}%` : ''}</span>)}</div>
    </> : <div style={{ height: Math.max(230, rows.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ left: 0, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 4" stroke="#e2e8f0" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="chartLabel" width={120} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, payload) => payload?.[0]?.payload?.chartLabel || ''} formatter={(value) => format(value)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey={currentKey} name={currentName} fill={color} radius={[0, 5, 5, 0]} maxBarSize={20} isAnimationActive={false} />
        {previous && <Bar dataKey={previousKey} name={previousName} fill="#cbd5e1" radius={[0, 5, 5, 0]} maxBarSize={20} isAnimationActive={false} />}
      </BarChart></ResponsiveContainer>
    </div>}
    <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-blue-700">View exact values</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="py-2">Category</th><th className="px-2 text-right">{currentName}</th>{previous && <th className="px-2 text-right">{previousName}</th>}{mode === 'donut' && <th className="text-right">Share</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.chartIndex} className="border-b border-slate-100"><th className="py-2 pr-2 font-medium text-slate-700"><span className="mr-2 inline-block text-blue-600">{mode === 'donut' ? <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: palette[(row.chartIndex - 1) % palette.length] }} /> : `${row.chartIndex}.`}</span>{row.chartLabel}</th><td className="px-2 text-right font-bold tabular-nums">{format(row[currentKey])}</td>{previous && <td className="px-2 text-right tabular-nums text-slate-500">{format(row[previousKey])}</td>}{mode === 'donut' && <td className="text-right tabular-nums">{total > 0 ? `${(100 * (row[currentKey] || 0) / total).toFixed(1)}%` : '—'}</td>}</tr>)}</tbody></table></div></details>
  </div>;
}

export function CapacityHeatmap({ data = [] }) {
  if (!data.length) return <p className="p-6 text-sm text-slate-500">No scheduled capacity in this period.</p>;
  const dates = [...new Set(data.map((row) => row.date))].sort();
  const people = [...new Map(data.map((row) => [row.technician_id, row.technician])).entries()];
  const cells = new Map(data.map((row) => [`${row.technician_id}:${row.date}`, row]));
  return <><p className="mb-3 text-xs text-slate-500">Darker blue = more scheduled capacity · red = over capacity · — = no reported entry</p><div className="overflow-x-auto"><table className="border-separate border-spacing-1 text-xs"><thead><tr><th className="min-w-32 text-left">Technician</th>{dates.map((date) => <th key={date} className="min-w-20 p-2 font-medium text-slate-500">{date}</th>)}</tr></thead><tbody>{people.map(([id, name]) => <tr key={id}><th className="pr-3 text-left font-medium">{name}</th>{dates.map((date) => { const row = cells.get(`${id}:${date}`); const ratio = row && Number(row.capacity_hours) > 0 ? Number(row.hours) / Number(row.capacity_hours) : null; const style = !row ? 'bg-slate-50 text-slate-400' : row.over_capacity ? 'bg-rose-600 text-white' : ratio >= .75 ? 'bg-blue-700 text-white' : ratio >= .4 ? 'bg-blue-300 text-blue-950' : 'bg-blue-100 text-blue-900'; return <td key={date} className={`rounded-lg p-3 text-center font-bold ${style}`} title={row ? `${name}: ${row.hours}h scheduled / ${row.capacity_hours}h capacity` : `${name}: no reported entry`} >{row ? `${format(row.hours)}h` : '—'}</td>; })}</tr>)}</tbody></table></div></>;
}

export function TechnicianScatter({ data = [] }) {
  const rows = data.filter((row) => Number(row.assigned_lead_jobs) > 0 && row.completion_rate != null);
  if (!rows.length) return <p className="p-6 text-sm text-slate-500">Assigned jobs and completion rates are needed for this comparison.</p>;
  return <><div className="h-72"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 15, right: 20, bottom: 28, left: 5 }}><CartesianGrid strokeDasharray="3 4" stroke="#e2e8f0" /><XAxis type="number" dataKey="assigned_lead_jobs" name="Assigned jobs" allowDecimals={false} label={{ value: 'Assigned lead jobs', position: 'bottom', offset: 8 }} /><YAxis type="number" dataKey="completion_rate" name="Completion" unit="%" domain={[0, 100]} /><Tooltip contentStyle={tooltipStyle} content={({ active, payload }) => active && payload?.length ? <div className="rounded-xl border bg-white p-3 text-xs shadow-lg"><strong>{payload[0].payload.technician}</strong><p>{payload[0].payload.assigned_lead_jobs} assigned jobs</p><p>{format(payload[0].payload.completion_rate)}% completed</p></div> : null} /><Scatter data={rows} fill="#2563eb" isAnimationActive={false} /></ScatterChart></ResponsiveContainer></div><p className="text-xs leading-5 text-slate-500">Each point is a technician with assignments. Higher points have a larger completed share; farther right means more assignments. Exact values are in the leaderboard below.</p></>;
}
