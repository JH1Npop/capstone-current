import { useEffect, useState } from 'react';
import { FiMessageCircle, FiRefreshCw, FiSend, FiX } from 'react-icons/fi';
import { fetchAdminAnalytics, fetchAdminAnalyticsAiSummary, fetchDashboardStats } from '../../api/api';
import { api } from '../../api/core';

const QUICK_QUESTIONS = [
  'Analytics summary',
  'Is forecasting ready?',
  'How will item demand be forecast?',
  'Historical demand by location',
  'Historical item consumption',
  'Requests created vs completed',
  'Busiest months',
  'Request count by service type',
  'Request count by source',
  'Ticket count by workflow status',
  'City completion trends',
  'Peak historical month',
  'Technician performance',
  'Most active technician',
  'SLA risks',
  'Inventory demand',
  'Scheduling and warranty counts',
  'Coverage heatmap',
  'Operational issue counts',
  'What can you analyze?'
];

const OUT_OF_SCOPE_RESPONSE =
  'I only answer from loaded analytics and dashboard data. Ask about request counts, created versus completed trends, service or status counts, historical service-location density, forecast readiness, ticket-linked item consumption, technician performance, SLA risks, inventory, scheduling, maintenance, or coverage insights.';

const ANALYTICS_SCOPE_TERMS = [
  'analytics',
  'analyze',
  'analysis',
  'forecast',
  'forecasting',
  'future',
  'predict',
  'predictive',
  'projection',
  'trend',
  'demand',
  'summary',
  'busiest',
  'busiest month',
  'busiest week',
  'peak',
  'monthly',
  'week',
  'top requested',
  'city',
  'province',
  'service demand',
  'service trend',
  'performance',
  'technician performance',
  'most active',
  'completed',
  'rating',
  'sla',
  'risk',
  'overdue',
  'delay',
  'breach',
  'inventory demand',
  'inventory usage',
  'stock demand',
  'maintenance forecast',
  'maintenance',
  'after-sales',
  'after sales',
  'coverage',
  'heatmap',
  'hotspot',
  'area demand',
  'location demand',
  'capacity',
  'workload',
  'staffing',
  'growth',
  'machine learning',
  'ml',
  'formula',
  'accuracy',
  'confidence',
  'how did you get',
  'how is it calculated',
  'how calculated',
  'calculation',
  'method'
];

const MONTH_ALIASES = [
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar'],
  ['april', 'apr'],
  ['may'],
  ['june', 'jun'],
  ['july', 'jul'],
  ['august', 'aug'],
  ['september', 'sep', 'sept'],
  ['october', 'oct'],
  ['november', 'nov'],
  ['december', 'dec']
];

const SYSTEM_KNOWLEDGE = [
  {
    keywords: ['service request', 'client request', 'new request', 'request flow'],
    answer: 'Service requests are created by clients or admins with service type, description, priority, preferred schedule, and location. Admin reviews pending requests, approves them, and an approved request becomes a service ticket for dispatch.'
  },
  {
    keywords: ['service ticket', 'ticket', 'job ticket'],
    answer: 'Service tickets are the operational jobs created from approved requests. They track technician assignment, schedule, priority, status, SLA, route information, checklist proof, completion notes, warranty, and client feedback.'
  },
  {
    keywords: ['dispatch', 'assign technician', 'assignment', 'auto assign', 'smart assignment'],
    answer: 'Dispatch is handled from the Dispatch Board and Service Tickets pages. Admins can manually assign a technician or use auto assignment, which considers technician skill, availability, workload, schedule, and location-related signals when data is available.'
  },
  {
    keywords: ['calendar', 'schedule', 'upcoming'],
    answer: 'The Calendar and Schedule views show pending approvals, scheduled tickets, assigned technicians, time slots, and job dates. Admins use it for operations planning, while technicians see their own schedule.'
  },
  {
    keywords: ['technician dashboard', 'technician jobs', 'my jobs'],
    answer: 'The technician workspace includes Dashboard, Jobs, Schedule, Navigation, Checklist, Messages, Job History, and Profile, depending on the capabilities granted to that technician.'
  },
  {
    keywords: ['client dashboard', 'client portal', 'customer portal'],
    answer: 'The client workspace lets clients submit service requests, track request and ticket status, view service history, read notifications, update profile details, request rescheduling, and submit feedback after completion.'
  },
  {
    keywords: ['checklist', 'inspection', 'proof', 'completion proof'],
    answer: 'The checklist is currently the technician validation workflow before closing a job. It stores site/electrical/structural/safety checks, procedure checklist items, required equipment snapshot, proof media, warranty details, maintenance settings, and follow-up case details. It is not yet a separate pre-install survey approval phase; finished or cancelled jobs are locked.'
  },
  {
    keywords: ['inventory', 'stock', 'parts', 'equipment', 'reservation'],
    answer: 'Inventory manages categories, items, stock levels, reserved quantity, transactions, service-type requirements, and reservations for tickets. Low-stock and out-of-stock signals appear in dashboard and inventory views.'
  },
  {
    keywords: ['service setup', 'services setup', 'service type', 'procedures', 'required equipment'],
    answer: 'Service setup lets admins define service types, duration, estimated cost, max daily assignments, procedure steps, required equipment, and default inventory requirements used by tickets and checklists.'
  },
  {
    keywords: ['sla', 'late', 'overdue', 'breach', 'delay'],
    answer: 'SLA tracking monitors approval delay, assignment delay, start delay, execution delay, and reschedule delay. The dashboard shows warning and overdue items so admins can prioritize work before service quality is affected.'
  },
  {
    keywords: ['analytics', 'forecast', 'demand forecasting', 'predictive', 'trend'],
    answer: 'Analytics provides descriptive trends, readiness evidence, and a seasonal-trend forecast only when genuine history and holdout validation pass. Otherwise it withholds future quantities. Service-location density and ticket-linked item consumption remain clearly identified as historical evidence.'
  },
  {
    keywords: ['formula', 'calculated', 'calculation', 'how did you get', 'accuracy', 'confidence', 'method'],
    answer: 'The forecast blends calendar-month seasonality with a damped 12-month linear trend. It is published only after rolling holdout validation, with MAE, WAPE, bias, and baseline comparison stored. Item demand then uses genuine ticket-linked usage and configured service-item mappings.'
  },
  {
    keywords: ['map', 'gps', 'tracking', 'technician tracking', 'location'],
    answer: 'Technician tracking uses technician GPS updates, service locations, maps, route navigation, and last-seen timestamps. Phone browsers require HTTPS for full live GPS permissions, so local HTTP testing can show a GPS warning.'
  },
  {
    keywords: ['coverage heatmap', 'heatmap', 'coverage', 'service density'],
    answer: 'Coverage Heatmap visualizes completed-service density and technician coverage by location. Forecasting uses genuine city/province history to allocate a validated 30-day service outlook, while clearly stating that this is a historical-share allocation rather than a separate geographic model.'
  },
  {
    keywords: ['message', 'messages', 'chat', 'communication'],
    answer: 'Messages support direct and group-style communication between system users, optionally tied to tickets. Admins and technicians can use the Messages page when their role/capabilities allow it.'
  },
  {
    keywords: ['notification', 'notifications', 'email', 'smtp'],
    answer: 'Notifications are stored as in-app records with read/unread status. Email delivery uses Django SMTP when the backend calls the email helper for a specific workflow event, such as password reset or selected ticket updates. Firebase push was removed, so there is no Firebase push notification layer right now.'
  },
  {
    keywords: ['forgot password', 'reset password', 'change password'],
    answer: 'Forgot Password sends a reset link by SMTP email using the configured frontend base URL. Change Password is for authenticated users who know their current password.'
  },
  {
    keywords: ['after sales', 'after-sales', 'follow up', 'follow-up', 'complaint', 'revisit', 'warranty case'],
    answer: 'After-sales cases handle follow-up, maintenance, complaint, warranty, revisit, and feedback work after service. Cases track status, priority, assigned admin, due date, satisfaction, and resolution notes.'
  },
  {
    keywords: ['maintenance', 'maintenance schedule', 'due soon', 'due maintenance'],
    answer: 'Maintenance schedules are created from completed service/checklist data when maintenance is required. They track profile, interval, next due date, notify date, risk level, and status such as scheduled, due soon, due, completed, or dismissed.'
  },
  {
    keywords: ['report', 'reports', 'operations report'],
    answer: 'Reports summarize operations, service history, SLA status, inventory/resource usage, notifications, maintenance, after-sales, technician work, and location coverage for management review.'
  },
  {
    keywords: ['user management', 'roles', 'capability', 'permission', 'rbac', 'access'],
    answer: 'User Management uses roles and capabilities. Main roles are superadmin, admin, technician, and client. Superadmin has full control, while capability grants control access to technician pages, after-sales, user directory, job history, and staff access management.'
  },
  {
    keywords: ['activity log', 'audit', 'change log', 'logs'],
    answer: 'Activity Logs and Change Logs support auditability. They record operational events such as login/logout, create/update/delete, assignments, reschedules, completions, cancellations, errors, and critical data changes.'
  },
  {
    keywords: ['pwa', 'installable', 'offline', 'mobile app'],
    answer: 'The frontend is configured as a PWA with a manifest, AFN icons, and service worker. It can be installed from the browser, but full GPS behavior on phones needs HTTPS.'
  },
  {
    keywords: ['technician_id', 'tech id', 'technician id', 'where did technician', 'no technician table', 'technician table'],
    answer: 'technician_id comes from users_user.id. The project does not need a separate technician table because technicians are user accounts with role = technician. The ticket/request table stores a foreign key to the same users_user table, then role filtering explains that the referenced user is a technician.'
  },
  {
    keywords: ['assigned_admin', 'assigned admin', 'assigned_admin_id', 'supervisor', 'supervisor_id', 'why supervisor'],
    answer: 'assigned_admin_id is the cleaned replacement for the old supervisor wording. It still points to users_user.id, limited to admin or superadmin accounts, because the active flow uses admins/superadmins to manage tickets instead of a separate supervisor role.'
  },
  {
    keywords: ['text not json', 'why text', 'json not text', 'json type', 'json data type', 'sqlite json'],
    answer: 'For the physical SQLite schema, JSON-like Django JSONField data is documented as TEXT because SQLite stores JSON as serialized text. In Django code it can still behave like structured JSON, but the ERD/data dictionary should show the real storage type as TEXT.'
  },
  {
    keywords: ['varchar', 'text? not varchar', 'text not varchar', 'why not varchar', 'charfield', 'textfield'],
    answer: 'In Django, CharField usually becomes varchar with a max_length, while TextField becomes TEXT. If the model field is TextField or a serialized JSONField on SQLite, the data dictionary should show TEXT. Use varchar only for bounded CharField values such as names, codes, phone numbers, or statuses.'
  },
  {
    keywords: ['integer id', 'ids integer', 'why integer', 'alphanumeric id', 'letters and number', 'letters and numbers', 'database id'],
    answer: 'Integer primary keys are normal internal database identifiers because they are fast, stable, and simple for relationships. If users need IDs with letters and numbers, those should be separate user-facing codes such as ticket codes or request reference numbers, not replacements for internal primary keys.'
  },
  {
    keywords: ['machine learning', 'ml', 'does it learn', 'learns', 'adaptive', 'ai assistant', 'real ai'],
    answer: 'The Analytics Assistant is not the forecasting model. It explains live aggregates, readiness, and any stored validated seasonal-trend run. It never creates predictions itself.'
  },
  {
    keywords: ['database', 'schema', 'erd', 'json', 'jsonfield', 'foreign key', 'fk', '_id'],
    answer: 'The database is a Django relational schema. ForeignKey fields appear physically as columns ending in _id. In this project, technician_id, client_id, and assigned_admin_id all reference users_user.id because role-specific users live in the shared users table. SQLite-backed JSONField values are documented as TEXT because SQLite stores serialized JSON text, not a separate physical JSON type.'
  },
  {
    keywords: ['admin settings', 'settings', 'system preferences'],
    answer: 'Admin Settings stores global preferences such as system name, support email, notifications enabled, auto dispatch setting, default time zone, and max technician assignments.'
  },
  {
    keywords: ['deploy', 'deployment', 'pythonanywhere', 'local', 'phone testing', 'lan'],
    answer: 'For local phone testing, build with npm run build:pythonanywhere, run Django on 0.0.0.0:8000, and open the laptop LAN IP or ngrok HTTPS URL from the phone. PythonAnywhere appears in build naming because the project has deployment support; it does not automatically mean the app is deployed there.'
  }
];

const ROUTE_HELP = [
  { keywords: ['dashboard', 'home'], answer: 'Admin dashboard is /admin/dashboard, technician dashboard is /technician/dashboard, and client dashboard is /client/dashboard.' },
  { keywords: ['dispatch board', 'dispatch'], answer: 'Open /admin/dispatch-board for technician assignment and dispatch planning.' },
  { keywords: ['service tickets', 'tickets'], answer: 'Open /admin/service-tickets for admin ticket operations, or /technician/my-jobs for technician assigned jobs.' },
  { keywords: ['tracking', 'gps'], answer: 'Open /admin/technician-tracking for admin tracking, or /technician/map-navigation for technician navigation.' },
  { keywords: ['inventory'], answer: 'Open /admin/inventory for stock, items, summaries, and service inventory requirements.' },
  { keywords: ['services'], answer: 'Open /admin/services to manage service types, procedures, duration, cost, and required equipment.' },
  { keywords: ['analytics', 'forecast'], answer: 'Open /admin/analytics for operational trends, comparisons, historical service-location density, ticket-linked item usage, and forecast readiness.' },
  { keywords: ['reports'], answer: 'Open /admin/reports or /admin/operations-report for management reports.' },
  { keywords: ['users', 'user management', 'accounts'], answer: 'Open /admin/user-management. Superadmin controls full user and capability management.' },
  { keywords: ['after sales', 'after-sales', 'follow up'], answer: 'Open /admin/after-sales-cases for follow-up, complaint, warranty, revisit, and feedback cases.' },
  { keywords: ['messages'], answer: 'Open /admin/messages or /technician/messages depending on the signed-in role and capability.' },
  { keywords: ['client requests'], answer: 'Clients open /client/service-requests to create a request and /client/requests to track requests.' }
];

function getTechnicianName(technician) {
  return technician?.username || technician?.name || technician?.full_name || `Technician #${technician?.technician_id || technician?.id || '-'}`;
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function plural(value, singular, pluralText = `${singular}s`) {
  return `${value} ${Number(value) === 1 ? singular : pluralText}`;
}

function withSource(answer, source, confidence = null) {
  return `${answer}\n\nSource: ${source}${confidence ? ` | Confidence: ${confidence}` : ''}`;
}

function AssistantMessageText({ text }) {
  const rawText = String(text || '');
  const sourceMatch = rawText.match(/\n\nSource:\s*([\s\S]*)$/);
  const body = sourceMatch ? rawText.slice(0, sourceMatch.index).trim() : rawText.trim();
  const source = sourceMatch ? sourceMatch[1].trim() : '';
  const paragraphs = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const clean = (value) => String(value || '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/, '')
    .trim();

  return (
    <div className="space-y-3">
      {paragraphs.map((paragraph, index) => {
        const headingMatch = paragraph.match(/^(\d+\.\s*)?(.+?)\s*:\s*([\s\S]*)$/);
        const isStructured = headingMatch && headingMatch[3]?.trim();

        if (isStructured) {
          return (
            <div key={`${paragraph}-${index}`} className="space-y-1">
              <p className="text-[0.72rem] font-bold uppercase tracking-wide text-slate-500">
                {clean(headingMatch[2])}
              </p>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-slate-700">{clean(headingMatch[3])}</p>
            </div>
          );
        }

        return (
          <p key={`${paragraph}-${index}`} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-slate-700">
            {clean(paragraph)}
          </p>
        );
      })}
      {source ? (
        <p className="break-words [overflow-wrap:anywhere] border-t border-slate-100 pt-2 text-[0.72rem] font-medium text-slate-500">
          Source: {clean(source)}
        </p>
      ) : null}
    </div>
  );
}

function dataAvailabilityNote(analytics, dashboardStats) {
  if (analytics && dashboardStats) return '';
  if (analytics) return ' Dashboard snapshot is not loaded, so live dashboard counters may be incomplete.';
  if (dashboardStats) return ' Analytics evidence is not loaded, so historical trends and forecast readiness may be incomplete.';
  return ' Live system data is not loaded yet.';
}

function getNumber(...values) {
  const value = values.find((item) => item !== null && item !== undefined && item !== '');
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function isSensitiveDisclosureRequest(text) {
  const safePasswordTopics = ['forgot password', 'reset password', 'change password'];
  if (safePasswordTopics.some((topic) => text.includes(topic))) return false;

  const sensitiveTerms = [
    'password',
    'app password',
    'secret',
    'token',
    'api key',
    'apikey',
    'private key',
    'smtp password',
    'email_host_password',
    'database password',
    '.env',
    'env file',
    'credentials',
    'authorization header',
    'auth token',
    'session',
    'cookie',
    'raw user data',
    'personal data',
    'phone numbers',
    'emails of users'
  ];
  const disclosureVerbs = ['show', 'reveal', 'display', 'print', 'list', 'give', 'tell me', 'what is', 'send', 'export'];
  return sensitiveTerms.some((term) => text.includes(term)) && disclosureVerbs.some((verb) => text.includes(verb));
}

function isAnalyticsForecastQuestion(text) {
  return includesAny(text, ANALYTICS_SCOPE_TERMS);
}

function findKnowledgeAnswer(text) {
  const routeIntent = includesAny(text, ['where', 'open', 'page', 'route', 'link', 'go to']);
  if (routeIntent) {
    const route = ROUTE_HELP.find((item) => item.keywords.some((keyword) => text.includes(keyword)));
    if (route) return route.answer;
  }

  const match = SYSTEM_KNOWLEDGE.find((item) => item.keywords.some((keyword) => text.includes(keyword)));
  return match?.answer || null;
}

function getRequestedMonth(text) {
  for (let index = 0; index < MONTH_ALIASES.length; index += 1) {
    const alias = MONTH_ALIASES[index].find((monthName) => new RegExp(`\\b${monthName}\\b`).test(text));
    if (alias) {
      return {
        monthIndex: index,
        monthName: MONTH_ALIASES[index][0][0].toUpperCase() + MONTH_ALIASES[index][0].slice(1)
      };
    }
  }
  return null;
}

function findMonthlyBreakdown(monthlyBreakdown, requestedMonth, question) {
  if (!requestedMonth || !Array.isArray(monthlyBreakdown)) return null;
  const requestedYearMatch = question.match(/\b(20\d{2})\b/);
  const requestedYear = requestedYearMatch ? Number(requestedYearMatch[1]) : null;

  return monthlyBreakdown.find((item) => {
    const monthStart = item?.monthStart ? new Date(`${item.monthStart}T00:00:00`) : null;
    if (!monthStart || Number.isNaN(monthStart.getTime())) return false;
    if (monthStart.getMonth() !== requestedMonth.monthIndex) return false;
    return requestedYear ? monthStart.getFullYear() === requestedYear : true;
  });
}

function getSpecificDateFromQuestion(text) {
  const isoMatch = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const slashMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const resolvedYear = year || String(new Date().getFullYear());
    return `${resolvedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const monthMatch = MONTH_ALIASES
    .map((aliases, monthIndex) => ({ aliases, monthIndex }))
    .find(({ aliases }) => aliases.some((alias) => new RegExp(`\\b${alias}\\s+\\d{1,2}\\b`).test(text)));

  if (!monthMatch) return null;

  const alias = monthMatch.aliases.find((monthAlias) => new RegExp(`\\b${monthAlias}\\s+\\d{1,2}\\b`).test(text));
  const dayMatch = text.match(new RegExp(`\\b${alias}\\s+(\\d{1,2})(?:,?\\s*(20\\d{2}))?\\b`));
  if (!dayMatch) return null;

  const day = Number(dayMatch[1]);
  const year = dayMatch[2] || String(new Date().getFullYear());
  if (day < 1 || day > 31) return null;

  return `${year}-${String(monthMatch.monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isDateRecordQuestion(text) {
  return Boolean(getSpecificDateFromQuestion(text)) && includesAny(text, [
    'customer',
    'client',
    'who',
    'request',
    'service',
    'ticket',
    'job',
    'scheduled',
    'completed'
  ]);
}

function formatDateRecordsAnswer(records) {
  const requests = Array.isArray(records?.requests) ? records.requests : [];
  const tickets = Array.isArray(records?.tickets) ? records.tickets : [];
  const allRows = [
    ...requests.map((item) => ({ ...item, source: `request #${item.id}` })),
    ...tickets.map((item) => ({ ...item, source: `ticket #${item.id}` }))
  ];

  if (!allRows.length) {
    return withSource(
      `No customer request or ticket record is found for ${records?.date || 'that date'}.`,
      'live service records',
      'high'
    );
  }

  const uniqueRows = [];
  const seen = new Set();
  allRows.forEach((item) => {
    const key = `${item.customer}-${item.service}-${item.status}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRows.push(item);
    }
  });

  const visibleRows = uniqueRows.slice(0, 5);
  const customerList = visibleRows
    .map((item) => `${item.customer} (${item.service}, ${item.status}, ${item.source})`)
    .join('; ');
  const extraCount = Math.max(0, uniqueRows.length - visibleRows.length);

  return withSource(
    `For ${records.date}, the customer record${uniqueRows.length === 1 ? '' : 's'} I can disclose here: ${customerList}${extraCount ? `, plus ${extraCount} more record${extraCount === 1 ? '' : 's'}.` : '.'} I am not showing private contact details.`,
    'live service records',
    'high'
  );
}

async function answerDateRecordQuestion(question) {
  const date = getSpecificDateFromQuestion(String(question || '').toLowerCase());
  if (!date) return null;
  const { data } = await api.get('/admin/analytics/date-records/', { params: { date } });
  return formatDateRecordsAnswer(data);
}

function buildAssistantAnswer(question, analytics, technicianPerformance = [], dashboardStats = null, technicianPerformanceAllTime = []) {
  const normalizedQuestion = String(question || '').toLowerCase();
  const forecasting = analytics?.forecasting || {};
  const forecastReadiness = forecasting.forecast || analytics?.forecast || {};
  const demandForecast = forecasting.demand_forecast || analytics?.demandForecast || {};
  const modelStatus = forecasting.model_status || analytics?.modelStatus || {};
  const forecastAvailable = Boolean(modelStatus.predictions_available && demandForecast.available);
  const itemDemandReadiness = forecasting.item_demand_readiness || {};
  const forecastHistory = forecasting.historical_charts || {};
  const historySummary = forecasting.history_summary || {};
  const historicalServiceMix = Array.isArray(forecastHistory.service_mix) ? forecastHistory.service_mix : [];
  const historicalLocations = Array.isArray(forecastHistory.service_location_density) ? forecastHistory.service_location_density : [];
  const historicalItems = Array.isArray(forecastHistory.historical_item_usage) ? forecastHistory.historical_item_usage : [];
  const monthlyServiceBreakdown = Array.isArray(analytics?.monthlyServiceBreakdown) ? analytics.monthlyServiceBreakdown : [];
  const inventoryDemand = analytics?.seasonalInventoryDemand || {};
  const busiestMonths = Array.isArray(analytics?.busiestMonths) ? analytics.busiestMonths : [];
  const busiestWeeks = Array.isArray(analytics?.busiestWeeks) ? analytics.busiestWeeks : [];
  const topRequestedServiceTypes = Array.isArray(analytics?.topRequestedServiceTypes) ? analytics.topRequestedServiceTypes : [];
  const cityCompletionTrends = Array.isArray(analytics?.cityCompletionTrends) ? analytics.cityCompletionTrends : [];
  const provinceCompletionTrends = Array.isArray(analytics?.provinceCompletionTrends) ? analytics.provinceCompletionTrends : [];
  const overview = analytics?.overview || {};
  const dashboardOverview = dashboardStats?.overview || {};
  const pendingRequests = Array.isArray(dashboardStats?.pending_requests) ? dashboardStats.pending_requests : [];
  const clientSchedule = Array.isArray(dashboardStats?.client_schedule) ? dashboardStats.client_schedule : [];
  const slaQueue = Array.isArray(dashboardStats?.sla_queue) ? dashboardStats.sla_queue : [];
  const slaOverview = dashboardStats?.sla_overview || {};
  const maintenanceQueue = Array.isArray(dashboardStats?.maintenance_queue) ? dashboardStats.maintenance_queue : [];
  const activeTechnicianJobs = Array.isArray(dashboardStats?.operations?.active_technician_jobs)
    ? dashboardStats.operations.active_technician_jobs
    : [];
  const afterSalesCases = Array.isArray(dashboardStats?.after_sales?.recent_cases)
    ? dashboardStats.after_sales.recent_cases
    : [];
  const topInventoryItem = [...(inventoryDemand?.topItems || [])].sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))[0];
  const topInventoryCategory = [...(inventoryDemand?.categoryDemand || [])].sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))[0];
  const wantsAllTimePerformance = includesAny(normalizedQuestion, ['all time', 'of all time', 'ever', 'lifetime', 'all recorded', 'entire history']);
  const recentTechnicians = Array.isArray(technicianPerformance) ? technicianPerformance : [];
  const allTimeTechnicians = Array.isArray(technicianPerformanceAllTime) ? technicianPerformanceAllTime : [];
  const technicians = wantsAllTimePerformance && allTimeTechnicians.length ? allTimeTechnicians : recentTechnicians;
  const performancePeriodLabel = wantsAllTimePerformance && allTimeTechnicians.length ? 'all recorded time' : 'the last 30 days';
  const mostActiveTechnician = [...technicians].sort((a, b) => {
    const bWork = Number(b.active_jobs || 0) + Number(b.completed_jobs || 0);
    const aWork = Number(a.active_jobs || 0) + Number(a.completed_jobs || 0);
    return bWork - aWork;
  })[0];
  const topCompletedTechnician = [...technicians].sort((a, b) => Number(b.completed_jobs || 0) - Number(a.completed_jobs || 0))[0];
  const bestRatedTechnician = [...technicians]
    .filter((item) => item.avg_rating != null)
    .sort((a, b) => Number(b.avg_rating || 0) - Number(a.avg_rating || 0))[0];
  const pendingCount = getNumber(dashboardOverview.pending_approvals, analytics?.pendingRequests, overview.pendingRequests, pendingRequests.length);
  const activeTickets = getNumber(dashboardOverview.active_tickets, overview.activeTickets);
  const completedToday = getNumber(dashboardOverview.completed_today);
  const totalTickets = getNumber(dashboardOverview.total_tickets);
  const lowStock = getNumber(dashboardOverview.low_stock_items);
  const outOfStock = getNumber(dashboardOverview.out_of_stock);
  const dueMaintenance = getNumber(dashboardOverview.due_maintenance);
  const dueSoonMaintenance = getNumber(dashboardOverview.due_soon_maintenance);
  const openCases = getNumber(dashboardOverview.open_cases);
  const overdueCases = getNumber(dashboardOverview.overdue_cases);
  const warningSla = getNumber(slaOverview.warning_count);
  const overdueSla = getNumber(slaOverview.overdue_count);
  const availableTechnicians = getNumber(dashboardOverview.available_technicians, dashboardOverview.active_technicians, overview.availableTechnicians, overview.activeTechnicians);
  const requestedMonth = getRequestedMonth(normalizedQuestion);
  const requestedMonthBreakdown = findMonthlyBreakdown(monthlyServiceBreakdown, requestedMonth, normalizedQuestion);
  const availabilityNote = dataAvailabilityNote(analytics, dashboardStats);

  if (isSensitiveDisclosureRequest(normalizedQuestion)) {
    return withSource(
      'I cannot disclose passwords, tokens, secrets, raw credentials, private environment settings, or personal user data. I can explain how the feature works or where to configure it safely.',
      'assistant safety rules',
      'high'
    );
  }

  if (includesAny(normalizedQuestion, ['help', 'what can you answer', 'what can you analyze', 'what can you analyse', 'topics', 'questions', 'guide'])) {
    return withSource(
      'I answer from loaded analytics and dashboard data: request and completion trends, service and status counts, comparisons, historical service-location density, forecast readiness, ticket-linked item consumption, technician performance, SLA risks, inventory, scheduling, maintenance, and coverage insights. I do not invent future quantities, confidence, or accuracy while forecasting is unavailable.',
      'analytics assistant scope',
      'high'
    );
  }

  if (!isAnalyticsForecastQuestion(normalizedQuestion)) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (!analytics && !dashboardStats) {
    return withSource(
      'I need to load the latest analytics first. Open me again or tap refresh so I can read the dashboard, forecast, technician performance, SLA, inventory, and coverage data.',
      'assistant data availability check',
      'high'
    );
  }

  if (includesAny(normalizedQuestion, [
    'technician_id',
    'tech id',
    'technician id',
    'no technician table',
    'assigned_admin',
    'assigned admin',
    'supervisor',
    'json',
    'jsonfield',
    'varchar',
    'text not',
    'why text',
    'integer id',
    'ids integer',
    'alphanumeric id',
    'machine learning',
    'does it learn'
  ])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['formula', 'calculated', 'calculation', 'how did you get', 'how is it calculated', 'how calculated', 'method'])) {
    return withSource(
      forecastAvailable
        ? `The published method is ${demandForecast.method}. It combines calendar-month seasonality with a damped 12-month linear trend, then must pass a rolling holdout backtest before display. The current outlook is ${getNumber(demandForecast.next_7_days).toFixed(1)} requests for 7 days and ${getNumber(demandForecast.next_30_days).toFixed(1)} for 30 days. Item demand uses only configured service-item mappings and average genuine issued quantity per ticket.${availabilityNote}`
        : `No future quantity is currently calculated because no model has passed every validation gate. The planned method forecasts service demand by service, validates it on unseen historical months, and then translates it through genuine ticket-linked item usage and configured service-item requirements. Current evidence includes ${getNumber(forecastReadiness.request_count)} genuine requests, ${getNumber(forecastReadiness.history_months).toFixed(1)} months of service history, ${getNumber(itemDemandReadiness.ticket_linked_issue_transactions)} ticket-linked issue transactions, and ${getNumber(itemDemandReadiness.requirement_mappings)} service-item mappings.${availabilityNote}`,
      'forecasting readiness contract',
      forecasting?.workspace ? 'high' : 'medium'
    );
  }

  if (includesAny(normalizedQuestion, ['accuracy', 'accurate', 'confidence', 'error rate', 'forecast error'])) {
    const publishedModels = (demandForecast.service_models || []).filter((row) => row.published);
    const accuracySummary = publishedModels.map((row) => `${row.service_type}: WAPE ${row.metrics?.wape_percent}% across ${row.holdout_months} holdout months`).join('; ');
    return withSource(
      forecastAvailable
        ? `The system reports holdout error, not invented confidence. ${accuracySummary || 'Validated error evidence is stored for the published service models.'} Lower WAPE is better, and every published model must stay within the configured error and baseline-comparison limits.${availabilityNote}`
        : `Forecast accuracy and confidence are unavailable because no current model has passed training, backtesting, freshness, and publication checks. ${forecastReadiness.reason || 'The service-history gate is not met'} ${itemDemandReadiness.reason || ''}`.trim(),
      'forecasting model status',
      forecasting?.workspace ? 'high' : 'medium'
    );
  }

  if (includesAny(normalizedQuestion, ['real workflow', 'actual workflow', 'workflow now', 'system flow', 'flow right', 'real world'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (
    includesAny(normalizedQuestion, ['pre current post', 'pre/current/post', 'pre service', 'current service', 'post service', 'pre-install', 'pre installation', 'site survey', 'survey first', 'area first', 'before installing'])
  ) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['checklist flow', 'inspection flow', 'technician checklist', 'job checklist'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['automatic notification', 'auto notification', 'auto notif', 'auto email', 'automatically send', 'email test', 'smtp test'])) {
    return 'Automatic communication currently includes in-app notifications for major workflow events and SMTP email for configured notification paths such as password reset and selected ticket/client/technician updates. Email is not magic by itself: it sends only when backend code calls the email helper and SMTP settings are valid. To test it, trigger a real workflow event or use the backend email helper/test path with a known recipient, then check inbox and spam.';
  }

  if (includesAny(normalizedQuestion, ['pwa phone', 'phone test', 'ngrok', 'lan ip', 'mobile test', 'install pwa'])) {
    return 'For phone testing: run Django on 0.0.0.0:8000, build the frontend with build:pythonanywhere, then open either the laptop LAN URL or the ngrok HTTPS URL on the phone. LAN works only when both devices can reach each other on the same network. Ngrok is better for phone demos because HTTPS also helps browser permissions like GPS and PWA behavior.';
  }

  if (includesAny(normalizedQuestion, ['system', 'overall', 'dashboard', 'snapshot', 'status'])) {
    const total = analytics?.totalRequests ?? overview.totalRequests ?? 0;
    const completed = analytics?.completedRequests ?? overview.completedRequests ?? 0;
    const pending = analytics?.pendingRequests ?? overview.pendingRequests ?? 0;
    return withSource(
      `Current system snapshot: ${plural(total, 'request')}, ${completed} completed, ${pending} pending, ${plural(activeTickets, 'active ticket')}, and ${plural(availableTechnicians, 'available technician')}. ${forecastAvailable ? `The validated outlook estimates ${getNumber(demandForecast.next_30_days).toFixed(1)} requests over the next 30 days.` : 'Forecast quantities are unavailable until the evidence and model-validation gates are met.'}${availabilityNote}`,
      'live dashboard data and forecasting readiness',
      analytics && dashboardStats ? 'high' : 'medium'
    );
  }

  if (includesAny(normalizedQuestion, ['pending', 'approval', 'approve', 'request queue'])) {
    const firstPending = pendingRequests[0];
    return withSource(
      firstPending
        ? `There are ${plural(pendingCount, 'pending approval')}. Oldest visible request: #${firstPending.id} from ${firstPending.client || 'a client'} for ${firstPending.service_type || 'a service'}. Review it from Admin Dashboard or Service Tickets.${availabilityNote}`
        : `There are no pending approvals right now. New client requests will appear on the Admin Dashboard and Service Tickets page.${availabilityNote}`,
      'live dashboard data',
      dashboardStats ? 'high' : 'medium'
    );
  }

  if (includesAny(normalizedQuestion, ['where', 'open', 'page', 'route', 'link', 'go to'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['sla', 'overdue', 'delay', 'late', 'breach'])) {
    const firstRisk = slaQueue[0];
    if (overdueSla || warningSla) {
      return withSource(
        `SLA watchlist: ${plural(overdueSla, 'overdue item')} and ${plural(warningSla, 'warning item')}. ${firstRisk ? `Top priority is ${firstRisk.entity_type || 'item'} #${firstRisk.id} for ${firstRisk.client || 'a client'} (${firstRisk.service_type || 'service not set'}).` : 'Open the SLA Watchlist on the dashboard for details.'}${availabilityNote}`,
        'live dashboard SLA data',
        dashboardStats ? 'high' : 'medium'
      );
    }
    return withSource(
      `The SLA queue is clear right now. No warning or overdue service items are currently flagged.${availabilityNote}`,
      'live dashboard SLA data',
      dashboardStats ? 'high' : 'medium'
    );
  }

  if (includesAny(normalizedQuestion, ['city', 'province', 'location completion', 'city completion', 'province completion'])) {
    const topCity = cityCompletionTrends[0];
    const topProvince = provinceCompletionTrends[0];
    if (topCity || topProvince) {
      const cityStr = topCity ? `${topCity.label} (${topCity.completedCount} completed)` : '';
      const provStr = topProvince ? `${topProvince.label} (${topProvince.completedCount} completed)` : '';
      return withSource(
        `Location completion trends: ${cityStr ? `Top city is ${cityStr}. ` : ''}${provStr ? `Top province is ${provStr}.` : ''}`,
        'analytics location trends',
        'high'
      );
    }
    return withSource('No location completion trends are available yet.', 'analytics location trends', 'medium');
  }

  if (includesAny(normalizedQuestion, ['busiest month', 'busiest week', 'busiest time'])) {
    const topMonth = busiestMonths[0];
    const topWeek = busiestWeeks[0];
    if (topMonth || topWeek) {
      const monthStr = topMonth ? `${topMonth.label} (${topMonth.requestCount} requests)` : '';
      const weekStr = topWeek ? `${topWeek.label} (${topWeek.requestCount} requests)` : '';
      return withSource(
        `Historical peak periods: ${monthStr ? `Busiest month was ${monthStr}. ` : ''}${weekStr ? `Busiest week was ${weekStr}.` : ''}`,
        'analytics historical peaks',
        'high'
      );
    }
    return withSource('No historical peak periods available yet.', 'analytics historical peaks', 'medium');
  }

  if (includesAny(normalizedQuestion, ['top requested service', 'top requested', 'most requested'])) {
    const topRequested = topRequestedServiceTypes[0];
    if (topRequested) {
      const allTop = topRequestedServiceTypes.slice(0, 3).map(s => `${s.serviceType} (${s.requestCount})`).join(', ');
      return withSource(
        `Top requested services: ${allTop}.`,
        'analytics service requests',
        'high'
      );
    }
    return withSource('No requested service history available yet.', 'analytics service requests', 'medium');
  }

  if (includesAny(normalizedQuestion, ['busiest', 'peak'])) {
    return withSource(
      historySummary.peak_month
        ? `The highest historical month in the genuine request evidence is ${historySummary.peak_month}, with ${plural(historySummary.peak_month_requests || 0, 'request')}. This is historical, not a prediction.${availabilityNote}`
        : `There is no historical peak month available yet.${availabilityNote}`,
      'historical genuine service requests',
      forecasting?.workspace ? 'high' : 'low'
    );
  }

  if (includesAny(normalizedQuestion, ['future demand by area', 'area demand', 'location demand', 'hotspot', 'hotspots', 'heatmap forecast', 'demand heatmap', 'where demand', 'which area', 'what area'])) {
    const projectedLocations = demandForecast.location_outlook || [];
    if (forecastAvailable && projectedLocations.length) {
      const allocation = projectedLocations.slice(0, 3).map((item) => `${item.city}${item.province ? `, ${item.province}` : ''} · ${item.service_type}: ${getNumber(item.allocated_30_day_requests).toFixed(1)} allocated requests`).join('; ');
      return withSource(
        `The validated 30-day service outlook, allocated using each area's latest genuine historical share, is: ${allocation}. This is a historical-share allocation of the service forecast, not a separately trained geographic model.${availabilityNote}`,
        'validated service forecast and historical location density',
        'high'
      );
    }
    const topHotspot = historicalLocations[0];
    if (!topHotspot) {
      return withSource(
        `I do not have enough service-location history to describe demand concentration, and no validated area forecast exists.${availabilityNote}`,
        'historical service-location density',
        analytics ? 'low' : 'low'
      );
    }

    const visibleHotspots = historicalLocations.slice(0, 3).map((item) => {
      const label = [item.location__city, item.location__province].filter(Boolean).join(', ');
      return `${label || 'Unspecified location'} — ${item.service_type__name || 'Unspecified service'}: ${plural(item.requests || 0, 'historical request')}`;
    });

    return withSource(
      `Historical service-location concentration: ${visibleHotspots.join('; ')}. These are recorded requests, not projected future demand. ${forecastReadiness.reason || 'No validated location forecast exists.'}${availabilityNote}`,
      'historical service-location density and forecasting readiness',
      forecasting?.workspace ? 'high' : 'low'
    );
  }

  if (
    normalizedQuestion.includes('most active') ||
    normalizedQuestion.includes('active tech') ||
    normalizedQuestion.includes('active technician') ||
    normalizedQuestion.includes('busiest tech') ||
    normalizedQuestion.includes('busiest technician')
  ) {
    if (!mostActiveTechnician) {
      return withSource(
        'I do not have technician performance data yet. Open Analytics or tap refresh so I can reload the latest performance breakdown.',
        'technician performance endpoint',
        'low'
      );
    }
    const workload = Number(mostActiveTechnician.active_jobs || 0) + Number(mostActiveTechnician.completed_jobs || 0);
    return withSource(
      `${getTechnicianName(mostActiveTechnician)} is the most active technician for ${performancePeriodLabel}, with ${workload} tracked job${workload === 1 ? '' : 's'}: ${mostActiveTechnician.active_jobs || 0} active and ${mostActiveTechnician.completed_jobs || 0} completed.`,
      'technician performance endpoint',
      'high'
    );
  }

  if (
    normalizedQuestion.includes('best technician') ||
    normalizedQuestion.includes('top technician') ||
    normalizedQuestion.includes('top tech') ||
    normalizedQuestion.includes('best tech') ||
    normalizedQuestion.includes('performer')
  ) {
    if (bestRatedTechnician) {
      return withSource(
        `${getTechnicianName(bestRatedTechnician)} is the best-rated technician for ${performancePeriodLabel}, with an average rating of ${bestRatedTechnician.avg_rating}. Completed jobs: ${bestRatedTechnician.completed_jobs || 0}.`,
        'technician performance endpoint',
        'high'
      );
    }
    if (topCompletedTechnician) {
      return withSource(
        `${getTechnicianName(topCompletedTechnician)} is the top performer by completed jobs for ${performancePeriodLabel}, with ${topCompletedTechnician.completed_jobs || 0} completed job${Number(topCompletedTechnician.completed_jobs || 0) === 1 ? '' : 's'}. Ratings are not available yet.`,
        'technician performance endpoint',
        'medium'
      );
    }
    return withSource(
      'No technician performance data is available yet. Completed jobs and ratings will make this answer more useful.',
      'technician performance endpoint',
      'low'
    );
  }

  if (
    normalizedQuestion.includes('completed') &&
    (normalizedQuestion.includes('tech') || normalizedQuestion.includes('technician'))
  ) {
    if (!topCompletedTechnician) {
      return withSource('No completed technician job data is available yet.', 'technician performance endpoint', 'low');
    }
    return withSource(
      `${getTechnicianName(topCompletedTechnician)} has the most completed jobs for ${performancePeriodLabel}, with ${topCompletedTechnician.completed_jobs || 0} completed job${Number(topCompletedTechnician.completed_jobs || 0) === 1 ? '' : 's'}.`,
      'technician performance endpoint',
      'high'
    );
  }

  if (includesAny(normalizedQuestion, ['dispatch', 'assign', 'assignment', 'schedule', 'scheduled', 'queue'])) {
    const nextSchedule = clientSchedule[0];
    return withSource(
      nextSchedule
        ? `Dispatch status: ${plural(activeTickets, 'active ticket')}, ${plural(clientSchedule.length, 'visible scheduled job')}, and ${plural(activeTechnicianJobs.length, 'active technician job')}. Next visible schedule is ticket #${nextSchedule.id} for ${nextSchedule.client || 'a client'}${nextSchedule.assigned_technician ? ` assigned to ${nextSchedule.assigned_technician}` : ' with no technician shown yet'}.${availabilityNote}`
        : `Dispatch status: ${plural(activeTickets, 'active ticket')} and no upcoming scheduled jobs visible in the dashboard list. Use the Dispatch Board to assign or adjust technician work.${availabilityNote}`,
      'live dashboard dispatch data',
      dashboardStats ? 'high' : 'medium'
    );
  }

  if (includesAny(normalizedQuestion, ['technician', 'capacity', 'staff', 'available'])) {
    return withSource(
      `There are ${plural(availableTechnicians, 'available technician')} in the current dashboard snapshot. The assistant cannot claim a future staffing gap because no validated demand forecast exists.${availabilityNote}`,
      'live technician availability and forecasting readiness',
      analytics && dashboardStats ? 'high' : 'medium'
    );
  }

  if (
    requestedMonth &&
    includesAny(normalizedQuestion, ['service', 'requested', 'request', 'highest', 'demand', 'popular'])
  ) {
    if (!monthlyServiceBreakdown.length) {
      return withSource(
        `I understand you are asking about ${requestedMonth.monthName}, but monthly service breakdown data is not loaded yet. Tap refresh and ask again.`,
        'analytics monthly breakdown',
        'low'
      );
    }
    if (!requestedMonthBreakdown) {
      return withSource(
        `I do not have ${requestedMonth.monthName} in the loaded analytics window yet. Use Analytics with a wider period if you need older months.`,
        'analytics monthly breakdown',
        'medium'
      );
    }

    const topMonthlyService = requestedMonthBreakdown.topService;
    if (!topMonthlyService || !Number(topMonthlyService.requestCount || 0)) {
      return withSource(
        `No service requests are recorded for ${requestedMonthBreakdown.label}.`,
        'analytics monthly breakdown',
        'high'
      );
    }

    const otherServices = Array.isArray(requestedMonthBreakdown.services)
      ? requestedMonthBreakdown.services
          .filter((item) => item.serviceType !== topMonthlyService.serviceType)
          .slice(0, 2)
          .map((item) => `${item.serviceType} (${item.requestCount})`)
      : [];
    return withSource(
      `${topMonthlyService.serviceType} was the most requested service in ${requestedMonthBreakdown.label}, with ${plural(topMonthlyService.requestCount || 0, 'request')}${topMonthlyService.completedCount ? ` and ${topMonthlyService.completedCount} completed` : ''}. ${otherServices.length ? `Next: ${otherServices.join(', ')}.` : 'No other service type is close in the loaded data.'}`,
      'analytics monthly breakdown',
      'high'
    );
  }

  if (includesAny(normalizedQuestion, ['service', 'highest', 'demand', 'forecast'])) {
    const topForecastService = (demandForecast.by_service || [])[0];
    if (forecastAvailable && topForecastService) {
      return withSource(
        `${topForecastService.service_type} has the highest published 30-day outlook at ${getNumber(topForecastService.next_30_days).toFixed(1)} expected requests, with ${getNumber(topForecastService.next_7_days).toFixed(1)} expected in the next 7 days. Its holdout WAPE is ${topForecastService.wape_percent}%. These values are estimates from a validated seasonal-trend model, not guaranteed sales.${availabilityNote}`,
        'validated demand forecast by service',
        'high'
      );
    }
    const topHistoricalService = historicalServiceMix[0];
    return withSource(
      topHistoricalService
        ? `${topHistoricalService.service_type__name || 'The leading service'} has the most genuine historical demand with ${plural(topHistoricalService.requests || 0, 'request')}. This is not a future forecast. ${forecastReadiness.reason || 'No validated forecast exists.'}${availabilityNote}`
        : `No genuine historical service-demand evidence is available, and no future forecast is generated.${availabilityNote}`,
      'historical service demand and forecasting readiness',
      forecasting?.workspace ? 'high' : 'low'
    );
  }

  if (includesAny(normalizedQuestion, ['risk', 'problem', 'warning', 'attention', 'issue'])) {
    if (overdueSla || warningSla || lowStock || dueMaintenance || overdueCases) {
      return withSource(
        `Current attention signals: ${plural(overdueSla, 'overdue SLA item')}, ${plural(warningSla, 'SLA warning')}, ${plural(lowStock, 'low-stock item')}, ${plural(dueMaintenance, 'due maintenance item')}, and ${plural(overdueCases, 'overdue after-sales case')}.${availabilityNote}`,
        'live dashboard data',
        dashboardStats ? 'high' : 'medium'
      );
    }
    return withSource(
      `No service type is currently marked high risk, and the main dashboard attention counters are clear.${availabilityNote}`,
      'live dashboard data and analytics trend',
      analytics && dashboardStats ? 'high' : 'medium'
    );
  }

  if (includesAny(normalizedQuestion, ['inventory', 'stock', 'item', 'parts', 'materials'])) {
    const linkedItem = historicalItems[0];
    if (linkedItem) {
      return withSource(
        `${linkedItem.item__name || linkedItem.item__sku || 'The leading item'} has the highest recorded ticket-linked consumption with ${plural(linkedItem.quantity || 0, 'unit')} issued across ${plural(linkedItem.transactions || 0, 'transaction')}. Future item quantities are unavailable. Readiness currently has ${getNumber(itemDemandReadiness.ticket_linked_issue_transactions)} linked issues, ${getNumber(itemDemandReadiness.linked_issue_active_months)} active usage months, and ${getNumber(itemDemandReadiness.requirement_mappings)} requirement mappings. Dashboard stock alerts: ${plural(lowStock, 'low-stock item')} and ${plural(outOfStock, 'out-of-stock item')}.${availabilityNote}`,
        'ticket-linked historical item consumption and demand readiness',
        forecasting?.workspace && dashboardStats ? 'high' : 'medium'
      );
    }
    if (topInventoryCategory) {
      return withSource(
        `${topInventoryCategory.category} is the strongest inventory category signal, with ${plural(topInventoryCategory.quantity || 0, 'unit')} consumed. Dashboard stock alerts: ${plural(lowStock, 'low-stock item')} and ${plural(outOfStock, 'out-of-stock item')}.${availabilityNote}`,
        'analytics inventory demand and dashboard stock data',
        analytics && dashboardStats ? 'high' : 'medium'
      );
    }
    return withSource(
      `No ticket-linked issued-item history is available for a reliable consumption breakdown. Future quantities remain unavailable. Current stock alerts: ${plural(lowStock, 'low-stock item')} and ${plural(outOfStock, 'out-of-stock item')}.${availabilityNote}`,
      'ticket-linked item consumption readiness and dashboard stock data',
      analytics && dashboardStats ? 'high' : 'medium'
    );
  }

  if (includesAny(normalizedQuestion, ['maintenance', 'warranty', 'follow up', 'follow-up', 'after sales', 'after-sales', 'case'])) {
    const nextMaintenance = maintenanceQueue[0];
    if (includesAny(normalizedQuestion, ['maintenance', 'warranty'])) {
      return nextMaintenance
        ? `Maintenance status: ${plural(dueMaintenance, 'due item')} and ${plural(dueSoonMaintenance, 'due-soon item')}. Next visible item is for ${nextMaintenance.client || 'a client'} (${nextMaintenance.service_type || 'service not set'}) due on ${nextMaintenance.next_due_date || 'the recorded due date'}.`
        : `Maintenance status: ${plural(dueMaintenance, 'due item')} and ${plural(dueSoonMaintenance, 'due-soon item')}. No maintenance queue rows are visible right now.`;
    }
    return `After-sales status: ${plural(openCases, 'open case')} and ${plural(overdueCases, 'overdue case')}. ${afterSalesCases[0] ? `Recent case: ${afterSalesCases[0].summary || `#${afterSalesCases[0].id}`}.` : 'Use After-Sales Cases to review follow-ups.'}`;
  }

  if (includesAny(normalizedQuestion, ['gps', 'map', 'maps', 'location', 'tracking', 'route'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['notification', 'notif', 'email', 'smtp', 'forgot password', 'reset password', 'password'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['pwa', 'install', 'offline', 'app', 'phone', 'mobile'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['checklist', 'inspection', 'step', 'proof', 'finish', 'finished', 'completed job'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['report', 'reports', 'analytics', 'chart', 'paper', 'chapter'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['user', 'account', 'role', 'permission', 'capability', 'client', 'admin', 'superadmin'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['client flow', 'customer', 'service request', 'request flow', 'process'])) {
    return withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high');
  }

  if (includesAny(normalizedQuestion, ['summary', 'week'])) {
    return withSource(
      forecastAvailable
        ? `The validated outlook estimates ${getNumber(demandForecast.next_7_days).toFixed(1)} service requests in the next 7 days and ${getNumber(demandForecast.next_30_days).toFixed(1)} in the next 30 days. Historical evidence contains ${plural(forecastReadiness.request_count || 0, 'genuine request')} across ${getNumber(forecastReadiness.history_months).toFixed(1)} months${historySummary.peak_month ? `, with ${historySummary.peak_month} as the highest recorded month` : ''}.${availabilityNote}`
        : `Forecast quantities are unavailable because the evidence and model-validation gates are not met. Historical evidence contains ${plural(forecastReadiness.request_count || 0, 'genuine request')} across ${getNumber(forecastReadiness.history_months).toFixed(1)} months${historySummary.peak_month ? `, with ${historySummary.peak_month} as the highest recorded month` : ''}. ${itemDemandReadiness.reason || forecastReadiness.reason || ''}${availabilityNote}`,
      'forecasting readiness and historical evidence',
      forecasting?.workspace ? 'high' : 'medium'
    );
  }

  return withSource(
    `I do not have a prepared answer for that exact question. Try asking about request trends, service or status counts, comparisons, historical service-location density, forecast readiness, ticket-linked item consumption, technician performance, SLA risk, inventory, scheduling, maintenance, or coverage. Current attention: ${plural(overdueSla, 'overdue SLA item')}, ${plural(warningSla, 'SLA warning')}, and ${plural(lowStock, 'low-stock item')}. ${forecastAvailable ? `A validated 30-day outlook of ${getNumber(demandForecast.next_30_days).toFixed(1)} requests is available.` : 'Future quantities are unavailable until a model is validated.'}${availabilityNote}`,
    'analytics fallback plus loaded dashboard and readiness data',
    analytics || dashboardStats ? 'medium' : 'low'
  );
}

export default function SystemAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [technicianPerformance, setTechnicianPerformance] = useState([]);
  const [technicianPerformanceAllTime, setTechnicianPerformanceAllTime] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: 'Ask me about AFN analytics: request and completion trends, comparisons, historical service-location density, forecast readiness, ticket-linked item consumption, technician performance, SLA risk, inventory, scheduling, maintenance, or coverage insights.'
    }
  ]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [data, forecastingData, dashboardData, performanceResponse, allTimePerformanceResponse] = await Promise.all([
        fetchAdminAnalytics(30),
        fetchAdminAnalytics({ days: 30, workspace: 'forecasting' }),
        fetchDashboardStats('admin'),
        api.get('/services/technician-performance/performance_breakdown/', { params: { days: 30 } }),
        api.get('/services/technician-performance/performance_breakdown/', { params: { period: 'all' } })
      ]);
      setAnalytics({ ...(data || {}), forecasting: forecastingData || {} });
      setDashboardStats(dashboardData || {});
      setTechnicianPerformance(Array.isArray(performanceResponse?.data) ? performanceResponse.data : []);
      setTechnicianPerformanceAllTime(Array.isArray(allTimePerformanceResponse?.data) ? allTimePerformanceResponse.data : []);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { sender: 'assistant', text: error.message || 'Unable to load analytics right now.' }
      ].slice(-8));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !analytics && !loading) {
      loadAnalytics();
    }
  }, [isOpen]);

  const askQuestion = async (question) => {
    const text = String(question || '').trim();
    if (!text) return;

    if (isSensitiveDisclosureRequest(text.toLowerCase())) {
      setMessages((current) => [
        ...current,
        { sender: 'user', text },
        {
          sender: 'assistant',
          text: withSource(
            'I cannot disclose passwords, tokens, secrets, raw credentials, private environment settings, or personal user data. I can explain how the feature works or where to configure it safely.',
            'assistant safety rules',
            'high'
          )
        }
      ].slice(-8));
      setInput('');
      return;
    }

    if (!isAnalyticsForecastQuestion(text.toLowerCase())) {
      setMessages((current) => [
        ...current,
        { sender: 'user', text },
        { sender: 'assistant', text: withSource(OUT_OF_SCOPE_RESPONSE, 'analytics assistant scope', 'high') }
      ].slice(-8));
      setInput('');
      return;
    }

    if (isDateRecordQuestion(text.toLowerCase())) {
      setMessages((current) => [
        ...current,
        { sender: 'user', text },
        { sender: 'assistant', text: 'Checking that date in the service records...' }
      ].slice(-8));
      setInput('');

      answerDateRecordQuestion(text)
        .then((answer) => {
          setMessages((current) => [
            ...current.slice(0, -1),
            { sender: 'assistant', text: answer || 'I could not read that date yet.' }
          ].slice(-8));
        })
        .catch((error) => {
          setMessages((current) => [
            ...current.slice(0, -1),
            { sender: 'assistant', text: error.message || 'Unable to check that date right now.' }
          ].slice(-8));
        });
      return;
    }

    const localAnswer = buildAssistantAnswer(text, analytics, technicianPerformance, dashboardStats, technicianPerformanceAllTime);
    setMessages((current) => [
      ...current,
      { sender: 'user', text },
      { sender: 'assistant', text: 'Reading the latest analytics and generating an answer...' }
    ].slice(-8));
    setInput('');

    try {
      const response = await fetchAdminAnalyticsAiSummary(30, text);
      const sourceLabel = response?.source === 'gemini' ? 'Gemini analytics explanation' : 'local analytics explanation';
      const answer = response?.source === 'gemini' && response?.summary
        ? withSource(response.summary, sourceLabel, response?.source === 'gemini' ? 'medium' : 'high')
        : localAnswer;
      setMessages((current) => [
        ...current.slice(0, -1),
        { sender: 'assistant', text: answer }
      ].slice(-8));
    } catch {
      setMessages((current) => [
        ...current.slice(0, -1),
        { sender: 'assistant', text: localAnswer }
      ].slice(-8));
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-3 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-white shadow-xl shadow-brand-900/20 transition hover:bg-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-200 sm:bottom-20 sm:right-5 lg:bottom-8 lg:right-8"
        aria-label="Open analytics assistant"
      >
        <FiMessageCircle size={24} />
      </button>
    );
  }

  return (
    <section className="fixed bottom-3 right-3 z-40 flex h-[min(540px,calc(100dvh-1.5rem))] w-[calc(100vw-1.5rem)] max-w-[31rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:bottom-6 sm:right-5 sm:h-[min(540px,calc(100dvh-3rem))] sm:w-[31rem] lg:bottom-8 lg:right-8">
      <div className="flex items-start gap-3 border-b border-slate-100 p-4">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-50 text-brand-600">
          <FiMessageCircle />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">Analytics Assistant</h3>
          <p className="mt-1 text-xs text-slate-500">Trends, comparisons, forecast readiness, item usage, technician performance, and SLA risk.</p>
        </div>
        <button
          type="button"
          onClick={loadAnalytics}
          disabled={loading}
          className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
          aria-label="Refresh assistant data"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          aria-label="Close system assistant"
        >
          <FiX />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="max-h-20 overflow-y-auto pr-1 flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => askQuestion(question)}
              disabled={loading}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-wait disabled:opacity-60"
            >
              {question}
            </button>
          ))}
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl bg-slate-50 p-3">
          {messages.map((message, index) => (
            <div key={`${message.sender}-${index}`} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`min-w-0 max-w-[92%] break-words [overflow-wrap:anywhere] rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.sender === 'user'
                  ? 'bg-brand-500 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}>
                {message.sender === 'assistant' ? (
                  <AssistantMessageText text={message.text} />
                ) : (
                  <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            askQuestion(input);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            placeholder="Ask about analytics or forecasts..."
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="Ask analytics assistant"
          >
            <FiSend />
          </button>
        </form>
      </div>
    </section>
  );
}
