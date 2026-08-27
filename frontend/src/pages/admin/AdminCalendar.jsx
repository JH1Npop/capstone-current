import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiUser,
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import RescheduleTicketModal from '../../components/shared/RescheduleTicketModal';
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

export default function AdminCalendar() {
  const navigate = useNavigate();
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTicketEvent, setSelectedTicketEvent] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [showCompletedJobs, setShowCompletedJobs] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(() => getLocalDateKey(new Date()));
  const [serviceTypes, setServiceTypes] = useState([]);

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

  const eventsByDay = useMemo(() => {
    const groups = new Map();
    for (const event of events) {
      if (!event.date) continue;
      groups.set(event.date, [...(groups.get(event.date) || []), event]);
    }
    return groups;
  }, [events]);
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
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  const goToCurrentMonth = () => {
    setCalendarMonth(new Date());
  };

  const openEvent = (event) => {
    if (event.ticket_id) {
      setSelectedTicketEvent(event);
      setSuccessMessage('');
      return;
    }
    navigate('/admin/service-tickets');
  };

  const handleRescheduleSubmit = async (ticketId, schedulingData) => {
    await rescheduleServiceTicket(ticketId, schedulingData);
    await loadCalendar();
    setSelectedTicketEvent(null);
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

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 xl:grid-cols-[auto_1fr] xl:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={goToPreviousMonth} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600" aria-label="Previous month">
              <FiChevronLeft />
            </button>
            <div className="min-w-0 px-2">
              <h3 className="text-lg font-semibold text-slate-900">{monthLabel}</h3>
              <p className="text-xs text-slate-500">{events.length} calendar event{events.length === 1 ? '' : 's'}</p>
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
            <div className="overflow-x-auto">
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

        {!loading && events.length === 0 && (
          <div className="border-t border-slate-200 bg-white p-5 text-sm text-slate-500">
            No service appointments in this calendar range yet. New client requests with preferred dates will appear here after submission.
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
                    <div className="truncate text-xs text-slate-500">{event.ticket_id ? formatTicketId(event.ticket_id) : 'Request'} · {event.client || 'Client'}</div>
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
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <RescheduleTicketModal
        ticket={selectedTicketEvent}
        onClose={() => setSelectedTicketEvent(null)}
        onSubmit={handleRescheduleSubmit}
      />
    </Layout>
  );
}
