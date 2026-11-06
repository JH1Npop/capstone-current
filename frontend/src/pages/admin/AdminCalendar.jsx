import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiChevronLeft,
  FiChevronRight,
  FiAlertTriangle,
  FiClock,
  FiFilter,
  FiRefreshCw,
  FiSettings,
  FiUser,
  FiX,
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { PanelSkeleton } from '../../components/ui/LoadingSkeleton';
import RescheduleTicketModal from '../../components/shared/RescheduleTicketModal';
import CalendarEventDetailsModal from '../../components/shared/CalendarEventDetailsModal';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import CalendarAvailabilityConfigurationPanel, { QUICK_CLOSE_REASONS } from '../../components/admin/CalendarAvailabilityConfigurationPanel';
import { formatRequestId, formatTicketId } from '../../utils/roleIds';
import {
  fetchAdminCalendarClosures,
  fetchAdminCalendarEvents,
  fetchServiceTypes,
  rescheduleServiceTicket,
  updateAdminCalendarClosure,
} from '../../api/api';
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

const getClosedRestrictions = (closures = []) => closures.filter(
  (closure) => closure.availability_status === 'closed'
);

const getClosedRestrictionLabel = (closures = []) => {
  if (closures.length === 0) return '';
  const slots = closures.some((closure) => closure.time_slot === 'all_day')
    ? 'Closed all day'
    : `${closures.map((closure) => closure.time_slot_label).join(', ')} closed`;
  const reasons = [...new Set(closures.map((closure) => closure.reason).filter(Boolean))].join(' · ');
  return reasons ? `${slots}: ${reasons}` : slots;
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

const AVAILABILITY_META = {
  available: { label: 'Available', dot: 'bg-emerald-500' },
  limited: { label: 'Limited', dot: 'bg-amber-500' },
  full: { label: 'Fully booked', dot: 'bg-rose-500' },
  closed: { label: 'Manually closed', dot: 'bg-slate-700' },
};

function SelectedDayAgendaModal({ open, dateLabel, events, allEventCount, closedRestrictions, conflictEventIds, onClose, onOpenEvent }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) || []).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
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
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="selected-day-agenda-title" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="selected-day-agenda-title" className="text-lg font-bold text-slate-950 sm:text-xl">Appointments for {dateLabel}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {events.length} visible scheduled item{events.length === 1 ? '' : 's'}
              {allEventCount !== events.length ? ` · ${allEventCount} before filters` : ''}
            </p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close selected day appointments" className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-800">
            <FiX size={20} />
          </button>
        </header>

        <div className="overflow-y-auto">
          {closedRestrictions.length > 0 && (
            <div className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:px-6" role="status" aria-label="Selected date closure reason">
              <span className="mt-0.5 shrink-0 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                {closedRestrictions.some((closure) => closure.time_slot === 'all_day') ? 'Closed' : 'Partly closed'}
              </span>
              <div>
                <p className="font-bold">{closedRestrictions.some((closure) => closure.time_slot === 'all_day') ? 'This date is closed for new appointments' : 'Part of this date is closed for new appointments'}</p>
                <p className="mt-0.5">{getClosedRestrictionLabel(closedRestrictions)}</p>
              </div>
            </div>
          )}

          {events.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500 sm:px-6">No appointments for the selected day.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {events.map((event) => {
                const style = getStatusStyle(event.calendar_status);
                return (
                  <button key={`selected-${event.id}`} type="button" onClick={() => onOpenEvent(event)} style={getServiceColorStyle(event, 0.1)} className="grid w-full gap-3 border-l-8 px-4 py-3 text-left text-sm transition hover:bg-blue-50/60 sm:px-6 md:grid-cols-[minmax(12rem,1.2fr)_minmax(9rem,0.8fr)_minmax(11rem,1fr)_minmax(10rem,1fr)] md:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={getServiceSwatchStyle(event.service_type_color)} />
                        <span className="truncate">{event.service_type || 'Service'}</span>
                      </div>
                      <div className="truncate text-xs text-slate-500">{event.ticket_id ? formatTicketId(event.ticket_id) : formatRequestId(event.request_id)} · {event.client || 'Client'}</div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2"><FiClock className="shrink-0 text-slate-400" size={14} /><span className="truncate text-slate-700">{formatEventTime(event)}</span></div>
                    <div className="flex min-w-0 items-center gap-2"><FiUser className="shrink-0 text-slate-400" size={14} /><span className="truncate text-slate-700">{event.assigned_technician || (event.assignment_status === 'unassigned' ? 'No technician assigned' : 'TBD')}</span></div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{style.label}</span>
                      {event.is_rescheduled ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">Rescheduled</span> : null}
                      {conflictEventIds.has(event.id) ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700"><FiAlertTriangle /> Conflict</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminCalendar() {
  const navigate = useNavigate();
  const calendarRequestId = useRef(0);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [closures, setClosures] = useState([]);
  const [availabilityDays, setAvailabilityDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [calendarError, setCalendarError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [configurationError, setConfigurationError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [rescheduleTicket, setRescheduleTicket] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [showCompletedJobs, setShowCompletedJobs] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(() => getLocalDateKey(new Date()));
  const [selectedDayAgendaOpen, setSelectedDayAgendaOpen] = useState(false);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [filters, setFilters] = useState({ service: 'all', technician: 'all', status: 'all', workflow: 'all' });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [serviceLegendOpen, setServiceLegendOpen] = useState(false);
  const [configurationMode, setConfigurationMode] = useState(false);
  const [configurationPanelOpen, setConfigurationPanelOpen] = useState(false);
  const [configurationDirty, setConfigurationDirty] = useState(false);
  const [configurationConfirmAction, setConfigurationConfirmAction] = useState(null);
  const [closureSaving, setClosureSaving] = useState(false);
  // "Select days" mode: click several dates, then close or reopen them together.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);
  const [bulkReason, setBulkReason] = useState(QUICK_CLOSE_REASONS[0]);
  const [bulkOtherReason, setBulkOtherReason] = useState('');
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [dailyCapacity, setDailyCapacity] = useState(3);
  const activeFilterCount = Object.values(filters).filter((value) => value !== 'all').length;

  const monthDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const monthRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);
  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = useMemo(() => new Date(), []);
  // Dates before today are shown slightly grayed out (they stay readable as job history).
  const todayKey = getLocalDateKey(today);

  const loadCalendar = useCallback(async () => {
    const requestId = calendarRequestId.current + 1;
    calendarRequestId.current = requestId;
    setLoading(true);
    setAvailabilityLoading(true);
    const [eventResult, availabilityResult] = await Promise.allSettled([
      fetchAdminCalendarEvents({ ...monthRange, showCompleted: showCompletedJobs }),
      fetchAdminCalendarClosures(monthRange),
    ]);
    if (requestId !== calendarRequestId.current) return;

    if (eventResult.status === 'fulfilled') {
      setEvents(eventResult.value.filter(isVisibleCalendarEvent));
      setCalendarError('');
    } else {
      setCalendarError(eventResult.reason?.message || 'Unable to refresh calendar events. Existing events are retained.');
    }

    if (availabilityResult.status === 'fulfilled') {
      setClosures(availabilityResult.value.closures);
      setDailyCapacity(availabilityResult.value.dailyCapacity);
      setAvailabilityDays(availabilityResult.value.availabilityDays);
      setAvailabilityError('');
    } else {
      setAvailabilityError(availabilityResult.reason?.message || 'Unable to refresh appointment availability.');
    }

    if (requestId === calendarRequestId.current) {
      setLoading(false);
      setAvailabilityLoading(false);
    }
  }, [monthRange, showCompletedJobs]);

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
  }, [loadCalendar]);

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
  const closuresByDay = useMemo(() => {
    const groups = new Map();
    for (const closure of closures) {
      groups.set(closure.date, [...(groups.get(closure.date) || []), closure]);
    }
    return groups;
  }, [closures]);
  const availabilityByDay = useMemo(() => new Map(
    availabilityDays.map((day) => [day.date, day])
  ), [availabilityDays]);
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
  const selectedDayAllEvents = events.filter((event) => event.date === selectedDateKey);
  const selectedDateClosures = closuresByDay.get(selectedDateKey) || [];
  const selectedDateClosedRestrictions = getClosedRestrictions(selectedDateClosures);
  const selectedDateAvailability = availabilityByDay.get(selectedDateKey) || null;
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

  const selectCalendarDate = (dateKey, { openConfiguration = true } = {}) => {
    if (configurationMode && selectMode) {
      if (dateKey < getLocalDateKey(new Date())) return; // past dates cannot be changed
      setBulkError('');
      setSuccessMessage('');
      setSelectedDates((current) => (current.includes(dateKey)
        ? current.filter((key) => key !== dateKey)
        : [...current, dateKey].sort()));
      return;
    }
    setSelectedDateKey(dateKey);
    if (configurationMode && openConfiguration) {
      setSelectedDayAgendaOpen(false);
      setConfigurationError('');
      setSuccessMessage('');
      setConfigurationPanelOpen(true);
    } else if (!configurationMode) {
      setSelectedDayAgendaOpen(true);
    }
  };

  const selectMobileDate = (value) => {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return;
    selectCalendarDate(value);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const closeSelectedDayAgenda = useCallback(() => setSelectedDayAgendaOpen(false), []);

  const closeConfigurationPanel = ({ exitMode = false } = {}) => {
    if (configurationDirty) {
      setConfigurationConfirmAction(exitMode ? 'exit-mode' : 'close-panel');
      return;
    }
    setConfigurationPanelOpen(false);
    if (exitMode) setConfigurationMode(false);
  };

  const toggleConfigurationMode = () => {
    if (configurationMode) {
      setSelectMode(false);
      setSelectedDates([]);
      closeConfigurationPanel({ exitMode: true });
      return;
    }
    setSelectedDayAgendaOpen(false);
    setConfigurationMode(true);
    setConfigurationPanelOpen(false);
    setConfigurationError('');
    setSuccessMessage('Select a date to configure booking availability.');
  };

  const openEvent = (event) => {
    setSelectedDayAgendaOpen(false);
    setSelectedEvent(event);
    setSuccessMessage('');
  };

  const handleRescheduleSubmit = async (ticketId, schedulingData) => {
    await rescheduleServiceTicket(ticketId, schedulingData);
    await loadCalendar();
    setRescheduleTicket(null);
    setSuccessMessage(`${formatTicketId(ticketId)} schedule updated.`);
  };

  const handleApplyAvailability = async ({ startDate, endDate, timeSlot, availabilityStatus, reason }) => {
    setClosureSaving(true);
    setConfigurationError('');
    try {
      await updateAdminCalendarClosure({
        action: 'set',
        startDate,
        endDate,
        timeSlot,
        availabilityStatus,
        reason,
      });
      setSuccessMessage(`${availabilityStatus === 'closed' ? 'Closed' : 'Limited'} availability applied from ${startDate} through ${endDate}.`);
      await loadCalendar();
      return true;
    } catch (err) {
      setConfigurationError(err.message || 'Unable to update calendar availability.');
      return false;
    } finally {
      setClosureSaving(false);
    }
  };

  // Shared by the quick card and "Select days": one request for all chosen dates, so it fully applies or not at all.
  const applyToDates = async ({ dates, action, reason = '' }) => {
    setClosureSaving(true);
    setConfigurationError('');
    try {
      await updateAdminCalendarClosure(action === 'reopen'
        ? { action: 'reopen', dates, timeSlot: 'any' }
        : { action: 'set', dates, timeSlot: 'all_day', availabilityStatus: 'closed', reason });
      const label = dates.length === 1
        ? new Date(`${dates[0]}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        : `${dates.length} days`;
      setSuccessMessage(action === 'reopen' ? `${label} reopened for new bookings.` : `${label} closed to new bookings (${reason}).`);
      await loadCalendar();
      return true;
    } catch (err) {
      const message = err.message || 'Unable to update calendar availability.';
      setConfigurationError(message);
      return message;
    } finally {
      setClosureSaving(false);
    }
  };

  const handleQuickClose = ({ reason }) => applyToDates({ dates: [selectedDateKey], action: 'close', reason });
  const handleQuickReopen = () => applyToDates({ dates: [selectedDateKey], action: 'reopen' });

  const bulkReasonText = bulkReason === 'Other' ? bulkOtherReason.trim() : bulkReason;
  const runBulk = async (action) => {
    if (!selectedDates.length) return;
    if (action === 'close' && bulkReasonText.length < 3) {
      setBulkError('Type a reason of at least 3 characters.');
      return;
    }
    const result = await applyToDates({ dates: selectedDates, action, reason: bulkReasonText });
    if (result === true) {
      setSelectedDates([]);
      setBulkError('');
    } else {
      setBulkError(result);
    }
  };

  const handleReopenAvailability = async (closure) => {
    setClosureSaving(true);
    setConfigurationError('');
    try {
      await updateAdminCalendarClosure({
        action: 'reopen',
        date: closure.date,
        timeSlot: closure.time_slot,
      });
      setSuccessMessage(`${closure.time_slot_label} availability reopened for ${selectedDateLabel}.`);
      await loadCalendar();
      return true;
    } catch (err) {
      setConfigurationError(err.message || 'Unable to reopen calendar availability.');
      return false;
    } finally {
      setClosureSaving(false);
    }
  };

  const handleReopenRange = async ({ startDate, endDate, timeSlot }) => {
    setClosureSaving(true);
    setConfigurationError('');
    try {
      await updateAdminCalendarClosure({
        action: 'reopen',
        startDate,
        endDate,
        timeSlot,
      });
      setSuccessMessage(`Availability reopened from ${startDate} through ${endDate}.`);
      await loadCalendar();
      return true;
    } catch (err) {
      setConfigurationError(err.message || 'Unable to reopen the selected range.');
      return false;
    } finally {
      setClosureSaving(false);
    }
  };

  return (
    <Layout>
      {calendarError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <span>{calendarError}</span>
          <button type="button" onClick={loadCalendar} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold"><FiRefreshCw /> Retry events</button>
        </div>
      )}

      {successMessage && !configurationPanelOpen && (
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
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm last:col-span-2 lg:last:col-span-1">
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
            <button
              type="button"
              onClick={toggleConfigurationMode}
              aria-pressed={configurationMode}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${configurationMode ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-700'}`}
            >
              <FiSettings aria-hidden="true" /> {configurationMode ? 'Done Configuring' : 'Configure Availability'}
            </button>
          </div>
        </div>

        {configurationMode && (
          <div className="border-b border-brand-200 bg-brand-50 px-4 py-2 text-xs text-brand-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span role="status">
                <strong>Configuration Mode:</strong>{' '}
                {selectMode
                  ? 'click each date you want to change, then choose Close or Reopen below.'
                  : 'click a date to close or reopen it. Appointment cards still open normally.'}
              </span>
              <button
                type="button"
                onClick={() => { setSelectMode((value) => !value); setSelectedDates([]); setBulkError(''); setSuccessMessage(''); }}
                aria-pressed={selectMode}
                className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${selectMode ? 'border-brand-600 bg-brand-600 text-white' : 'border-brand-300 bg-white text-brand-800 hover:bg-brand-100'}`}
              >
                {selectMode ? 'Done selecting' : 'Select days'}
              </button>
            </div>
            {selectMode ? (
              // Floats at the bottom of the screen so it stays in view while scrolling the month to pick days.
              <section aria-label="Selected days" className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-brand-300 bg-white px-4 py-3 text-slate-700 shadow-2xl shadow-slate-900/20">
                <span className="text-sm font-semibold text-slate-900">{selectedDates.length} {selectedDates.length === 1 ? 'day' : 'days'} selected</span>
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">Reason
                  <select value={bulkReason} onChange={(event) => { setBulkReason(event.target.value); setBulkError(''); }} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-normal">
                    {QUICK_CLOSE_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                {bulkReason === 'Other' ? (
                  <input value={bulkOtherReason} maxLength={255} onChange={(event) => { setBulkOtherReason(event.target.value); setBulkError(''); }} placeholder="Why are these dates closed?" aria-label="Other reason" className="h-8 min-w-[12rem] rounded-lg border border-slate-300 px-2 text-xs" />
                ) : null}
                <button type="button" disabled={!selectedDates.length || closureSaving} onClick={() => { if (bulkReason === 'Other' && bulkReasonText.length < 3) { setBulkError('Type a reason of at least 3 characters.'); return; } setBulkConfirmOpen(true); }} className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white disabled:opacity-50">Close selected days</button>
                <button type="button" disabled={!selectedDates.length || closureSaving} onClick={() => runBulk('reopen')} className="h-8 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 disabled:opacity-50">Reopen selected days</button>
                <button type="button" disabled={!selectedDates.length || closureSaving} onClick={() => { setSelectedDates([]); setBulkError(''); }} className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">Clear selection</button>
                {bulkError ? <p role="alert" className="w-full text-xs font-medium text-rose-700">{bulkError}</p> : null}
                {successMessage && !configurationPanelOpen ? <p role="status" className="w-full text-xs font-medium text-emerald-700">{successMessage}</p> : null}
              </section>
            ) : (
              !configurationPanelOpen && <p className="mt-1 font-semibold">No date configuration open</p>
            )}
          </div>
        )}

        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><FiFilter /> Filter schedule</div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((open) => !open)}
              aria-expanded={mobileFiltersOpen}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:hidden"
            >
              {mobileFiltersOpen ? 'Hide filters' : `Show filters${activeFilterCount ? ` (${activeFilterCount})` : ''}`}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <input type="date" value={selectedDateKey} onChange={(event) => selectMobileDate(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 md:hidden" aria-label="Selected calendar date" />
            <select value={filters.workflow} onChange={(event) => setFilters((current) => ({ ...current, workflow: event.target.value }))} className={`${mobileFiltersOpen ? 'block' : 'hidden'} h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 sm:block`} aria-label="Filter by workflow">
              <option value="all">All work types</option>
              <option value="request">Client requests</option>
              <option value="inspection">Inspections</option>
              <option value="installation">Service jobs</option>
            </select>
            <select value={filters.service} onChange={(event) => setFilters((current) => ({ ...current, service: event.target.value }))} className={`${mobileFiltersOpen ? 'block' : 'hidden'} h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 sm:block`} aria-label="Filter by service">
              <option value="all">All services</option>
              {serviceColorLegend.map((service) => <option key={service.name} value={service.name}>{service.name}</option>)}
            </select>
            <select value={filters.technician} onChange={(event) => setFilters((current) => ({ ...current, technician: event.target.value }))} className={`${mobileFiltersOpen ? 'block' : 'hidden'} h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 sm:block`} aria-label="Filter by technician">
              <option value="all">All technicians</option>
              <option value="unassigned">Unassigned only</option>
              {technicianOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className={`${mobileFiltersOpen ? 'block' : 'hidden'} h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 sm:block`} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {statusOptions.map((statusValue) => <option key={statusValue} value={statusValue}>{getStatusStyle(statusValue).label}</option>)}
            </select>
            <button type="button" onClick={() => setFilters({ service: 'all', technician: 'all', status: 'all', workflow: 'all' })} className={`${mobileFiltersOpen ? 'block' : 'hidden'} h-10 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:block`}>Clear filters</button>
          </div>
        </div>

        {serviceColorLegend.length > 0 && (
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600" aria-label="Booking availability legend">
                {Object.entries(AVAILABILITY_META).map(([statusValue, meta]) => <span key={statusValue} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />{meta.label}</span>)}
              </div>
              <button type="button" onClick={() => setServiceLegendOpen((value) => !value)} aria-expanded={serviceLegendOpen} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">{serviceLegendOpen ? 'Hide service colors' : `Service colors (${serviceColorLegend.length})`}</button>
            </div>
            {serviceLegendOpen && <div className="mt-3 flex flex-wrap items-center gap-2">{serviceColorLegend.map((service) => (
              <div key={service.name} className="flex min-h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"><span className="h-3 w-8 rounded-sm shadow-sm" style={getServiceSwatchStyle(service.color)} /><span className="max-w-40 truncate">{service.name}</span></div>
            ))}</div>}
          </div>
        )}

        {loading ? (
          <div className="py-4">
            <PanelSkeleton rows={8} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 border-b border-slate-200 md:hidden" aria-label="Mobile month calendar">
              {WEEKDAYS.map((day) => (
                <div key={`mobile-${day}`} className="bg-slate-900 px-1 py-2 text-center text-xs font-semibold uppercase text-white">
                  {day.slice(0, 1)}
                </div>
              ))}
              {monthDays.map((day) => {
                const key = getLocalDateKey(day);
                const dayEvents = eventsByDay.get(key) || [];
                const dayAvailability = availabilityByDay.get(key);
                const availabilityMeta = AVAILABILITY_META[dayAvailability?.status] || null;
                const closedRestrictions = getClosedRestrictions(closuresByDay.get(key) || []);
                const closedRestrictionLabel = getClosedRestrictionLabel(closedRestrictions);
                const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isToday = sameDay(day, today);
                const isPastDay = key < todayKey;
                const isSelected = key === selectedDateKey && !selectMode;
                const isPicked = selectMode && selectedDates.includes(key);

                return (
                  <button
                    key={`mobile-${key}`}
                    type="button"
                    onClick={() => selectCalendarDate(key)}
                    aria-label={`${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${dayEvents.length} visible scheduled item${dayEvents.length === 1 ? '' : 's'}, ${availabilityMeta?.label || 'availability unknown'}${closedRestrictionLabel ? `, ${closedRestrictionLabel}` : ''}${configurationMode ? (selectMode ? (isPicked ? ', selected for a bulk change' : ', select this day') : ', open availability configuration') : ''}`}
                    aria-pressed={selectMode ? isPicked : undefined}
                    className={`relative flex min-h-14 flex-col items-center justify-center border-b border-r border-slate-200 p-1 text-xs transition ${
                      isPicked
                        ? 'bg-brand-100 text-brand-900 outline outline-2 -outline-offset-2 outline-brand-600'
                        : isSelected
                        ? 'bg-blue-100 text-blue-800 ring-2 ring-inset ring-blue-400'
                        : isPastDay
                          ? 'bg-slate-100 text-slate-400'
                          : isCurrentMonth
                            ? 'bg-white text-slate-700'
                            : 'bg-slate-50 text-slate-400'
                    }`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${isToday ? 'bg-brand-600 text-white' : ''}`}>
                      {day.getDate()}
                    </span>
                    {dayEvents.length > 0 ? (
                      <span className="mt-1 min-w-4 rounded-full bg-amber-100 px-1 text-xs font-bold text-amber-800">
                        {dayEvents.length}
                      </span>
                    ) : (
                      <span className="mt-1 h-3" aria-hidden="true" />
                    )}
                    {availabilityMeta && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${availabilityMeta.dot}`} title={availabilityMeta.label} />}
                    {closedRestrictions.length > 0 && (
                      <span className="absolute left-1 top-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-rose-700" title={closedRestrictionLabel}>
                        {closedRestrictions.some((closure) => closure.time_slot === 'all_day') ? 'Closed' : 'Partly closed'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
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
                    const dayAvailability = availabilityByDay.get(key);
                    const availabilityMeta = AVAILABILITY_META[dayAvailability?.status] || null;
                    const closedRestrictions = getClosedRestrictions(closuresByDay.get(key) || []);
                    const closedRestrictionLabel = getClosedRestrictionLabel(closedRestrictions);
                    const visibleEvents = dayEvents.slice(0, 2);
                    const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                    const isToday = sameDay(day, today);
                const isPastDay = key < todayKey;
                    const isSelected = key === selectedDateKey && !selectMode;
                const isPicked = selectMode && selectedDates.includes(key);

                    return (
                      <div
                        key={key}
                        // A click on an empty part of the date selects it. The keyboard target is the date-row
                        // button below; it only covers the top row so it never sits under the appointment buttons.
                        onClick={(clickEvent) => {
                          // Focus the date button so closing the day list returns focus to this date.
                          clickEvent.currentTarget.querySelector('button')?.focus();
                          selectCalendarDate(key);
                        }}
                        className={`relative min-h-28 cursor-pointer border-b border-r border-slate-200 p-1.5 transition sm:min-h-32 xl:min-h-36 ${
                          isPicked
                            ? 'bg-brand-50 outline outline-2 -outline-offset-2 outline-brand-600'
                            : isSelected
                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-300'
                            : isPastDay
                              ? 'bg-slate-100/80 text-slate-400'
                              : isCurrentMonth
                                ? 'bg-white hover:bg-slate-50'
                                : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                    <button
                      type="button"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        selectCalendarDate(key);
                      }}
                      className="absolute inset-x-0 top-0 z-0 h-[1.875rem] rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                      aria-label={`${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${dayEvents.length} visible scheduled item${dayEvents.length === 1 ? '' : 's'}, ${availabilityMeta?.label || 'availability unknown'}${closedRestrictionLabel ? `, ${closedRestrictionLabel}` : ''}${configurationMode ? (selectMode ? (isPicked ? ', selected for a bulk change' : ', select this day') : ', open availability configuration') : ''}`}
                    aria-pressed={selectMode ? isPicked : undefined}
                    />
                    <div className="pointer-events-none relative z-[1] mb-1.5 flex items-center justify-between gap-1">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'text-blue-600' : isPastDay ? 'text-slate-400' : 'text-slate-700'}`}>
                        {day.getDate()}
                      </span>
                      <div className="flex items-center gap-1">
                        {isPicked ? <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Selected</span> : null}
                        {availabilityMeta && <span className={`h-2.5 w-2.5 rounded-full ${availabilityMeta.dot} ${isPastDay ? 'opacity-30' : ''}`} title={availabilityMeta.label} />}
                        {dayEvents.length > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {closedRestrictions.length > 0 && (
                      <div
                        className="pointer-events-none relative z-[1] mb-1.5 rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-rose-800"
                        aria-label={`Closure for ${key}: ${closedRestrictionLabel}`}
                      >
                        <p className="text-[11px] font-bold leading-4">{closedRestrictions.some((closure) => closure.time_slot === 'all_day') ? 'CLOSED' : 'PARTLY CLOSED'}</p>
                        <p className="line-clamp-2 text-[10px] leading-3.5" title={closedRestrictionLabel}>{closedRestrictionLabel}</p>
                      </div>
                    )}

                    <div className="relative z-[2] space-y-1.5">
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
                            className="block w-full rounded-md border border-l-8 border-slate-200 px-1.5 py-1 text-left text-xs text-slate-800 transition hover:border-slate-300 hover:shadow-sm"
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
                                <p className="truncate text-xs opacity-75">{formatEventTime(event)} · {event.client || 'Client'}</p>
                              </div>
                              <span
                                className="mt-0.5 shrink-0 rounded bg-white/75 px-1 text-xs font-semibold uppercase text-slate-500"
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
                            selectCalendarDate(key);
                          }}
                          className="w-full rounded-md bg-slate-100 px-1.5 py-1 text-left text-xs font-semibold text-slate-500 hover:bg-slate-200"
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

      {/* Room for the floating "Selected days" bar so it never covers the last row of dates. */}
      {configurationMode && selectMode ? <div aria-hidden="true" className="h-28" /> : null}

      <CalendarAvailabilityConfigurationPanel
        open={configurationMode && configurationPanelOpen}
        selectedDateKey={selectedDateKey}
        availability={selectedDateAvailability}
        availabilityDays={availabilityDays}
        availabilityError={availabilityError}
        mutationError={configurationError}
        feedback={configurationPanelOpen ? successMessage : ''}
        availabilityLoading={availabilityLoading}
        closures={selectedDateClosures}
        dailyCapacity={dailyCapacity}
        saving={closureSaving}
        onRetry={loadCalendar}
        onApplyOverride={handleApplyAvailability}
        onReopen={handleReopenRange}
        onReopenClosure={handleReopenAvailability}
        onQuickClose={handleQuickClose}
        onQuickReopen={handleQuickReopen}
        onRequestClose={() => closeConfigurationPanel()}
        onDirtyChange={setConfigurationDirty}
      />

      <SelectedDayAgendaModal
        open={selectedDayAgendaOpen}
        dateLabel={selectedDateLabel}
        events={selectedDayEvents}
        allEventCount={selectedDayAllEvents.length}
        closedRestrictions={selectedDateClosedRestrictions}
        conflictEventIds={conflictEventIds}
        onClose={closeSelectedDayAgenda}
        onOpenEvent={openEvent}
      />

      {bulkConfirmOpen && (
        <ConfirmationDialog
          title={`Close ${selectedDates.length} ${selectedDates.length === 1 ? 'day' : 'days'}?`}
          message={`${selectedDates.map((key) => new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')} will be closed to new bookings (${bulkReasonText}). Visits already booked stay scheduled.`}
          tone="warning"
          icon="warning"
          confirmLabel="Close days"
          cancelLabel="Go back"
          loading={closureSaving}
          onCancel={() => setBulkConfirmOpen(false)}
          onConfirm={async () => { setBulkConfirmOpen(false); await runBulk('close'); }}
        />
      )}

      {configurationConfirmAction && (
        <ConfirmationDialog
          title="Discard availability changes?"
          message="Your unsaved availability edits will be discarded. Calendar events, filters, month, and Include completed will remain unchanged."
          tone="warning"
          icon="warning"
          confirmLabel="Discard changes"
          cancelLabel="Keep configuring"
          onCancel={() => setConfigurationConfirmAction(null)}
          onConfirm={() => {
            const exitMode = configurationConfirmAction === 'exit-mode';
            setConfigurationDirty(false);
            setConfigurationPanelOpen(false);
            if (exitMode) setConfigurationMode(false);
            setConfigurationConfirmAction(null);
          }}
        />
      )}

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
