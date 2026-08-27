import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiCheckCircle,
  FiClipboard,
  FiAlertTriangle,
  FiRefreshCw,
  FiTrendingUp,
  FiX
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import ActiveTechnicianJobs from '../../components/shared/ActiveTechnicianJobs';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import StatsCard from '../../components/ui/StatsCard';
import StatusBadge from '../../components/ui/StatusBadge';
import SLABadge from '../../components/ui/SLABadge';
import { useAuth } from '../../context/AuthContext';
import { fetchDashboardStats, approveServiceRequest, rejectServiceRequest, fetchServiceRequest } from '../../api/api';
import { canViewAdminUserDirectory, hasAnyCapability, SERVICE_REQUEST_REVIEW_CAPABILITIES } from '../../rbac';
import {
  AUTO_REFRESH_MS,
  formatDate,
  formatDateTime,
  getDisplayText
} from '../../utils/dashboardHelpers';
import { formatClientId } from '../../utils/roleIds';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canReviewRequests = hasAnyCapability(user, SERVICE_REQUEST_REVIEW_CAPABILITIES);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [approvingRequests, setApprovingRequests] = useState(new Set());
  const [requestDecision, setRequestDecision] = useState(null);
  const [viewingRequestDetails, setViewingRequestDetails] = useState(null);

  const loadDashboard = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      setError('');
      const data = await fetchDashboardStats('admin');
      setStats(data || {});
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(err.message || 'Unable to load the admin dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleApproveRequest = async (requestId, requireInspection = false) => {
    setApprovingRequests(prev => new Set(prev).add(requestId));
    try {
      await approveServiceRequest(requestId, requireInspection);
      // Refresh the dashboard to show updated stats
      await loadDashboard({ silent: true });
      if (viewingRequestDetails?.id === requestId) {
        setViewingRequestDetails(null);
      }
    } catch (err) {
      setError(err.message || 'Unable to approve request.');
    } finally {
      setApprovingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const handleRejectRequest = async (requestId) => {
    setApprovingRequests(prev => new Set(prev).add(requestId));
    try {
      await rejectServiceRequest(requestId, 'Request rejected during admin review.');
      await loadDashboard({ silent: true });
      if (viewingRequestDetails?.id === requestId) {
        setViewingRequestDetails(null);
      }
    } catch (err) {
      setError(err.message || 'Unable to reject request.');
    } finally {
      setApprovingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const confirmRequestDecision = async () => {
    if (!requestDecision) return;
    const decision = requestDecision;
    setRequestDecision(null);
    if (decision.type === 'approve') {
      await handleApproveRequest(decision.id, false);
    } else if (decision.type === 'approve_inspection') {
      await handleApproveRequest(decision.id, true);
    } else {
      await handleRejectRequest(decision.id);
    }
  };

  useEffect(() => {
    loadDashboard();
    const intervalId = window.setInterval(() => loadDashboard({ silent: true }), AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  const overview = stats?.overview || {};
  const pendingRequests = Array.isArray(stats?.pending_requests) ? stats.pending_requests : [];
  const slaQueue = Array.isArray(stats?.sla_queue) ? stats.sla_queue : [];
  const clientSchedule = Array.isArray(stats?.client_schedule) ? stats.client_schedule : [];
  const activeTechnicianJobs = Array.isArray(stats?.operations?.active_technician_jobs)
    ? stats.operations.active_technician_jobs
    : (Array.isArray(stats?.active_technician_jobs) ? stats.active_technician_jobs : []);
  const pendingApprovalsCount = Number(overview.pending_approvals ?? pendingRequests.length ?? 0);
  const activeTicketsCount = Number(overview.active_tickets ?? 0);
  const completedTodayCount = Number(overview.completed_today ?? 0);
  const activeTechniciansCount = Number(overview.active_technicians ?? 0);
  const slaOverview = stats?.sla_overview || {};
  const slaWarningCount = Number(slaOverview.warning_count ?? 0);
  const slaOverdueCount = Number(slaOverview.overdue_count ?? 0);
  const lowStockCount = Number(overview.low_stock_items ?? 0);
  const canOpenUsers = canViewAdminUserDirectory(user);

  const isActiveScheduleTicket = (ticket) => !['completed', 'cancelled'].includes(
    String(ticket?.status || '').toLowerCase().replace(/\s+/g, '_')
  );

  const filteredPendingRequests = pendingRequests;

  const filteredClientSchedule = useMemo(
    () => clientSchedule.filter((ticket) => (
      isActiveScheduleTicket(ticket)
    )),
    [clientSchedule]
  );

  const filteredSlaQueue = slaQueue;
  const filteredActiveTechnicianJobs = activeTechnicianJobs;
  const attentionItems = [
    {
      label: 'Pending approvals',
      value: pendingApprovalsCount,
      tone: pendingApprovalsCount ? 'text-amber-700 bg-amber-50 ring-amber-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'SLA warnings',
      value: slaWarningCount,
      tone: slaWarningCount ? 'text-orange-700 bg-orange-50 ring-orange-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'Overdue SLA',
      value: slaOverdueCount,
      tone: slaOverdueCount ? 'text-rose-700 bg-rose-50 ring-rose-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'Low stock',
      value: lowStockCount,
      tone: lowStockCount ? 'text-amber-700 bg-amber-50 ring-amber-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
  ];
  const totalAttentionCount = attentionItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Last updated: <span className="font-medium text-slate-700">{formatDateTime(lastUpdated)}</span>
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="Pending Approvals"
            value={pendingApprovalsCount}
            icon={FiClipboard}
            accent="amber"
            color="text-amber-600"
          />
          <StatsCard
            title="Active Tickets"
            value={activeTicketsCount}
            icon={FiTrendingUp}
            accent="blue"
            color="text-brand-600"
          />
          <StatsCard
            title="Completed Today"
            value={completedTodayCount}
            icon={FiCheckCircle}
            accent="emerald"
            color="text-emerald-600"
          />
          <StatsCard
            title="Active Technicians"
            value={activeTechniciansCount}
            icon={FiCheckCircle}
            accent="emerald"
            color="text-emerald-600"
          />
        </div>

        {/* ── Attention bar ── */}
        {/* ── Two-column: Approvals + Schedule ── */}
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`grid h-9 w-9 flex-none place-items-center rounded-lg ${totalAttentionCount ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {totalAttentionCount ? <FiAlertTriangle /> : <FiCheckCircle />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {totalAttentionCount ? `${totalAttentionCount} item${totalAttentionCount === 1 ? '' : 's'} need attention` : 'No urgent dashboard alerts'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {attentionItems.map((item) => (
                <span key={item.label} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${item.tone}`}>
                  <span>{item.value}</span>
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          {/* Pending Approvals */}
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Pending Approvals</h2>
            </div>
            <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {loading && !stats ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
                </div>
              ) : filteredPendingRequests.length ? (
                filteredPendingRequests.map((req) => (
                  <div key={req.id} className="flex flex-col gap-3 rounded-xl bg-surface-50 px-4 py-3 transition hover:bg-surface-100 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{req.client || 'Client not set'}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{req.service_type || 'Service not set'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                      <StatusBadge status={req.status || 'pending'} size="sm" />
                      <span className="text-xs text-slate-400">{formatDate(req.request_date)}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const fullReq = await fetchServiceRequest(req.id);
                            setViewingRequestDetails(fullReq);
                          } catch (err) {
                            console.error(err);
                            setViewingRequestDetails(req);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
                      >
                        <FiClipboard className="h-3 w-3" />
                        View Details
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No approvals waiting.</p>
              )}
            </div>
          </div>

          {/* Upcoming Schedule */}
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Upcoming Schedule</h2>
              <button
                type="button"
                onClick={() => navigate('/admin/dispatch-board')}
                className="text-sm font-medium text-brand-500 transition hover:text-brand-600"
              >
                Dispatch board →
              </button>
            </div>
            <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {loading && !stats ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
                </div>
              ) : filteredClientSchedule.length ? (
                filteredClientSchedule.map((ticket) => (
                  <div key={ticket.id} className="flex flex-col gap-3 rounded-xl bg-surface-50 px-4 py-3 transition hover:bg-surface-100 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{ticket.client || 'Client not set'}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {ticket.service_type || 'Service not set'}
                        {ticket.assigned_technician ? ` · ${ticket.assigned_technician}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                      <StatusBadge status={ticket.status || 'scheduled'} size="sm" />
                      <span className="text-xs text-slate-400">
                        {formatDate(ticket.scheduled_date)}
                        {ticket.scheduled_time ? ` ${ticket.scheduled_time}` : ''}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No scheduled visits yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Active Technician Jobs ── */}
        <ActiveTechnicianJobs
          jobs={filteredActiveTechnicianJobs}
          title="Technician Job Progress"
        />

        {/* ── SLA Watchlist ── */}
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">SLA Watchlist</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-slate-600">
              {filteredSlaQueue.length} items
            </span>
          </div>

          {loading && !stats ? (
            <div className="mt-4 space-y-2">
              {[1,2,3].map((i) => <div key={i} className="skeleton h-10 w-full" />)}
            </div>
          ) : filteredSlaQueue.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-xs font-medium uppercase tracking-wider text-slate-400">
                    <th className="pb-3 pr-4">Client / Service</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">SLA</th>
                    <th className="pb-3">Schedule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {filteredSlaQueue.slice(0, 5).map((item) => {
                    const slaLabel = getDisplayText(item.sla) || 'SLA tracked';
                    return (
                      <tr key={`${item.entity_type || 'item'}-${item.id}`} className="text-slate-700 transition hover:bg-surface-50">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-800">{item.client || 'Not set'}</p>
                          <p className="text-xs text-slate-500">{item.service_type || ''}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs capitalize text-slate-500">
                          {item.entity_type === 'request' ? 'Request' : 'Ticket'}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={item.status || 'open'} size="sm" />
                        </td>
                        <td className="py-3 pr-4">
                          <SLABadge sla={item.sla} />
                        </td>
                        <td className="py-3 text-xs text-slate-500">
                          {item.scheduled_date ? formatDate(item.scheduled_date) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 py-8 text-center text-sm text-slate-400">SLA queue is clear.</p>
          )}
        </div>

      </div>
      {requestDecision && (
        <ConfirmationDialog
          title={requestDecision.type === 'approve'
            ? 'Approve request for service?'
            : requestDecision.type === 'approve_inspection'
              ? 'Require site inspection?'
              : 'Reject request?'}
          message={requestDecision.type === 'approve'
            ? `${requestDecision.label} will be approved and a service ticket will be prepared for dispatch.`
            : requestDecision.type === 'approve_inspection'
              ? `This will create an inspection ticket for ${requestDecision.label}. A technician must complete the site survey before service approval.`
              : `${requestDecision.label} will be rejected and the client will be notified.`}
          tone={requestDecision.type === 'approve' || requestDecision.type === 'approve_inspection' ? 'success' : 'danger'}
          icon={requestDecision.type === 'approve' || requestDecision.type === 'approve_inspection' ? 'success' : 'warning'}
          confirmLabel={requestDecision.type === 'approve'
            ? 'Approve request'
            : requestDecision.type === 'approve_inspection'
              ? 'Require inspection'
              : 'Reject request'}
          cancelLabel="Cancel"
          onCancel={() => setRequestDecision(null)}
          onConfirm={confirmRequestDecision}
        />
      )}

      {viewingRequestDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Service Request Details</h3>
                <p className="text-sm text-slate-500">#{viewingRequestDetails.id} • Submitted {formatDateTime(viewingRequestDetails.request_date)}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRequestDetails(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Client Information</h4>
                  <p className="mt-1 text-sm font-medium text-slate-900">{viewingRequestDetails.client_fullname || viewingRequestDetails.client_name}</p>
                  <p className="text-sm text-slate-600">{formatClientId(viewingRequestDetails.client)}</p>
                  <div className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phone</p>
                      <p className="mt-1 font-medium text-slate-900">{viewingRequestDetails.client_phone || 'No phone provided'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</p>
                      <p className="mt-1 break-words font-medium text-slate-900">{viewingRequestDetails.client_email || 'No email provided'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Account Address</p>
                      <p className="mt-1 whitespace-pre-line font-medium text-slate-900">{viewingRequestDetails.client_address || 'No account address provided'}</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Service Required</h4>
                  <p className="mt-1 text-sm font-medium text-slate-900">{viewingRequestDetails.service_summary || viewingRequestDetails.service_type_name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                      Priority: {viewingRequestDetails.priority}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                      Source: {viewingRequestDetails.request_source_label}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Location</h4>
                  <p className="mt-1 text-sm text-slate-900 whitespace-pre-line">
                    {viewingRequestDetails.location?.address || 'No address provided'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {viewingRequestDetails.location?.city || 'City not provided'}
                    {viewingRequestDetails.location?.province ? `, ${viewingRequestDetails.location.province}` : ''}
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preferred Schedule</h4>
                  <p className="mt-1 text-sm text-slate-900">
                    {viewingRequestDetails.preferred_date ? formatDate(viewingRequestDetails.preferred_date) : 'No preferred date'}
                    {viewingRequestDetails.preferred_time_slot ? ` • ${viewingRequestDetails.preferred_time_slot.replace('_', ' ')}` : ''}
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Description / Notes</h4>
                  <div className="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-line">
                    {viewingRequestDetails.description || 'No additional details provided.'}
                    {viewingRequestDetails.scheduling_notes && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <span className="font-semibold block mb-1">Scheduling Notes:</span>
                        {viewingRequestDetails.scheduling_notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {canReviewRequests && <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 rounded-b-2xl flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setRequestDecision({ type: 'reject', id: viewingRequestDetails.id, label: viewingRequestDetails.service_summary || viewingRequestDetails.service_type_name || 'this request' })}
                disabled={approvingRequests.has(viewingRequestDetails.id)}
                className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 hover:border-rose-300 disabled:opacity-60"
              >
                Reject Request
              </button>
              
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRequestDecision({ type: 'approve_inspection', id: viewingRequestDetails.id, label: viewingRequestDetails.service_summary || viewingRequestDetails.service_type_name || 'this request' })}
                  disabled={approvingRequests.has(viewingRequestDetails.id)}
                  className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 hover:border-indigo-300 disabled:opacity-60"
                >
                  {approvingRequests.has(viewingRequestDetails.id) ? 'Processing...' : 'Require Inspection'}
                </button>
                <button
                  type="button"
                  onClick={() => setRequestDecision({ type: 'approve', id: viewingRequestDetails.id, label: viewingRequestDetails.service_summary || viewingRequestDetails.service_type_name || 'this request' })}
                  disabled={approvingRequests.has(viewingRequestDetails.id)}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 shadow-sm"
                >
                  {approvingRequests.has(viewingRequestDetails.id) ? 'Approving...' : 'Approve for Service'}
                </button>
              </div>
            </div>}
          </div>
        </div>
      )}
    </Layout>
  );
}
