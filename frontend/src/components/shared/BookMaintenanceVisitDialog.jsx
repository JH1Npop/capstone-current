import { useEffect, useState } from 'react';
import ConfirmationDialog from './ConfirmationDialog';
import { bookMaintenanceVisit, fetchServiceTypes } from '../../api/services';
import { getLocalDateInputValue } from '../../utils/date';
import { formatDate } from '../../utils/dashboardHelpers';

const TIME_SLOTS = [
  ['', 'No preference'],
  ['morning', 'Morning (8 AM - 11 AM)'],
  ['midday', 'Midday (11 AM - 2 PM)'],
  ['afternoon', 'Afternoon (2 PM - 5 PM)'],
];

// Books a plan's maintenance visit as a normal service request at the plan's site. Used by the office
// (Maintenance page) and by the client (their request page); the server decides who may book.
export default function BookMaintenanceVisitDialog({ plan, audience = 'office', onClose, onBooked }) {
  const today = getLocalDateInputValue();
  const dueDate = plan?.next_due_date && plan.next_due_date >= today ? plan.next_due_date : today;
  const [serviceTypes, setServiceTypes] = useState([]);
  // The catalog's "maintenance visit service" for the plan's service, else the plan's own service.
  const defaultServiceId = plan?.visit_service_type || plan?.service_type;
  const defaultServiceName = plan?.visit_service_type_name || plan?.service_type_name;
  const [serviceTypeId, setServiceTypeId] = useState(defaultServiceId ? String(defaultServiceId) : '');
  const [preferredDate, setPreferredDate] = useState(dueDate);
  const [timeSlot, setTimeSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchServiceTypes()
      .then((types) => { if (active) setServiceTypes((types || []).filter((type) => type.is_active !== false)); })
      .catch(() => { if (active) setServiceTypes([]); });
    return () => { active = false; };
  }, []);

  const submit = async () => {
    if (!preferredDate) return;
    setSaving(true);
    setError('');
    try {
      const result = await bookMaintenanceVisit(plan.id, {
        serviceTypeId: serviceTypeId || undefined,
        preferredDate,
        preferredTimeSlot: timeSlot || undefined,
        notes: notes.trim() || undefined,
      });
      onBooked?.(result);
    } catch (bookError) {
      setError(bookError.message || 'Unable to book the maintenance visit.');
      setSaving(false);
    }
  };

  const message = audience === 'client'
    ? `Pick a date for your ${plan?.service_type_name || ''} maintenance at ${plan?.service_address || 'your site'}. The office confirms the schedule and assigns a technician.`
    : `This creates a service request at ${plan?.service_address || 'the plan site'} for the office to approve and dispatch as usual. Reminders pause while the visit is booked.`;

  return (
    <ConfirmationDialog
      title="Book maintenance visit"
      message={message}
      tone="brand"
      icon="info"
      confirmLabel="Book visit"
      loading={saving}
      disabled={!preferredDate}
      onConfirm={submit}
      onCancel={() => { if (!saving) onClose?.(); }}
    >
      <div className="space-y-4">
        {plan?.next_due_date ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Maintenance is due {formatDate(plan.next_due_date)}.</p>
        ) : null}
        <label className="block text-sm font-semibold text-slate-800">
          Service
          <select value={serviceTypeId} onChange={(event) => setServiceTypeId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {!serviceTypes.some((type) => String(type.id) === serviceTypeId) && defaultServiceName ? (
              <option value={serviceTypeId}>{defaultServiceName}</option>
            ) : null}
            {serviceTypes.map((type) => <option key={type.id} value={String(type.id)}>{type.name}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-800">
            Preferred date
            <input type="date" value={preferredDate} min={today} onChange={(event) => setPreferredDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Time
            <select value={timeSlot} onChange={(event) => setTimeSlot(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              {TIME_SLOTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-semibold text-slate-800">
          Notes (optional)
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} placeholder={audience === 'client' ? 'Anything the technician should know?' : 'Anything the technician should know, or what the client asked for.'} className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      </div>
    </ConfirmationDialog>
  );
}
