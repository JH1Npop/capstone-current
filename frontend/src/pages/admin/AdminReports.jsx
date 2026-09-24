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

const ITEMS_PER_PAGE = 10;

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

const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

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
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

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

  const filteredTickets = useMemo(() => {
    const dateFloor = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const dateCeiling = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return tickets.filter((ticket) => {
      const ticketDate = new Date(ticket.created_at);
      if (dateFloor && ticketDate < dateFloor) return false;
      if (dateCeiling && ticketDate > dateCeiling) return false;
      if (serviceFilter !== 'All' && normalizeReportValue(ticket.service) !== normalizeReportValue(serviceFilter)) return false;
      if (clientFilter !== 'All' && normalizeReportValue(ticket.client_fullname || ticket.client) !== normalizeReportValue(clientFilter)) return false;
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
  }, [tickets, dateFrom, dateTo, serviceFilter, clientFilter, technicianFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / ITEMS_PER_PAGE));
  const paginatedTickets = filteredTickets.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const visibleStartIndex = filteredTickets.length ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0;
  const visibleEndIndex = Math.min(currentPage * ITEMS_PER_PAGE, filteredTickets.length);

  const summaryStats = useMemo(() => {
    const total = filteredTickets.length;
    const completed = filteredTickets.filter((ticket) => normalizeReportValue(ticket.status) === 'completed').length;
    const pending = filteredTickets.filter((ticket) =>
      ['not started', 'in progress', 'pending'].includes(normalizeReportValue(ticket.status))
    ).length;
    const unassigned = filteredTickets.filter((ticket) => !ticket.technician_id).length;

    return { total, completed, pending, unassigned };
  }, [filteredTickets]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, serviceFilter, clientFilter, technicianFilter, searchTerm]);

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
            <p className="text-[13px] font-medium text-slate-500">Total Tickets</p>
            <p className="mt-1 text-3xl font-bold text-slate-800">{summaryStats.total}</p>
          </div>
          <div className="stat-card p-4">
            <p className="text-[13px] font-medium text-slate-500">Completed</p>
            <p className="mt-1 text-3xl font-bold text-emerald-600">{summaryStats.completed}</p>
          </div>
          <div className="stat-card p-4">
            <p className="text-[13px] font-medium text-slate-500">Pending / Active</p>
            <p className="mt-1 text-3xl font-bold text-blue-600">{summaryStats.pending}</p>
          </div>
          <div className="stat-card p-4">
            <p className="text-[13px] font-medium text-slate-500">Unassigned</p>
            <p className="mt-1 text-3xl font-bold text-amber-600">{summaryStats.unassigned}</p>
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
            { key: 'client', label: 'Client', value: clientFilter, defaultValue: 'All', onChange: setClientFilter, options: [{ value: 'All', label: 'Any client' }, ...clientOptions.map((value) => ({ value, label: value }))] },
            { key: 'technician', label: 'Technician', value: technicianFilter, defaultValue: 'All', onChange: setTechnicianFilter, options: [{ value: 'All', label: 'Any technician' }, ...technicianOptions.map((value) => ({ value, label: value }))] },
          ]}
          onClear={resetFilters}
        />

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Service Ticket Report</h2>
              <p className="text-sm text-slate-500">Showing {visibleStartIndex}-{visibleEndIndex} of {filteredTickets.length} tickets.</p>
            </div>
            <div className="flex gap-2">
              {canExport ? (
                <>
                  <button type="button" onClick={printReport} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                    Print
                  </button>
                  <button type="button" onClick={downloadCSV} className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700">
                    Export
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
              <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
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
