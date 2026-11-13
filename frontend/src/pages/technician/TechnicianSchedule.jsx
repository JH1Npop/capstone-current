import { useEffect, useMemo, useRef, useState } from 'react';
import { toTelHref } from '../../utils/landingSettings';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import { fetchTechnicianSchedule } from '../../api/api';
import { formatTicketId } from '../../utils/roleIds';
import { FiChevronLeft, FiChevronRight, FiClock, FiMapPin, FiPhone, FiRefreshCw } from 'react-icons/fi';
import StatusBadge, { STATUS_META } from '../../components/ui/StatusBadge';
import { TECHNICIAN_NAVIGATION_CAPABILITIES, hasAnyCapability } from '../../rbac';

// Technicians use this page on their phones, so the default there is a day-by-day list with large
// buttons (Open, Navigate, Call). The month grid is one tap away, and on a computer it is the default.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VIEW_STORAGE_KEY = 'afn:tech-schedule-view';

const normalizeStatus = (status) => String(status || '').toLowerCase().replace(/[\s-]+/g, '_');

const getStatusMeta = (status) => STATUS_META[normalizeStatus(status)] || STATUS_META.unknown;

const isActiveScheduleStatus = (status) => normalizeStatus(status) !== 'cancelled';
const FINISHED_STATUSES = new Set(['completed', 'inspection_completed', 'cancelled']);

const NOTE_STYLES = {
  closed: 'bg-rose-100 text-rose-800 ring-rose-200',
  limited: 'bg-amber-100 text-amber-800 ring-amber-200',
  holiday: 'bg-violet-100 text-violet-800 ring-violet-200',
  day_off: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const parseScheduleDate = (item) => {
  const dateValue = item.scheduledDate || item.scheduled_date;
  if (!dateValue) return null;

  const timeValue = item.scheduled_time || item.scheduledTime || '';
  const date = timeValue ? new Date(`${dateValue}T${timeValue}`) : new Date(`${dateValue}T00:00:00`);
  if (!Number.isNaN(date.getTime())) return date;

  const fallbackDate = new Date(dateValue);
  return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
};

const formatSlot = (slot) => {
  const value = String(slot || '');
  if (!value) return '';
  return `${value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')} slot`;
};

const workDayLabel = (item) => (item.workDays > 1 ? `Day ${item.workDay} of ${item.workDays}` : '');

const formatTime = (item) => {
  if (item.workDays > 1 && item.workDay > 1) return workDayLabel(item);
  const date = parseScheduleDate(item);
  const slot = formatSlot(item.scheduled_time_slot || item.scheduledTimeSlot);
  if (!date) return slot || 'Time TBD';

  const hasTime = Boolean(item.scheduled_time || item.scheduledTime);
  if (!hasTime) return slot || 'Time TBD';

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

const readSavedView = () => {
  try {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'list' || saved === 'month') return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the screen size.
  }
  return window.matchMedia?.('(max-width: 767px)').matches ? 'list' : 'month';
};

const clientName = (item) => item.client?.full_name || item.client || 'Client';
const serviceName = (item) => item.service || item.serviceType || item.service_type || 'Service';
const ticketOf = (item) => item.ticketId || item.ticket_id || item.id;

function DayNotes({ notes, compact = false }) {
  if (!notes?.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'mt-1'}`}>
      {notes.map((note, index) => (
        <span
          key={`${note.kind}-${index}`}
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${NOTE_STYLES[note.kind] || NOTE_STYLES.day_off}`}
          title={note.reason || undefined}
        >
          {note.label}{note.reason && !compact ? ` · ${note.reason}` : ''}
        </span>
      ))}
    </div>
  );
}

// One job, sized for a thumb: the time first, then what and where, then the three actions.
function JobCard({ item, canNavigate, onOpen, onNavigate }) {
  const meta = getStatusMeta(item.status);
  const ticketId = ticketOf(item);
  const phone = item.client?.phone;
  return (
    <article className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
            {item.workDays > 1 && item.workDay > 1 ? 'Continuing job' : formatTime(item)}
          </p>
          <p className="mt-1 break-words text-base font-semibold text-slate-900">{serviceName(item)}</p>
          {item.workDays > 1 ? (
            <p className="mt-0.5 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">{workDayLabel(item)}</p>
          ) : null}
          <p className="text-sm text-slate-600">{formatTicketId(ticketId)} · {clientName(item)}</p>
          <p className="mt-1 flex items-start gap-1 text-sm text-slate-500">
            <FiMapPin className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="break-words">{item.address || item.location || 'Location TBD'}</span>
          </p>
        </div>
        <StatusBadge status={item.status} size="sm" />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          aria-label={`Open ${formatTicketId(ticketId)}`}
          onClick={() => onOpen(ticketId)}
          className="min-h-11 flex-1 rounded-lg bg-slate-900 px-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Open
        </button>
        {canNavigate ? (
          <button
            type="button"
            aria-label={`Navigate to ${formatTicketId(ticketId)}`}
            onClick={() => onNavigate(ticketId)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <FiMapPin aria-hidden="true" /> Navigate
          </button>
        ) : null}
        {phone ? (
          <a
            href={toTelHref(phone)}
            aria-label={`Call ${clientName(item)}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FiPhone aria-hidden="true" /> Call
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function TechnicianSchedule() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const techName = user?.username || 'Technician';
  const [schedule, setSchedule] = useState([]);
  const [dayNotes, setDayNotes] = useState({});
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompletedJobs, setShowCompletedJobs] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(() => getLocalDateKey(new Date()));
  const [view, setView] = useState(readSavedView);
  const canNavigate = hasAnyCapability(user, TECHNICIAN_NAVIGATION_CAPABILITIES);
  const hasLoadedOnce = useRef(false);
  const requestSequence = useRef(0);

  const monthDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const monthRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);
  const today = new Date();
  const todayKey = getLocalDateKey(today);
  const tomorrowKey = getLocalDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isCurrentMonthShown = calendarMonth.getMonth() === today.getMonth() && calendarMonth.getFullYear() === today.getFullYear();

  const chooseView = (nextView) => {
    setView(nextView);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, nextView);
    } catch {
      // Not remembered; the choice still applies now.
    }
  };

  useEffect(() => {
    loadSchedule();
  }, [monthRange.start, monthRange.end, showCompletedJobs]);

  const loadSchedule = async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    try {
      const data = await fetchTechnicianSchedule(techName, { ...monthRange, showCompleted: showCompletedJobs });
      if (requestId !== requestSequence.current) return;
      setSchedule(data.jobs);
      setDayNotes(data.dayNotes);
      setError('');
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      setSchedule([]);
      setDayNotes({});
      setError(err.message || 'Unable to load schedule.');
    } finally {
      if (requestId === requestSequence.current) {
        hasLoadedOnce.current = true;
        setLoading(false);
      }
    }
  };

  // One entry per job per work day ("Day 3 of 20"); the server lists the days inside this view.
  const occurrences = useMemo(
    () => schedule
      .filter((item) => isActiveScheduleStatus(item.status))
      .flatMap((item) => {
        const days = Array.isArray(item.work_days) && item.work_days.length
          ? item.work_days
          : [{ date: item.scheduledDate || item.scheduled_date, day: 1, of: 1 }];
        return days.filter((entry) => entry.date).map((entry) => {
          const occurrence = { ...item, dayKey: entry.date, workDay: entry.day, workDays: entry.of };
          const timed = entry.day === 1 ? parseScheduleDate({ ...item, scheduledDate: entry.date }) : null;
          return { ...occurrence, calendarDate: timed || new Date(`${entry.date}T00:00:00`) };
        });
      })
      .sort((a, b) => a.calendarDate - b.calendarDate),
    [schedule]
  );
  // Each job once, with the first of its days in this view.
  const scheduleWithDates = useMemo(() => {
    const seen = new Set();
    return occurrences.filter((item) => (seen.has(item.id) ? false : seen.add(item.id)));
  }, [occurrences]);

  const jobsByDay = useMemo(() => {
    const groups = new Map();
    for (const item of occurrences) {
      groups.set(item.dayKey, [...(groups.get(item.dayKey) || []), item]);
    }
    return groups;
  }, [occurrences]);
  const selectedDayJobs = jobsByDay.get(selectedDateKey) || [];
  const notesFor = (key) => dayNotes[key] || [];
  // A plain weekend is not news; it is only worth showing next to jobs or in the day panel.
  const notableNotes = (key) => notesFor(key).filter((note) => note.kind !== 'day_off' || (jobsByDay.get(key) || []).length > 0);
  // The month count is for the month shown, not the neighbouring days in the grid.
  const monthPrefix = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthTaskCount = new Set(occurrences.filter((item) => item.dayKey.startsWith(monthPrefix)).map((item) => item.id)).size;
  // Upcoming means from today on, and not finished.
  const upcomingTasks = (() => {
    const seen = new Set();
    return occurrences.filter((item) => item.dayKey >= todayKey
      && !FINISHED_STATUSES.has(normalizeStatus(item.status))
      && (seen.has(item.id) ? false : seen.add(item.id)));
  })();
  // The legend lists the statuses actually on the calendar.
  const legendStatuses = [...new Set(scheduleWithDates.map((item) => normalizeStatus(item.status)))];
  const canNavigateTo = (item) => canNavigate && !FINISHED_STATUSES.has(normalizeStatus(item.status));
  const openJob = (ticketId) => navigate(`/technician/my-jobs?ticketId=${ticketId}`);
  const navigateTo = (ticketId) => navigate(`/technician/map-navigation?ticketId=${ticketId}`);

  // The list: this month's days from today (or from the 1st for other months) that have jobs or
  // something to know, and always today itself.
  const listDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const last = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const days = [];
    for (let day = new Date(first); day <= last; day.setDate(day.getDate() + 1)) {
      const key = getLocalDateKey(day);
      if (isCurrentMonthShown && key < todayKey) continue;
      const hasJobs = (jobsByDay.get(key) || []).length > 0;
      if (hasJobs || notableNotes(key).length > 0 || key === todayKey) days.push(new Date(day));
    }
    return days;
  }, [calendarMonth, jobsByDay, dayNotes, isCurrentMonthShown, todayKey]);

  const dayHeading = (date) => {
    const key = getLocalDateKey(date);
    const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (key === todayKey) return `Today · ${label}`;
    if (key === tomorrowKey) return `Tomorrow · ${label}`;
    return label;
  };

  const goToPreviousMonth = () => {
    setCalendarMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() - 1, 1);
      setSelectedDateKey(getLocalDateKey(next));
      return next;
    });
  };

  const goToNextMonth = () => {
    setCalendarMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      setSelectedDateKey(getLocalDateKey(next));
      return next;
    });
  };

  const goToCurrentMonth = () => {
    const current = new Date();
    setCalendarMonth(current);
    setSelectedDateKey(getLocalDateKey(current));
  };

  const selectedDate = new Date(`${selectedDateKey}T00:00:00`);

  return (
    <Layout>
      {error ? (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={loadSchedule} className="shrink-0 font-semibold">Try again</button>
        </div>
      ) : null}
      {loading && !hasLoadedOnce.current ? (
        <PanelSkeleton rows={8} />
      ) : (
        <section aria-busy={loading} className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:px-5 sm:py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={goToPreviousMonth} className="min-h-11 min-w-11 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-blue-300 hover:text-blue-600" aria-label="Previous month">
                <FiChevronLeft className="mx-auto" />
              </button>
              <div className="min-w-0 flex-1 text-center sm:min-w-48">
                <h3 className="truncate text-lg font-semibold text-slate-900 sm:text-xl">{monthLabel}</h3>
                <p className="text-xs text-slate-500">{loading ? 'Loading…' : `${monthTaskCount} scheduled task${monthTaskCount === 1 ? '' : 's'} this month`}</p>
              </div>
              <button type="button" onClick={goToNextMonth} className="min-h-11 min-w-11 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-blue-300 hover:text-blue-600" aria-label="Next month">
                <FiChevronRight className="mx-auto" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <div className="col-span-2 grid grid-cols-2 rounded-lg border border-slate-200 bg-white p-1 sm:col-span-1" role="group" aria-label="Schedule view">
                {[['list', 'List'], ['month', 'Month']].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={view === value}
                    onClick={() => chooseView(value)}
                    className={`min-h-10 rounded-md px-4 text-sm font-semibold ${view === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={goToCurrentMonth} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
                Today
              </button>
              <button type="button" onClick={loadSchedule} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 disabled:opacity-60">
                <FiRefreshCw aria-hidden="true" /> Refresh
              </button>
              <label className="col-span-2 flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm sm:col-span-1">
                <input
                  type="checkbox"
                  checked={showCompletedJobs}
                  onChange={(event) => setShowCompletedJobs(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Show Completed Jobs
              </label>
            </div>
          </div>

          {view === 'list' ? (
            <div className="space-y-5 p-3 sm:p-5" aria-label="Schedule list">
              {listDays.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  Nothing scheduled for the rest of {calendarMonth.toLocaleDateString('en-US', { month: 'long' })}.
                </p>
              ) : listDays.map((date) => {
                const key = getLocalDateKey(date);
                const dayJobs = jobsByDay.get(key) || [];
                return (
                  <section key={key} aria-label={dayHeading(date)}>
                    <div className="sticky top-0 z-10 -mx-3 bg-white/95 px-3 py-1.5 backdrop-blur sm:-mx-5 sm:px-5">
                      <h4 className="text-sm font-bold text-slate-900">{dayHeading(date)}</h4>
                      <DayNotes notes={notesFor(key)} />
                    </div>
                    <div className="mt-2 space-y-2">
                      {dayJobs.length ? dayJobs.map((item) => (
                        <JobCard key={`${item.id}-${item.dayKey}`} item={item} canNavigate={canNavigateTo(item)} onOpen={openJob} onNavigate={navigateTo} />
                      )) : (
                        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">No jobs this day.</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <>
              {legendStatuses.length ? (
                <div className="flex flex-wrap gap-3 border-b border-slate-200 px-3 py-2 sm:px-5">
                  {legendStatuses.map((key) => {
                    const meta = STATUS_META[key] || STATUS_META.unknown;
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="md:hidden">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-900 text-white">
                  {WEEKDAYS.map((day) => (
                    <div key={`mobile-${day}`} className="py-2 text-center text-xs font-semibold uppercase">
                      {day.slice(0, 1)}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthDays.map((day) => {
                    const key = getLocalDateKey(day);
                    const dayJobs = jobsByDay.get(key) || [];
                    const notes = notesFor(key);
                    const isClosed = notes.some((note) => note.kind === 'closed' || note.kind === 'holiday');
                    const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                    const isToday = sameDay(day, today);
                    const isSelected = key === selectedDateKey;
                    return (
                      <button
                        key={`mobile-${key}`}
                        type="button"
                        onClick={() => setSelectedDateKey(key)}
                        aria-pressed={isSelected}
                        aria-label={`${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${dayJobs.length} scheduled task${dayJobs.length === 1 ? '' : 's'}${notes.length ? `, ${notes.map((note) => note.label).join(', ')}` : ''}`}
                        className={`flex min-h-12 flex-col items-center justify-center border-b border-r border-slate-200 p-0.5 text-xs ${
                          isSelected
                            ? 'bg-blue-100 text-blue-800 ring-2 ring-inset ring-blue-400'
                            : isClosed
                              ? 'bg-rose-50 text-rose-700'
                              : isCurrentMonth
                                ? 'bg-white text-slate-700'
                                : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${isToday ? 'bg-brand-600 text-white' : ''}`}>{day.getDate()}</span>
                        {dayJobs.length > 0 ? <span className="mt-0.5 rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-800">{dayJobs.length}</span> : <span className="h-3" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="hidden overflow-x-auto md:block">
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
                      const notes = notableNotes(key);
                      const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                      const isToday = sameDay(day, today);
                      const isSelected = key === selectedDateKey;

                      return (
                        <div
                          key={key}
                          className={`min-h-36 border-b border-r border-slate-200 p-2 sm:min-h-44 xl:min-h-52 ${isSelected ? 'ring-2 ring-inset ring-blue-300' : ''} ${isCurrentMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'}`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedDateKey(key)}
                            aria-pressed={isSelected}
                            aria-label={`Show ${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}
                            className="mb-2 flex w-full items-center justify-between rounded-md text-left hover:bg-slate-50"
                          >
                            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-blue-500 text-white' : 'text-slate-700'}`}>
                              {day.getDate()}
                            </span>
                            {dayJobs.length > 0 && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                                {dayJobs.length}
                              </span>
                            )}
                          </button>
                          {notes.length ? <div className="mb-2"><DayNotes notes={notes} compact /></div> : null}

                          <div className="space-y-2">
                            {dayJobs.map((item) => {
                              const meta = getStatusMeta(item.status);
                              const ticketId = ticketOf(item);
                              return (
                                <div key={item.id} className={`rounded-lg ring-1 ring-inset p-2 text-xs shadow-sm ${meta.tone}`}>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold">{serviceName(item)}</p>
                                      <p className="mt-1 truncate opacity-80">{clientName(item)}</p>
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
                                      aria-label={`Details for ${formatTicketId(ticketId)}`}
                                      onClick={() => openJob(ticketId)}
                                      className="flex-1 rounded-md bg-white/80 px-2 py-1 font-semibold text-slate-700 hover:bg-white"
                                    >
                                      Details
                                    </button>
                                    {canNavigateTo(item) ? (
                                      <button
                                        type="button"
                                        onClick={() => navigateTo(ticketId)}
                                        className="rounded-md bg-slate-900 px-2 py-1 font-semibold text-white hover:bg-slate-700"
                                        aria-label={`Navigate to ${formatTicketId(ticketId)}`}
                                        title="Navigate"
                                      >
                                        <FiMapPin />
                                      </button>
                                    ) : null}
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

              {/* The chosen day, on every screen size. */}
              <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4" aria-label="Selected day">
                <p className="text-sm font-bold text-slate-900">{dayHeading(selectedDate)}</p>
                <DayNotes notes={notesFor(selectedDateKey)} />
                {selectedDayJobs.length > 0 ? (
                  <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {selectedDayJobs.map((item) => (
                      <JobCard key={`day-${item.id}`} item={item} canNavigate={canNavigateTo(item)} onOpen={openJob} onNavigate={navigateTo} />
                    ))}
                  </div>
                ) : <p className="mt-2 text-sm text-slate-500">No scheduled tasks for this day.</p>}
              </div>

              <div className="border-t border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Upcoming Tasks</h3>
                {upcomingTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    No upcoming jobs on this calendar. Assigned jobs will appear on their scheduled dates.
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {upcomingTasks.slice(0, 6).map((item) => {
                      const meta = getStatusMeta(item.status);
                      const ticketId = ticketOf(item);
                      return (
                        <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                          <div className={`h-3 w-3 shrink-0 rounded-full ${meta.dot}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {formatTicketId(ticketId)}: {serviceName(item)}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="truncate text-xs text-slate-500">
                                {item.calendarDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{item.workDays > 1 && item.workDay > 1 ? ` · ${workDayLabel(item)}` : ` at ${formatTime(item)}`}
                              </span>
                              <StatusBadge status={item.status} size="sm" />
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label={`Open ${formatTicketId(ticketId)}`}
                            onClick={() => openJob(ticketId)}
                            className="col-span-2 min-h-11 w-full rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 sm:col-span-1 sm:min-h-0 sm:w-auto sm:py-2"
                          >
                            Open
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </Layout>
  );
}
