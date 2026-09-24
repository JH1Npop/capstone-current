import { useEffect, useId, useRef } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiInfo, FiTrash2, FiX } from 'react-icons/fi';

const toneConfig = {
  brand: {
    iconWrap: 'bg-brand-50 text-brand-600 ring-brand-100',
    confirm: 'bg-brand-600 hover:bg-brand-700 focus:ring-brand-100'
  },
  success: {
    iconWrap: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    confirm: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-100'
  },
  warning: {
    iconWrap: 'bg-amber-50 text-amber-600 ring-amber-100',
    confirm: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-100'
  },
  danger: {
    iconWrap: 'bg-rose-50 text-rose-600 ring-rose-100',
    confirm: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-100'
  },
  neutral: {
    iconWrap: 'bg-slate-100 text-slate-600 ring-slate-200',
    confirm: 'bg-slate-900 hover:bg-slate-800 focus:ring-slate-200'
  }
};

const iconMap = {
  info: FiInfo,
  success: FiCheckCircle,
  warning: FiAlertTriangle,
  danger: FiTrash2
};

export default function ConfirmationDialog({
  title,
  message,
  tone = 'brand',
  icon = 'info',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  disabled = false,
  onConfirm,
  onCancel,
  children
}) {
  const activeTone = toneConfig[tone] || toneConfig.brand;
  const Icon = iconMap[icon] || iconMap.info;
  const titleId = useId();
  const dialogRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    const preferredFocus = dialog?.querySelector('textarea, input, select') || focusable?.[0];
    preferredFocus?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        event.preventDefault();
        onCancelRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
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
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loading]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${activeTone.iconWrap}`}>
              <Icon size={20} />
            </div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close confirmation dialog"
          >
            <FiX size={20} />
          </button>
        </div>

        <div className="p-5">
          {message && <p className="text-sm text-slate-600">{message}</p>}
          {children && <div className={message ? 'mt-4' : ''}>{children}</div>}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading || disabled}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${activeTone.confirm}`}
            >
              {loading ? 'Please wait...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
