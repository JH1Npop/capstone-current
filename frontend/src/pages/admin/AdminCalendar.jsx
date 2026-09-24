import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiChevronLeft,
  FiChevronRight,
  FiAlertTriangle,
  FiClock,
  FiFilter,
  FiUser,
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import RescheduleTicketModal from '../../components/shared/RescheduleTicketModal';
import CalendarEventDetailsModal from '../../components/shared/CalendarEventDetailsModal';
import { formatTicketId } from '../../utils/roleIds';
import { fetchAdminCalendarEvents, fetchServiceTypes, rescheduleServiceTicket } from '../../api/api';
import { STATUS_META } from '../../components/ui/StatusBadge';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getStatusStyle = (status) => {
  const normStatus = String(status || '').toLowerCase().replace(/\s+/g, '_');
  const meta = normStatus === 'pending_approval' ? { ...STATUS_META.pending, label: 'Pending Approval' } :
               normStatus === 'unassigned' ? { ...STATUS_META.approved, label: 'Approved / Unassigned' } :
               normStatus === 'missed_dispatch' ? { ...STATUS_META.due, label: 'Needs Reschedule' } :
               normStatus === 'scheduled' ? { ...STATUS_META.assigned, label: 'Assigned / Scheduled' } :
               normStatus === 'in_progress' ? STATUS_META.in_progress :
               normStatus === 'completed' ? STATUS_META.completed :
               normStatus === 'cancelled' ? STATUS_META.cancelled :
               normStatus === 'requested' ? { ...STATUS_META.assigned, label: 'Requested' } :
               normStatus === 'for_inspection' ? STATUS_META.for_inspection :
               normStatus === 'inspection_completed' ? STATUS_META.inspection_completed :
               STATUS_META.unknown;
  return {
    label: meta.label,
    dot: meta.dot,
  };
};

const getCompactStatusLabel = (status) => {
  const normStatus = String(status || '').toLowerCase().replace(/\s+/g, '_');
  if (normStatus === 'pending_approval') return 'Pending';
  if (normStatus === 'unassigned') return 'Unassigned';
  if (normStatus === 'for_inspection') return 'Inspect';
  if (normStatus === 'inspection_completed') return 'Ready';
  if (normStatus === 'in_progress') return 'Active';
  if (normStatus === 'missed_dispatch') return 'Resched';
  if (normStatus === 'completed') return 'Done';
  if (normStatus === 'requested') return 'Request';
  return 'Scheduled';
};

const isVisibleCalendarEvent = (event) => !['cancelled'].includes(
  String(event?.calendar_status || event?.status || '').toLowerCase().replace(/\s+/g, '_')
);

const getLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

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

const formatEventTime = (event) => {
  if (event.time) {
    const date = new Date(`1970-01-01T${event.time}`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return event.time;
  }
  return event.time_slot || 'Time TBD';
};

const isHexColor = (value) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(value || '').trim());

const expandHexColor = (value) => {
  const color = String(value || '').trim();
  if (!isHexColor(color)) return '#2563eb';
  if (color.length === 4) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  return color;
};

const hexToRgb = (value) => {
  const color = expandHexColor(value).slice(1);
  return {
    r: parseInt(color.slice(0, 2), 16),
    g: parseInt(color.slice(2, 4), 16),
    b: parseInt(color.slice(4, 6), 16),
  };
};

const getServiceColorStyle = (event, alpha = 0.16) => {
  const color = expandHexColor(event?.service_type_color);
  const { r, g, b } = hexToRgb(color);
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})`,
    borderLeftColor: color,
  };
};

const getServiceSwatchStyle = (color) => ({
  backgroundColor: expandHexColor(color),
});

const normalizeStatus = (value) => String(value || '').toLowerCase().replace(/\s+/g, '_');

const getEventTeam = (event) => [
  event.assigned_technician,
  ...(Array.isArray(event.crew_members) ? event.crew_members : []),
].filter(Boolean);

const getConflictEventIds = (events) => {
  const conflicts = new Set();
  const timedEvents = events.filter((event) => event.date && event.time && getEventTeam(event).length);
  for (let firstIndex = 0; firstIndex < timedEvents.length; firstIndex += 1) {
    const first = timedEvents[firstIndex];
    const firstStart = new Date(`${first.date}T${first.time}`);
    const firstEnd = new Date(firstStart.getTime() + Math.max(1, Number(first.estimated_duration || 60)) * 60000);
    for (let secondIndex = firstIndex + 1; secondIndex < timedEvents.length; secondIndex += 1) {
      const second = timedEvents[secondIndex];
      if (first.date !== second.date) continue;
      if (!getEventTeam(first).some((member) => getEventTeam(second).includes(member))) continue;
      const secondStart = new Date(`${second.date}T${second.time}`);
      const secondEnd = new Date(secondStart.getTime() + Math.max(1, Number(second.estimated_duration || 60)) * 60000);
      if (firstStart < secondEnd && secondStart < firstEnd) {
        conflicts.add(first.id);
        conflicts.add(second.id);
      }
    }
  }
  return conflicts;
};

export default function AdminCalendar() {
  const navigate = useNavigate();
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [rescheduleTicket, setRescheduleTicket] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [showCompletedJobs, setShowCompletedJobs] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(() => getLocalDateKey(new Date()));
  const [serviceTypes, setServiceTypes] = useState([]);
  const [filters, setFilters] = useState({ service: 'all', technician: 'all', status: 'all', workflow: 'all' });

  const monthDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const monthRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);
  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = useMemo(() => new Date(), []);

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminCalendarEvents({ ...monthRange, showCompleted: showCompletedJobs });
      setEvents(data.filter(isVisibleCalendarEvent));
      setError('');
    } catch (err) {
      setEvents([]);
      setError(err.message || 'Unable to load admin calendar.');
    } finally {
      setLoading(false);
    }
  };

  const loadServiceTypes = async () => {
    try {
      const data = await fetchServiceTypes();
      setServiceTypes(Array.isArray(data) ? data : []);
    } catch {
      setServiceTypes([]);
    }
  };

  useEffect(() => {
    loadCalendar();
  }, [monthRange.start, monthRange.end, showCompletedJobs]);

  useEffect(() => {
    loadServiceTypes();
  }, []);

  const filteredEvents = useMemo(() => events.filter((event) => {
    if (filters.service !== 'all' && event.service_type !== filters.service) return false;
    if (filters.technician === 'unassigned' && event.assigned_technician) return false;
    if (filters.technician !== 'all' && filters.technician !== 'unassigned' && !getEventTeam(event).includes(filters.technician)) return false;
    if (filters.status !== 'all' && normalizeStatus(event.calendar_status) !== filters.status) return false;
    if (filters.workflow !== 'all') {
      const workflow = event.entity_type === 'request' ? 'request' : event.workflow_type || 'installation';
      if (workflow !== filters.workflow) return false;
    }
    return true;
  }), [events, filters]);

  const eventsByDay = useMemo(() => {
    const groups = new Map();
    for (const event of filteredEvents) {
      if (!event.date) continue;
      groups.set(event.date, [...(groups.get(event.date) || []), event]);
    }
    return groups;
  }, [filteredEvents]);
  const conflictEventIds = useMemo(() => getConflictEventIds(events), [events]);
  const technicianOptions = useMemo(() => Array.from(new Set(events.flatMap(getEventTeam))).sort(), [events]);
  const statusOptions = useMemo(() => Array.from(new Set(events.map((event) => normalizeStatus(event.calendar_status)))).sort(), [events]);
  const calendarSummary = useMemo(() => ({
    today: events.filter((event) => event.date === getLocalDateKey(today)).length,
    unassigned: events.filter((event) => !event.assigned_technician).length,
    pending: events.filter((event) => normalizeStatus(event.calendar_status) === 'pending_approval').length,
    reschedule: events.filter((event) => event.reschedule_requested || normalizeStatus(event.calendar_status) === 'missed_dispatch').length,
    conflicts: conflictEventIds.size,
  }), [events, conflictEventIds, today]);
  const serviceColorLegend = useMemo(() => {
    const services = new Map();
    for (const service of serviceTypes) {
      if (service?.is_active === false) continue;
      const serviceName = service?.name || 'Service';
      services.set(serviceName, {
        name: serviceName,
        color: expandHexColor(service?.color),
        displayOrder: Number(service?.display_order || 0),
      });
    }
    for (const event of events) {
      const serviceName = event.service_type || 'Service';
      if (!services.has(serviceName)) {
        services.set(serviceName, {
          name: serviceName,
          color: expandHexColor(event.service_type_color),
          displayOrder: 9999,
        });
      }
    }
    return Array.from(services.values()).sort((a, b) =>
      a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)
    );
  }, [events, serviceTypes]);
  const selectedDayEvents = eventsByDay.get(selectedDateKey) || [];
  const selectedDateLabel = new Date(`${selectedDateKey}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

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

  const selectMobileDate = (value) => {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return;
    setSelectedDateKey(value);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const openEvent = (event) => {
    setSelectedEvent(event);
    setSuccessMessage('');
  };

  const handleRescheduleSubmit = async (ticketId, schedulingData) => {
    await rescheduleServiceTicket(ticketId, schedulingData);
    await loadCalendar();
    setRescheduleTicket(null);
    setSuccessMessage(`${formatTicketId(ticketId)} schedule updated.`);
  };

  return (
    <Layout>
      
      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {successMessage && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          {successMessage}
        </div>
      )}

      <section aria-label="Calendar operations summary" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Today', calendarSummary.today, 'text-blue-700'],
          ['Unassigned', calendarSummary.unassigned, 'text-amber-700'],
          ['Pending approval', calendarSummary.pending, 'text-violet-700'],
          ['Needs reschedule', calendarSummary.reschedule, 'text-rose-700'],
          ['Time conflicts', calendarSummary.conflicts, calendarSummary.conflicts ? 'text-rose-700' : 'text-emerald-700'],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 xl:grid-cols-[auto_1fr] xl:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={goToPreviousMonth} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600" aria-label="Previous month">
              <FiChevronLeft />
            </button>
            <div className="min-w-0 px-2">
              <h3 className="text-lg font-semibold text-slate-900">{monthLabel}</h3>
              <p className="text-xs text-slate-500">Showing {filteredEvents.length} of {events.length} event{events.length === 1 ? '' : 's'}</p>
            </div>
            <button type="button" onClick={goToNextMonth} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600" aria-label="Next month">
              <FiChevronRight />
            </button>
            <button type="button" onClick={goToCurrentMonth} className="ml-1 h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
              Today
            </button>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3 xl:justify-end">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={showCompletedJobs}
                onChange={(event) => setShowCompletedJobs(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Include completed
            </label>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><FiFilter /> Filter schedule</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <input type="date" value={selectedDateKey} onChange={(event) => selectMobileDate(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 md:hidden" aria-label="Selected calendar date" />
            <select value={filters.workflow} onChange={(event) => setFilters((current) => ({ ...current, workflow: event.target.value }))} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700" aria-label="Filter by workflow">
              <option value="all">All work types</option>
              <option value="request">Client requests</option>
              <option value="inspection">Inspections</option>
              <option value="installation">Service jobs</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <select value={filters.service} onChange={(event) => setFilters((current) => ({ ...current, service: event.target.value }))} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700" aria-label="Filter by service">
              <option value="all">All services</option>
              {serviceColorLegend.map((service) => <option key={service.name} value={service.name}>{service.name}</option>)}
            </select>
            <select value={filters.technician} onChange={(event) => setFilters((current) => ({ ...current, technician: event.target.value }))} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700" aria-label="Filter by technician">
              <option value="all">All technicians</option>
              <option value="unassigned">Unassigned only</option>
              {technicianOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700" aria-label="Filter by status">
              <option value="all">All statuses</option>
              {statusOptions.map((statusValue) => <option key={statusValue} value={statusValue}>{getStatusStyle(statusValue).label}</option>)}
            </select>
            <button type="button" onClick={() => setFilters({ service: 'all', technician: 'all', status: 'all', workflow: 'all' })} className="h-10 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Clear filters</button>
          </div>
        </div>

        {serviceColorLegend.length > 0 && (
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase text-slate-500">Service Colors</span>
              {serviceColorLegend.map((service) => (
                <div
                  key={service.name}
                  className="flex min-h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
                >
                  <span
                    className="h-3 w-8 rounded-sm shadow-sm"
                    style={getServiceSwatchStyle(service.color)}
                  />
                  <span className="max-w-40 truncate">{service.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-4">
            <PanelSkeleton rows={8} />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[46rem] md:min-w-0">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-900 text-white">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {monthDays.map((day) => {
                    const key = getLocalDateKey(day);
                    const dayEvents = eventsByDay.get(key) || [];
                    const visibleEvents = dayEvents.slice(0, 2);
                    const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                    const isToday = sameDay(day, today);
                    const isSelected = key === selectedDateKey;

                    return (
                      <div
                        key={key}
                        onClick={() => setSelectedDateKey(key)}
                        className={`min-h-28 cursor-pointer border-b border-r border-slate-200 p-1.5 transition sm:min-h-32 xl:min-h-36 ${
                          isSelected
                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-300'
                            : isCurrentMonth
                              ? 'bg-white hover:bg-slate-50'
                              : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>
                        {day.getDate()}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {visibleEvents.map((event) => {
                        const style = getStatusStyle(event.calendar_status);
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              setSelectedDateKey(key);
                              openEvent(event);
                            }}
                            style={getServiceColorStyle(event)}
                            className="block w-full rounded-md border border-l-8 border-slate-200 px-1.5 py-1 text-left text-[11px] text-slate-800 transition hover:border-slate-300 hover:shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="flex min-w-0 items-center gap-1.5 font-semibold">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                    style={getServiceSwatchStyle(event.service_type_color)}
                                  />
                                  <span className="truncate">{event.service_type || 'Service'}</span>
                                </p>
                                <p className="truncate text-[10px] opacity-75">{formatEventTime(event)} · {event.client || 'Client'}</p>
                              </div>
                              <span
                                className="mt-0.5 shrink-0 rounded bg-white/75 px-1 text-[9px] font-semibold uppercase text-slate-500"
                                title={style.label}
                              >
                                {getCompactStatusLabel(event.calendar_status)}
                              </span>
                              {conflictEventIds.has(event.id) && <FiAlertTriangle className="mt-0.5 shrink-0 text-rose-600" title="Schedule conflict" />}
                            </div>
                          </button>
                        );
                      })}
                      {dayEvents.length > visibleEvents.length ? (
                        <button
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            setSelectedDateKey(key);
                          }}
                          className="w-full rounded-md bg-slate-100 px-1.5 py-1 text-left text-[10px] font-semibold text-slate-500 hover:bg-slate-200"
                        >
                          +{dayEvents.length - visibleEvents.length} more
                        </button>
                      ) : null}
                    </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {!loading && filteredEvents.length === 0 && (
          <div className="border-t border-slate-200 bg-white p-5 text-sm text-slate-500">
            {events.length === 0 ? 'No service appointments in this calendar range yet. New client requests with preferred dates will appear here after submission.' : 'No appointments match the selected filters.'}
          </div>
        )}
      </section>

      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{selectedDateLabel}</h3>
            <p className="text-sm text-slate-500">{selectedDayEvents.length} scheduled item{selectedDayEvents.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        {selectedDayEvents.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">No appointments for the selected day.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {selectedDayEvents.map((event) => {
              const style = getStatusStyle(event.calendar_status);
              return (
                <button
                  key={`selected-${event.id}`}
                  type="button"
                  onClick={() => openEvent(event)}
                  style={getServiceColorStyle(event, 0.1)}
                  className="grid w-full gap-3 border-l-8 px-4 py-3 text-left text-sm transition hover:bg-blue-50/60 md:grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={getServiceSwatchStyle(event.service_type_color)}
                      />
                      <span className="truncate">{event.service_type || 'Service'}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">{event.ticket_id ? formatTicketId(event.ticket_id) : `Request #${event.request_id}`} · {event.client || 'Client'}</div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <FiClock className="shrink-0 text-slate-400" size={14} />
                    <span className="truncate text-slate-700">{formatEventTime(event)}</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <FiUser className="shrink-0 text-slate-400" size={14} />
                    <span className="truncate text-slate-700">{event.assigned_technician || (event.assignment_status === 'unassigned' ? 'No technician assigned' : 'TBD')}</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {style.label}
                    </span>
                    {event.is_rescheduled ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Rescheduled</span>
                    ) : null}
                    {conflictEventIds.has(event.id) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700"><FiAlertTriangle /> Conflict</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <CalendarEventDetailsModal
        event={selectedEvent}
        statusLabel={selectedEvent ? getStatusStyle(selectedEvent.calendar_status).label : ''}
        timeLabel={selectedEvent ? formatEventTime(selectedEvent) : ''}
        hasConflict={selectedEvent ? conflictEventIds.has(selectedEvent.id) : false}
        onClose={() => setSelectedEvent(null)}
        onReschedule={() => {
          setRescheduleTicket(selectedEvent);
          setSelectedEvent(null);
        }}
        onViewTickets={() => navigate(selectedEvent?.ticket_id ? '/admin/service-tickets' : '/admin/dashboard#pending-approvals')}
        onOpenDispatch={() => navigate('/admin/dispatch-board')}
      />
      <RescheduleTicketModal
        ticket={rescheduleTicket}
        onClose={() => setRescheduleTicket(null)}
        onSubmit={handleRescheduleSubmit}
      />
    </Layout>
  );
}
