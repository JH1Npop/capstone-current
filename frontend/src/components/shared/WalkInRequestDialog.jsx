import { useEffect } from 'react';
import { MapContainer, Marker, useMapEvents } from 'react-leaflet';
import { FiCheck, FiChevronDown, FiMapPin, FiSearch, FiX } from 'react-icons/fi';
import MapTileLayer from '../maps/MapTileLayer';
import { CALABARZON_BOUNDS, CALABARZON_MIN_ZOOM, clampToCalabarzon } from '../../utils/mapRegion';

const inputClass = 'mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

function LocationPicker({ latitude, longitude, onChange }) {
  const map = useMapEvents({
    click(event) {
      const [clat, clng] = clampToCalabarzon(event.latlng.lat, event.latlng.lng);
      onChange(clat, clng);
    },
  });

  useEffect(() => {
    if (latitude == null || longitude == null || !map) return;
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);

  return latitude != null && longitude != null ? <Marker position={[latitude, longitude]} /> : null;
}

function SectionHeading({ number, title, description }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{number}</span>
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function WalkInRequestDialog({
  open,
  form,
  clients,
  serviceTypes,
  priorityOptions,
  timeSlotOptions,
  mapCenter,
  searchQuery,
  searchResults,
  submitting,
  error,
  getClientLabel,
  getServiceTypeName,
  onChange,
  onToggleService,
  onSearchQueryChange,
  onSearchSelect,
  onLocationChange,
  onClear,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, submitting]);

  if (!open) return null;

  const selectedLatitude = form.latitude ? Number(form.latitude) : null;
  const selectedLongitude = form.longitude ? Number(form.longitude) : null;
  const submitLabel = form.approveNow ? 'Approve & Create Ticket' : 'Save for Review';

  return (
    <div
      className="fixed inset-0 z-[70] flex bg-slate-950/55 sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="walk-in-dialog-title"
        className="grid h-full w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-slate-50 shadow-2xl sm:h-[calc(100vh-2rem)] sm:max-w-6xl sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Service intake</p>
            <h2 id="walk-in-dialog-title" className="mt-1 text-xl font-bold text-slate-900">Create Walk-in Request</h2>
            <p className="mt-1 text-sm text-slate-500">Record an in-person or phone request without leaving the service queue.</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close walk-in request" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50">
            <FiX size={21} />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {error ? (
            <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionHeading number="1" title="Client and service" description="Choose who requested service and what work they need." />

              <fieldset>
                <legend className="text-sm font-semibold text-slate-700">After saving</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button type="button" aria-pressed={!form.approveNow} onClick={() => onChange('approveNow', false)} className={`rounded-lg border px-4 py-3 text-left transition ${!form.approveNow ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-100' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                      Save for review {!form.approveNow ? <FiCheck className="text-brand-600" /> : null}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">Keep it in the request-review queue before creating a ticket.</span>
                  </button>
                  <button type="button" aria-pressed={form.approveNow} onClick={() => onChange('approveNow', true)} className={`rounded-lg border px-4 py-3 text-left transition ${form.approveNow ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-100' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                      Approve and create ticket {form.approveNow ? <FiCheck className="text-brand-600" /> : null}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">Approve immediately and add the new ticket to dispatch.</span>
                  </button>
                </div>
              </fieldset>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Client
                  <select value={form.client} onChange={(event) => onChange('client', event.target.value)} className={inputClass} required>
                    <option value="">Select client</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{getClientLabel(client)}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Priority
                  <select value={form.priority} onChange={(event) => onChange('priority', event.target.value)} className={inputClass}>
                    {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </label>
              </div>

              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-slate-700">Services</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {serviceTypes.map((serviceType) => {
                    const serviceTypeId = String(serviceType.id);
                    const selected = form.serviceTypeIds.includes(serviceTypeId);
                    return (
                      <button key={serviceType.id} type="button" aria-pressed={selected} onClick={() => onToggleService(serviceTypeId)} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${selected ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                        <span className="font-medium">{getServiceTypeName(serviceType)}</span>
                        {selected ? <FiCheck className="shrink-0 text-brand-600" /> : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Request details
                <textarea value={form.description} onChange={(event) => onChange('description', event.target.value)} rows={3} className={inputClass} placeholder="Describe what the client needs." required />
              </label>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionHeading number="2" title="Preferred schedule" description="Capture the client's requested service window for planning." />
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Preferred date
                  <input type="date" value={form.preferredDate} onChange={(event) => onChange('preferredDate', event.target.value)} className={inputClass} required />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Time slot
                  <select value={form.preferredTimeSlot} onChange={(event) => onChange('preferredTimeSlot', event.target.value)} className={inputClass}>
                    {timeSlotOptions.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                Scheduling notes <span className="font-normal text-slate-400">(optional)</span>
                <textarea value={form.schedulingNotes} onChange={(event) => onChange('schedulingNotes', event.target.value)} rows={2} className={inputClass} placeholder="Access restrictions, contact timing, or dispatch notes." />
              </label>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionHeading number="3" title="Service location" description="Search or pin the exact location technicians should visit." />
              <label className="block text-sm font-medium text-slate-700">
                Search location
                <div className="relative mt-1">
                  <FiSearch className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                  <input value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} className="w-full rounded-lg border border-surface-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100" placeholder="Address, city, barangay, or landmark" />
                </div>
              </label>
              {searchResults.length ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  {searchResults.map((result) => (
                    <button key={`${result.place_id}-${result.lat}-${result.lon}`} type="button" onClick={() => onSearchSelect(result)} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-slate-50">
                      {result.display_name}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <MapContainer center={mapCenter} zoom={CALABARZON_MIN_ZOOM} minZoom={CALABARZON_MIN_ZOOM} maxBounds={CALABARZON_BOUNDS} maxBoundsViscosity={1} className="h-64 w-full sm:h-72">
                  <MapTileLayer />
                  <LocationPicker latitude={selectedLatitude} longitude={selectedLongitude} onChange={onLocationChange} />
                </MapContainer>
                <div className="flex items-start gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <FiMapPin className="mt-0.5 shrink-0" /> Search above or click the map to set the service pin and fill the location fields.
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr_1fr]">
                <label className="block text-sm font-medium text-slate-700">
                  Service address
                  <input value={form.address} onChange={(event) => onChange('address', event.target.value)} className={inputClass} placeholder="Street, barangay, landmark" required />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  City
                  <input value={form.city} onChange={(event) => onChange('city', event.target.value)} className={inputClass} required />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Province
                  <input value={form.province} onChange={(event) => onChange('province', event.target.value)} className={inputClass} required />
                </label>
              </div>

              <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700">
                  Coordinates <FiChevronDown />
                </summary>
                <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Latitude
                    <input type="number" step="any" value={form.latitude} onChange={(event) => onChange('latitude', event.target.value)} className={inputClass} placeholder="14.5995" />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Longitude
                    <input type="number" step="any" value={form.longitude} onChange={(event) => onChange('longitude', event.target.value)} className={inputClass} placeholder="121.0364" />
                  </label>
                </div>
              </details>
            </section>
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button type="button" onClick={onClear} disabled={submitting} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
            Clear form
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60">
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
