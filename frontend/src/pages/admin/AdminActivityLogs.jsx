import { useEffect, useMemo, useRef, useState } from 'react';
import { FiActivity, FiChevronDown, FiClock, FiDatabase, FiSearch, FiUser } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { fetchActivityLogs } from '../../api/api';

const ITEMS_PER_PAGE = 15;

const actionTone = {
  create: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  update: 'bg-sky-50 text-sky-700 ring-sky-200',
  delete: 'bg-rose-50 text-rose-700 ring-rose-200',
  login: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  logout: 'bg-slate-50 text-slate-700 ring-slate-200',
  assign: 'bg-violet-50 text-violet-700 ring-violet-200',
  reschedule: 'bg-amber-50 text-amber-700 ring-amber-200',
  complete: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancel: 'bg-rose-50 text-rose-700 ring-rose-200',
  error: 'bg-red-50 text-red-700 ring-red-200',
  system: 'bg-slate-50 text-slate-700 ring-slate-200'
};

const actionLabels = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  login: 'Logged in',
  logout: 'Logged out',
  assign: 'Assigned',
  reschedule: 'Rescheduled',
  complete: 'Completed',
  cancel: 'Cancelled',
  error: 'Needs attention',
  system: 'System event'
};

const categoryLabels = {
  security: 'Security',
  users: 'Users',
  requests: 'Requests',
  tickets: 'Tickets',
  inventory: 'Inventory',
  settings: 'Settings',
  sla: 'SLA',
  communication: 'Communication',
  system: 'System'
};

const modelLabels = {
  user: 'User account',
  servicerequest: 'Service request',
  service_request: 'Service request',
  serviceticket: 'Service ticket',
  service_ticket: 'Service ticket',
  service_type: 'Service type',
  servicetype: 'Service type',
  inventoryitem: 'Inventory item',
  inventory_item: 'Inventory item',
  notification: 'Notification',
  message: 'Message',
  technicianskill: 'Technician skill',
  technician_skill: 'Technician skill',
  technicianprofile: 'Technician profile',
  technician_profile: 'Technician profile',
  inspectionchecklist: 'Checklist',
  inspection_checklist: 'Checklist',
  maintenanceschedule: 'Maintenance schedule',
  maintenance_schedule: 'Maintenance schedule'
};

const categoryOptions = [
  { value: '', label: 'All categories' },
  { value: 'security', label: 'Security' },
  { value: 'users', label: 'Users' },
  { value: 'requests', label: 'Requests' },
  { value: 'tickets', label: 'Tickets' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'settings', label: 'Settings' },
  { value: 'sla', label: 'SLA' },
  { value: 'communication', label: 'Communication' },
  { value: 'system', label: 'System' }
];

const actionOptions = [
  { value: '', label: 'All actions' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'assign', label: 'Assign' },
  { value: 'reschedule', label: 'Reschedule' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancel', label: 'Cancel' },
  { value: 'error', label: 'Error' },
  { value: 'system', label: 'System' }
];

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const formatModelLabel = (value = '') =>
  String(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatCategoryLabel = (value = '') => categoryLabels[value] || formatModelLabel(value || 'system');

const formatActionLabel = (value = '') => actionLabels[value] || formatModelLabel(value || 'activity');

const formatTargetLabel = (model = '', objectId = '', objectLabel = '') => {
  const normalizedModel = String(model || '').toLowerCase();
  const modelLabel = modelLabels[normalizedModel] || formatModelLabel(model || 'System record');
  const recordLabel = objectLabel || (objectId ? `Record #${objectId}` : '');
  return recordLabel ? `${modelLabel}: ${recordLabel}` : modelLabel;
};

const friendlyFieldLabels = {
  assigned_admin_id: 'assigned admin',
  technician_id: 'assigned technician',
  service_type_id: 'service type',
  client_id: 'client',
  scheduled_date: 'schedule date',
  scheduled_time: 'schedule time',
  scheduled_time_slot: 'schedule time slot',
  reschedule_requested: 'reschedule request',
  completion_notes: 'completion notes',
  warranty_status: 'warranty status',
  auto_assigned: 'auto dispatch'
};

const formatFieldLabel = (value = '') => friendlyFieldLabels[value] || formatModelLabel(value);

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (value === true || value === 'True' || value === 'true') return 'Yes';
  if (value === false || value === 'False' || value === 'false') return 'No';
  return String(value);
};

const getActorName = (log) => log.changedByName || 'System';

const getTargetLabel = (log) => log.objectLabel || formatTargetLabel(log.model, log.objectId, log.objectLabel);

const displayFieldValue = (field, value) => {
  const formatted = formatValue(value);
  if (!formatted) return '';
  return formatted;
};

const getEventDescription = (log) => {
  const actor = getActorName(log);
  const target = getTargetLabel(log);
  const field = log.fieldName || log.metadata?.field_name || '';
  const newValue = displayFieldValue(field, log.newValue ?? log.metadata?.new_display_value ?? log.metadata?.new_value);
  const normalizedModel = String(log.model || '').toLowerCase();
  const serviceType = log.serviceContext?.serviceType || '';

  if (log.action === 'create') {
    if (normalizedModel === 'servicerequest') {
      return `${actor} submitted${serviceType ? ` a ${serviceType}` : ' a service'} request.`;
    }
    if (normalizedModel === 'serviceticket') {
      return `${actor} created ${target}.`;
    }
    return `${actor} created ${target}.`;
  }
  if (log.action === 'delete') return `${actor} deleted ${target}.`;
  if (log.action === 'login') return `${actor} logged in.`;
  if (log.action === 'logout') return `${actor} logged out.`;

  if (log.action === 'update' && field) {
    if (normalizedModel === 'serviceticket') {
      if (field === 'assigned_admin_id') {
        return `${actor} assigned ${target}${newValue ? ` to admin owner ${newValue}` : ' to an admin owner'}.`;
      }
      if (field === 'technician_id') {
        return `${actor} assigned ${target}${newValue ? ` to technician ${newValue}` : ' to a technician'}.`;
      }
      if (field === 'status') return `${actor} changed ${target} status${newValue ? ` to ${newValue}` : ''}.`;
      if (field === 'priority') return `${actor} changed ${target} priority${newValue ? ` to ${newValue}` : ''}.`;
      if (['scheduled_date', 'scheduled_time', 'scheduled_time_slot'].includes(field)) {
        return `${actor} updated the schedule for ${target}.`;
      }
      if (field === 'reschedule_requested') return `${actor} updated the reschedule request for ${target}.`;
      if (field === 'completion_notes') return `${actor} updated completion notes for ${target}.`;
    }

    if (normalizedModel === 'servicerequest' && field === 'status') {
      return `${actor} changed ${target} status${newValue ? ` to ${newValue}` : ''}.`;
    }

    return `${actor} updated the ${formatFieldLabel(field)} for ${target}.`;
  }

  return log.message || log.summary || 'An activity was recorded in the system.';
};

const getActionTaken = (log) => {
  const field = log.fieldName || log.metadata?.field_name || '';
  const normalizedModel = String(log.model || '').toLowerCase();
  if (log.action === 'create' && normalizedModel === 'servicerequest') return 'Request submitted';
  if (field === 'assigned_admin_id') return 'Admin owner assigned';
  if (field === 'technician_id') return 'Technician assigned';
  if (field) return `${formatFieldLabel(field)} updated`;
  return formatActionLabel(log.action);
};

const getActorFieldLabel = (log) => {
  const normalizedModel = String(log.model || '').toLowerCase();
  if (normalizedModel === 'servicerequest' && log.action === 'create') return 'Requested By';
  if (log.action === 'create') return 'Created By';
  return 'Updated By';
};

const getFriendlyTitle = (log) => {
  const category = formatCategoryLabel(log.category).toLowerCase();
  const action = formatActionLabel(log.action);
  const normalizedModel = String(log.model || '').toLowerCase();
  const modelLabel = modelLabels[normalizedModel] || formatModelLabel(log.model || category || 'record');
  if (log.action === 'login') return 'User logged in';
  if (log.action === 'logout') return 'User logged out';
  if (log.action === 'assign') return 'Work was assigned';
  if (log.action === 'reschedule') return 'Schedule was changed';
  if (log.action === 'complete') return 'Work was completed';
  if (log.action === 'error') return 'System needs attention';
  return `${modelLabel} was ${action.toLowerCase()}`;
};

const isLocationNoiseLog = (log) => {
  const normalizedModel = String(log.model || '').toLowerCase();
  const field = String(log.fieldName || log.metadata?.field_name || '').toLowerCase();
  return (
    ['technicianprofile', 'technician_profile'].includes(normalizedModel) &&
    ['current_latitude', 'current_longitude', 'last_location_update'].includes(field)
  );
};

const shortValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const text = String(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
};

const detailText = (log) => {
  const details = [];
  if (log.fieldName) details.push(`Field: ${formatFieldLabel(log.fieldName)}`);
  if (log.oldValue !== null && log.oldValue !== undefined && log.oldValue !== '') {
    details.push(`Before: ${shortValue(displayFieldValue(log.fieldName, log.oldValue))}`);
  }
  if (log.newValue !== null && log.newValue !== undefined && log.newValue !== '') {
    details.push(`After: ${shortValue(displayFieldValue(log.fieldName, log.newValue))}`);
  }
  return details.join(' | ') || '-';
};

const metadataText = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).length === 0) return '-';
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
};

const hasServiceContext = (log) => {
  const context = log.serviceContext || {};
  return Object.values(context).some((value) => value !== null && value !== undefined && value !== '');
};

const serviceLogFields = (log) => {
  const context = log.serviceContext || {};
  return [
    ['Recorded On', context.dateTime || log.changedAt],
    ['Event Description', getEventDescription(log)],
    [getActorFieldLabel(log), getActorName(log) || context.serviceProvider || 'System'],
    ['Service Type', context.serviceType],
    ['Outcome', context.outcome || formatActionLabel(log.action)],
    ['Action Taken', getActionTaken(log)],
    ['Resolution', context.resolution],
    ['Feedback', context.feedback]
  ];
};

const normalizeSearchValue = (value) => String(value ?? '').toLowerCase();

const flattenSearchValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
};

const getLogSearchText = (log) => [
  log.category,
  log.action,
  log.message,
  log.summary,
  log.model,
  log.appLabel,
  log.objectId,
  log.objectLabel,
  log.changedBy,
  log.changedByName,
  log.changedByRole,
  log.fieldName,
  log.oldValue,
  log.newValue,
  log.ipAddress,
  log.changedAt,
  log.serviceContext,
  log.metadata
].map(flattenSearchValue).join(' ').toLowerCase();

const isDateInRange = (value, dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const logDate = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
  if (dateFrom && logDate < dateFrom) return false;
  if (dateTo && logDate > dateTo) return false;
  return true;
};

const matchesActivityFilters = (log, filters) => {
  if (filters.category && log.category !== filters.category) return false;
  if (filters.action && log.action !== filters.action) return false;
  if (!isDateInRange(log.changedAt, filters.dateFrom, filters.dateTo)) return false;

  const search = normalizeSearchValue(filters.search).trim();
  if (search && !getLogSearchText(log).includes(search)) return false;

  return true;
};

export default function AdminActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [expandedLogs, setExpandedLogs] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const requestSeq = useRef(0);
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    action: '',
    dateFrom: '',
    dateTo: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = async (nextFilters = filters, nextPage = currentPage) => {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    try {
      setLoading(true);
      const data = await fetchActivityLogs({
        ...nextFilters,
        page: nextPage,
        pageSize: ITEMS_PER_PAGE
      });
      if (requestId !== requestSeq.current) return;
      setLogs(Array.isArray(data?.rows) ? data.rows : []);
      setTotalCount(Number(data?.count || 0));
      setError('');
    } catch (loadError) {
      if (requestId !== requestSeq.current) return;
      setLogs([]);
      setTotalCount(0);
      setError(loadError.message || 'Unable to load activity logs.');
    } finally {
      if (requestId === requestSeq.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCurrentPage(1);
      loadLogs(filters, 1);
    }, 350);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const visibleLogs = useMemo(
    () => logs.filter((log) => !isLocationNoiseLog(log)),
    [logs]
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
  const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedLogs = visibleLogs;

  const counts = useMemo(() => ({
    total: totalCount,
    security: visibleLogs.filter((log) => log.category === 'security').length,
    tickets: visibleLogs.filter((log) => log.category === 'tickets').length,
    inventory: visibleLogs.filter((log) => log.category === 'inventory').length
  }), [totalCount, visibleLogs]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setCurrentPage(1);
  };

  const goToPage = (nextPage) => {
    const safePage = Math.max(1, Math.min(totalPages, nextPage));
    setCurrentPage(safePage);
    loadLogs(filters, safePage);
  };

  const toggleLog = (logId) => {
    setExpandedLogs((current) => ({
      ...current,
      [logId]: !current[logId]
    }));
  };

  return (
    <Layout>
      <section className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Activity Logs</h1>
          <p className="text-sm text-slate-500">Activity timeline for user actions, ticket updates, and system events.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Events found</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{counts.total}</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Security shown</p>
            <p className="mt-2 text-2xl font-bold text-indigo-600">{counts.security}</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tickets shown</p>
            <p className="mt-2 text-2xl font-bold text-sky-600">{counts.tickets}</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory shown</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600">{counts.inventory}</p>
          </div>
        </div>

        <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1.5fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_minmax(9rem,0.7fr)_minmax(9rem,0.7fr)]">
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <FiSearch /> Search
              </span>
              <input
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="Name, action, ticket, request, or item"
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Area</span>
              <select
                value={filters.category}
                onChange={(event) => updateFilter('category', event.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Action</span>
              <select
                value={filters.action}
                onChange={(event) => updateFilter('action', event.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              >
                {actionOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Start date</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => updateFilter('dateFrom', event.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">End date</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => updateFilter('dateTo', event.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <section className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-surface-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FiActivity className="text-brand-500" />
              <h2 className="text-base font-semibold text-slate-900">Activity Timeline</h2>
            </div>
          </div>
          <div className="divide-y divide-surface-200">
            {loading ? (
              <ListSkeleton rows={6} />
            ) : visibleLogs.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-slate-500">No activity logs match the current filters.</div>
            ) : (
              paginatedLogs.map((log) => {
                const expanded = Boolean(expandedLogs[log.id]);
                const targetLabel = getTargetLabel(log);
                const hasContext = hasServiceContext(log);
                return (
                  <article key={log.id} className="px-4 py-4 transition hover:bg-surface-50/70 sm:px-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${actionTone[log.action] || actionTone.update}`}>
                            {formatActionLabel(log.action)}
                          </span>
                          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                            {formatCategoryLabel(log.category)}
                          </span>
                        </div>

                        <h3 className="mt-3 text-base font-semibold text-slate-950">{getFriendlyTitle(log)}</h3>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
                          {getEventDescription(log)}
                        </p>

                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <FiUser className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="truncate">
                              <span className="font-medium text-slate-800">{getActorName(log)}</span>
                              <span className="ml-1 text-xs capitalize text-slate-500">({log.changedByRole || 'system'})</span>
                            </span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <FiDatabase className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="truncate" title={targetLabel}>{targetLabel}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiClock className="h-4 w-4 shrink-0 text-slate-400" />
                            <span>{formatDateTime(log.changedAt)}</span>
                          </div>
                        </div>

                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => toggleLog(log.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-surface-50"
                          aria-expanded={expanded}
                        >
                          {expanded ? 'Hide details' : 'View details'}
                          <FiChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4">
                        {hasContext ? (
                          <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Service Details</p>
                            <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                              {serviceLogFields(log).map(([label, value]) => (
                                <DetailItem
                                  key={label}
                                  label={label}
                                  value={label === 'Recorded On' ? formatDateTime(value) : shortValue(value)}
                                  strong
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className={hasContext ? 'mt-4 border-t border-surface-200 pt-4' : ''}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Change Details</p>
                          <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                            <DetailItem label="Record affected" value={targetLabel} strong />
                            <DetailItem label="Record ID" value={`${formatModelLabel(log.model)}${log.objectId ? ` #${log.objectId}` : ''}`} />
                            <DetailItem label="Changed item" value={log.fieldName ? formatFieldLabel(log.fieldName) : '-'} />
                            <DetailItem label="Before" value={shortValue(displayFieldValue(log.fieldName, log.oldValue))} />
                            <DetailItem label="After" value={shortValue(displayFieldValue(log.fieldName, log.newValue))} />
                          </div>
                          <p className="mt-3 text-xs text-slate-500">Change summary: {detailText(log)}</p>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
          {!loading && totalCount > 0 ? (
            <div className="flex flex-col gap-3 border-t border-surface-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + visibleLogs.length, totalCount)} of {totalCount} events
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="min-w-20 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </Layout>
  );
}

function DetailItem({ label, value, strong = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 break-words text-sm ${strong ? 'font-medium text-slate-900' : 'text-slate-700'}`}>
        {value || '-'}
      </p>
    </div>
  );
}
