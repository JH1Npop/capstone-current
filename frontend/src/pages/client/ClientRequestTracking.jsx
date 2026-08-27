import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState, ErrorState } from '../../components/ui/StateDisplay';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import StatusBadge from '../../components/ui/StatusBadge';
import { FiCalendar, FiEye, FiPlus, FiSearch, FiX } from 'react-icons/fi';
import { cancelServiceRequest, fetchClientRequests } from '../../api/api';
import { clientTechnicianDisplayString } from '../../utils/clientTechnicianDisplay';
import { formatTicketId } from '../../utils/roleIds';

const ITEMS_PER_PAGE = 15;

export default function ClientRequestTracking() {
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    filterRequests();
  }, [requests, statusFilter, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await fetchClientRequests();
      setRequests(data);
      setError(null);
    } catch (err) {
      setError('Failed to load requests');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filterRequests = () => {
    const query = searchTerm.trim().toLowerCase();
    setFilteredRequests(requests.filter((req) => {
      const normalizedStatus = String(req.status || '').toLowerCase().replace(/\s+/g, '_');
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && !['completed', 'cancelled', 'canceled', 'rejected', 'closed'].includes(normalizedStatus))
        || normalizedStatus === statusFilter;
      const searchableText = [
        req.id,
        formatTicketId(req.ticket_id),
        req.service_type_name || req.service_type,
        req.address,
        req.request_source_label,
        req.priority,
        req.workflow_label,
        clientTechnicianDisplayString(req),
        req.description,
      ].join(' ').toLowerCase();
      const matchesSearch = !query || searchableText.includes(query);
      return matchesStatus && matchesSearch;
    }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleViewDetail = (requestId) => {
    navigate(`/client/requests/${requestId}?entity=request`);
  };

  const canCancelRequest = (request) => (
    ['pending', 'approved', 'not_started', 'on_hold'].includes(String(request.status || '').toLowerCase().replace(/\s+/g, '_'))
  );

  const confirmCancelRequest = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelServiceRequest(cancelTarget.id, cancelReason.trim());
      setCancelTarget(null);
      setCancelReason('');
      await loadRequests();
    } catch (err) {
      setError(err.message || 'Failed to cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRequests = filteredRequests.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);
  const statusOptions = [
    { value: 'active', label: 'Active / Ongoing' },
    { value: 'all', label: `All requests (${requests.length})` },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Request Tracking</h1>
            <p className="text-sm text-slate-500">Track active requests, ticket progress, technician assignment, and cancellations.</p>
          </div>
          <button
            onClick={() => navigate('/client/service-requests')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            <FiPlus size={16} /> Create Service Request
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <label className="relative block">
              <span className="sr-only">Search requests</span>
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search request, ticket, service, address"
                aria-label="Search requests"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="rounded-lg bg-white shadow-sm">
            <ListSkeleton rows={4} />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mt-4">
            <ErrorState
              error={error}
              onRetry={loadRequests}
            />
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredRequests.length === 0 && (
          <div className="mt-4">
            <EmptyState
              title={
                statusFilter === 'all'
                  ? 'No service requests found'
                  : statusFilter === 'active'
                    ? 'No active service requests'
                    : `No ${statusFilter} requests`
              }
              description="Create a service request or adjust your filters to view tracking details."
              actionLabel="New Service Request"
              onAction={() => navigate('/client/service-requests')}
            />
          </div>
        )}

        {!loading && filteredRequests.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Service Requests</h2>
                <p className="text-sm text-slate-500">
                  Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + ITEMS_PER_PAGE, filteredRequests.length)} of {filteredRequests.length} requests
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Request</th>
                    <th className="px-4 py-3">Service & Location</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Schedule</th>
                    <th className="px-4 py-3">Technician</th>
                    <th className="px-4 py-3">Ticket</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedRequests.map((request) => {
                    const technicianLabel = clientTechnicianDisplayString(request);
                    return (
                      <tr key={request.id} className="transition hover:bg-slate-50">
                        <td className="px-4 py-4 align-top">
                          <button
                            type="button"
                            onClick={() => handleViewDetail(request.id)}
                            className="font-semibold text-brand-700 hover:underline"
                          >
                            Request #{request.id}
                          </button>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {request.priority && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">
                                {request.priority}
                              </span>
                            )}
                            {request.request_source_label && (
                              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                {request.request_source_label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-[280px] px-4 py-4 align-top">
                          <p className="truncate font-semibold text-slate-900">{request.service_type_name || request.service_type || 'Service request'}</p>
                          <p className="mt-1 truncate text-sm text-slate-500">{request.address || 'No address set'}</p>
                          {request.description && <p className="mt-1 line-clamp-1 text-xs text-slate-400">{request.description}</p>}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <StatusBadge status={request.status} size="sm" />
                          {request.operational_status && request.operational_status !== request.status && (
                            <div className="mt-2">
                              <StatusBadge status={request.operational_status} size="sm" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top text-slate-600">
                          <div className="flex items-center gap-2">
                            <FiCalendar className="shrink-0 text-slate-400" size={14} />
                            <span>{request.scheduled_date ? formatDate(request.scheduled_date) : 'Not scheduled'}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">Requested {formatDate(request.request_date)}</p>
                        </td>
                        <td className="px-4 py-4 align-top text-slate-700">
                          {technicianLabel || <span className="text-slate-400">Unassigned</span>}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {request.ticket_id ? (
                            <span className="font-semibold text-slate-700">{formatTicketId(request.ticket_id)}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                          {request.workflow_label && <p className="mt-1 text-xs text-slate-400">{request.workflow_label}</p>}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleViewDetail(request.id)}
                              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                              aria-label={`View request ${request.id}`}
                            >
                              <FiEye size={16} />
                            </button>
                            {canCancelRequest(request) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelTarget(request);
                                  setCancelReason('');
                                }}
                                className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                                aria-label={`Cancel request ${request.id}`}
                              >
                                <FiX size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredRequests.length > ITEMS_PER_PAGE && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm">
                <span className="text-slate-500">
                  Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + ITEMS_PER_PAGE, filteredRequests.length)} of {filteredRequests.length} requests
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                  <span className="text-slate-500">Page {safeCurrentPage} of {totalPages}</span>
                  <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {cancelTarget && (
        <ConfirmationDialog
          title="Cancel service request?"
          message={`Request #${cancelTarget.id} will be removed from active processing if work has not started. AFN will be notified.`}
          tone="danger"
          icon="warning"
          confirmLabel="Cancel request"
          cancelLabel="Keep request"
          loading={cancelling}
          onCancel={() => {
            setCancelTarget(null);
            setCancelReason('');
          }}
          onConfirm={confirmCancelRequest}
        >
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Reason</span>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={3}
              maxLength={240}
              placeholder="Briefly explain why this request is being cancelled."
              className="mt-2 w-full resize-none rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </ConfirmationDialog>
      )}
    </Layout>
  );
}
