import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiLock,
  FiRefreshCw,
  FiUnlock,
  FiX,
} from 'react-icons/fi';
import ConfirmationDialog from '../shared/ConfirmationDialog';

const SLOT_OPTIONS = [
  ['all_day', 'Entire date'],
  ['morning', 'Morning (8 AM - 11 AM)'],
  ['midday', 'Midday (11 AM - 2 PM)'],
  ['afternoon', 'Afternoon (2 PM - 5 PM)'],
];

const BOOKABLE_SLOTS = [
  ['morning', 'Morning'],
  ['midday', 'Midday'],
  ['afternoon', 'Afternoon'],
];

const statusMeta = {
  available: { label: 'Available', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  limited: { label: 'Limited', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  full: { label: 'Full', tone: 'bg-rose-50 text-rose-800 ring-rose-200' },
  closed: { label: 'Closed', tone: 'bg-slate-100 text-slate-800 ring-slate-300' },
};

const formatDate = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateKey
    : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const dateCount = (start, end) => {
  const first = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return 0;
  return Math.floor((last - first) / 86400000) + 1;
};

export default function CalendarAvailabilityConfigurationPanel({
  open,
  selectedDateKey,
  availability,
  availabilityDays = [],
  availabilityError = '',
  mutationError = '',
  feedback = '',
  availabilityLoading = false,
  closures = [],
  dailyCapacity = 3,
  saving = false,
  onRetry,
  onApplyOverride,
  onReopen,
  onReopenClosure,
  onRequestClose,
  onDirtyChange,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onRequestCloseRef = useRef(onRequestClose);
  const interactionStateRef = useRef({ saving, confirmation: null });
  const [affectedTime, setAffectedTime] = useState('all_day');
  const [manualStatus, setManualStatus] = useState('closed');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [bulkEdit, setBulkEdit] = useState(false);
  const [rangeStart, setRangeStart] = useState(selectedDateKey);
  const [rangeEnd, setRangeEnd] = useState(selectedDateKey);
  const [overrideDirty, setOverrideDirty] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const today = useMemo(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }, []);

  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  }, [onRequestClose]);

  useEffect(() => {
    interactionStateRef.current = { saving, confirmation };
  }, [saving, confirmation]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      const interactionState = interactionStateRef.current;
      if (event.key === 'Escape' && !interactionState.saving && !interactionState.confirmation) {
        event.preventDefault();
        onRequestCloseRef.current?.();
      }
      if (event.key === 'Tab' && !interactionState.confirmation) {
        const focusable = Array.from(dialogRef.current?.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ) || []).filter((element) => element.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setRangeStart(selectedDateKey);
    setRangeEnd(selectedDateKey);
    setAffectedTime('all_day');
    setManualStatus('closed');
    setReason('');
    setReasonError('');
    setBulkEdit(false);
    setOverrideDirty(false);
  }, [open, selectedDateKey]);

  const dirty = overrideDirty;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const activeStatus = statusMeta[availability?.status] || statusMeta.available;
  const rangeLength = dateCount(rangeStart, rangeEnd);
  const bookedInRange = useMemo(() => availabilityDays
    .filter((day) => day.date >= rangeStart && day.date <= rangeEnd)
    .reduce((total, day) => total + Number(day.booked || 0), 0), [availabilityDays, rangeStart, rangeEnd]);
  const dataUnavailable = Boolean(availabilityError) || (!availability && !availabilityLoading);
  const isPast = selectedDateKey < today;

  if (!open) return null;

  const performOverrideAction = async (kind) => {
    const startDate = bulkEdit ? rangeStart : selectedDateKey;
    const endDate = bulkEdit ? rangeEnd : selectedDateKey;
    let saved = false;
    if (kind === 'reopen') {
      saved = await onReopen?.({ startDate, endDate, timeSlot: affectedTime });
    } else {
      if (reason.trim().length < 3) {
        setReasonError('Enter a reason of at least 3 characters.');
        return;
      }
      saved = await onApplyOverride?.({
        startDate,
        endDate,
        timeSlot: affectedTime,
        availabilityStatus: manualStatus,
        reason: reason.trim(),
      });
    }
    if (saved !== false) {
      setReason('');
      setReasonError('');
      setOverrideDirty(false);
    }
  };

  const requestOverrideAction = (kind) => {
    setReasonError('');
    if (bulkEdit) {
      setConfirmation({ kind });
      return;
    }
    performOverrideAction(kind);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-slate-950/35"
        aria-hidden="true"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) onRequestClose?.();
        }}
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Configure availability for ${formatDate(selectedDateKey)}`}
        className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[30rem] md:rounded-none md:border-l md:border-slate-200"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Availability configuration</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{formatDate(selectedDateKey)}</h2>
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${activeStatus.tone}`}>
                {availabilityLoading ? 'Checking...' : dataUnavailable ? 'Status unavailable' : activeStatus.label}
              </span>
              <span className="text-xs text-slate-500">Booking availability only; technician feasibility is separate.</span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onRequestClose}
            disabled={saving}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            aria-label="Close availability configuration"
          >
            <FiX size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {feedback && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800" role="status">{feedback}</div>}
          {mutationError && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{mutationError}</div>}
          {availabilityError && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              <div className="flex items-start gap-2"><FiAlertTriangle className="mt-0.5 shrink-0" /><p>{availabilityError} Configuration actions are disabled until current capacity can be verified.</p></div>
              <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-amber-100"><FiRefreshCw /> Retry availability</button>
            </div>
          )}

          <section aria-labelledby="slot-availability-title">
            <div className="flex items-center justify-between gap-3">
              <h3 id="slot-availability-title" className="text-sm font-semibold text-slate-900">Current booking position</h3>
              <span className="text-xs text-slate-500">
                {availability ? `${availability.booked} / ${availability.capacity} booked` : 'Capacity unavailable'}
              </span>
            </div>
            {availability && (
              <p className="mt-1 text-xs text-slate-500">{availability.remaining} appointment {availability.remaining === 1 ? 'place' : 'places'} remaining for this date.</p>
            )}
            <div className="mt-2 grid gap-2">
              {BOOKABLE_SLOTS.map(([slot, label]) => {
                const slotData = availability?.slots?.[slot];
                const meta = statusMeta[slotData?.status] || statusMeta.available;
                return (
                  <div key={slot} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                    <div><p className="font-semibold text-slate-800">{label}</p><p className="text-xs text-slate-500">{slotData ? `${slotData.booked} booked in this time` : 'Capacity data unavailable'}</p></div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${meta.tone}`}>{slotData ? meta.label : 'Unknown'}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-5 border-t border-slate-200 pt-5" aria-labelledby="capacity-title">
            <h3 id="capacity-title" className="text-sm font-semibold text-slate-900">Daily booking limit</h3>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-sm font-semibold text-slate-900">{dailyCapacity} jobs maximum per date</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Morning, midday, and afternoon share this limit. Close a time or the entire date when a heavy job needs more capacity.</p>
            </div>
          </section>

          <section className="mt-5 border-t border-slate-200 pt-5" aria-labelledby="override-title">
            <div className="flex items-center justify-between gap-3">
              <div><h3 id="override-title" className="text-sm font-semibold text-slate-900">Manual availability override</h3><p className="mt-1 text-xs text-slate-500">Limited is advisory. Closed blocks new booking.</p></div>
              <button type="button" aria-pressed={bulkEdit} onClick={() => { setBulkEdit((value) => !value); setOverrideDirty(true); }} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${bulkEdit ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-700'}`}>Bulk Edit</button>
            </div>

            {bulkEdit && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                <label className="text-xs font-semibold text-slate-600">Start date<input type="date" min={today} value={rangeStart} onChange={(event) => { setRangeStart(event.target.value); if (rangeEnd < event.target.value) setRangeEnd(event.target.value); setOverrideDirty(true); }} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">End date<input type="date" min={rangeStart || today} value={rangeEnd} onChange={(event) => { setRangeEnd(event.target.value); setOverrideDirty(true); }} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm" /></label>
                <p className="col-span-2 text-xs text-slate-600">{rangeLength || 0} date{rangeLength === 1 ? '' : 's'} selected · {bookedInRange} existing booked visit{bookedInRange === 1 ? '' : 's'} will remain scheduled.</p>
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Availability status
                <select value={manualStatus} onChange={(event) => { setManualStatus(event.target.value); setOverrideDirty(true); }} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                  <option value="open">No manual restriction / reopen</option>
                  <option value="limited">Limited (advisory)</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Affected time
                <select value={affectedTime} onChange={(event) => { setAffectedTime(event.target.value); setOverrideDirty(true); }} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                  {SLOT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>

            {manualStatus !== 'open' && (
              <label className="mt-3 block text-xs font-semibold text-slate-600">Reason
                <textarea value={reason} maxLength={255} onChange={(event) => { setReason(event.target.value); setReasonError(''); setOverrideDirty(true); }} rows={3} placeholder="Reason for limiting or closing new bookings" className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${reasonError ? 'border-rose-400' : 'border-slate-300'}`} aria-invalid={Boolean(reasonError)} />
                {reasonError && <span className="mt-1 block text-xs font-medium text-rose-700">{reasonError}</span>}
              </label>
            )}

            <button
              type="button"
              onClick={() => requestOverrideAction(manualStatus === 'open' ? 'reopen' : 'set')}
              disabled={saving || dataUnavailable || isPast || !rangeLength || rangeLength > 93}
              className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${manualStatus === 'open' ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
            >
              {manualStatus === 'open' ? <FiUnlock /> : <FiLock />}
              {saving ? 'Saving...' : manualStatus === 'open' ? (bulkEdit ? 'Reopen selected range' : 'Reopen availability') : manualStatus === 'limited' ? (bulkEdit ? 'Apply Limited to range' : 'Apply Limited') : (bulkEdit ? 'Close selected range' : 'Close availability')}
            </button>
            {rangeLength > 93 && <p className="mt-2 text-xs font-medium text-rose-700">A bulk change can cover at most 93 dates.</p>}
            {isPast && <p className="mt-2 text-xs text-slate-500">Past availability cannot be changed.</p>}
          </section>

          <section className="mt-5 border-t border-slate-200 pt-5" aria-labelledby="restrictions-title">
            <h3 id="restrictions-title" className="text-sm font-semibold text-slate-900">Existing manual restrictions</h3>
            {closures.length === 0 ? <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No manual restrictions for this date.</p> : (
              <div className="mt-2 space-y-2">{closures.map((closure) => (
                <div key={closure.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-800">{closure.time_slot_label} · {closure.availability_status_label}</p><p className="mt-1 text-xs text-slate-600">{closure.reason}{closure.updated_by ? ` · ${closure.updated_by}` : ''}</p></div><button type="button" onClick={() => onReopenClosure?.(closure)} disabled={saving || dataUnavailable} className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Reopen</button></div>
                </div>
              ))}</div>
            )}
          </section>
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500"><span>{dirty ? 'Unsaved configuration changes' : 'All displayed settings are current'}</span>{!dirty && <FiCheckCircle className="text-emerald-600" />}</div>
        </footer>
      </aside>

      {confirmation && (
        <ConfirmationDialog
          title={confirmation.kind === 'reopen' ? 'Reopen this date range?' : `${manualStatus === 'closed' ? 'Close' : 'Limit'} this date range?`}
          message={`${formatDate(rangeStart)} through ${formatDate(rangeEnd)} covers ${rangeLength} date${rangeLength === 1 ? '' : 's'} and ${bookedInRange} existing booked visit${bookedInRange === 1 ? '' : 's'}. Existing appointments will remain scheduled and technicians will not be rescheduled.`}
          tone="warning"
          icon="warning"
          confirmLabel={confirmation.kind === 'reopen' ? 'Reopen range' : `Apply ${manualStatus}`}
          loading={saving}
          onCancel={() => setConfirmation(null)}
          onConfirm={async () => {
            await performOverrideAction(confirmation.kind);
            setConfirmation(null);
          }}
        />
      )}
    </>
  );
}
