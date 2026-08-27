import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { fetchTechnicianSchedule } from '../../api/api';
import { formatTicketId } from '../../utils/roleIds';
import { FiChevronLeft, FiChevronRight, FiClock, FiMapPin, FiRefreshCw } from 'react-icons/fi';
import StatusBadge, { STATUS_META } from '../../components/ui/StatusBadge';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const normalizeStatus = (status) => String(status || '').toLowerCase().replace(/[\s-]+/g, '_');

const getStatusMeta = (status) => STATUS_META[normalizeStatus(status)] || STATUS_META.unknown;

const isActiveScheduleStatus = (status) => normalizeStatus(status) !== 'cancelled';

const parseScheduleDate = (item) => {
  const dateValue = item.scheduledDate || item.scheduled_date;
  if (!dateValue) return null;

  const timeValue = item.scheduled_time || item.scheduledTime || '';
  const date = timeValue ? new Date(`${dateValue}T${timeValue}`) : new Date(`${dateValue}T00:00:00`);
  if (!Number.isNaN(date.getTime())) return date;

  const fallbackDate = new Date(dateValue);
  return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
};

const formatTime = (item) => {
  const date = parseScheduleDate(item);
  if (!date) return item.scheduled_time_slot || item.scheduledTimeSlot || 'Time TBD';

  const hasTime = Boolean(item.scheduled_time || item.scheduledTime);
  if (!hasTime) {
    return item.scheduled_time_slot || item.scheduledTimeSlot || 'Time TBD';
  }

  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCalendarDays = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const getMonthRange = (monthDate) => {
  const days = getCalendarDays(monthDate);
  return {
    start: getLocalDateKey(days[0]),
    end: getLocalDateKey(days[days.length - 1]),
  };
};

export default function TechnicianSchedule() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const techName = user?.username || 'Technician';
  const [schedule, setSchedule] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompletedJobs, setShowCompletedJobs] = useState(false);

  const monthDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const monthRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);
  const today = useMemo(() => new Date(), []);
  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    loadSchedule();
  }, [monthRange.start, monthRange.end, showCompletedJobs]);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const data = await fetchTechnicianSchedule(techName, { ...monthRange, showCompleted: showCompletedJobs });
      setSchedule(data);
      setError('');
    } catch (err) {
      setSchedule([]);
      setError(err.message || 'Unable to load schedule.');
    } finally {
      setLoading(false);
    }
  };

  const scheduleWithDates = useMemo(
    () => schedule
      .filter((item) => isActiveScheduleStatus(item.status))
      .map((item) => ({ ...item, calendarDate: parseScheduleDate(item) }))
      .filter((item) => item.calendarDate)
      .sort((a, b) => a.calendarDate - b.calendarDate),
    [schedule]
  );

  const jobsByDay = useMemo(() => {
    const groups = new Map();
    for (const item of scheduleWithDates) {
      const key = getLocalDateKey(item.calendarDate);
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return groups;
  }, [scheduleWithDates]);

  const goToPreviousMonth = () => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  const goToCurrentMonth = () => {
    setCalendarMonth(new Date());
  };

  return (
    <Layout>


      {loading ? (
        <PanelSkeleton rows={8} />
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <button type="button" onClick={goToPreviousMonth} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-blue-300 hover:text-blue-600" aria-label="Previous month">
                <FiChevronLeft />
              </button>
              <div className="min-w-48 text-center">
                <h3 className="text-xl font-semibold text-slate-900">{monthLabel}</h3>
                <p className="text-xs text-slate-500">{scheduleWithDates.length} scheduled task{scheduleWithDates.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={goToNextMonth} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-blue-300 hover:text-blue-600" aria-label="Next month">
                <FiChevronRight />
              </button>
              <button type="button" onClick={goToCurrentMonth} className="ml-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
                Today
              </button>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
              <input
                type="checkbox"
                checked={showCompletedJobs}
                onChange={(event) => setShowCompletedJobs(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Show Completed Jobs
            </label>

            <div className="flex flex-wrap gap-3">
              {['not_started', 'assigned', 'in_progress', 'completed', 'on_hold'].map((key) => {
                const meta = STATUS_META[key] || STATUS_META.unknown;
                return (
                  <div key={key} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[46rem] md:min-w-0">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-900 text-white">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide sm:text-sm">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {monthDays.map((day) => {
                  const key = getLocalDateKey(day);
                  const dayJobs = jobsByDay.get(key) || [];
                  const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                  const isToday = sameDay(day, today);

                  return (
                    <div
                      key={key}
                      className={`min-h-36 border-b border-r border-slate-200 p-2 sm:min-h-44 xl:min-h-52 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'}`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-blue-500 text-white' : 'text-slate-700'}`}>
                          {day.getDate()}
                        </span>
                        {dayJobs.length > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            {dayJobs.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {dayJobs.map((item) => {
                          const meta = getStatusMeta(item.status);
                          const ticketId = item.ticketId || item.ticket_id || item.id;
                          return (
                            <div key={item.id} className={`rounded-lg ring-1 ring-inset p-2 text-xs shadow-sm ${meta.tone}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{item.service || item.serviceType || item.service_type || 'Service'}</p>
                                  <p className="mt-1 truncate opacity-80">{item.client?.full_name || item.client || 'Client'}</p>
                                </div>
                                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                              </div>

                              <div className="mt-2 flex items-center gap-1 opacity-80">
                                <FiClock className="shrink-0" />
                                <span className="truncate">{formatTime(item)}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-1 opacity-80">
                                <FiMapPin className="shrink-0" />
                                <span className="truncate">{item.address || item.location || 'Location TBD'}</span>
                              </div>

                              <div className="mt-2 flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/technician/my-jobs?ticketId=${ticketId}`)}
                                  className="flex-1 rounded-md bg-white/80 px-2 py-1 font-semibold text-slate-700 hover:bg-white"
                                >
                                  Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/technician/map-navigation?ticketId=${ticketId}`)}
                                  className="rounded-md bg-slate-900 px-2 py-1 font-semibold text-white hover:bg-slate-700"
                                  aria-label={`Navigate to ticket ${ticketId}`}
                                >
                                  <FiMapPin />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Upcoming Tasks</h3>
            {scheduleWithDates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No scheduled jobs for this calendar yet. Assigned jobs will appear on their scheduled dates.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {scheduleWithDates.slice(0, 6).map((item) => {
                  const meta = getStatusMeta(item.status);
                  const ticketId = item.ticketId || item.ticket_id || item.id;
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                      <div className={`h-3 w-3 shrink-0 rounded-full ${meta.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {formatTicketId(ticketId)}: {item.service || item.serviceType || item.service_type || 'Service'}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="truncate text-xs text-slate-500">
                            {item.calendarDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {formatTime(item)}
                          </span>
                          <StatusBadge status={item.status} size="sm" />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/technician/my-jobs?ticketId=${ticketId}`)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                      >
                        Open
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </Layout>
  );
}
