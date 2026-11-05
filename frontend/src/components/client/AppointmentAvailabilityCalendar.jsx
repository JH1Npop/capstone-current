import { useEffect, useMemo, useState } from 'react';
import {
  FiCalendar,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiRefreshCw,
} from 'react-icons/fi';
import { fetchAppointmentAvailability } from '../../api/api';
import { getLocalDateInputValue } from '../../utils/date';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' });
const DATE_FORMATTER = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });

const toDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromDateValue = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
};

const getMonthRange = (monthDate) => ({
  start: toDateValue(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)),
  end: toDateValue(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)),
});

const getUnavailableDisplay = (day, loadError) => {
  if (loadError) {
    return {
      badge: 'Unavailable',
      ariaLabel: 'availability could not be verified',
      message: 'Availability could not be verified.',
    };
  }

  const slotStatuses = Object.values(day?.availability?.slots || {})
    .map((slot) => slot?.status)
    .filter(Boolean);
  const isClosed = slotStatuses.length > 0 && slotStatuses.every((status) => status === 'closed');

  return isClosed
    ? {
        badge: 'Closed',
        ariaLabel: 'closed to new appointment requests',
        message: 'Closed to new appointment requests.',
      }
    : {
        badge: 'Full',
        ariaLabel: 'fully booked for new appointment requests',
        message: 'Fully booked for new appointment requests.',
      };
};

export default function AppointmentAvailabilityCalendar({ value, onChange, onSelectedDayChange }) {
  const today = getLocalDateInputValue();
  const initialDate = fromDateValue(value) || fromDateValue(today) || new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [availability, setAvailability] = useState({});
  const [advisory, setAdvisory] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryToken, setRetryToken] = useState(0);

  const monthRange = useMemo(() => getMonthRange(visibleMonth), [visibleMonth]);
  const currentMonthStart = getMonthRange(fromDateValue(today) || new Date()).start;

  useEffect(() => {
    const selectedDate = fromDateValue(value);
    if (
      selectedDate
      && (selectedDate.getFullYear() !== visibleMonth.getFullYear()
        || selectedDate.getMonth() !== visibleMonth.getMonth())
    ) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value, visibleMonth]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    fetchAppointmentAvailability(monthRange)
      .then((data) => {
        if (!active) return;
        setAvailability(Object.fromEntries((data?.days || []).map((day) => [day.date, day])));
        setAdvisory(data?.advisory || 'Schedule activity may change until your request is confirmed.');
      })
      .catch((error) => {
        if (!active) return;
        setAvailability({});
        setLoadError(error.message || 'Unable to load appointment availability.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [monthRange, retryToken]);

  const days = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const lastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: first.getDay() }, () => null),
      ...Array.from({ length: lastDay }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1)),
    ];
  }, [visibleMonth]);

  const selectedActivity = value ? availability[value] : null;
  const selectedDayStatus = selectedActivity?.availability?.status || 'available';
  const selectedUnavailableDisplay = getUnavailableDisplay(selectedActivity, loadError);
  const selectedSlotAvailability = selectedActivity?.availability?.slots || {};
  const selectedDate = fromDateValue(value);
  const selectedDateLabel = selectedDate ? DATE_FORMATTER.format(selectedDate) : '';

  useEffect(() => {
    onSelectedDayChange?.(selectedActivity || null);
  }, [onSelectedDayChange, selectedActivity]);
  const moveMonth = (offset) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="appointment-calendar-title">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <FiCalendar size={18} aria-hidden="true" />
          </span>
          <div>
            <h3 id="appointment-calendar-title" className="text-sm font-bold text-slate-900">Choose an appointment date</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">Full and closed dates cannot accept new requests. Limited dates still have a small number of openings.</p>
          </div>
        </div>
      </div>

      <div className="px-3 pb-4 pt-3 sm:px-4">
      <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => moveMonth(-1)}
            disabled={monthRange.start <= currentMonthStart}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiChevronLeft aria-hidden="true" />
          </button>
          <p className="text-center text-base font-bold text-slate-900">{MONTH_FORMATTER.format(visibleMonth)}</p>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => moveMonth(1)}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
          >
            <FiChevronRight aria-hidden="true" />
          </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5" role="grid" aria-label={MONTH_FORMATTER.format(visibleMonth)}>
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:text-[11px]" role="columnheader">{weekday}</div>
        ))}
        {days.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} aria-hidden="true" />;
          const dateValue = toDateValue(date);
          const isPast = dateValue < today;
          const isSelected = dateValue === value;
          const dayStatus = availability[dateValue]?.availability?.status || 'available';
          const isUnavailable = dayStatus === 'unavailable' || Boolean(loadError);
          const isLimited = dayStatus === 'limited';
          const unavailableDisplay = getUnavailableDisplay(availability[dateValue], loadError);
          const availabilityLabel = isUnavailable
            ? unavailableDisplay.ariaLabel
            : isLimited
              ? 'limited appointment availability'
              : 'appointment availability open';
          return (
            <button
              key={dateValue}
              type="button"
              role="gridcell"
              disabled={isPast || isUnavailable}
              aria-selected={isSelected}
              aria-label={`${DATE_FORMATTER.format(date)}, ${isPast ? 'unavailable' : availabilityLabel}`}
              onClick={() => onChange(dateValue)}
              className={`relative flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 py-1 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                isPast
                    ? 'cursor-not-allowed border-transparent text-slate-300'
                    : isUnavailable
                      ? 'cursor-not-allowed border-rose-300 bg-rose-50 text-rose-800'
                    : isLimited
                      ? `border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500 ${isSelected ? 'ring-2 ring-brand-500 ring-offset-1' : ''}`
                      : `border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-500 ${isSelected ? 'ring-2 ring-brand-500 ring-offset-1' : ''}`
              }`}
            >
              <span>{date.getDate()}</span>
              {!isPast && (
                <span className={`mt-1 inline-flex items-center justify-center font-bold ${isUnavailable ? 'rounded-full bg-rose-100 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-rose-700' : `h-4 w-4 rounded-full text-white ${isLimited ? 'bg-amber-500' : 'bg-emerald-600'}`}`} aria-hidden="true">
                  {isUnavailable ? unavailableDisplay.badge : <FiCheck size={11} strokeWidth={3} />}
                </span>
              )}
              {isSelected && <span className="absolute -right-1 -top-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm">Selected</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold" aria-label="Calendar legend">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800 ring-1 ring-inset ring-emerald-200"><FiCheck aria-hidden="true" />Available</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 ring-1 ring-inset ring-amber-200"><FiCheck aria-hidden="true" />Limited</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-rose-800 ring-1 ring-inset ring-rose-200">Full / Closed</span>
      </div>
      {loading && <p className="mt-2 text-xs text-slate-500" role="status">Checking the current schedule...</p>}
      {loadError && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="alert">
          <p>{loadError} Dates are temporarily disabled because current capacity could not be verified.</p>
          <button type="button" onClick={() => setRetryToken((value) => value + 1)} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-amber-100"><FiRefreshCw /> Retry availability</button>
        </div>
      )}
      {!loading && !loadError && value && (
        <div className={`mt-4 rounded-xl border px-3.5 py-3 text-xs ${selectedDayStatus === 'unavailable' ? 'border-rose-200 bg-rose-50 text-rose-900' : selectedDayStatus === 'limited' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`} role="status">
          <div className="flex items-start gap-2.5">
            <span className={`mt-0.5 inline-flex shrink-0 items-center justify-center font-bold ${selectedDayStatus === 'unavailable' ? 'rounded-full bg-rose-100 px-2 py-1 text-[9px] uppercase tracking-wide text-rose-700' : `h-5 w-5 rounded-full text-white ${selectedDayStatus === 'limited' ? 'bg-amber-500' : 'bg-emerald-600'}`}`}>
              {selectedDayStatus === 'unavailable' ? selectedUnavailableDisplay.badge : <FiCheck aria-hidden="true" />}
            </span>
            <div>
              <p className="font-bold text-slate-900">{selectedDateLabel}</p>
              <p className="mt-0.5 font-semibold">
            {selectedDayStatus === 'unavailable'
              ? selectedUnavailableDisplay.message
              : selectedDayStatus === 'limited'
                ? 'Limited appointment availability.'
                : 'Available for an appointment request.'}
              </p>
            </div>
          </div>
          {selectedActivity && (
            <div className="mt-2 grid gap-1 sm:grid-cols-3" aria-label="Selected date time-slot availability">
              {[
                ['morning', 'Morning'],
                ['midday', 'Midday'],
                ['afternoon', 'Afternoon'],
              ].map(([slot, label]) => {
                const slotStatus = selectedSlotAvailability[slot]?.status || 'available';
                return (
                  <span key={slot} className="rounded-md border border-white/80 bg-white/75 px-2 py-1.5 font-semibold">
                    {label}: {slotStatus === 'available' ? 'Available' : slotStatus === 'limited' ? 'Limited' : slotStatus === 'full' ? 'Full' : 'Closed'}
                  </span>
                );
              })}
            </div>
          )}
          <p className="mt-2 leading-5">The office will confirm the final schedule after reviewing your request.</p>
        </div>
      )}
      <p className="mt-3 text-[11px] leading-4 text-slate-500">{advisory || 'Only aggregate availability is shown; other clients\' details remain private.'}</p>
      </div>
    </section>
  );
}
