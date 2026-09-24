import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiAlertCircle,
  FiArrowRight,
  FiBell,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiClock,
  FiLayers,
  FiMapPin,
  FiPlusSquare,
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatsCard from '../../components/ui/StatsCard';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { fetchDashboardStats } from '../../api/api';
import { AUTO_REFRESH_MS, formatDate, formatDateTime } from '../../utils/dashboardHelpers';
import { clientTechnicianDisplayOrDash } from '../../utils/clientTechnicianDisplay';

export default function ClientDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
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
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const id = window.setInterval(() => loadDashboard({ silent: true }), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const overview = stats?.overview || {};
  const statusBreakdown = stats?.status_breakdown || {};
  const alerts = Array.isArray(stats?.alerts) ? stats.alerts : [];
  const recommendations = Array.isArray(stats?.recommendations) ? stats.recommendations : [];
  const activeRequests = Array.isArray(stats?.active_requests) ? stats.active_requests : [];
  const activeTickets = Array.isArray(stats?.active_tickets) ? stats.active_tickets : [];
  const recentHistory = Array.isArray(stats?.recent_history) ? stats.recent_history : [];
  const performance = stats?.performance || {};
  const nextAppointment = activeTickets.find((ticket) => ticket.scheduled_date) || activeTickets[0] || null;

  const openTicketDetail = (ticket) => {
    navigate(`/client/requests/${ticket.id}?entity=ticket`);
  };

  const handleRecommendation = (item) => {
    const action = String(item?.action || '').toLowerCase();
    if (action.includes('create') || action.includes('request') || action.includes('schedule')) {
      navigate('/client/service-requests');
    } else {
      navigate('/client/requests');
    }
  };

  const pipelineItems = [
    { label: 'Pending approval', value: statusBreakdown.pending ?? 0 },
    { label: 'Approved', value: statusBreakdown.approved ?? 0 },
    { label: 'In progress', value: statusBreakdown.in_progress ?? 0 },
    { label: 'On hold', value: statusBreakdown.on_hold ?? 0 }
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">
              Last updated: <span className="font-semibold text-slate-700">{formatDateTime(lastUpdated)}</span>
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate('/client/service-requests')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <FiPlusSquare className="h-4 w-4" />
              Create Service Request
            </button>
            <button
              type="button"
              onClick={() => navigate('/client/requests')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-surface-50"
            >
              <FiClipboard className="h-4 w-4" />
              My requests
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {nextAppointment && (
          <button
            type="button"
            onClick={() => openTicketDetail(nextAppointment)}
            className="flex w-full flex-col gap-4 rounded-2xl border border-sky-200 bg-sky-50/80 p-5 text-left transition hover:border-sky-300 hover:bg-sky-50 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Next Appointment</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">{nextAppointment.service_type}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Technician: {clientTechnicianDisplayOrDash(nextAppointment)}
              </p>
            </div>
            <div className="grid grid-cols-1 w-full gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:min-w-[360px] lg:w-auto">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-sky-100">
                <FiCalendar className="h-4 w-4 text-sky-600" />
                {nextAppointment.scheduled_date ? formatDate(nextAppointment.scheduled_date) : 'Schedule pending'}
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-sky-100">
                <FiMapPin className="h-4 w-4 text-sky-600" />
                {nextAppointment.location || nextAppointment.address || 'Location on request'}
              </span>
            </div>
          </button>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="All requests"
            value={overview.total_requests ?? 0}
            icon={FiClipboard}
            accent="blue"
          />
          <StatsCard
            title="Active requests"
            value={overview.active_requests ?? 0}
            icon={FiClock}
            accent="amber"
            color="text-amber-600"
          />
          <StatsCard
            title="Open tickets"
            value={overview.active_tickets ?? 0}
            icon={FiLayers}
            accent="sky"
            color="text-sky-600"
          />
          <StatsCard
            title="Completed"
            value={overview.completed_services ?? 0}
            icon={FiCheckCircle}
            accent="emerald"
            color="text-emerald-600"
          />
        </div>

        {alerts.length > 0 && (
          <div className="grid gap-3">
            {alerts.map((alert) => (
              <div
                key={alert.message}
                className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                <FiAlertCircle className="mt-0.5 shrink-0" />
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold text-slate-900">Active Requests</h2>
                <button
                  type="button"
                  onClick={() => navigate('/client/requests')}
                  className="hidden items-center gap-1.5 text-sm font-medium text-brand-500 transition hover:text-brand-600 sm:inline-flex"
                >
                  View all <FiArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              {loading && !stats ? (
                <div className="p-4">
                  <ListSkeleton rows={3} compact />
                </div>
              ) : activeRequests.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Service</th>
                        <th className="px-4 py-3">Submitted</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeRequests.map((request) => (
                        <tr key={request.id} className="transition hover:bg-slate-50">
                          <td className="max-w-[360px] px-4 py-3">
                            <button
                              type="button"
                              onClick={() => navigate(`/client/requests/${request.id}`)}
                              className="text-left font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                            >
                              {request.service_type}
                            </button>
                            <p className="mt-1 line-clamp-1 text-xs text-slate-500">{request.description || 'No details added'}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(request.created_at)}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                              {request.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="m-4 rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                    No active requests.
                </p>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4">
                <h2 className="text-base font-semibold text-slate-900">Recent History</h2>
              </div>
              {loading && !stats ? (
                <div className="p-4">
                  <ListSkeleton rows={2} compact />
                </div>
              ) : recentHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Service</th>
                        <th className="px-4 py-3">Technician</th>
                        <th className="px-4 py-3">Completed</th>
                        <th className="px-4 py-3">Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentHistory.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 font-semibold text-slate-900">{item.service_type}</td>
                          <td className="px-4 py-3 text-slate-600">{clientTechnicianDisplayOrDash(item)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(item.completed_date)}</td>
                          <td className="px-4 py-3 text-slate-600">{item.rating != null ? `${item.rating}/5` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="m-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-500">
                    Completed services will appear here after your tickets are closed.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-semibold text-slate-900">Request Pipeline</h2> 
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {pipelineItems.map((item) => (
                  <div key={item.label} className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-surface-200 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Service rating</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {performance.avg_rating != null ? `${performance.avg_rating}/5` : '-'}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">{performance.total_rated ?? 0} rated services</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4">
                <h2 className="text-base font-semibold text-slate-900">Live Tickets</h2>
              </div>
              {loading && !stats ? (
                <div className="p-4">
                  <ListSkeleton rows={2} compact />
                </div>
              ) : activeTickets.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Service</th>
                        <th className="px-4 py-3">Schedule</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeTickets.map((ticket) => (
                        <tr key={ticket.id} className="transition hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => openTicketDetail(ticket)}
                              className="text-left font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                            >
                              {ticket.service_type}
                            </button>
                            <p className="mt-1 text-xs text-slate-500">Tech: {clientTechnicianDisplayOrDash(ticket)}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {ticket.scheduled_date ? formatDate(ticket.scheduled_date) : 'Pending'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                              {ticket.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="m-4 rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                    No active tickets.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-semibold text-slate-900">Suggestions</h2>
              <div className="mt-4 space-y-2">
                {recommendations.length > 0 ? (
                  recommendations.map((item) => (
                    <button
                      key={item.message}
                      type="button"
                      onClick={() => handleRecommendation(item)}
                      className="w-full rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-left transition hover:bg-surface-100"
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.action}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    </button>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-surface-200 py-8 text-center text-sm text-slate-500">
                    You are up to date.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
