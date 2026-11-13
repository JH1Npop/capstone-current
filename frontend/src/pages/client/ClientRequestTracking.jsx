import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState, ErrorState } from '../../components/ui/StateDisplay';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import StatusBadge, { formatStatusLabel } from '../../components/ui/StatusBadge';
import { FiCalendar, FiEye, FiMapPin, FiPlus, FiSearch, FiUser, FiX } from 'react-icons/fi';
import { canClientDismissRequest, cancelServiceRequest, fetchClientRequests } from '../../api/api';
import { clientTechnicianDisplayString } from '../../utils/clientTechnicianDisplay';
import { formatRequestId, formatTicketId } from '../../utils/roleIds';

const ITEMS_PER_PAGE = 10;

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
  // Errors from dismissing stay in the dialog; a short notice confirms success.
  const [cancelError, setCancelError] = useState('');
  const [notice, setNotice] = useState('');
  // PC/laptop quick view (the eye button); phones open the full page directly.
  const [quickView, setQuickView] = useState(null);
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
      setError(err.message || 'Failed to load requests');
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
        formatRequestId(req.id),
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

  const showPriority = (request) => request.priority && String(request.priority).toLowerCase() !== 'normal';
  const showSource = (request) => request.request_source_label && request.request_source_label !== 'Client Portal';
  // Before a visit is booked, the client's own preferred date is the useful one to show.
  const scheduleText = (request) => {
    if (request.scheduled_date) return formatDate(request.scheduled_date);
    if (request.preferred_date && !['cancelled', 'completed'].includes(String(request.status))) return `Preferred ${formatDate(request.preferred_date)}`;
    return 'Not scheduled';
  };

  // Escape closes the quick view (the dismiss dialog handles its own Escape).
  useEffect(() => {
    if (!quickView) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setQuickView(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [quickView]);

  const handleViewDetail = (requestId) => {
    navigate(`/client/requests/${requestId}?entity=request`);
  };

  // Shared with Request Detail; follows the server rule.
  const canCancelRequest = canClientDismissRequest;
  const openCancel = (request) => {
    setCancelTarget(request);
    setCancelReason('');
    setCancelError('');
  };

  const confirmCancelRequest = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      setCancelError('Please give a short reason so the office knows why.');
      return;
    }
    setCancelling(true);
    setCancelError('');
    try {
      await cancelServiceRequest(cancelTarget.id, cancelReason.trim());
      setNotice(`${formatRequestId(cancelTarget.id)} was dismissed. The office has been told.`);
      setCancelTarget(null);
      setCancelReason('');
      await loadRequests();
    } catch (err) {
      setCancelError(err.message || 'Failed to dismiss request');
    } finally {
      setCancelling(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRequests = filteredRequests.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);
  // Same words as the Dashboard.
  const statusOptions = [
    { value: 'active', label: 'Active / Ongoing' },
    { value: 'all', label: `All requests (${requests.length})` },
    { value: 'pending', label: 'Waiting for approval' },
    { value: 'approved', label: 'Approved, waiting to start' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Dismissed or not accepted' },
  ];
  const statusFilterLabel = statusOptions.find((option) => option.value === statusFilter)?.label || statusFilter;

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/client/service-requests')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
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
              aria-label="Show requests"
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

        {notice ? (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} className="min-h-11 px-2 font-semibold">Dismiss</button>
          </div>
        ) : null}

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
                    : `No requests: ${statusFilterLabel}`
              }
              description={searchTerm.trim() ? `Nothing matches "${searchTerm.trim()}". Clear the search or choose another filter.` : 'Create a service request or choose another filter.'}
              actionLabel="New Service Request"
              onAction={() => navigate('/client/service-requests')}
            />
          </div>
        )}

        {!loading && filteredRequests.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Results</h2>
                <p className="text-sm text-slate-500">
                  Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + ITEMS_PER_PAGE, filteredRequests.length)} of {filteredRequests.length} requests
                </p>
              </div>
            </div>
            <div className="space-y-3 bg-slate-50/70 p-3 md:hidden">
              {paginatedRequests.map((request) => {
                const technicianLabel = clientTechnicianDisplayString(request);
                return (
                  <article key={request.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => handleViewDetail(request.id)}
                          className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 hover:underline"
                        >
                          {formatRequestId(request.id)}
                        </button>
                        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                          {request.service_type_name || request.service_type || 'Service request'}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <StatusBadge status={request.rejected ? 'rejected' : request.status} size="sm" />
                      </div>
                    </div>

                    <div className="space-y-3 px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {showPriority(request) && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold capitalize text-amber-800">
                            {request.priority} priority
                          </span>
                        )}
                        {showSource(request) && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                            {request.request_source_label}
                          </span>
                        )}
                        {request.operational_status && request.operational_status !== request.status && (
                          // One status badge per card; the job's progress reads as a labeled stage.
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                            Stage: {formatStatusLabel(request.operational_status)}
                          </span>
                        )}
                      </div>

                      {request.description && (
                        <p className="line-clamp-2 text-sm leading-5 text-slate-600">{request.description}</p>
                      )}

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="min-w-0">
                          <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            <FiCalendar size={13} /> Schedule
                          </dt>
                          <dd className="mt-1 font-medium text-slate-700">
                            {scheduleText(request)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            <FiUser size={13} /> Technician
                          </dt>
                          <dd className="mt-1 truncate font-medium text-slate-700">
                            {technicianLabel || 'Unassigned'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket</dt>
                          <dd className="mt-1 font-medium text-slate-700">
                            {request.ticket_id ? formatTicketId(request.ticket_id) : 'Not created'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Requested</dt>
                          <dd className="mt-1 font-medium text-slate-700">{formatDate(request.request_date)}</dd>
                        </div>
                      </dl>

                      <div className="flex items-start gap-2 text-sm text-slate-500">
                        <FiMapPin className="mt-0.5 shrink-0" size={15} />
                        <span className="line-clamp-2">{request.address || 'No service address set'}</span>
                      </div>

                      {request.rejected ? (
                        <p className="text-xs font-medium text-rose-700">
                          Not accepted by our office{request.closure_reason ? `: ${request.closure_reason}` : '.'}
                        </p>
                      ) : request.workflow_label && (
                        <p className="text-xs font-medium text-slate-500">Current step: {request.workflow_label}</p>
                      )}
                    </div>

                    <div className="flex gap-2 border-t border-slate-100 bg-white px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleViewDetail(request.id)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white transition hover:bg-brand-600"
                      >
                        <FiEye size={16} /> View details
                      </button>
                      {canCancelRequest(request) && (
                        <button
                          type="button"
                          onClick={() => openCancel(request)}
                          aria-label={`Dismiss request ${request.id}`}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                        >
                          <FiX size={16} /> Dismiss
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
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
                            className="whitespace-nowrap font-semibold text-brand-700 hover:underline"
                          >
                            {formatRequestId(request.id)}
                          </button>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {showPriority(request) && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold capitalize text-amber-800">
                                {request.priority} priority
                              </span>
                            )}
                            {showSource(request) && (
                              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
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
                          <StatusBadge status={request.rejected ? 'rejected' : request.status} size="sm" />
                          {request.operational_status && request.operational_status !== request.status && (
                            <p className="mt-2 text-xs font-semibold text-slate-500">
                              Stage: {formatStatusLabel(request.operational_status)}
                            </p>
                          )}
                          {request.rejected && request.closure_reason && (
                            <p className="mt-2 max-w-[14rem] text-xs text-rose-700">{request.closure_reason}</p>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top text-slate-600">
                          <div className="flex items-center gap-2">
                            <FiCalendar className="shrink-0 text-slate-400" size={14} />
                            <span>{scheduleText(request)}</span>
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
                            <span className="text-slate-400">No ticket</span>
                          )}
                          {request.workflow_label && <p className="mt-1 text-xs text-slate-400">{request.workflow_label}</p>}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setQuickView(request)}
                              title="Quick view"
                              className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                              aria-label={`Quick view ${formatRequestId(request.id)}`}
                            >
                              <FiEye size={16} />
                            </button>
                            {canCancelRequest(request) && (
                              <button
                                type="button"
                                onClick={() => openCancel(request)}
                                className="grid h-10 w-10 place-items-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                                aria-label={`Dismiss request ${request.id}`}
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
                  <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                  <span className="text-slate-500">Page {safeCurrentPage} of {totalPages}</span>
                  <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {quickView && (() => {
        const technicianLabel = clientTechnicianDisplayString(quickView);
        const fact = (label, value) => (
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd>
          </div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && setQuickView(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="request-quick-view-title" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <h2 id="request-quick-view-title" className="text-lg font-bold text-slate-900">{formatRequestId(quickView.id)}</h2>
                  <p className="truncate text-sm text-slate-500">{quickView.service_type_name || quickView.service_type || 'Service request'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={quickView.rejected ? 'rejected' : quickView.status} size="sm" />
                  <button type="button" onClick={() => setQuickView(null)} aria-label="Close quick view" className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                    <FiX size={18} />
                  </button>
                </div>
              </div>
              <div className="space-y-4 px-5 py-4">
                {quickView.rejected ? (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Not accepted by our office{quickView.closure_reason ? `: ${quickView.closure_reason}` : '.'}</p>
                ) : quickView.workflow_label ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-semibold">Current step:</span> {quickView.workflow_label}
                    {quickView.operational_status && quickView.operational_status !== quickView.status ? ` · ${formatStatusLabel(quickView.operational_status)}` : ''}
                  </p>
                ) : null}
                <dl className="grid grid-cols-2 gap-4">
                  {fact('Schedule', scheduleText(quickView))}
                  {fact('Technician', technicianLabel || 'Not assigned yet')}
                  {fact('Ticket', quickView.ticket_id ? formatTicketId(quickView.ticket_id) : 'No ticket yet')}
                  {fact('Requested', formatDate(quickView.request_date))}
                  <div className="col-span-2">{fact('Address', quickView.address || 'No service address set')}</div>
                  {quickView.description ? <div className="col-span-2">{fact('Your notes', quickView.description)}</div> : null}
                </dl>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
                {canCancelRequest(quickView) ? (
                  <button
                    type="button"
                    onClick={() => {
                      const target = quickView;
                      setQuickView(null);
                      openCancel(target);
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <FiX size={16} /> Dismiss request
                  </button>
                ) : null}
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    // Close first: the list stays on screen while the detail page loads, and Back
                    // would otherwise return to a still-open quick view.
                    const requestId = quickView.id;
                    setQuickView(null);
                    handleViewDetail(requestId);
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  <FiEye size={16} /> Open full details
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {cancelTarget && (
        <ConfirmationDialog
          title="Dismiss service request?"
          message={`${formatRequestId(cancelTarget.id)} will be closed and removed from active processing if work has not started. AFN will be notified, and the request will remain in its history.`}
          tone="danger"
          icon="warning"
          confirmLabel="Dismiss request"
          cancelLabel="Keep request"
          loading={cancelling}
          onCancel={() => {
            setCancelTarget(null);
            setCancelReason('');
            setCancelError('');
          }}
          onConfirm={confirmCancelRequest}
        >
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Reason <span className="text-rose-600">*</span></span>
            <textarea
              value={cancelReason}
              required
              aria-invalid={Boolean(cancelError) && !cancelReason.trim()}
              onChange={(event) => {
                setCancelReason(event.target.value);
                if (cancelError) setCancelError('');
              }}
              rows={3}
              maxLength={240}
              placeholder="Briefly explain why this request should be dismissed."
              className="mt-2 w-full resize-none rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100 sm:text-sm"
            />
            <span className="mt-1 block text-right text-xs text-slate-400">{cancelReason.length}/240</span>
          </label>
          {cancelError ? <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{cancelError}</p> : null}
        </ConfirmationDialog>
      )}
    </Layout>
  );
}
