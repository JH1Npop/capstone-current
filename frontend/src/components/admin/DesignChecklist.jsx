import { FiAlertTriangle, FiCheckCircle, FiInfo } from 'react-icons/fi';

const ICONS = {
  ok: { Icon: FiCheckCircle, className: 'text-emerald-600' },
  problem: { Icon: FiAlertTriangle, className: 'text-rose-600' },
  note: { Icon: FiInfo, className: 'text-sky-600' },
};

/**
 * The plain-language result of checking a design: what was found, what is missing, and what to do about it.
 * Items come from the server (`version.checklist`), so the list always matches what the server will accept.
 */
export default function DesignChecklist({ items, busy = false, onAddFields = null, onFillBlanks = null, onPlaceFields = null }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const blocked = list.some((item) => item.status === 'problem');
  return (
    <section aria-label="Design checklist" className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className={`text-sm font-semibold ${blocked ? 'text-rose-700' : 'text-emerald-700'}`}>
        {blocked ? 'This design is not ready to use yet' : 'This design is ready to use'}
      </p>
      <ul className="mt-2 space-y-2">
        {list.map((item, index) => {
          const { Icon, className } = ICONS[item.status] || ICONS.note;
          return (
            <li key={`${item.label}-${index}`} className="flex items-start gap-2 text-sm">
              <Icon aria-hidden="true" className={`mt-0.5 shrink-0 ${className}`} />
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{item.label}</p>
                {item.detail ? <p className="break-words text-xs text-slate-600">{item.detail}</p> : null}
                {item.hint ? <p className="text-xs text-slate-500">{item.hint}</p> : null}
                {item.action === 'add_fields' && onAddFields ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAddFields(item.names || [])}
                    className="mt-1.5 h-8 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-semibold text-brand-800 disabled:opacity-50"
                  >
                    Add as fields
                  </button>
                ) : null}
                {item.action === 'place_fields' && onPlaceFields ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPlaceFields(item.names || [])}
                    className="mt-1.5 h-8 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-semibold text-brand-800 disabled:opacity-50"
                  >
                    Place these fields
                  </button>
                ) : null}
                {item.action === 'fill_blanks' && onFillBlanks ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onFillBlanks(item.names || [])}
                    className="mt-1.5 h-8 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-semibold text-brand-800 disabled:opacity-50"
                  >
                    Fill these blanks
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
