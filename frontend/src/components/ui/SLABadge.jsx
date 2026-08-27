const SLA_META = {
  overdue: {
    label: 'SLA Overdue',
    tone: 'bg-rose-50 text-rose-800 ring-rose-200',
    dot: 'bg-rose-500'
  },
  warning: {
    label: 'SLA Warning',
    tone: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500'
  },
  healthy: {
    label: 'SLA Healthy',
    tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    dot: 'bg-emerald-500'
  },
  paused: {
    label: 'SLA Paused',
    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-400'
  },
  inactive: {
    label: 'No Active SLA',
    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-400'
  }
};

const SIZE_MAP = {
  sm: 'px-2.5 py-1 text-[11px]',
  md: 'px-3 py-1.5 text-xs'
};

const normalizeSlaState = (state) => String(state || 'inactive').toLowerCase();

export const formatSlaSummary = (sla) => {
  const normalizedState = normalizeSlaState(sla?.state);

  if (normalizedState === 'overdue' && Number.isFinite(sla?.minutesOverdue) && sla.minutesOverdue > 0) {
    return `${sla.label} - ${sla.minutesOverdue}m overdue`;
  }

  if (
    (normalizedState === 'healthy' || normalizedState === 'warning') &&
    Number.isFinite(sla?.minutesToBreach)
  ) {
    return `${sla.label} - ${sla.minutesToBreach}m to breach`;
  }

  return sla?.label || SLA_META.inactive.label;
};

export default function SLABadge({ sla, size = 'md', className = '' }) {
  const normalizedState = normalizeSlaState(sla?.state);
  const meta = SLA_META[normalizedState] || SLA_META.inactive;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full ring-1 ring-inset ${meta.tone} ${
        SIZE_MAP[size] || SIZE_MAP.md
      } ${className}`.trim()}
    >
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      <span className="whitespace-nowrap font-semibold tracking-[0.02em]">{meta.label}</span>
    </span>
  );
}
