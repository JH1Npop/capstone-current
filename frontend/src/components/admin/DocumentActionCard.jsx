import { FiDownload, FiSave } from 'react-icons/fi';

const STATUS_TONES = {
  none: 'bg-slate-300',
  progress: 'bg-amber-500',
  done: 'bg-emerald-500',
  alert: 'bg-rose-500',
};

function ActionButton({ action, variant = 'secondary' }) {
  if (!action) return null;
  const Icon = action.icon || FiSave;
  const styles = variant === 'primary'
    ? 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300 disabled:text-white'
    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60';
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.busy}
      title={action.title}
      className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${styles}`}
    >
      <Icon size={15} aria-hidden="true" />
      {action.busy ? action.busyLabel || 'Saving...' : action.label}
    </button>
  );
}

export default function DocumentActionCard({
  title,
  status,
  missingFields = [],
  showPaymentNote = false,
  locked = false,
  canManage = false,
  noTicket = false,
  primaryAction,
  secondaryActions = [],
  generationAction,
  message = '',
  messageIsGood = false,
  children,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {status ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            <span className={`h-2 w-2 rounded-full ${STATUS_TONES[status.tone] || STATUS_TONES.none}`} aria-hidden="true" />
            {status.label}
          </span>
        ) : null}
      </div>
      {missingFields.length ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Still needed before printing</p>
          <p className="mt-1">{missingFields.join(', ')}</p>
        </div>
      ) : null}
      {showPaymentNote ? (
        <p className="mt-3 text-xs text-slate-500" role="note">
          Amounts and payment terms are typed in for the document. Payments are collected and verified outside this system.
        </p>
      ) : null}
      {locked ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" role="note">
          This document is locked at its current workflow status. Its saved record can still be viewed and printed.
        </p>
      ) : null}
      {canManage ? (
        <div className="mt-4 space-y-2">
          {noTicket ? <p className="text-xs text-slate-500">Choose a ticket to save or send this document.</p> : null}
          <ActionButton action={primaryAction} variant="primary" />
          {secondaryActions.map((action) => <ActionButton key={action.label} action={action} />)}
          <ActionButton action={{ icon: FiDownload, ...generationAction }} />
        </div>
      ) : null}
      {message ? (
        <p role="status" aria-live="polite" className={`mt-3 text-xs ${messageIsGood ? 'text-emerald-700' : 'text-rose-600'}`}>
          {message}
        </p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
