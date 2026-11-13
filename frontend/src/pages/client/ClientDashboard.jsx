import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiAlertCircle,
  FiArrowRight,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiClock,
  FiLayers,
  FiMapPin,
  FiPlusSquare,
  FiStar,
  FiUser,
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatsCard from '../../components/ui/StatsCard';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { fetchDashboardStats } from '../../api/api';
import { AUTO_REFRESH_MS, formatDate, formatDateTime } from '../../utils/dashboardHelpers';
import { clientTechnicianDisplayOrDash } from '../../utils/clientTechnicianDisplay';
import { startDashboardRefresh } from '../../utils/dashboardRefresh';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const slotLabel = (slot) => (slot && slot !== 'all_day' ? String(slot).replace(/^./, (letter) => letter.toUpperCase()) : '');

// One colour per stage, so a status reads the same everywhere on the page.
const statusTone = (status) => {
  if (['Navigating', 'Arrived on Site', 'In Progress'].includes(status)) return 'bg-sky-50 text-sky-700 ring-sky-200';
  if (status === 'On Hold' || status === 'Awaiting Materials') return 'bg-amber-50 text-amber-800 ring-amber-200';
  if (status === 'Pending') return 'bg-violet-50 text-violet-700 ring-violet-200';
  if (['Completed', 'Turned Over / Accepted'].includes(status)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
};

function StatusPill({ status }) {
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone(status)}`}>
      {status === 'Pending' ? 'Waiting for approval' : status}
    </span>
  );
}

// A card with a title row (and an optional "View all") over a list of rows.
function Panel({ title, viewAllLabel, onViewAll, aside, children }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-h-[3.75rem] items-center justify-between gap-3 border-b border-slate-200 px-4 py-2 sm:px-5">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {aside}
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            aria-label={viewAllLabel}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-brand-600 transition hover:text-brand-700"
          >
            View all <FiArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function EmptyRow({ children }) {
  return <p className="m-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

export default function ClientDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      setError('');
      const data = await fetchDashboardStats('client');
      setStats(data || {});
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setStats({});
      setError(err.message || 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    return startDashboardRefresh(() => loadDashboard({ silent: true }), 'client', AUTO_REFRESH_MS);
  }, []);

  const overview = stats?.overview || {};
  const stages = stats?.status_breakdown || {};
  const alerts = Array.isArray(stats?.alerts) ? stats.alerts : [];
  const recommendations = Array.isArray(stats?.recommendations) ? stats.recommendations : [];
  const waitingRequests = Array.isArray(stats?.active_requests) ? stats.active_requests : [];
  const openJobs = Array.isArray(stats?.active_tickets) ? stats.active_tickets : [];
  const recentHistory = Array.isArray(stats?.recent_history) ? stats.recent_history : [];
  const performance = stats?.performance || {};
  // The server picks the next visit from today onward; a past or held job is not shown as "next".
  const nextAppointment = stats?.next_appointment || null;
  const showSkeleton = loading && !stats;

  const openTicketDetail = (ticket) => navigate(`/client/requests/${ticket.id}?entity=ticket`);
  const handleRecommendation = (item) => {
    const action = String(item?.action || '').toLowerCase();
    navigate(action.includes('create') ? '/client/service-requests' : '/client/requests');
  };
  const linkButton = 'inline-flex min-h-11 max-w-full items-center text-left font-semibold text-brand-700 hover:text-brand-800 hover:underline';

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header: last update and the two main actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Last updated: <span className="font-semibold text-slate-700">{formatDateTime(lastUpdated)}</span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate('/client/service-requests')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <FiPlusSquare className="h-4 w-4" />
              Create Service Request
            </button>
            <button
              type="button"
              onClick={() => navigate('/client/requests')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <FiClipboard className="h-4 w-4" />
              My requests
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => loadDashboard()} className="min-h-11 self-start rounded-lg border border-rose-200 bg-white px-3 font-semibold text-rose-700 hover:bg-rose-100 sm:self-auto">
              Try again
            </button>
          </div>
        )}

        {nextAppointment && (
          <button
            type="button"
            onClick={() => openTicketDetail(nextAppointment)}
            className="grid w-full gap-4 rounded-2xl border border-sky-200 bg-sky-50/80 p-5 text-left transition hover:border-sky-300 hover:bg-sky-50 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Next Appointment</p>
              <p className="sr-only">Open the details of this visit.</p>
              <h2 className="mt-2 truncate text-lg font-semibold text-slate-950">{nextAppointment.service_type}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <FiUser className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                Technician: {clientTechnicianDisplayOrDash(nextAppointment)}
              </p>
            </div>
            <div className="flex flex-col gap-2 text-sm text-slate-700 sm:flex-row md:justify-end">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-sky-100">
                <FiCalendar className="h-4 w-4 shrink-0 text-sky-600" />
                {formatDate(nextAppointment.scheduled_date)}
                {slotLabel(nextAppointment.scheduled_time_slot) ? ` · ${slotLabel(nextAppointment.scheduled_time_slot)}` : ''}
              </span>
              <span className="inline-flex min-w-0 items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-sky-100 md:max-w-xs">
                <FiMapPin className="h-4 w-4 shrink-0 text-sky-600" />
                <span className="truncate">{nextAppointment.location || 'Location on request'}</span>
              </span>
            </div>
          </button>
        )}

        {/* Each job is counted once; the small lines say where the open ones are. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatsCard title="All requests" value={overview.total_requests ?? 0} icon={FiClipboard} accent="blue" helper="All time" />
          <StatsCard
            title="Waiting for approval"
            value={overview.awaiting_approval ?? overview.active_requests ?? 0}
            icon={FiClock}
            accent="amber"
            color="text-amber-600"
            helper="Not reviewed yet"
          />
          <StatsCard
            title="Open jobs"
            value={overview.active_tickets ?? 0}
            icon={FiLayers}
            accent="sky"
            color="text-sky-600"
            // Non-breaking spaces keep "0 on hold" together when the line wraps.
            helper={[
              `${stages.waiting_to_start ?? 0} to start`,
              `${stages.in_progress ?? 0} in progress`,
              `${stages.on_hold ?? 0} on hold`,
            ].map((part) => part.replace(/ /g, ' ')).join(' · ')}
          />
          <StatsCard
            title="Completed"
            value={overview.completed_services ?? 0}
            icon={FiCheckCircle}
            accent="emerald"
            color="text-emerald-600"
            helper={performance.avg_rating != null ? `Your rating ${performance.avg_rating}/5` : 'Finished work'}
          />
        </div>

        {alerts.length > 0 || recommendations.length > 0 ? (
          <div className="grid gap-2">
            {alerts.map((alert) => (
              <button
                key={alert.message}
                type="button"
                onClick={() => navigate('/client/requests')}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition hover:bg-amber-100"
              >
                <FiAlertCircle className="shrink-0" />
                <span className="flex-1">{alert.message}</span>
                <FiArrowRight className="shrink-0" aria-hidden="true" />
              </button>
            ))}
            {recommendations.map((item) => (
              <button
                key={item.message}
                type="button"
                onClick={() => handleRecommendation(item)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-left text-sm text-brand-900 transition hover:bg-brand-100"
              >
                <FiPlusSquare className="shrink-0" />
                <span className="flex-1">{item.message}</span>
                <span className="shrink-0 font-semibold">{item.action}</span>
              </button>
            ))}
          </div>
        ) : null}

        {/* Two equal columns: work that is underway, and requests the office has not decided yet. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="Open Jobs" viewAllLabel="View all open jobs" onViewAll={() => navigate('/client/requests')}>
            {showSkeleton ? (
              <div className="p-4"><ListSkeleton rows={2} compact /></div>
            ) : openJobs.length ? (
              <ul className="divide-y divide-slate-100">
                {openJobs.map((ticket) => (
                  <li key={ticket.id} className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
                    <div className="min-w-0">
                      <button type="button" onClick={() => openTicketDetail(ticket)} className={linkButton}>
                        <span className="truncate">{ticket.service_type}</span>
                      </button>
                      <p className="-mt-1 truncate pb-1 text-xs text-slate-500">
                        {ticket.scheduled_date ? formatDate(ticket.scheduled_date) : 'Not scheduled yet'}
                        {' · '}Technician: {clientTechnicianDisplayOrDash(ticket)}
                      </p>
                    </div>
                    <StatusPill status={ticket.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyRow>No open jobs.</EmptyRow>
            )}
          </Panel>

          <Panel title="Waiting for Approval" viewAllLabel="View all requests waiting for approval" onViewAll={() => navigate('/client/requests')}>
            {showSkeleton ? (
              <div className="p-4"><ListSkeleton rows={2} compact /></div>
            ) : waitingRequests.length ? (
              <ul className="divide-y divide-slate-100">
                {waitingRequests.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
                    <div className="min-w-0">
                      <button type="button" onClick={() => navigate(`/client/requests/${request.id}?entity=request`)} className={linkButton}>
                        <span className="truncate">{request.service_type}</span>
                      </button>
                      <p className="-mt-1 truncate pb-1 text-xs text-slate-500">
                        Sent {formatDate(request.created_at)} · {request.description || 'No details added'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Preferred</p>
                      <p className="text-sm font-semibold text-slate-700">{request.preferred_date ? formatDate(request.preferred_date) : '-'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyRow>No requests are waiting for approval.</EmptyRow>
            )}
          </Panel>
        </div>

        <Panel
          title="Recent History"
          aside={(
            <p className="ml-auto flex items-center gap-1.5 text-sm text-slate-600">
              <FiStar className="h-4 w-4 text-amber-500" aria-hidden="true" />
              {performance.avg_rating != null
                ? <span><span className="font-semibold text-slate-900">{performance.avg_rating}/5</span> from {plural(performance.total_rated ?? 0, 'rated service', 'rated services')}</span>
                : 'No ratings yet'}
            </p>
          )}
        >
          {showSkeleton ? (
            <div className="p-4"><ListSkeleton rows={2} compact /></div>
          ) : recentHistory.length ? (
            <ul className="divide-y divide-slate-100">
              {recentHistory.map((item) => (
                <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_8rem_6rem] sm:px-5">
                  <button type="button" onClick={() => openTicketDetail(item)} className={linkButton}>
                    <span className="truncate">{item.service_type}</span>
                  </button>
                  <p className="hidden truncate text-sm text-slate-600 sm:block">{clientTechnicianDisplayOrDash(item)}</p>
                  <p className="hidden text-sm text-slate-600 sm:block">{formatDate(item.completed_date)}</p>
                  <div className="text-right">
                    {item.rating != null ? (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800">
                        <FiStar className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                        {item.rating}/5
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openTicketDetail(item)}
                        aria-label={`Rate ${item.service_type}`}
                        className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                      >
                        <FiStar className="h-4 w-4" aria-hidden="true" /> Rate
                      </button>
                    )}
                  </div>
                  <p className="col-span-2 -mt-1 truncate pb-1 text-xs text-slate-500 sm:hidden">
                    {formatDate(item.completed_date)} · {clientTechnicianDisplayOrDash(item)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyRow>Finished services will appear here.</EmptyRow>
          )}
        </Panel>
      </div>
    </Layout>
  );
}
