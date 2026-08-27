// Shared admin dashboard + analytics utilities
// Extracted to avoid duplication between AdminDashboard.jsx and AdminAnalytics.jsx

export const AUTO_REFRESH_MS = 45000;

export const formatDate = (value) => {
  if (!value) return 'No date';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export const formatDateTime = (value) => {
  if (!value) return 'Waiting for first refresh';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export const formatCompactNumber = (value) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value || 0));

export const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

export const getDisplayText = (value) => {
  if (value && typeof value === 'object') {
    return value.label || value.ruleLabel || value.rule_label || value.state || '';
  }
  return value || '';
};

export const getSlaAction = (sla) => {
  if (!sla || typeof sla !== 'object') return '';
  return sla.actionRequired || sla.action_required || '';
};

export const getStatusTone = (value) => {
  const normalized = String(getDisplayText(value) || '').toLowerCase();

  if (
    normalized.includes('overdue') ||
    normalized.includes('cancel') ||
    normalized.includes('failed') ||
    normalized.includes('risk')
  ) {
    return 'bg-rose-50 text-rose-700 ring-rose-200';
  }

  if (
    normalized.includes('pending') ||
    normalized.includes('warning') ||
    normalized.includes('due')
  ) {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }

  if (
    normalized.includes('in progress') ||
    normalized.includes('assigned') ||
    normalized.includes('scheduled')
  ) {
    return 'bg-sky-50 text-sky-700 ring-sky-200';
  }

  if (normalized.includes('complete') || normalized.includes('done') || normalized.includes('approved')) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200';
};

export const toneStyles = {
  amber: {
    card: 'border-amber-200 bg-amber-50/70',
    icon: 'bg-amber-100 text-amber-700'
  },
  blue: {
    card: 'border-sky-200 bg-sky-50/70',
    icon: 'bg-sky-100 text-sky-700'
  },
  emerald: {
    card: 'border-emerald-200 bg-emerald-50/70',
    icon: 'bg-emerald-100 text-emerald-700'
  },
  violet: {
    card: 'border-violet-200 bg-violet-50/70',
    icon: 'bg-violet-100 text-violet-700'
  }
};

export const demandTone = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700'
};

export const createLinePoints = (data, width, height, paddingX, paddingY, accessor, maxValue) => {
  if (!data.length) return [];
  const stepX = data.length > 1 ? (width - paddingX * 2) / (data.length - 1) : 0;
  return data.map((item, index) => ({
    x: paddingX + index * stepX,
    y: height - paddingY - ((Number(accessor(item)) || 0) / maxValue) * (height - paddingY * 2)
  }));
};

export const queueActionLabel = (ticket) => {
  if (ticket.isMissedDispatch) return ticket.dispatchAction || 'Assign technician or reschedule';
  if (!ticket.assignedTech) return 'Dispatch technician';
  if (ticket.status === 'not_started' || ticket.status === 'assigned') return 'Confirm arrival window';
  if (ticket.status === 'in_progress') return 'Monitor field progress';
  if (ticket.status === 'completed') return 'Review completion notes';
  if (ticket.status === 'on_hold') return 'Resolve blocker';
  return 'Monitor queue';
};
