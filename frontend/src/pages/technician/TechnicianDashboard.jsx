import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiBell,
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiMapPin,
  FiPackage,
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import Layout from '../../components/layout/Layout';
import StatsCard from '../../components/ui/StatsCard';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import { fetchTechnicianDashboard, updateJobStatus, updateTechnicianLocation } from '../../api/api';
import { useGPSTracking } from '../../hooks/useGPSTracking';
import GPSStatusIndicator from '../../components/ui/GPSStatusIndicator';
import StatusBadge, { formatStatusLabel } from '../../components/ui/StatusBadge';
import { AUTO_REFRESH_MS, formatDateTime } from '../../utils/dashboardHelpers';
import {
  TECHNICIAN_CHECKLIST_CAPABILITIES,
  TECHNICIAN_HISTORY_CAPABILITIES,
  TECHNICIAN_JOBS_CAPABILITIES,
  TECHNICIAN_MESSAGES_CAPABILITIES,
  TECHNICIAN_NAVIGATION_CAPABILITIES,
  TECHNICIAN_SCHEDULE_CAPABILITIES,
  hasAnyCapability
} from '../../rbac';
import { formatTicketId } from '../../utils/roleIds';

const EMPTY_DASHBOARD = {
  technician: { is_available: false, current_location: null },
  stats: { total_assigned: 0, completed_today: 0, pending_jobs: 0, active_jobs: 0 },
  todays_schedule: [],
  active_jobs: [],
  recent_activity: []
};

const normalizeStatus = (status) => String(status || '').toLowerCase().replace(/\s+/g, '_');

const formatTimeSlot = (value) => {
  const normalized = normalizeStatus(value);
  if (!normalized) return '';
  return normalized.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
};

const formatDateLabel = (value) => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatTimeLabel = (value) => {
  if (!value) return '';
  const date = new Date(`1970-01-01T${value}`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatNotificationTime = (value) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatEquipmentName = (item) => {
  if (!item) return 'Equipment';
  if (typeof item === 'string') return item;
  return item.item_name || item.itemName || item.name || item.label || 'Equipment';
};

const formatEquipmentQuantity = (item) => {
  const quantity = Number(item?.quantity ?? item?.qty ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

export default function TechnicianDashboard() {
  const { user } = useAuth();
  const { notifications, unreadCount: unreadNotificationCount, deleteAllNotifications } = useNotifications();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [isStartingGps, setIsStartingGps] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);

  const techName = dashboard.technician?.full_name || user?.username || 'Technician';

  const {
    location,
    error: gpsError,
    permission: gpsPermission,
    watching: gpsWatching,
    requestPermission,
    startWatching,
  } = useGPSTracking({
    updateInterval: 20000,
    autoStart: false,
    onLocationUpdate: async (loc) => {
      try {
        await updateTechnicianLocation({ techName, lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy, speed: loc.speed, heading: loc.heading });
      } catch (err) { console.error('Failed to update location:', err); }
    }
  });

  const loadData = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const dData = await fetchTechnicianDashboard(techName);
      setDashboard(dData || EMPTY_DASHBOARD);
      setLastUpdated(new Date().toISOString());
      setError('');
    } catch (err) {
      setDashboard(EMPTY_DASHBOARD);
      setError(err.message || 'Unable to load technician dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const [isDeletingNotifications, setIsDeletingNotifications] = useState(false);

  const startLocationSharing = async () => {
    setIsStartingGps(true);
    setActionMessage('');
    try {
      await requestPermission();
      startWatching();
      setActionMessage('Location sharing is on for this dashboard session.');
    } catch {
      // The GPS panel renders the browser-specific error and recovery guidance.
    } finally {
      setIsStartingGps(false);
    }
  };

  const handleDeleteAllNotifications = async () => {
    setIsDeletingNotifications(true);
    try {
      await deleteAllNotifications();
      setDeleteAllConfirmOpen(false);
    } catch (err) {
      console.error('Failed to delete notifications:', err);
    } finally {
      setIsDeletingNotifications(false);
    }
  };

  useEffect(() => {
    loadData();
    const id = window.setInterval(() => loadData({ silent: true }), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [techName]);

  const rawTodaysSchedule = Array.isArray(dashboard.todays_schedule) ? dashboard.todays_schedule : [];
  const todaysSchedule = rawTodaysSchedule.filter((job) => !['cancelled', 'completed', 'inspection_completed'].includes(normalizeStatus(job.status)));
  const actionableTodaysSchedule = todaysSchedule.filter((job) => !['completed', 'inspection_completed'].includes(normalizeStatus(job.status)));
  const activeJobs = Array.isArray(dashboard.active_jobs) ? dashboard.active_jobs.filter(job => !['completed', 'inspection_completed', 'cancelled'].includes(normalizeStatus(job.status))) : [];
  const recentActivity = Array.isArray(dashboard.recent_activity) ? dashboard.recent_activity : [];

  const canOpenJobs = hasAnyCapability(user, TECHNICIAN_JOBS_CAPABILITIES);
  const canOpenSchedule = hasAnyCapability(user, TECHNICIAN_SCHEDULE_CAPABILITIES);
  const canOpenNavigation = hasAnyCapability(user, TECHNICIAN_NAVIGATION_CAPABILITIES);
  const canOpenChecklist = hasAnyCapability(user, TECHNICIAN_CHECKLIST_CAPABILITIES);
  const canOpenMessages = hasAnyCapability(user, TECHNICIAN_MESSAGES_CAPABILITIES);
  const canOpenHistory = hasAnyCapability(user, TECHNICIAN_HISTORY_CAPABILITIES);

  const currentJob =
    activeJobs.find((j) => normalizeStatus(j.status) === 'in_progress') ||
    activeJobs.find((j) => normalizeStatus(j.status) === 'arrived_on_site') ||
    activeJobs.find((j) => normalizeStatus(j.status) === 'navigating') ||
    actionableTodaysSchedule[0] ||
    activeJobs[0] ||
    null;
  const nextJob = actionableTodaysSchedule.find((j) => j.id !== currentJob?.id) || null;
  const currentJobStatus = normalizeStatus(currentJob?.status);
  const currentJobHasCoordinates = Number.isFinite(Number(currentJob?.latitude)) && Number.isFinite(Number(currentJob?.longitude));
  const currentJobChecklistDone = Boolean(currentJob?.checklist_completed);
  const currentJobIsUrgent = ['urgent', 'high'].includes(String(currentJob?.priority || '').toLowerCase());
  const currentJobReservations = Array.isArray(currentJob?.inventory_reservations) ? currentJob.inventory_reservations : [];
  const currentJobRequiredEquipment = Array.isArray(currentJob?.required_equipment) ? currentJob.required_equipment : [];
  const equipmentReminderItems = currentJobReservations.length > 0 ? currentJobReservations : currentJobRequiredEquipment;
  const readinessItems = currentJob ? [
    {
      label: 'Route',
      value: currentJobHasCoordinates ? 'Ready' : 'Coordinates missing',
      ready: currentJobHasCoordinates
    },
    {
      label: 'Schedule',
      value: currentJob.scheduled_date ? `${formatDateLabel(currentJob.scheduled_date)}${formatTimeLabel(currentJob.scheduled_time) ? `, ${formatTimeLabel(currentJob.scheduled_time)}` : ''}` : 'Not scheduled',
      ready: Boolean(currentJob.scheduled_date)
    },
    {
      label: 'Checklist',
      value: currentJobChecklistDone ? 'Submitted' : 'Pending',
      ready: currentJobChecklistDone
    },
    {
      label: 'Equipment',
      value: equipmentReminderItems.length > 0 ? `${equipmentReminderItems.length} item${equipmentReminderItems.length === 1 ? '' : 's'}` : 'No items listed',
      ready: equipmentReminderItems.length > 0
    }
  ] : [];

  const startCurrentJob = async () => {
    if (!currentJob) return;
    setActionMessage('');
    setError('');
    setIsStartingJob(true);
    try {
      await updateJobStatus(currentJob.id, 'in_progress');
      setActionMessage(`${formatTicketId(currentJob.id)} is now in progress.`);
      await loadData({ silent: true });
    } catch (err) {
      setError(err.message || 'Unable to start job.');
    } finally {
      setIsStartingJob(false);
    }
  };

  const gpsLatitude = toFiniteNumber(location?.latitude ?? dashboard.technician?.current_location?.latitude);
  const gpsLongitude = toFiniteNumber(location?.longitude ?? dashboard.technician?.current_location?.longitude);
  const gpsAccuracy = location?.accuracy;

  return (
    <Layout>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <p className="text-xs text-slate-500">
          Last updated: <span className="font-medium text-slate-700">{formatDateTime(lastUpdated)}</span>
        </p>
      </div>

      {actionMessage && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{actionMessage}</div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Upcoming Jobs" value={todaysSchedule.length} color="text-brand-600" icon={FiCalendar} accent="blue" />
        <StatsCard title="Active Jobs" value={dashboard.stats?.active_jobs || 0} color="text-orange-600" icon={FiClipboard} accent="orange" />
        <StatsCard title="Completed Today" value={dashboard.stats?.completed_today || 0} color="text-emerald-600" icon={FiCheckSquare} accent="emerald" />
        <StatsCard title="Unread Alerts" value={unreadNotificationCount} color="text-rose-600" icon={FiBell} accent="rose" />
      </div>

      {/* Current Focus + GPS */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="card min-h-full p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Current Focus</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">
                {currentJob ? `${formatTicketId(currentJob.id)}: ${currentJob.service_type}` : 'No active field job right now'}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {currentJob
                  ? `${currentJob.client?.full_name || currentJob.client} - ${currentJob.location || 'Location pending'}`
                  : 'When a job is assigned or started, it will appear here.'}
              </p>
            </div>
            <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:self-stretch sm:items-end">
              <div className="flex items-center">
                {currentJob ? (
                  <StatusBadge status={currentJob.status} />
                ) : (
                  <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-semibold text-slate-500">Idle</span>
                )}
              </div>
              <div className="mt-auto pt-2 sm:pt-4">
                {canOpenSchedule && <Link to="/technician/schedule" className="inline-flex rounded-xl bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600 sm:px-4 sm:text-sm">Check Schedule</Link>}
              </div>

            </div>
          </div>

          {currentJob ? (
            <>
              {currentJobIsUrgent && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {currentJob.priority} priority job
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Schedule</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{formatDateLabel(currentJob.scheduled_date)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatTimeLabel(currentJob.scheduled_time) || formatTimeSlot(currentJob.scheduled_time_slot) || 'Time not set'}</p>
                </div>
                <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Client</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{currentJob.client?.full_name || currentJob.client}</p>
                  <p className="mt-1 text-xs text-slate-500">{currentJob.priority || 'Normal'} priority</p>
                </div>
                <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Address</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{currentJob.location || 'Location pending'}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-surface-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Readiness Checklist</p>
                  <div className="mt-3 space-y-2">
                    {readinessItems.map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                          <span className={`h-2 w-2 rounded-full ${item.ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {item.label}
                        </span>
                        <span className={`shrink-0 text-xs font-semibold ${item.ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-surface-200 bg-white p-3">
                  <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <FiPackage className="h-4 w-4 text-brand-500" />
                    Equipment Reminder
                  </p>
                  <div className="mt-3 space-y-2">
                    {equipmentReminderItems.length > 0 ? (
                      equipmentReminderItems.slice(0, 4).map((item, index) => (
                        <div key={`${formatEquipmentName(item)}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-surface-50 px-3 py-2 text-sm">
                          <span className="min-w-0 truncate font-medium text-slate-800">{formatEquipmentName(item)}</span>
                          <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                            x{formatEquipmentQuantity(item)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md bg-surface-50 px-3 py-3 text-sm text-slate-500">
                        No reserved or required equipment is listed for this job.
                      </p>
                    )}
                    {equipmentReminderItems.length > 4 && (
                      <p className="text-xs font-medium text-slate-500">+{equipmentReminderItems.length - 4} more item{equipmentReminderItems.length - 4 === 1 ? '' : 's'}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {canOpenJobs && currentJobStatus === 'arrived_on_site' && (
                  <button
                    type="button"
                    onClick={startCurrentJob}
                    disabled={refreshing || isStartingJob}
                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    {isStartingJob ? 'Starting Job...' : 'Start Job'}
                  </button>
                )}
                {canOpenJobs && (
                  <Link to="/technician/my-jobs" className="rounded-lg border border-surface-200 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-surface-50">
                    {currentJobStatus === 'in_progress' ? 'Continue Job' : 'Open Jobs'}
                  </Link>
                )}
                {canOpenNavigation && (
                  <Link
                    to={`/technician/map-navigation?ticketId=${currentJob.id}`}
                    className={`rounded-lg px-4 py-2 text-center text-sm font-medium text-white ${currentJobHasCoordinates ? 'bg-emerald-500 hover:bg-emerald-600' : 'pointer-events-none bg-slate-300'}`}
                    aria-disabled={!currentJobHasCoordinates}
                  >
                    Navigate to Job
                  </Link>
                )}
                {canOpenChecklist && !currentJobChecklistDone && (
                  <Link 
                    to={currentJob.ticket_type === 'inspection' || currentJob.ticketType === 'inspection' 
                      ? `/technician/inspection-checklist?ticketId=${currentJob.id}` 
                      : `/technician/checklist?ticketId=${currentJob.id}`} 
                    className="rounded-lg bg-navy-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-navy-800"
                  >
                    Open Checklist
                  </Link>
                )}
                {canOpenJobs && currentJob.ticket_type !== 'inspection' && currentJob.ticketType !== 'inspection' && <Link to="/technician/my-jobs" className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"><FiPackage className="h-4 w-4" /> Request Equipment</Link>}
              </div>
            </>
          ) : (
            <div className="mt-5 min-h-24 rounded-lg border border-dashed border-surface-200 bg-surface-50" />
          )}

          {nextJob && (
            <div className="mt-5 rounded-lg border border-brand-200 bg-brand-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-600">Up Next</p>
              <p className="mt-2 text-sm font-semibold text-navy-900">{formatTicketId(nextJob.id)}: {nextJob.service_type}</p>
              <p className="mt-1 text-sm text-slate-600">
                {nextJob.client?.full_name || nextJob.client} - {formatDateLabel(nextJob.scheduled_date)}
                {formatTimeLabel(nextJob.scheduled_time) ? ` - ${formatTimeLabel(nextJob.scheduled_time)}` : ''}
              </p>
            </div>
          )}
        </section>

        {/* GPS Section */}
        <section className="card min-h-full p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">GPS Status</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Live Tracking</h3>
              <p className="mt-2 text-sm text-slate-500">Used for route visibility and dispatch.</p>
            </div>
            <GPSStatusIndicator
              status={gpsWatching ? 'granted' : gpsPermission === 'denied' ? 'denied' : 'off'}
              accuracy={gpsAccuracy}
              className="rounded-full bg-surface-100 px-3 py-1.5"
            />
          </div>

          <div className="mt-5 divide-y divide-surface-200 rounded-lg border border-surface-200 bg-surface-50">
            <div>
              <div className="p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Availability</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{dashboard.technician?.is_available ? 'Available for dispatch' : 'Currently on a job'}</p>
              </div>
            </div>
            <div className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Coordinates</p>
              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                {gpsLatitude !== null && gpsLongitude !== null ? `${gpsLatitude.toFixed(6)}, ${gpsLongitude.toFixed(6)}` : 'Waiting for GPS fix'}
              </p>
            </div>
            {gpsError && (
              <div className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Turn on Location/GPS and allow browser location access. {gpsError.message}
              </div>
            )}
          </div>
          {!gpsWatching && gpsPermission !== 'denied' && (
            <div className="mt-4">
              <button
                type="button"
                onClick={startLocationSharing}
                disabled={isStartingGps}
                className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60"
              >
                {isStartingGps ? 'Starting location sharing...' : 'Start location sharing'}
              </button>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Sharing starts only after you choose this action and lasts for this dashboard session.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Schedule + Notifications */}
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Upcoming Schedule</h3>
            {canOpenSchedule && <Link to="/technician/schedule" className="text-sm font-medium text-brand-500 hover:text-brand-600">View full schedule</Link>}
          </div>
          <div className="mt-4 space-y-3">
            {loading ? (
              <ListSkeleton rows={3} compact />
            ) : todaysSchedule.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-5 text-center text-sm text-slate-500">No upcoming jobs scheduled.</div>
            ) : (
              todaysSchedule.slice(0, 4).map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => navigate(`/technician/my-jobs?ticketId=${job.id}`)}
                  className="w-full rounded-lg border border-surface-200 p-4 text-left transition hover:bg-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{job.service_type}</p>
                      <p className="text-sm text-slate-600">{job.client?.full_name || job.client}</p>
                    </div>
                    <StatusBadge status={job.status} size="sm" />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {formatDateLabel(job.scheduled_date)}
                    {formatTimeLabel(job.scheduled_time) ? ` - ${formatTimeLabel(job.scheduled_time)}` : ''}
                    {!formatTimeLabel(job.scheduled_time) && job.scheduled_time_slot ? ` - ${formatTimeSlot(job.scheduled_time_slot)}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{job.location || 'Location pending'}</p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <FiBell className="text-brand-500" /> Notifications
            </h3>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={() => setDeleteAllConfirmOpen(true)}
                disabled={isDeletingNotifications}
                className="text-sm font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
              >
                {isDeletingNotifications ? 'Deleting...' : 'Delete all'}
              </button>
            )}
          </div>
          <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {loading ? (
              <ListSkeleton rows={3} compact />
            ) : notifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-5 text-center text-sm text-slate-500">No recent notifications.</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`rounded-lg border p-4 transition ${n.status === 'unread' ? 'border-brand-200 bg-brand-50/50' : 'border-surface-200 hover:bg-surface-50'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{n.title || formatStatusLabel(n.type)}</p>
                      <p className="mt-1 text-sm text-slate-600">{n.message}</p>
                    </div>
                    {n.status === 'unread' && (
                      <span className="rounded-full bg-brand-500 px-2.5 py-1 text-[10px] font-semibold text-white">Unread</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{formatNotificationTime(n.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Recent Activity */}
      <section className="mt-5 card p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
          {canOpenHistory && <Link to="/technician/job-history" className="text-sm font-medium text-brand-500 hover:text-brand-600">Open history</Link>}
        </div>
        <div className="mt-4">
          {loading ? (
            <ListSkeleton rows={3} compact />
          ) : recentActivity.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-5 text-center text-sm text-slate-500">No recent activity yet.</div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {recentActivity.slice(0, 5).map((item) => (
                  <article key={item.id} className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{formatTicketId(item.id)}</p>
                        <p className="mt-1 truncate text-sm text-slate-600" title={item.client?.full_name || item.client}>
                          {item.client?.full_name || item.client}
                        </p>
                      </div>
                      <StatusBadge status={item.status} size="sm" />
                    </div>
                    <p className="mt-3 truncate text-sm text-slate-600" title={item.service_type}>
                      {item.service_type}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(`/technician/my-jobs?ticketId=${item.id}`)}
                      className="mt-3 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    >
                      View job
                    </button>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-hidden rounded-lg border border-surface-200 md:block">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-surface-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="w-[15%] px-4 py-3">Ticket</th>
                    <th className="w-[24%] px-4 py-3">Client</th>
                    <th className="w-[31%] px-4 py-3">Service</th>
                    <th className="w-[16%] px-4 py-3">Status</th>
                    <th className="w-[14%] px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 bg-white">
                  {recentActivity.slice(0, 5).map((item) => (
                    <tr key={item.id} className="transition hover:bg-surface-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatTicketId(item.id)}</td>
                      <td className="px-4 py-3">
                        <span className="block truncate text-slate-700" title={item.client?.full_name || item.client}>
                          {item.client?.full_name || item.client}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block truncate text-slate-700" title={item.service_type}>
                          {item.service_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/technician/my-jobs?ticketId=${item.id}`)}
                          className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </section>

      {deleteAllConfirmOpen && (
        <ConfirmationDialog
          title="Delete all notifications?"
          message="This clears every dashboard notification for your account. This action cannot be undone."
          tone="danger"
          icon="danger"
          confirmLabel="Delete all"
          cancelLabel="Keep notifications"
          loading={isDeletingNotifications}
          onCancel={() => setDeleteAllConfirmOpen(false)}
          onConfirm={handleDeleteAllNotifications}
        />
      )}
    </Layout>
  );
}
