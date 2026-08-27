import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({ baseURL: API_BASE_URL });

const API_CACHE_PREFIX = 'afn_api_cache:';
const CACHEABLE_METHODS = new Set(['get']);
const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const PUBLIC_CACHEABLE_PATHS = new Set(['/public/landing-page/']);
const PUBLIC_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const getRequestCacheKey = (config = {}) => {
  const method = String(config.method || 'get').toLowerCase();
  const baseURL = config.baseURL || API_BASE_URL;
  const url = config.url || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${API_CACHE_PREFIX}public:${method}:${baseURL}:${url}:${params}`;
};

const shouldCacheRequest = (config = {}) => {
  const method = String(config.method || 'get').toLowerCase();
  const url = String(config.url || '');
  return CACHEABLE_METHODS.has(method) && PUBLIC_CACHEABLE_PATHS.has(url);
};

const writeCachedResponse = (response) => {
  if (!shouldCacheRequest(response?.config) || response?.status !== 200) {
    return;
  }

  try {
    localStorage.setItem(getRequestCacheKey(response.config), JSON.stringify({
      cachedAt: new Date().toISOString(),
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }));
  } catch {
    // Ignore storage limits; live network data still wins.
  }
};

const readCachedResponse = (config) => {
  if (!shouldCacheRequest(config)) {
    return null;
  }

  try {
    const cached = JSON.parse(localStorage.getItem(getRequestCacheKey(config)) || 'null');
    if (!cached) {
      return null;
    }
    const cachedAt = Date.parse(cached.cachedAt || '');
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > PUBLIC_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(getRequestCacheKey(config));
      return null;
    }

    return {
      data: cached.data,
      status: cached.status || 200,
      statusText: cached.statusText || 'OK (cached)',
      headers: cached.headers || {},
      config,
      request: null,
      cached: true,
      cachedAt: cached.cachedAt,
    };
  } catch {
    return null;
  }
};

export const clearStoredAuth = () => {
  sessionStorage.removeItem('afn_token');
  sessionStorage.removeItem('afn_user');
  // Remove legacy persistent credentials left by older builds.
  localStorage.removeItem('afn_token');
  localStorage.removeItem('afn_user');
  delete axios.defaults.headers.common.Authorization;
  delete api.defaults.headers.common.Authorization;
  Object.keys(localStorage)
    .filter((key) => key.startsWith(API_CACHE_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
};

api.interceptors.request.use((config) => {
  const method = String(config.method || 'get').toLowerCase();
  if (isOffline() && WRITE_METHODS.has(method)) {
    return Promise.reject(new Error('You are offline. Reconnect before saving changes.'));
  }

  const token = sessionStorage.getItem('afn_token');
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

const extractApiErrorMessage = (value) => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractApiErrorMessage(item);
      if (message) {
        return message;
      }
    }
    return '';
  }

  if (typeof value === 'object') {
    if (typeof value.error === 'string' && value.error) {
      return value.error;
    }
    if (typeof value.detail === 'string' && value.detail) {
      return value.detail;
    }

    for (const nestedValue of Object.values(value)) {
      const message = extractApiErrorMessage(nestedValue);
      if (message) {
        return message;
      }
    }
  }

  return '';
};

export const getApiErrorMessage = (error, fallbackMessage) => {
  return extractApiErrorMessage(error?.response?.data) || fallbackMessage;
};

export const extractPaginatedResults = (data) =>
  Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);

const normalizeNextUrl = (nextUrl) => {
  if (!nextUrl) return null;
  const apiBasePath = (() => {
    try {
      return new URL(API_BASE_URL, window.location.origin).pathname.replace(/\/$/, '');
    } catch {
      return String(API_BASE_URL || '').replace(/\/$/, '');
    }
  })();
  const stripApiBase = (value) => {
    if (apiBasePath && apiBasePath !== '/' && value.startsWith(`${apiBasePath}/`)) {
      return value.slice(apiBasePath.length);
    }
    return value;
  };
  try {
    const parsedUrl = new URL(nextUrl);
    return stripApiBase(`${parsedUrl.pathname}${parsedUrl.search}`);
  } catch {
    return stripApiBase(nextUrl);
  }
};

export const fetchAllPages = async (url, config = {}) => {
  const firstResponse = await api.get(url, config);
  const firstData = firstResponse.data;
  if (!firstData || !Array.isArray(firstData.results)) {
    return extractPaginatedResults(firstData);
  }

  const results = [...firstData.results];
  let nextUrl = normalizeNextUrl(firstData.next);
  while (nextUrl) {
    const { data } = await api.get(nextUrl);
    results.push(...extractPaginatedResults(data));
    nextUrl = normalizeNextUrl(data?.next);
  }
  return results;
};

api.interceptors.response.use(
  (response) => {
    writeCachedResponse(response);
    return response;
  },
  (error) => {
    const cachedResponse = readCachedResponse(error?.config);
    if (!error?.response && cachedResponse) {
      return Promise.resolve(cachedResponse);
    }

    if (error?.response?.status === 401 && sessionStorage.getItem('afn_token')) {
      clearStoredAuth();
      const publicAuthPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];
      const isPublicAuthPath =
        typeof window !== 'undefined' &&
        publicAuthPaths.some((path) => window.location.pathname.startsWith(path));

      if (typeof window !== 'undefined' && !isPublicAuthPath) {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

const splitDisplayName = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ')
  };
};

const getDisplayName = (user) => {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return fullName || user?.username || 'Unknown';
};

const toInteger = (value) => {
  if (value == null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

export const normalizeTechnicianStatus = (user) => {
  if (user?.status !== 'active') {
    return 'offline';
  }
  return user?.is_available ? 'available' : 'on_job';
};

export const normalizeSla = (sla) => {
  const state = String(sla?.state || 'inactive').toLowerCase();
  return {
    ...sla,
    state,
    rule: sla?.rule || '',
    ruleLabel: sla?.rule_label || '',
    label: sla?.label || 'No active SLA',
    dueAt: sla?.due_at || null,
    warningAt: sla?.warning_at || null,
    breachedAt: sla?.breached_at || null,
    minutesToBreach: toInteger(sla?.minutes_to_breach),
    minutesOverdue: toInteger(sla?.minutes_overdue) ?? 0,
    actionRequired: sla?.action_required || '',
    isActive: Boolean(sla?.is_active)
  };
};

export const normalizeUser = (user) => ({
  ...user,
  capabilities: Array.isArray(user?.capabilities) ? user.capabilities : [],
  name: getDisplayName(user),
  active: user?.status === 'active' && user?.is_active !== false,
  isAvailable: Boolean(user?.is_available),
  lat: user?.current_latitude == null ? 0 : Number(user.current_latitude),
  lng: user?.current_longitude == null ? 0 : Number(user.current_longitude),
  technicianStatus: normalizeTechnicianStatus(user)
});

export const normalizeTicket = (ticket) => {
  const requestDetails = ticket?.request_details || {};
  const location = requestDetails?.location || {};
  const serviceItems = Array.isArray(requestDetails?.service_items) ? requestDetails.service_items : [];
  const serviceNames = serviceItems
    .map((item) => item?.service_type_name)
    .filter(Boolean);
  const clientId = ticket?.client_id || requestDetails?.client || null;
  const clientFullname = ticket?.client_fullname || requestDetails?.client_fullname || requestDetails?.client_name || ticket?.client || 'Unknown';
  const clientPhone = ticket?.client_phone || requestDetails?.client_phone || '';
  const clientEmail = ticket?.client_email || requestDetails?.client_email || '';
  const clientAddress = ticket?.client_address || requestDetails?.client_address || '';
  const technicianFullname = ticket?.technician_fullname || ticket?.technician_name || '';
  const requestSource = requestDetails?.request_source || ticket?.request_source || 'client_portal';
  const requestSourceLabel = requestDetails?.request_source_label || ticket?.request_source_label || 'Client Portal';
  const crewMembers = Array.isArray(ticket?.crew_members)
    ? ticket.crew_members.map((member) => ({
      ...member,
      name: member?.name || member?.username || 'Technician'
    }))
    : [];
  return {
    ...ticket,
    requestId: ticket?.request || requestDetails?.id || null,
    client: requestDetails?.client_name || requestDetails?.client || ticket?.client || 'Unknown',
    clientId,
    clientFullname,
    clientPhone,
    clientEmail,
    clientAddress,
    requestSource,
    requestSourceLabel,
    serviceTypeId: requestDetails?.service_type || ticket?.service_type || ticket?.serviceTypeId || null,
    serviceItems,
    service: requestDetails?.service_summary || serviceNames.join(', ') || requestDetails?.service_type_name || ticket?.service || 'Service',
    status: String(ticket?.status || 'unknown').toLowerCase().replace(/\s+/g, '_'),
    priority: String(ticket?.priority || 'normal').toLowerCase(),
    assignedTech: ticket?.technician_name || '',
    assignedTechnicianId: ticket?.technician || ticket?.technician_id || null,
    technicianFullname,
    assignedAdminId: ticket?.assigned_admin || ticket?.assigned_admin_id || null,
    assignedAdminName: ticket?.assigned_admin_name || ticket?.assigned_admin_fullname || '',
    assignedById: ticket?.assigned_by_id || null,
    assignedByName: ticket?.assigned_by_name || '',
    assignedByRole: ticket?.assigned_by_role || '',
    assignedAt: ticket?.assigned_at || null,
    crewMembers,
    crewSummary: crewMembers.map((member) => member.name).join(', '),
    teamSize: (ticket?.technician_name ? 1 : 0) + crewMembers.length,
    locationDesc: location?.address || ticket?.locationDesc || '',
    lat: location?.latitude == null ? ticket?.lat : Number(location.latitude),
    lng: location?.longitude == null ? ticket?.lng : Number(location.longitude),
    preferredDate: requestDetails?.preferred_date || null,
    preferredTimeSlot: requestDetails?.preferred_time_slot || '',
    schedulingNotes: requestDetails?.scheduling_notes || '',
    scheduledDate: ticket?.scheduled_date || null,
    scheduledTime: ticket?.scheduled_time || null,
    scheduledTimeSlot: ticket?.scheduled_time_slot || '',
    rescheduleRequested: Boolean(ticket?.reschedule_requested),
    rescheduleReason: ticket?.reschedule_reason || '',
    completionNotes: ticket?.completion_notes || '',
    warrantyStatus: ticket?.warranty_status || 'not_applicable',
    warrantyEndDate: ticket?.warranty_end_date || null,
    smartAssignmentScore: ticket?.smart_assignment_score ?? null,
    smartAssignmentSummary: ticket?.smart_assignment_summary || '',
    inventoryReservations: Array.isArray(ticket?.inventory_reservations) ? ticket.inventory_reservations : [],
    dispatchStatus: ticket?.dispatch_status || '',
    dispatchLabel: ticket?.dispatch_label || '',
    dispatchAction: ticket?.dispatch_action || '',
    isMissedDispatch: Boolean(ticket?.is_missed_dispatch),
    missedDispatchAt: ticket?.missed_dispatch_at || null,
    dispatchOverdueDays: toInteger(ticket?.dispatch_overdue_days) ?? 0,
    sla: normalizeSla(ticket?.sla)
  };
};

export const buildUserCreatePayload = ({ name, passwordConfirm, ...userData }) => {
  const { first_name, last_name } = splitDisplayName(name);
  return {
    ...userData,
    first_name: userData.first_name ?? first_name,
    last_name: userData.last_name ?? last_name,
    password_confirm: passwordConfirm ?? userData.password_confirm
  };
};

export const buildUserUpdatePayload = ({
  name,
  status,
  technicianStatus,
  lat,
  lng,
  active,
  password,
  passwordConfirm,
  ...userData
}) => {
  const { first_name, last_name } = splitDisplayName(name);
  const resolvedStatus = status || (active === false ? 'inactive' : 'active');
  const resolvedTechnicianStatus = technicianStatus || status;

  const payload = {
    ...userData,
    first_name: userData.first_name ?? first_name,
    last_name: userData.last_name ?? last_name,
    status: ['active', 'inactive'].includes(resolvedStatus)
      ? resolvedStatus
      : (resolvedTechnicianStatus === 'offline' ? 'inactive' : 'active')
  };

  if (lat !== undefined) {
    payload.current_latitude = lat === '' ? null : lat;
  }
  if (lng !== undefined) {
    payload.current_longitude = lng === '' ? null : lng;
  }
  if (resolvedTechnicianStatus) {
    payload.is_available = resolvedTechnicianStatus === 'available';
  }

  return payload;
};
