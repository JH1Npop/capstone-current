import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FiCheckCircle,
  FiClipboard,
  FiAlertTriangle,
  FiBox,
  FiClock,
  FiTool,
  FiUsers,
  FiRefreshCw,
  FiTrendingUp,
  FiExternalLink,
  FiX
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import ActiveTechnicianJobs from '../../components/shared/ActiveTechnicianJobs';
import ActiveJobDetailsDialog from '../../components/shared/ActiveJobDetailsDialog';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import StatsCard from '../../components/ui/StatsCard';
import StatusBadge from '../../components/ui/StatusBadge';
import SLABadge from '../../components/ui/SLABadge';
import { useAuth } from '../../context/AuthContext';
import { fetchDashboardStats, approveServiceRequest, rejectServiceRequest, fetchServiceRequest } from '../../api/api';
import {
  ADMIN_JOB_HISTORY_CAPABILITIES,
  AFTER_SALES_CASE_CAPABILITIES,
  INVENTORY_VIEW_CAPABILITIES,
  SERVICE_REQUEST_REVIEW_CAPABILITIES,
  SUPERVISOR_DISPATCH_CAPABILITIES,
  SUPERVISOR_TICKETS_CAPABILITIES,
  SUPERVISOR_TRACKING_CAPABILITIES,
  canViewAdminUserDirectory,
  hasAnyCapability,
} from '../../rbac';
import {
  AUTO_REFRESH_MS,
  formatDate,
  formatDateTime,
  getDisplayText
} from '../../utils/dashboardHelpers';
import { formatClientId } from '../../utils/roleIds';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const canReviewRequests = hasAnyCapability(user, SERVICE_REQUEST_REVIEW_CAPABILITIES);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [approvingRequests, setApprovingRequests] = useState(new Set());
  const [requestDecision, setRequestDecision] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewingRequestDetails, setViewingRequestDetails] = useState(null);
  const [viewingActiveJob, setViewingActiveJob] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const detailsDialogRef = useRef(null);
  const detailsTriggerRef = useRef(null);
  const activeJobTriggerRef = useRef(null);

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
        closeRequestDetails();
      }
      setActionMessage(requireInspection
        ? 'Request approved for site inspection.'
        : 'Request approved and prepared for dispatch.');
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

  const handleRejectRequest = async (requestId, reason) => {
    setApprovingRequests(prev => new Set(prev).add(requestId));
    try {
      await rejectServiceRequest(requestId, reason);
      await loadDashboard({ silent: true });
      if (viewingRequestDetails?.id === requestId) {
        closeRequestDetails();
      }
      setActionMessage('Request rejected with the recorded reason.');
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
      await handleRejectRequest(decision.id, rejectReason.trim());
      setRejectReason('');
    }
  };

  const closeRequestDetails = () => {
    setViewingRequestDetails(null);
    window.requestAnimationFrame(() => detailsTriggerRef.current?.focus());
  };

  const openRequestDetails = async (requestId, fallback, trigger = null) => {
    detailsTriggerRef.current = trigger;
    try {
      const fullRequest = await fetchServiceRequest(requestId);
      setViewingRequestDetails(fullRequest);
    } catch (requestError) {
      console.error(requestError);
      setViewingRequestDetails(fallback || { id: requestId });
    }
  };

  const openActiveJobDetails = (job, trigger = null) => {
    activeJobTriggerRef.current = trigger;
    setViewingActiveJob(job);
  };

  const closeActiveJobDetails = () => {
    setViewingActiveJob(null);
    window.requestAnimationFrame(() => activeJobTriggerRef.current?.focus());
  };

  const focusDashboardSection = (sectionId) => {
    navigate(`/admin/dashboard#${sectionId}`);
    window.requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      section?.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    loadDashboard();
    const intervalId = window.setInterval(() => loadDashboard({ silent: true }), AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!viewingRequestDetails) return undefined;
    const dialog = detailsDialogRef.current;
    const focusable = dialog?.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRequestDetails();
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewingRequestDetails]);

  useEffect(() => {
    const sectionId = location.hash.replace(/^#/, '');
    if (!sectionId || !stats) return;
    window.requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ block: 'start' }));
  }, [location.hash, stats]);

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
  const outOfStockCount = Number(overview.out_of_stock ?? 0);
  const dueMaintenanceCount = Number(overview.due_maintenance ?? 0);
  const overdueCasesCount = Number(overview.overdue_cases ?? 0);
  const unassignedScheduleCount = Number(overview.unassigned_scheduled_jobs ?? 0);
  const listCounts = stats?.list_counts || {};
  const pendingRequestTotal = Number(listCounts.pending_requests ?? pendingApprovalsCount);
  const scheduledJobTotal = Number(listCounts.client_schedule ?? clientSchedule.length ?? 0);
  const canOpenUsers = canViewAdminUserDirectory(user);
  const canOpenTickets = hasAnyCapability(user, SUPERVISOR_TICKETS_CAPABILITIES);
  const canOpenDispatch = hasAnyCapability(user, SUPERVISOR_DISPATCH_CAPABILITIES);
  const canOpenInventory = hasAnyCapability(user, INVENTORY_VIEW_CAPABILITIES);
  const canOpenAfterSales = hasAnyCapability(user, AFTER_SALES_CASE_CAPABILITIES);
  const canOpenJobHistory = hasAnyCapability(user, ADMIN_JOB_HISTORY_CAPABILITIES);
  const canOpenTracking = hasAnyCapability(user, SUPERVISOR_TRACKING_CAPABILITIES);

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
      icon: FiClipboard,
      actionLabel: 'Review requests',
      onClick: canReviewRequests ? () => focusDashboardSection('pending-approvals') : null,
      tone: pendingApprovalsCount ? 'text-amber-700 bg-amber-50 ring-amber-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'SLA warnings',
      value: slaWarningCount,
      icon: FiClock,
      actionLabel: 'Open warning queue',
      path: canOpenTickets ? '/admin/service-tickets?focus=sla-warning' : null,
      tone: slaWarningCount ? 'text-orange-700 bg-orange-50 ring-orange-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'Overdue SLA',
      value: slaOverdueCount,
      icon: FiAlertTriangle,
      actionLabel: 'Open overdue queue',
      path: canOpenTickets ? '/admin/service-tickets?focus=sla-overdue' : null,
      tone: slaOverdueCount ? 'text-rose-700 bg-rose-50 ring-rose-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'Low stock',
      value: lowStockCount,
      icon: FiBox,
      actionLabel: 'Open inventory',
      path: canOpenInventory ? '/admin/inventory' : null,
      tone: lowStockCount ? 'text-amber-700 bg-amber-50 ring-amber-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'Out of stock',
      value: outOfStockCount,
      icon: FiBox,
      actionLabel: 'Open inventory',
      path: canOpenInventory ? '/admin/inventory' : null,
      tone: outOfStockCount ? 'text-rose-700 bg-rose-50 ring-rose-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'Unassigned visits',
      value: unassignedScheduleCount,
      icon: FiUsers,
      actionLabel: 'Open dispatch',
      path: canOpenDispatch ? '/admin/dispatch-board' : null,
      tone: unassignedScheduleCount ? 'text-orange-700 bg-orange-50 ring-orange-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'Maintenance due',
      value: dueMaintenanceCount,
      icon: FiTool,
      actionLabel: 'Review required',
      path: null,
      tone: dueMaintenanceCount ? 'text-orange-700 bg-orange-50 ring-orange-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
    {
      label: 'Overdue after-sales',
      value: overdueCasesCount,
      icon: FiAlertTriangle,
      actionLabel: 'Open cases',
      path: canOpenAfterSales ? '/admin/after-sales-cases?status=open' : null,
      tone: overdueCasesCount ? 'text-rose-700 bg-rose-50 ring-rose-200' : 'text-slate-600 bg-slate-50 ring-slate-200',
    },
  ];
  const activeAttentionItems = attentionItems.filter((item) => item.value > 0);
  const attentionCategoryCount = activeAttentionItems.length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-white via-brand-50/70 to-sky-50/70 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <FiTrendingUp className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Live operations snapshot</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Updated <span className="font-medium text-slate-700">{formatDateTime(lastUpdated)}</span> · refreshes every 45 seconds
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadDashboard({ silent: true })}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
          >
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing' : 'Refresh dashboard'}
          </button>
        </div>

        {error && (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
            <span>{stats ? `Showing last known data. ${error}` : error}</span>
            <button type="button" onClick={() => loadDashboard()} className="font-semibold underline underline-offset-2">Try again</button>
          </div>
        )}

        {actionMessage && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>{actionMessage}</span>
            <button type="button" onClick={() => setActionMessage('')} aria-label="Dismiss update" className="rounded-md p-1 hover:bg-emerald-100"><FiX /></button>
          </div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="Pending Approvals"
            value={pendingApprovalsCount}
            icon={FiClipboard}
            accent="amber"
            color="text-amber-600"
            helper={canReviewRequests ? 'Review on this dashboard' : 'Awaiting review'}
            onClick={canReviewRequests ? () => focusDashboardSection('pending-approvals') : undefined}
          />
          <StatsCard
            title="Active Tickets"
            value={activeTicketsCount}
            icon={FiTrendingUp}
            accent="blue"
            color="text-brand-600"
            helper={canOpenTickets ? 'Open service tickets' : 'Current active work'}
            onClick={canOpenTickets ? () => navigate('/admin/service-tickets?focus=active') : undefined}
          />
          <StatsCard
            title="Completed Today"
            value={completedTodayCount}
            icon={FiCheckCircle}
            accent="emerald"
            color="text-emerald-600"
            helper={canOpenJobHistory ? 'Open completed jobs' : 'Business day total'}
            onClick={canOpenJobHistory ? () => navigate('/admin/job-history') : undefined}
          />
          <StatsCard
            title="Active Technician Accounts"
            value={activeTechniciansCount}
            icon={FiCheckCircle}
            accent="emerald"
            color="text-emerald-600"
            helper={canOpenTracking ? 'Open technician tracking' : (canOpenUsers ? 'Open user directory' : 'Enabled accounts')}
            onClick={canOpenTracking
              ? () => navigate('/admin/technician-tracking')
              : (canOpenUsers ? () => navigate('/admin/user-management') : undefined)}
          />
        </div>

        {/* ── Attention bar ── */}
        {/* ── Two-column: Approvals + Schedule ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`grid h-9 w-9 flex-none place-items-center rounded-lg ${attentionCategoryCount ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {attentionCategoryCount ? <FiAlertTriangle className="h-4 w-4" /> : <FiCheckCircle className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900">
                  {attentionCategoryCount ? `${attentionCategoryCount} area${attentionCategoryCount === 1 ? ' needs' : 's need'} your attention` : 'Everything looks under control'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">Operations control</p>
              </div>
            </div>
            {activeAttentionItems.length > 0 ? (
              <div className="flex flex-wrap gap-2">
              {activeAttentionItems.map((item) => {
                const actionable = item.path || item.onClick;
                const ItemIcon = item.icon || FiAlertTriangle;
                const content = (
                  <>
                    <ItemIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="font-bold">{item.value}</span>
                    <span>{item.label}</span>
                    {actionable && <FiExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />}
                  </>
                );
                return actionable ? (
                  <button
                    type="button"
                    key={item.label}
                    onClick={() => item.onClick ? item.onClick() : navigate(item.path)}
                    aria-label={`${item.label}: ${item.value}. ${item.actionLabel}`}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${item.tone}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={item.label} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset ${item.tone}`}>{content}</div>
                );
              })}
              </div>
            ) : (
              <span className="text-xs font-semibold text-emerald-700">All queues clear</span>
            )}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          {/* Pending Approvals */}
          <div id="pending-approvals" tabIndex={-1} className="card scroll-mt-24 p-5 outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700"><FiClipboard /></span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Pending Approvals</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Showing {filteredPendingRequests.length} of {pendingRequestTotal}</p>
                </div>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Review queue</span>
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
                        onClick={(event) => openRequestDetails(req.id, req, event.currentTarget)}
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
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700"><FiClock /></span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Upcoming Schedule</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Showing {filteredClientSchedule.length} of {scheduledJobTotal}</p>
                </div>
              </div>
              {canOpenDispatch && <button
                type="button"
                onClick={() => navigate('/admin/dispatch-board')}
                className="text-sm font-medium text-brand-500 transition hover:text-brand-600"
              >
                Dispatch board →
              </button>}
            </div>
            <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {loading && !stats ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
                </div>
              ) : filteredClientSchedule.length ? (
                filteredClientSchedule.map((ticket) => (
                  <button key={ticket.id} type="button" onClick={() => canOpenDispatch && navigate('/admin/dispatch-board')} disabled={!canOpenDispatch} className="flex w-full flex-col gap-3 rounded-xl bg-surface-50 px-4 py-3 text-left transition hover:bg-surface-100 disabled:cursor-default sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{ticket.client || 'Client not set'}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {ticket.service_type || 'Service not set'}
                        {ticket.assigned_technician ? ` · ${ticket.assigned_technician}` : ' · Unassigned'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                      <StatusBadge status={ticket.status || 'scheduled'} size="sm" />
                      <span className="text-xs text-slate-400">
                        {formatDate(ticket.scheduled_date)}
                        {ticket.scheduled_time ? ` ${ticket.scheduled_time}` : ''}
                      </span>
                    </div>
                  </button>
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
          onJobClick={canOpenTickets ? openActiveJobDetails : undefined}
          onViewAll={canOpenDispatch ? () => navigate('/admin/dispatch-board') : undefined}
        />

        {/* ── SLA Watchlist ── */}
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">SLA Watchlist</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-slate-600">
              Showing {Math.min(filteredSlaQueue.length, 5)} of {filteredSlaQueue.length}
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
                    <th className="pb-3 text-right">Action</th>
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
                        <td className="py-3 text-right">
                          {canOpenTickets && (
                            <button
                              type="button"
                              onClick={(event) => item.entity_type === 'request'
                                ? openRequestDetails(item.id, item, event.currentTarget)
                                : navigate(`/admin/service-tickets?focus=${item.sla?.state === 'overdue' ? 'sla-overdue' : 'sla-warning'}`)}
                              className="font-semibold text-brand-600 hover:text-brand-700"
                            >
                              Open
                            </button>
                          )}
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
          disabled={requestDecision.type === 'reject' && rejectReason.trim().length < 8}
          onCancel={() => {
            setRequestDecision(null);
            setRejectReason('');
          }}
          onConfirm={confirmRequestDecision}
        >
          {requestDecision.type === 'reject' && (
            <div>
              <label htmlFor="dashboard-rejection-reason" className="text-sm font-semibold text-slate-800">Reason for rejection</label>
              <textarea
                id="dashboard-rejection-reason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Explain the decision clearly for the client and activity record."
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <p className="mt-1 text-xs text-slate-500">Enter at least 8 characters. This reason is sent to the client and retained in the audit trail.</p>
            </div>
          )}
        </ConfirmationDialog>
      )}

      {viewingRequestDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onMouseDown={(event) => event.target === event.currentTarget && closeRequestDetails()}>
          <div ref={detailsDialogRef} role="dialog" aria-modal="true" aria-labelledby="dashboard-request-details-title" className="w-full max-w-2xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 id="dashboard-request-details-title" className="text-lg font-semibold text-slate-900">Service Request Details</h3>
                <p className="text-sm text-slate-500">#{viewingRequestDetails.id} • Submitted {formatDateTime(viewingRequestDetails.request_date)}</p>
              </div>
              <button
                type="button"
                onClick={closeRequestDetails}
                aria-label="Close request details"
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
      {viewingActiveJob && (
        <ActiveJobDetailsDialog
          job={viewingActiveJob}
          onClose={closeActiveJobDetails}
          onOpenTickets={canOpenTickets ? () => navigate('/admin/service-tickets?focus=active') : undefined}
          onOpenDispatch={canOpenDispatch ? () => navigate('/admin/dispatch-board') : undefined}
        />
      )}
    </Layout>
  );
}
