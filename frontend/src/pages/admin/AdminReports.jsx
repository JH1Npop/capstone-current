import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/layout/Layout';
import SearchFilterBar from '../../components/shared/SearchFilterBar';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import { api } from '../../api/core';
import { useAuth } from '../../context/AuthContext';
import { REPORTS_EXPORT_CAPABILITIES, hasAnyCapability } from '../../rbac';
import { formatDate } from '../../utils/formatDate';
import { formatTechnicianId, formatTicketId } from '../../utils/roleIds';
import { FiDownload, FiPrinter } from 'react-icons/fi';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const ITEMS_PER_PAGE = 10;
const FALLBACK_SERVICE_CHART_COLORS = ['#2563eb', '#8b5cf6', '#06b6d4', '#10b981', '#f97316'];

const normalizeReportValue = (value) =>
  String(value || '').trim().replace(/[_-]+/g, ' ').toLowerCase();

const getReportOptionValue = (value) => String(value || '').trim();

const getUniqueReportOptions = (rows, getValue) => {
  const seen = new Set();
  return rows.reduce((options, row) => {
    const value = getReportOptionValue(getValue(row));
    const key = normalizeReportValue(value);
    if (!value || seen.has(key)) return options;
    seen.add(key);
    options.push(value);
    return options;
  }, []);
};

const escapeCsv = (value) => {
  const stringValue = String(value ?? '');
  const formulaSafeValue = /^[=+\-@\t\r]/.test(stringValue.trimStart()) ? `'${stringValue}` : stringValue;
  return `"${formulaSafeValue.replace(/"/g, '""')}"`;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const convertToCSV = (rows) => {
  if (!rows.length) return '';
  const headers = [
    'Ticket',
    'Date',
    'Client',
    'Service',
    'Priority',
    'Status',
    'SLA',
    'Technician',
    'Next Step'
  ];

  const csvRows = rows.map((row) => [
    formatTicketId(row.id),
    formatDate(row.created_at),
    row.client_fullname || row.client,
    row.service,
    row.priority,
    row.status,
    row.sla?.status || '-',
    row.technician_fullname || formatTechnicianId(row.technician_id),
    row.next_step
  ]);

  return [headers.join(','), ...csvRows.map((row) => row.map(escapeCsv).join(','))].join('\n');
};





const getSlaColor = (status) => {
  switch (normalizeReportValue(status)) {
    case 'breached':
    case 'overdue':
      return 'bg-red-100 text-red-800';
    case 'warning':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-emerald-100 text-emerald-800';
  }
};

export default function AdminReports() {
  const { user } = useAuth();
  const canExport = hasAnyCapability(user, REPORTS_EXPORT_CAPABILITIES);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [clientFilter, setClientFilter] = useState('All');
  const [technicianFilter, setTechnicianFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [workloadChartMode, setWorkloadChartMode] = useState('stacked');

  const fetchServiceTickets = async () => {
    try {
      setLoading(true);
      const response = await api.get('/services/service-tickets/report/');
      setTickets(response.data || []);
      setError('');
    } catch (err) {
      setTickets([]);
      setError(err.response?.data?.message || err.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceTickets();
  }, []);

  const serviceOptions = useMemo(
    () => getUniqueReportOptions(tickets, (ticket) => ticket.service),
    [tickets]
  );

  const clientOptions = useMemo(
    () => getUniqueReportOptions(tickets, (ticket) => ticket.client_fullname || ticket.client),
    [tickets]
  );

  const technicianOptions = useMemo(
    () => getUniqueReportOptions(tickets, (ticket) => ticket.technician_fullname || (ticket.technician_id ? formatTechnicianId(ticket.technician_id) : '')),
    [tickets]
  );

  const statusOptions = useMemo(
    () => getUniqueReportOptions(tickets, (ticket) => ticket.status),
    [tickets]
  );

  const priorityOptions = useMemo(
    () => getUniqueReportOptions(tickets, (ticket) => ticket.priority),
    [tickets]
  );

  const filteredTickets = useMemo(() => {
    const dateFloor = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const dateCeiling = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return tickets.filter((ticket) => {
      const ticketDate = new Date(ticket.created_at);
      if (dateFloor && ticketDate < dateFloor) return false;
      if (dateCeiling && ticketDate > dateCeiling) return false;
      if (serviceFilter !== 'All' && normalizeReportValue(ticket.service) !== normalizeReportValue(serviceFilter)) return false;
      if (clientFilter !== 'All' && normalizeReportValue(ticket.client_fullname || ticket.client) !== normalizeReportValue(clientFilter)) return false;
      if (statusFilter !== 'All' && normalizeReportValue(ticket.status) !== normalizeReportValue(statusFilter)) return false;
      if (priorityFilter !== 'All' && normalizeReportValue(ticket.priority) !== normalizeReportValue(priorityFilter)) return false;
      if (
        technicianFilter !== 'All' &&
        normalizeReportValue(ticket.technician_fullname || formatTechnicianId(ticket.technician_id)) !== normalizeReportValue(technicianFilter)
      ) {
        return false;
      }

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          ticket.client?.toLowerCase().includes(searchLower) ||
          ticket.client_fullname?.toLowerCase().includes(searchLower) ||
          ticket.service?.toLowerCase().includes(searchLower) ||
          ticket.technician_fullname?.toLowerCase().includes(searchLower) ||
          ticket.next_step?.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  }, [tickets, dateFrom, dateTo, serviceFilter, clientFilter, technicianFilter, statusFilter, priorityFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / ITEMS_PER_PAGE));
  const paginatedTickets = filteredTickets.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const visibleStartIndex = filteredTickets.length ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0;
  const visibleEndIndex = Math.min(currentPage * ITEMS_PER_PAGE, filteredTickets.length);

  const summaryStats = useMemo(() => {
    const total = filteredTickets.length;
    const completed = filteredTickets.filter((ticket) =>
      ['completed', 'turned over / accepted'].includes(normalizeReportValue(ticket.status))
    ).length;
    const cancelled = filteredTickets.filter((ticket) =>
      ['cancelled', 'canceled', 'rejected'].includes(normalizeReportValue(ticket.status))
    ).length;
    const active = Math.max(0, total - completed - cancelled);
    const unassigned = filteredTickets.filter((ticket) => !ticket.technician_id).length;
    const slaRisk = filteredTickets.filter((ticket) =>
      ['warning', 'overdue', 'breached'].includes(normalizeReportValue(ticket.sla?.status))
    ).length;
    const completionRate = total ? (completed / total) * 100 : 0;

    return { total, completed, cancelled, active, unassigned, slaRisk, completionRate };
  }, [filteredTickets]);

  const topServices = useMemo(() => {
    const counts = filteredTickets.reduce((result, ticket) => {
      const services = Array.isArray(ticket.services) && ticket.services.length
        ? ticket.services
        : [{ name: ticket.service || 'Unspecified service', color: '' }];
      services.forEach((service) => {
        const label = String(service?.name || 'Unspecified service').trim();
        const key = normalizeReportValue(label);
        const entry = result.get(key) || { label, color: service?.color || '', total: 0, completed: 0 };
        entry.color = service?.color || entry.color;
        entry.total += 1;
        if (['completed', 'turned over / accepted'].includes(normalizeReportValue(ticket.status))) entry.completed += 1;
        result.set(key, entry);
      });
      return result;
    }, new Map());
    return [...counts.values()]
      .map((service) => ({ ...service, remaining: service.total - service.completed }))
      .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
      .slice(0, 5);
  }, [filteredTickets]);

  const serviceChartSeries = useMemo(
    () => topServices.map((service, index) => ({
      ...service,
      dataKey: `service_${index}`,
      color: service.color || FALLBACK_SERVICE_CHART_COLORS[index % FALLBACK_SERVICE_CHART_COLORS.length],
    })),
    [topServices]
  );

  const serviceWorkloadChartData = useMemo(() => [
    serviceChartSeries.reduce(
      (row, service) => ({ ...row, [service.dataKey]: service.completed }),
      { status: 'Completed' }
    ),
    serviceChartSeries.reduce(
      (row, service) => ({ ...row, [service.dataKey]: service.remaining }),
      { status: 'Not completed' }
    ),
  ], [serviceChartSeries]);

  const workflowSegments = [
    { label: 'Completed', value: summaryStats.completed, color: '#10b981', className: 'bg-emerald-500' },
    { label: 'Active', value: summaryStats.active, color: '#2563eb', className: 'bg-blue-600' },
    { label: 'Cancelled', value: summaryStats.cancelled, color: '#f43f5e', className: 'bg-rose-500' },
  ];

  const workflowGradient = (() => {
    if (!summaryStats.total) return '#e2e8f0';
    let cursor = 0;
    const stops = workflowSegments.map((segment) => {
      const start = cursor;
      cursor += (segment.value / summaryStats.total) * 360;
      return `${segment.color} ${start}deg ${cursor}deg`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  })();

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, serviceFilter, clientFilter, technicianFilter, statusFilter, priorityFilter, searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setServiceFilter('All');
    setClientFilter('All');
    setTechnicianFilter('All');
    setStatusFilter('All');
    setPriorityFilter('All');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const downloadCSV = () => {
    const csv = convertToCSV(filteredTickets);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `service-tickets-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const rows = filteredTickets.map((ticket) => `
      <tr>
        <td>
          <strong>${escapeHtml(formatTicketId(ticket.id))}</strong>
          <span>${escapeHtml(formatDate(ticket.created_at))}</span>
        </td>
        <td>
          <strong>${escapeHtml(ticket.client_fullname || ticket.client || 'Client')}</strong>
          <span>${escapeHtml(ticket.service || 'Service')}</span>
        </td>
        <td>${escapeHtml(ticket.priority || 'Normal')}</td>
        <td>${escapeHtml(ticket.status || 'Unknown')}</td>
        <td>
          <strong>${escapeHtml(ticket.technician_fullname || 'Unassigned')}</strong>
          <span>${escapeHtml(formatTechnicianId(ticket.technician_id))}</span>
        </td>
        <td>
          <strong>${escapeHtml(ticket.sla?.status || '-')}</strong>
          <span>${escapeHtml(ticket.next_step || '-')}</span>
        </td>
      </tr>
    `).join('');

    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Service Ticket Report</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 24px;
              color: #0f172a;
              font-family: Arial, sans-serif;
              font-size: 12px;
            }
            h1 {
              margin: 0 0 4px;
              font-size: 20px;
            }
            .meta {
              margin-bottom: 16px;
              color: #475569;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            th {
              border-bottom: 1px solid #cbd5e1;
              background: #f8fafc;
              color: #475569;
              font-size: 10px;
              letter-spacing: 0.04em;
              padding: 8px;
              text-align: left;
              text-transform: uppercase;
            }
            td {
              border-bottom: 1px solid #e2e8f0;
              padding: 8px;
              vertical-align: top;
              word-break: break-word;
            }
            strong {
              display: block;
              font-weight: 700;
            }
            span {
              display: block;
              color: #475569;
              font-size: 11px;
              margin-top: 3px;
            }
            @page { margin: 16mm; }
          </style>
        </head>
        <body>
          <h1>Service Ticket Report</h1>
          <div class="meta">Showing ${filteredTickets.length} ticket${filteredTickets.length === 1 ? '' : 's'} | Printed ${escapeHtml(formatDate(new Date()))}</div>
          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Ticket</th>
                <th style="width: 24%;">Customer & Service</th>
                <th style="width: 11%;">Priority</th>
                <th style="width: 13%;">Status</th>
                <th style="width: 18%;">Technician</th>
                <th style="width: 22%;">SLA & Next Step</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="6">No service tickets to display.</td></tr>'}
            </tbody>
          </table>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Layout>
      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="stat-card p-4">
            <p className="text-[13px] font-medium text-slate-500">Tickets in view</p>
            <p className="mt-1 text-3xl font-bold text-slate-800">{summaryStats.total}</p>
            <p className="mt-1 text-xs text-slate-400">Matches the active report filters</p>
          </div>
          <div className="stat-card p-4">
            <p className="text-[13px] font-medium text-slate-500">Completion rate</p>
            <p className="mt-1 text-3xl font-bold text-emerald-600">{summaryStats.completionRate.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-slate-400">{summaryStats.completed} completed or turned over</p>
          </div>
          <div className="stat-card p-4">
            <p className="text-[13px] font-medium text-slate-500">Active workload</p>
            <p className="mt-1 text-3xl font-bold text-blue-600">{summaryStats.active}</p>
            <p className="mt-1 text-xs text-slate-400">{summaryStats.unassigned} currently unassigned</p>
          </div>
          <div className="stat-card p-4">
            <p className="text-[13px] font-medium text-slate-500">SLA attention</p>
            <p className={`mt-1 text-3xl font-bold ${summaryStats.slaRisk ? 'text-rose-600' : 'text-slate-800'}`}>{summaryStats.slaRisk}</p>
            <p className="mt-1 text-xs text-slate-400">Warning, overdue, or breached</p>
          </div>
        </section>

        <SearchFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchLabel="Find a service ticket"
          searchPlaceholder="Search client, technician, address, or service"
          filters={[
            { key: 'from', label: 'From date', type: 'date', value: dateFrom, defaultValue: '', onChange: setDateFrom },
            { key: 'to', label: 'To date', type: 'date', value: dateTo, defaultValue: '', min: dateFrom || undefined, onChange: setDateTo },
            { key: 'service', label: 'Service', value: serviceFilter, defaultValue: 'All', onChange: setServiceFilter, options: [{ value: 'All', label: 'Any service' }, ...serviceOptions.map((value) => ({ value, label: value }))] },
            { key: 'status', label: 'Status', value: statusFilter, defaultValue: 'All', onChange: setStatusFilter, options: [{ value: 'All', label: 'Any status' }, ...statusOptions.map((value) => ({ value, label: value }))] },
            { key: 'priority', label: 'Priority', value: priorityFilter, defaultValue: 'All', onChange: setPriorityFilter, options: [{ value: 'All', label: 'Any priority' }, ...priorityOptions.map((value) => ({ value, label: value }))] },
            { key: 'client', label: 'Client', value: clientFilter, defaultValue: 'All', onChange: setClientFilter, options: [{ value: 'All', label: 'Any client' }, ...clientOptions.map((value) => ({ value, label: value }))] },
            { key: 'technician', label: 'Technician', value: technicianFilter, defaultValue: 'All', onChange: setTechnicianFilter, options: [{ value: 'All', label: 'Any technician' }, ...technicianOptions.map((value) => ({ value, label: value }))] },
          ]}
          onClear={resetFilters}
        />

        {!loading && !error && filteredTickets.length > 0 ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="flex min-h-[340px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">Workflow composition</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900">How the selected tickets are distributed</h2>
              </div>
              <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-5 sm:flex-row sm:items-start">
                <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: workflowGradient }} aria-label={`${summaryStats.completed} completed, ${summaryStats.active} active, ${summaryStats.cancelled} cancelled`}>
                  <div className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center shadow-inner">
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{summaryStats.total}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tickets</p>
                    </div>
                  </div>
                </div>
                <div className="grid w-full gap-2">
                  {workflowSegments.map((segment) => (
                    <div key={segment.label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <span className={`h-2.5 w-2.5 rounded-full ${segment.className}`} />
                        {segment.label}
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {segment.value} <span className="font-medium text-slate-400">({summaryStats.total ? ((segment.value / summaryStats.total) * 100).toFixed(0) : 0}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="flex min-h-[340px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">Service workload</p>
                  <h2 className="mt-1 text-base font-semibold text-slate-900">Top services in the selected report</h2>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label="Service workload chart layout">
                  {[
                    { value: 'stacked', label: 'Stacked' },
                    { value: 'grouped', label: 'Grouped' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={workloadChartMode === option.value}
                      onClick={() => setWorkloadChartMode(option.value)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                        workloadChartMode === option.value
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 min-h-[250px] flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={250}>
                  <BarChart data={serviceWorkloadChartData} margin={{ top: 10, right: 12, left: -18, bottom: 8 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="status"
                      interval={0}
                      height={32}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderColor: '#cbd5e1', borderRadius: 10, boxShadow: '0 8px 24px rgb(15 23 42 / 0.08)' }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    {serviceChartSeries.map((service) => (
                      <Bar
                        key={service.dataKey}
                        dataKey={service.dataKey}
                        name={service.label}
                        stackId={workloadChartMode === 'stacked' ? 'services' : undefined}
                        fill={service.color}
                        radius={workloadChartMode === 'grouped' ? [4, 4, 0, 0] : 0}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Service Ticket Report</h2>
              <p className="text-sm text-slate-500">Showing {visibleStartIndex}-{visibleEndIndex} of {filteredTickets.length} tickets.</p>
            </div>
            <div className="flex gap-2">
              {canExport ? (
                <>
                  <button type="button" onClick={printReport} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                    <FiPrinter size={14} /> Print
                  </button>
                  <button type="button" onClick={downloadCSV} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700">
                    <FiDownload size={14} /> Export CSV
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : null}

          {loading ? (
            <TableSkeleton rows={8} columns={5} />
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-600">No service tickets to display.</div>
          ) : (
            <>
              <div className="divide-y divide-slate-200 md:hidden">
                {paginatedTickets.map((ticket) => (
                  <article key={`mobile-${ticket.id}`} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-brand-700">{formatTicketId(ticket.id)}</p>
                        <p className="text-xs text-slate-500">{formatDate(ticket.created_at)}</p>
                      </div>
                      <StatusBadge status={ticket.status || 'Unknown'} size="sm" />
                    </div>
                    <div className="min-w-0">
                      <p className="break-words font-medium text-slate-900">{ticket.client_fullname || ticket.client || 'Client'}</p>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                        <StatusBadge status={ticket.priority || 'low'} size="sm" />
                        <span className="break-words text-xs text-slate-600">{ticket.service || 'Service'}</span>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div className="min-w-0 rounded-lg bg-slate-50 p-2.5">
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">Technician</dt>
                        <dd className="mt-1 break-words text-slate-800">{ticket.technician_fullname || 'Unassigned'}</dd>
                        <dd className="text-slate-500">{formatTechnicianId(ticket.technician_id)}</dd>
                      </div>
                      <div className="min-w-0 rounded-lg bg-slate-50 p-2.5">
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">SLA / Next step</dt>
                        <dd className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${getSlaColor(ticket.sla?.status)}`}>{ticket.sla?.status || '-'}</dd>
                        <dd className="mt-1 break-words text-slate-600">{ticket.next_step || '-'}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              <table className="hidden w-full table-fixed border-separate border-spacing-0 text-sm md:table">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-[13%] border-b border-slate-200 px-3 py-3">Ticket</th>
                    <th className="w-[27%] border-b border-slate-200 px-3 py-3">Customer & Service</th>
                    <th className="w-[18%] border-b border-slate-200 px-3 py-3">Status</th>
                    <th className="w-[19%] border-b border-slate-200 px-3 py-3">Technician</th>
                    <th className="w-[23%] border-b border-slate-200 px-3 py-3">SLA & Next Step</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTickets.map((ticket) => (
                    <tr key={ticket.id} className="transition hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-3 py-2 align-middle">
                        <div className="font-semibold text-brand-700">{formatTicketId(ticket.id)}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{formatDate(ticket.created_at)}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-middle">
                        <div className="truncate font-medium text-slate-900" title={ticket.client_fullname || ticket.client || ''}>
                          {ticket.client_fullname || ticket.client || 'Client'}
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-2">
                          <StatusBadge status={ticket.priority || 'low'} size="sm" />
                          <span className="truncate text-[11px] text-slate-600" title={ticket.service || ''}>{ticket.service || 'Service'}</span>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-middle">
                        <StatusBadge status={ticket.status || 'Unknown'} size="sm" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-middle">
                        <div className="truncate font-medium text-slate-900" title={ticket.technician_fullname || ''}>
                          {ticket.technician_fullname || 'Unassigned'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{formatTechnicianId(ticket.technician_id)}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-middle">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${getSlaColor(ticket.sla?.status)}`}>
                          {ticket.sla?.status || '-'}
                        </span>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-600" title={ticket.next_step || ''}>{ticket.next_step || '-'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm">
                <div className="text-slate-500">
                  Showing {visibleStartIndex}-{visibleEndIndex} of {filteredTickets.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-2 text-slate-500">Page {currentPage} of {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </Layout>
  );
}
