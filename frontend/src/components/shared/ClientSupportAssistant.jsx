import { useEffect, useMemo, useRef, useState } from 'react';
import { FiMessageCircle, FiRefreshCw, FiRotateCcw, FiSend, FiX } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchCustomerSupportCases } from '../../api/api';
import { fetchClientRequests } from '../../api/client';
import { formatRequestId, formatSupportCaseId } from '../../utils/roleIds';
import DraggableAssistantButton from './DraggableAssistantButton';

const BASE_QUESTIONS = [
  'What is my latest request status?',
  'When is my next appointment?',
  'How do I request service?',
  'How do I contact support?',
  'Where can I see payments and purchases?'
];

const PAGE_CONTEXT = [
  { prefix: '/client/service-requests', label: 'Request Service', questions: ['What information do I need for a request?', 'Where do I track it after submitting?'] },
  { prefix: '/client/solar-estimates', label: 'Solar Estimates', questions: ['Is a solar estimate a final quotation?', 'How do I request a site assessment?'] },
  { prefix: '/client/requests/', label: 'Request Details', questions: ['Can I reschedule my visit?', 'Can I cancel my request?', 'Who is my technician?'] },
  { prefix: '/client/requests', label: 'My Requests', questions: ['What is my latest request status?', 'When is my next appointment?', 'Who is my technician?'] },
  { prefix: '/client/service-history', label: 'Service History', questions: ['Is any warranty active?', 'When is my maintenance due?', 'How do I leave feedback?'] },
  { prefix: '/client/purchase-records', label: 'Purchase Records', questions: ['Where can I see payments and purchases?', 'Is this an official receipt?'] },
  { prefix: '/client/support', label: 'Client Support', questions: ['How many support cases are open?', 'How do I start a new support case?'] },
  { prefix: '/client/notifications', label: 'Notifications', questions: ['What notifications will I receive?', 'How do I check my request status?'] },
  { prefix: '/client/profile', label: 'Profile', questions: ['How do I update my contact details?', 'How do I change my password?'] },
  { prefix: '/client/dashboard', label: 'Dashboard', questions: ['What is my latest request status?', 'When is my next appointment?'] },
];

const CLOSED_REQUEST_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'rejected', 'closed']);
const CLOSED_SUPPORT_STATUSES = new Set(['resolved', 'closed']);

const normalizedStatus = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const formatStatus = (value) => String(value || 'pending').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

const formatDate = (value) => {
  if (!value) return '';
  const raw = String(value);
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const containsAny = (text, terms) => terms.some((term) => text.includes(term));
const detailPath = (request) => `/client/requests/${request.id}?entity=request`;
const requestService = (request) => request?.service_type_name || 'service request';
const requestCode = (request) => formatRequestId(request?.request_id || request?.id);
const appointmentTime = (request) => {
  if (request?.scheduled_time_slot) return formatStatus(request.scheduled_time_slot);
  if (request?.scheduled_time) return String(request.scheduled_time).slice(0, 5);
  return 'time to be confirmed';
};

const requestSummary = (request) => {
  const stage = request.workflow_label || request.progress_label || formatStatus(request.status);
  const operational = request.ticket_status && normalizedStatus(request.ticket_status) !== normalizedStatus(request.status)
    ? ` Current work status: ${formatStatus(request.ticket_status)}.`
    : '';
  const technician = request.technician_name ? ` Assigned technician: ${request.technician_name}.` : '';
  return `${requestCode(request)} is for ${requestService(request)}. ${stage}.${operational}${technician}`;
};

const findReferencedRequest = (question, requests) => {
  const requestMatch = question.match(/\breq(?:uest)?[\s#-]*(\d+)\b/i);
  if (requestMatch) return requests.find((request) => Number(request.id) === Number(requestMatch[1])) || null;
  const ticketMatch = question.match(/(?:tkt|ticket)[\s#-]*(\d+)/i);
  if (ticketMatch) return requests.find((request) => Number(request.ticket_id) === Number(ticketMatch[1])) || null;
  return null;
};

const response = (text, actions = []) => ({ text, actions });

const buildAnswer = (question, requests, supportCases, availability) => {
  const normalized = question.toLowerCase().trim();
  const latestRequest = requests[0] || null;
  const activeRequests = requests.filter((request) => !CLOSED_REQUEST_STATUSES.has(normalizedStatus(request.status)));
  const openCases = supportCases.filter((supportCase) => !CLOSED_SUPPORT_STATUSES.has(normalizedStatus(supportCase?.status)));
  const referencedRequest = findReferencedRequest(question, requests);

  if (containsAny(normalized, ['api key', 'secret', 'token', 'credential', 'other client', 'another client', 'all accounts'])) {
    return response("I cannot show passwords, secret keys, credentials, or another customer's information. I only use records available to your signed-in client account.", [{ label: 'Open profile', path: '/client/profile' }]);
  }

  if (containsAny(normalized, ['emergency', 'on fire', 'smoke', 'sparking', 'electric shock', 'electrocution', 'immediate danger'])) {
    return response('Move to a safe location and contact local emergency services if there is fire, smoke, sparking, electric-shock risk, or another immediate danger. Do not touch damaged electrical, battery, or solar equipment. Contact the office only after you are safe.', [{ label: 'Contact support', path: '/client/support' }]);
  }

  if (referencedRequest) {
    return response(requestSummary(referencedRequest), [{ label: `Open ${requestCode(referencedRequest)}`, path: detailPath(referencedRequest) }]);
  }

  if (/\b(req(?:uest)?|tkt|ticket)[\s#-]*\d+\b/i.test(question) && availability.requests) {
    return response('I could not find that request or ticket in your account. Check the number in My Requests. For privacy, I cannot look up another client’s records.', [{ label: 'View my requests', path: '/client/requests' }]);
  }

  if (containsAny(normalized, ['track it after', 'where is my requests', 'where do i follow', 'track after submitting'])) {
    return response('Open My Requests after submitting. It shows office review, the current work stage, confirmed schedule, technician assignment, progress, and completed history for records available to your account.', [{ label: 'View my requests', path: '/client/requests' }]);
  }

  if (containsAny(normalized, ['latest', 'status', 'track', 'progress', 'request update', 'where is my request'])) {
    if (!availability.requests) return response('I could not refresh your request information. Use Refresh in this assistant or open My Requests to retry securely.', [{ label: 'View my requests', path: '/client/requests' }]);
    if (!latestRequest) return response('You do not have a service request yet. Start one from Request Service, then track office review and field work from My Requests.', [{ label: 'Request service', path: '/client/service-requests' }]);
    return response(`${requestSummary(latestRequest)} You currently have ${activeRequests.length} active ${activeRequests.length === 1 ? 'request' : 'requests'}.`, [{ label: `Open ${requestCode(latestRequest)}`, path: detailPath(latestRequest) }, { label: 'View all requests', path: '/client/requests' }]);
  }

  if (containsAny(normalized, ['appointment', 'schedule', 'scheduled', 'next visit', 'technician arrive', 'when is my visit'])) {
    if (!availability.requests) return response('I could not refresh your appointment information. Open My Requests to retry or ask the office to confirm the schedule.', [{ label: 'View my requests', path: '/client/requests' }, { label: 'Contact support', path: '/client/support' }]);
    const today = localDateKey();
    const scheduledRequest = [...activeRequests]
      .filter((request) => request.scheduled_date && String(request.scheduled_date).slice(0, 10) >= today)
      .sort((left, right) => String(left.scheduled_date).localeCompare(String(right.scheduled_date)))[0];
    if (!scheduledRequest) return response('I cannot find an upcoming confirmed appointment in your current requests. A preferred date is not a confirmed visit; the office can confirm availability.', [{ label: 'View my requests', path: '/client/requests' }, { label: 'Contact support', path: '/client/support' }]);
    return response(`Your next confirmed appointment is ${requestCode(scheduledRequest)} on ${formatDate(scheduledRequest.scheduled_date)}, ${appointmentTime(scheduledRequest)}. ${scheduledRequest.technician_name ? `Assigned technician: ${scheduledRequest.technician_name}.` : 'The assigned technician is not visible yet.'}`, [{ label: 'Open appointment', path: detailPath(scheduledRequest) }]);
  }

  if (containsAny(normalized, ['who is my technician', 'assigned technician', 'technician contact', 'who will visit'])) {
    const assigned = activeRequests.find((request) => request.technician_name);
    if (!availability.requests) return response('I could not refresh assignment information. Open My Requests to retry.', [{ label: 'View my requests', path: '/client/requests' }]);
    if (!assigned) return response('No technician assignment is visible on your active requests yet. The office assigns the technician after review and scheduling.', [{ label: 'View my requests', path: '/client/requests' }]);
    return response(`${assigned.technician_name} is assigned to ${requestCode(assigned)} for ${requestService(assigned)}. Use the request details for the latest assignment and schedule.`, [{ label: 'Open request', path: detailPath(assigned) }]);
  }

  if (containsAny(normalized, ['reschedule', 'change schedule', 'change appointment', 'different date'])) {
    return response('Open the request and use Request reschedule when that action is available. Enter your reason and preferred date/time. This sends a request to the office; it does not change the confirmed schedule until the office approves it.', [{ label: 'View my requests', path: '/client/requests' }, { label: 'Contact support', path: '/client/support' }]);
  }

  if (containsAny(normalized, ['cancel request', 'cancel my', 'dismiss request', 'withdraw request'])) {
    return response('Open the request and use Dismiss request if work has not started. Once a technician is travelling, on site, or working, contact the office instead. Dismissal closes the request and should include a reason.', [{ label: 'View my requests', path: '/client/requests' }, { label: 'Contact support', path: '/client/support' }]);
  }

  if (containsAny(normalized, ['feedback', 'rating', 'review service', 'rate technician'])) {
    return response('Feedback becomes available on completed work. Open Service History, select the completed service, and submit the rating and comments shown there.', [{ label: 'Open service history', path: '/client/service-history' }]);
  }

  if (containsAny(normalized, ['request service', 'new request', 'book service', 'need for a request', 'information do i need', 'submit request', 'track it after submitting'])) {
    return response('Open Request Service, choose the service, describe the work, provide the service location and preferred schedule, review the summary, then submit. The preferred date is a request—not a confirmed appointment. Track office review afterward in My Requests.', [{ label: 'Request service', path: '/client/service-requests' }, { label: 'View my requests', path: '/client/requests' }]);
  }

  if (containsAny(normalized, ['profile', 'contact details', 'phone number', 'email address', 'change password', 'update password', 'my password'])) {
    return response('Profile lets you update your own contact details and profile photo. Password & Security requires your current password before saving a new one. Use Forgot Password from sign-in if you cannot access the current password.', [{ label: 'Open profile', path: '/client/profile' }]);
  }

  if (containsAny(normalized, ['support case', 'support', 'human', 'agent', 'complaint', 'concern', 'help desk', 'contact', 'office reply'])) {
    if (containsAny(normalized, ['how many', 'open case', 'case status']) && availability.supportCases) {
      const newest = supportCases[0];
      const newestText = newest ? ` Latest: ${formatSupportCaseId(newest.id)} is ${formatStatus(newest.status)}.` : '';
      return response(`You have ${openCases.length} open support ${openCases.length === 1 ? 'case' : 'cases'}.${newestText}`, [{ label: 'Open client support', path: '/client/support' }]);
    }
    return response(availability.supportCases ? `Client Support connects you with the office. You currently have ${openCases.length} open ${openCases.length === 1 ? 'case' : 'cases'}. Start a new case with a category, priority, related request, and clear message, or open an existing case to continue the conversation.` : 'Client Support connects you with the office. I could not refresh your case count, but the support page will retry securely.', [{ label: 'Contact support', path: '/client/support' }]);
  }

  if (containsAny(normalized, ['warranty', 'after sales', 'after-sales'])) {
    if (!availability.requests) return response('I could not refresh warranty information. Open Service History to retry or ask the office for an account review.', [{ label: 'View service history', path: '/client/service-history' }]);
    const warrantyRequests = requests.filter((request) => normalizedStatus(request.warranty_status) === 'active');
    if (!warrantyRequests.length) return response('I do not see an active warranty in your current portal records. This is not a denial of coverage; contact the office to review documents or older records.', [{ label: 'View service history', path: '/client/service-history' }, { label: 'Contact support', path: '/client/support' }]);
    const nearestEnd = warrantyRequests.filter((request) => request.warranty_end_date).sort((a, b) => String(a.warranty_end_date).localeCompare(String(b.warranty_end_date)))[0];
    return response(`I found ${warrantyRequests.length} ${warrantyRequests.length === 1 ? 'service with an active warranty' : 'services with active warranties'}.${nearestEnd ? ` ${requestCode(nearestEnd)} is recorded through ${formatDate(nearestEnd.warranty_end_date)}.` : ''}`, [{ label: 'View service history', path: '/client/service-history' }, { label: 'Report a concern', path: '/client/support' }]);
  }

  if (containsAny(normalized, ['maintenance', 'next service', 'service due'])) {
    if (!availability.requests) return response('I could not refresh maintenance information. Open Service History to retry.', [{ label: 'View service history', path: '/client/service-history' }]);
    const scheduled = requests.filter((request) => request.maintenance_schedule?.next_due_date).sort((a, b) => String(a.maintenance_schedule.next_due_date).localeCompare(String(b.maintenance_schedule.next_due_date)))[0];
    if (!scheduled) return response('No next maintenance date is recorded in your current service history. Ask the office whether your equipment needs a maintenance plan.', [{ label: 'View service history', path: '/client/service-history' }, { label: 'Contact support', path: '/client/support' }]);
    return response(`The next recorded maintenance date is ${formatDate(scheduled.maintenance_schedule.next_due_date)} for ${requestCode(scheduled)} (${requestService(scheduled)}).`, [{ label: 'View service history', path: '/client/service-history' }]);
  }

  if (containsAny(normalized, ['solar', 'estimate', 'quotation', 'quote', 'site assessment'])) {
    return response('Solar Estimates provides a saved preliminary calculation. It is not a final quotation or site assessment. Review the estimate, then request an on-site assessment or contact the office for confirmed scope and pricing.', [{ label: 'Open solar estimates', path: '/client/solar-estimates' }, { label: 'Request service', path: '/client/service-requests' }]);
  }

  if (containsAny(normalized, ['purchase', 'purchased', 'delivered', 'product record', 'service record', 'bill', 'billing', 'payment', 'invoice', 'receipt', 'refund', 'price', 'cost'])) {
    return response('Purchase Records shows confirmed delivered products/services, the recorded contract value, and payments the office has recorded. Payments happen outside the portal. The page is not an official receipt; contact the office for receipts, refunds, warranties, or corrections.', [{ label: 'View purchase records', path: '/client/purchase-records' }, { label: 'Contact support', path: '/client/support' }]);
  }

  if (containsAny(normalized, ['notification', 'alert', 'updates will i receive'])) {
    return response('Notifications contains account, request, schedule, service, support, purchase-record, and maintenance updates created for your account. Open a notification to follow its related record when a link is available.', [{ label: 'View notifications', path: '/client/notifications' }]);
  }

  if (containsAny(normalized, ['install app', 'installable', 'add to home', 'mobile app', 'pwa'])) {
    return response('On a supported browser, use the Install button in the top bar when it appears. The deployed site must use HTTPS and the app must not already be installed. On iPhone or iPad, use Safari Share → Add to Home Screen.');
  }

  if (containsAny(normalized, ['offline', 'without internet', 'no internet'])) {
    return response('The installed app can reopen its saved interface, but live requests, messages, schedules, payments, and record changes still require an internet connection. Do not assume an offline submission was sent.');
  }

  if (containsAny(normalized, ['what can you do', 'help me', 'assistant'])) {
    return response('I can explain this client portal and summarize records available to your account: requests, progress, appointments, technician assignments, support cases, warranties, maintenance, purchases, payments recorded by the office, notifications, profile security, and app installation. I cannot change records or act as a human representative.', [{ label: 'Contact the office', path: '/client/support' }]);
  }

  return response('I did not confidently match that question. I can help with request status, appointments, technicians, rescheduling, cancellation, support cases, warranties, maintenance, solar estimates, purchases, recorded payments, notifications, profile security, and app installation. For account-specific decisions, contact the office.', [{ label: 'View my requests', path: '/client/requests' }, { label: 'Contact support', path: '/client/support' }]);
};

const initialMessages = [{ sender: 'assistant', text: 'Hi! I can explain the client portal and summarize service records available to your account. I cannot change records or replace the office team.' }];

export default function ClientSupportAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const messageListRef = useRef(null);
  const inputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [requests, setRequests] = useState([]);
  const [supportCases, setSupportCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [availability, setAvailability] = useState({ requests: false, supportCases: false });
  const [messages, setMessages] = useState(initialMessages);

  const pageContext = useMemo(() => PAGE_CONTEXT.find((entry) => location.pathname.startsWith(entry.prefix)) || { label: 'Client Portal', questions: [] }, [location.pathname]);
  const quickQuestions = useMemo(() => [...new Set([...pageContext.questions, ...BASE_QUESTIONS])].slice(0, 7), [pageContext]);
  const partialFailure = dataLoaded && (!availability.requests || !availability.supportCases);

  const loadClientData = async () => {
    setLoading(true);
    const [requestResult, supportResult] = await Promise.allSettled([fetchClientRequests(), fetchCustomerSupportCases()]);
    setRequests(requestResult.status === 'fulfilled' ? requestResult.value : []);
    setSupportCases(supportResult.status === 'fulfilled' ? supportResult.value : []);
    setAvailability({ requests: requestResult.status === 'fulfilled', supportCases: supportResult.status === 'fulfilled' });
    setLastUpdated(new Date());
    setDataLoaded(true);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen && !dataLoaded && !loading) loadClientData();
  }, [isOpen, dataLoaded, loading]);

  useEffect(() => {
    if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && dataLoaded && !loading) inputRef.current?.focus();
  }, [isOpen, dataLoaded, loading]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  const askQuestion = (question) => {
    const text = String(question || '').trim();
    if (!text || loading || !dataLoaded) return;
    const answer = buildAnswer(text, requests, supportCases, availability);
    setMessages((current) => [...current, { sender: 'user', text }, { sender: 'assistant', ...answer }].slice(-20));
    setInput('');
  };

  const followAction = (path) => { setIsOpen(false); navigate(path); };
  const resetConversation = () => {
    setMessages(initialMessages);
    setInput('');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (!isOpen) {
    return <DraggableAssistantButton ariaLabel="Open client support assistant" storageKey="afn:client-assistant-position" onOpen={() => setIsOpen(true)}><FiMessageCircle size={24} /></DraggableAssistantButton>;
  }

  return (
    <section role="dialog" aria-modal="false" aria-labelledby="client-assistant-title" className="fixed bottom-3 right-3 z-40 flex h-[min(540px,calc(100dvh-1.5rem))] w-[calc(100vw-1.5rem)] max-w-[31rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:bottom-6 sm:right-5 sm:h-[min(540px,calc(100dvh-3rem))] sm:w-[31rem] lg:bottom-8 lg:right-8">
      <div className="flex items-start gap-2 border-b border-slate-100 p-3 sm:gap-3 sm:p-4">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-50 text-brand-600"><FiMessageCircle /></div>
        <div className="min-w-0 flex-1">
          <h2 id="client-assistant-title" className="text-base font-semibold text-slate-900">Client Support Assistant</h2>
          <p className="mt-0.5 truncate text-xs text-slate-500">Helping with {pageContext.label} · your account only</p>
          <p className={`mt-1 text-[0.7rem] font-medium ${partialFailure ? 'text-amber-700' : 'text-emerald-700'}`} role="status">{loading ? 'Refreshing your portal records…' : partialFailure ? 'Some records could not be refreshed' : lastUpdated ? `Records checked ${lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : 'Preparing your portal records…'}</p>
        </div>
        <button type="button" onClick={resetConversation} className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" aria-label="Start a new assistant conversation"><FiRotateCcw /></button>
        <button type="button" onClick={loadClientData} disabled={loading} className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60" aria-label="Refresh client assistant data"><FiRefreshCw className={loading ? 'animate-spin' : ''} /></button>
        <button type="button" onClick={() => setIsOpen(false)} className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" aria-label="Close client support assistant"><FiX /></button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
        <div className="flex shrink-0 gap-2 overflow-x-auto pb-1" aria-label="Suggested questions">
          {quickQuestions.map((question) => <button key={question} type="button" onClick={() => askQuestion(question)} disabled={!dataLoaded || loading} className="min-h-9 shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-wait disabled:opacity-60">{question}</button>)}
        </div>

        <div ref={messageListRef} role="log" aria-live="polite" aria-relevant="additions text" className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl bg-slate-50 p-3">
          {messages.map((message, index) => (
            <div key={`${message.sender}-${index}`} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[94%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.sender === 'user' ? 'bg-brand-500 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
                <p className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{message.text}</p>
                {message.actions?.length ? <div className="mt-3 flex flex-wrap gap-2">{message.actions.map((action) => <button key={`${action.label}-${action.path}`} type="button" onClick={() => followAction(action.path)} className="min-h-9 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100">{action.label}</button>)}</div> : null}
              </div>
            </div>
          ))}
          {loading ? <p className="text-center text-xs font-medium text-slate-500" role="status">Securely refreshing requests and support cases…</p> : null}
        </div>

        {partialFailure ? <p className="mt-2 text-xs text-amber-700">Answers that need unavailable records will say so. Use Refresh or open the related page to retry.</p> : null}

        <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); askQuestion(input); }}>
          <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={500} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100 sm:text-sm" placeholder="Ask about your request, visit, or account…" aria-label="Ask the client support assistant" disabled={!dataLoaded || loading} />
          <button type="submit" disabled={!dataLoaded || loading || !input.trim()} className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300" aria-label="Send question to client support assistant"><FiSend /></button>
        </form>
        <p className="mt-2 text-center text-[0.68rem] text-slate-500">Guidance only · confirm urgent, billing, warranty, and schedule decisions with the office.</p>
      </div>
    </section>
  );
}
