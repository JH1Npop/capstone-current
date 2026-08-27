import { useState, useEffect } from 'react';
import { FiAlertCircle, FiCamera, FiCheckCircle, FiCheckSquare, FiClock, FiFileText, FiSettings, FiX } from 'react-icons/fi';
import StatusBadge from '../ui/StatusBadge';
import { fetchInspectionDetails } from '../../api/admin';
import { formatTicketId } from '../../utils/roleIds';

const formatField = (value) => (value ? 'Yes' : 'No');

const TONE_CLASS_MAP = {
  slate: 'text-slate-900',
  emerald: 'text-emerald-700',
  rose: 'text-rose-700',
  amber: 'text-amber-700',
  blue: 'text-blue-700'
};

const InfoCard = ({ label, value, tone = 'slate' }) => (
  <div className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm">
    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
    <div className={`mt-2 text-sm font-semibold ${TONE_CLASS_MAP[tone] || TONE_CLASS_MAP.slate}`}>{value}</div>
  </div>
);

const NoteBlock = ({ title, value, className }) => (
  <div className={`rounded-2xl border p-4 text-sm leading-6 ${className}`}>
    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{title}</span>
    <p className="whitespace-pre-wrap">{value}</p>
  </div>
);

export default function InspectionDetailsModal({ ticket, onClose }) {
  const [inspection, setInspection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ticket) return;

    const loadInspection = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchInspectionDetails(ticket.id);
        if (data) {
          setInspection(data);
        } else {
          setError('No inspection details found for this ticket.');
        }
      } catch (err) {
        setError(err.message || 'Failed to load inspection details.');
      } finally {
        setLoading(false);
      }
    };

    loadInspection();
  }, [ticket]);

  if (!ticket) return null;

  const ticketLabel = formatTicketId(ticket.id);
  const clientLabel = ticket.clientFullname || 'Client';
  const serviceLabel = ticket.service || ticket.service_type || 'Inspection';
  const recommendation = inspection?.recommendation || 'Pending';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-slate-900">{ticketLabel}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {serviceLabel} for {clientLabel}. Review the site conditions, checklist completion, and any follow-up notes in one place.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Close inspection details dialog"
          >
            <FiX size={20} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <FiAlertCircle className="mt-0.5 shrink-0" size={18} />
              <p>{error}</p>
            </div>
          ) : inspection ? (
            <div className="space-y-6">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoCard label="Site Accessible" value={formatField(inspection.site_accessible)} tone={inspection.site_accessible ? 'emerald' : 'rose'} />
                <InfoCard label="Electrical Adequate" value={formatField(inspection.electrical_adequate)} tone={inspection.electrical_adequate ? 'emerald' : 'rose'} />
                <InfoCard label="Safety Equipment" value={formatField(inspection.safety_equipment_present)} tone={inspection.safety_equipment_present ? 'emerald' : 'rose'} />
                <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">Recommendation</span>
                  <div className={`mt-2 text-sm font-bold ${recommendation === 'Approved' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {recommendation}
                  </div>
                </div>
              </section>

              {inspection.checklist_items && inspection.checklist_items.length > 0 && (
                <section className="rounded-3xl border border-surface-200 bg-surface-50/70 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <FiFileText className="text-brand-600" />
                    <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-600">Checklist Items</h4>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-surface-200 bg-white">
                    {inspection.checklist_items.map((item, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-3 px-4 py-3 ${index < inspection.checklist_items.length - 1 ? 'border-b border-surface-200' : ''}`}
                      >
                        <div className="mt-0.5">
                          {item.completed ? (
                            <FiCheckCircle className="text-emerald-500" size={18} />
                          ) : (
                            <div className="h-4 w-4 rounded border-2 border-slate-300" />
                          )}
                        </div>
                        <p className={`text-sm leading-6 ${item.completed ? 'text-slate-800' : 'text-slate-500'}`}>
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(inspection.maintenance_notes || inspection.additional_notes || inspection.warranty_notes || inspection.follow_up_summary) && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FiSettings className="text-brand-600" />
                    <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-600">Notes & Follow-up</h4>
                  </div>
                  {inspection.additional_notes && (
                    <NoteBlock
                      title="Additional Notes"
                      value={inspection.additional_notes}
                      className="border-amber-200 bg-amber-50 text-amber-950"
                    />
                  )}
                  {inspection.maintenance_notes && (
                    <NoteBlock
                      title="Maintenance Notes"
                      value={inspection.maintenance_notes}
                      className="border-sky-200 bg-sky-50 text-sky-950"
                    />
                  )}
                  {inspection.warranty_notes && (
                    <NoteBlock
                      title="Warranty Notes"
                      value={inspection.warranty_notes}
                      className="border-emerald-200 bg-emerald-50 text-emerald-950"
                    />
                  )}
                  {inspection.follow_up_summary && (
                    <NoteBlock
                      title="Follow-up Requirements"
                      value={inspection.follow_up_summary}
                      className="border-violet-200 bg-violet-50 text-violet-950"
                    />
                  )}
                </section>
              )}

              {inspection.proof_media && inspection.proof_media.length > 0 && (
                <section>
                  <div className="mb-4 flex items-center gap-2">
                    <FiCamera className="text-brand-600" />
                    <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-600">Proof Photos</h4>
                    <span className="text-xs text-slate-400">({inspection.proof_media.length})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {inspection.proof_media.map((media, index) => {
                      const url = typeof media === 'string' ? media : (media.url || media.file || null);
                      if (!url) return null;

                      return (
                        <figure
                          key={index}
                          className="group relative aspect-square overflow-hidden rounded-2xl border border-surface-200 bg-slate-100 shadow-sm"
                        >
                          <img
                            src={url}
                            alt={`Inspection photo ${index + 1}`}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://placehold.co/400x400/f8fafc/94a3b8?text=Image+Not+Found';
                            }}
                          />
                          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 to-transparent px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">
                            Photo {index + 1}
                          </figcaption>
                        </figure>
                      );
                    })}
                  </div>
                </section>
              )}

              <div className="flex items-center gap-2 rounded-2xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-slate-600">
                <FiClock className="text-brand-600" />
                <span>Use these details to decide whether the ticket can move forward, needs materials, or should be closed out.</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end border-t border-surface-200 bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl border border-surface-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-surface-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
