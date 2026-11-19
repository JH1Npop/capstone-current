import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { createCustomerSupportCase, fetchCustomerSupportCases, fetchMessages, fetchSupportContact, sendMessage } from '../../api/api';
import { fetchServiceTickets } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { FiArchive, FiMessageSquare, FiPlus, FiRefreshCw } from 'react-icons/fi';
import { formatRequestId, formatSupportCaseId } from '../../utils/roleIds';
import { MESSAGES_CHANGED_EVENT, startLiveRefresh } from '../../utils/liveUpdates';

const supportCategoryLabels = {
  general: 'Need support',
  billing: 'Purchase record',
  schedule: 'Schedule',
  technical: 'Technical help',
  complaint: 'Service concern',
  warranty: 'Warranty'
};

const CASE_STATUS_LABELS = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  closed: 'Closed',
};

const CASE_STATUS_STYLES = {
  open: 'bg-blue-50 text-blue-700',
  in_review: 'bg-amber-50 text-amber-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
};

const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

const supportCategorySubjectValues = Object.values(supportCategoryLabels);

const CLOSED_SUPPORT_STATUSES = ['resolved', 'closed'];
const isOpenSupportCase = (supportCase) => !CLOSED_SUPPORT_STATUSES.includes(String(supportCase?.status || '').toLowerCase());
const caseCode = (supportCase) => supportCase?.case_code || formatSupportCaseId(supportCase?.id);

const formatStamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `Today, ${date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
    : date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const emptyForm = () => ({ subject: '', category: 'general', priority: 'normal', ticket_id: '' });

function CaseStatus({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CASE_STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
      {CASE_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function ClientSupport() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const linkedCaseId = Number(searchParams.get('case') || 0);
  // "Report a problem" links (for example from the handover) open a new case already filled in:
  // ?ticket=<id>&category=<key>&subject=<text>.
  const prefillTicketId = searchParams.get('ticket') || '';
  const prefillCategory = searchParams.get('category') || '';
  const prefillSubject = searchParams.get('subject') || '';
  const [supportCases, setSupportCases] = useState([]);
  const [clientTickets, setClientTickets] = useState([]);
  const [activeSupportCase, setActiveSupportCase] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportForm, setSupportForm] = useState(emptyForm);
  const [supportText, setSupportText] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  useEffect(() => {
    let active = true;
    fetchSupportContact().then((address) => { if (active) setSupportEmail(address); });
    return () => { active = false; };
  }, []);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messageSending, setMessageSending] = useState(false);
  const [error, setError] = useState('');
  const [messageNotice, setMessageNotice] = useState('');
  const [showPastCases, setShowPastCases] = useState(false);
  const conversationRef = useRef(null);
  // While the client fills in a new case, background refreshes must not switch to another case.
  const composingNewRef = useRef(false);

  const supportGroupKey = activeSupportCase?.group_key || '';
  const openSupportCases = supportCases.filter(isOpenSupportCase);
  const pastSupportCases = supportCases.filter((supportCase) => !isOpenSupportCase(supportCase));
  const activeIsClosed = Boolean(activeSupportCase) && !isOpenSupportCase(activeSupportCase);
  const ticketsById = useMemo(() => new Map(clientTickets.map((ticket) => [Number(ticket.id), ticket])), [clientTickets]);

  const loadClientTickets = async () => {
    try {
      setClientTickets(await fetchServiceTickets({ client_id: user?.id }));
    } catch {
      setClientTickets([]);
    }
  };

  // Keeps the chosen case (refreshed), or opens the linked case (?case=), else the newest open case.
  const loadSupportCases = async ({ preferId } = {}) => {
    const cases = await fetchCustomerSupportCases();
    setSupportCases(cases);
    setActiveSupportCase((current) => {
      // A refresh that finishes after "Start new case" was clicked must not switch away.
      if (composingNewRef.current) return null;
      const wantedId = preferId || current?.id;
      if (wantedId) {
        const match = cases.find((item) => Number(item.id) === Number(wantedId));
        if (match) return match;
      }
      return cases.find(isOpenSupportCase) || null;
    });
    return cases;
  };

  const load = async () => {
    if (linkedCaseId) composingNewRef.current = false;
    if (!linkedCaseId && prefillTicketId) {
      composingNewRef.current = true;
      setActiveSupportCase(null);
      setSupportForm({
        ...emptyForm(),
        ticket_id: prefillTicketId,
        category: supportCategoryLabels[prefillCategory] ? prefillCategory : 'general',
        subject: prefillSubject.slice(0, 120),
      });
    }
    setLoading(true);
    setError('');
    try {
      const [cases] = await Promise.all([
        loadSupportCases({ preferId: linkedCaseId || undefined }),
        loadClientTickets()
      ]);
      const linked = linkedCaseId ? cases.find((item) => Number(item.id) === linkedCaseId) : null;
      if (linked && !isOpenSupportCase(linked)) setShowPastCases(true);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load your support cases. Try Refresh.');
    } finally {
      setLoading(false);
    }
  };

  const loadSupportMessages = async (silent = false) => {
    if (!supportGroupKey) {
      setSupportMessages([]);
      setMessagesLoading(false);
      return;
    }
    if (!silent) setMessagesLoading(true);
    try {
      const allMessages = await fetchMessages('client');
      setSupportMessages(
        allMessages
          .filter((message) => message.roomType === 'group' && message.groupKey === supportGroupKey && !message.ticketId)
          .sort((first, second) => new Date(first.timestamp) - new Date(second.timestamp))
      );
    } catch {
      if (!silent) setSupportMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [linkedCaseId]);

  useEffect(() => {
    loadSupportMessages(false);
    // New replies and status changes (resolved by the office) arrive without a manual refresh.
    return startLiveRefresh(() => {
      if (supportGroupKey) loadSupportMessages(true);
      loadSupportCases().catch(() => {});
    }, { eventName: MESSAGES_CHANGED_EVENT });
  }, [supportGroupKey]);

  // Show the newest message.
  useEffect(() => {
    const box = conversationRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [supportMessages.length, supportGroupKey]);

  const selectCase = (supportCase) => {
    composingNewRef.current = false;
    setActiveSupportCase(supportCase);
    setMessageNotice('');
  };

  const startNewCase = () => {
    composingNewRef.current = true;
    setActiveSupportCase(null);
    setSupportMessages([]);
    setSupportForm(emptyForm());
    setMessageNotice('');
  };

  const handleSendSupportMessage = async () => {
    if (!supportText.trim() || activeIsClosed) return;

    setMessageSending(true);
    setMessageNotice('');
    try {
      let targetCase = activeSupportCase;
      if (!targetCase) {
        const resolvedSubject = supportForm.subject.trim() || supportCategoryLabels[supportForm.category] || 'Need support';
        targetCase = await createCustomerSupportCase({
          ...supportForm,
          subject: resolvedSubject,
        });
        composingNewRef.current = false;
        setActiveSupportCase(targetCase);
        setSupportCases((current) => [targetCase, ...current]);
      }
      const sentMessage = await sendMessage({
        roomType: 'group',
        groupKey: targetCase.group_key,
        text: supportText.trim(),
      });
      setSupportMessages((current) => (
        current.some((message) => String(message.id) === String(sentMessage.id))
          ? current.map((message) => (String(message.id) === String(sentMessage.id) ? sentMessage : message))
          : [...current, sentMessage]
      ));
      setSupportText('');
      setSupportForm(emptyForm());
      loadSupportCases({ preferId: targetCase.id }).catch(() => {});
    } catch (sendError) {
      setMessageNotice(sendError.message || 'Unable to send customer service message.');
    } finally {
      setMessageSending(false);
    }
  };

  const refreshAll = () => {
    load();
    loadSupportMessages();
  };

  const linkedRequestId = activeSupportCase?.request_id || null;

  const caseButton = (supportCase) => {
    const selected = activeSupportCase?.id === supportCase.id;
    return (
      <button
        key={supportCase.id}
        type="button"
        onClick={() => selectCase(supportCase)}
        aria-pressed={selected}
        className={`flex min-h-11 max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition ${
          selected ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <span className="min-w-0 truncate">[{caseCode(supportCase)}] {supportCase.subject}</span>
        <CaseStatus status={supportCase.status} />
      </button>
    );
  };

  return (
    <Layout>
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">Conversation</h3>
            {supportEmail ? (
              <p className="mt-0.5 break-words text-xs text-slate-500" data-testid="support-email">
                You can also email us at <a href={`mailto:${supportEmail}`} className="font-semibold text-brand-700 underline">{supportEmail}</a>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {activeSupportCase ? (
              <button
                type="button"
                onClick={startNewCase}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                <FiPlus aria-hidden="true" /> Start new case
              </button>
            ) : null}
            <button
              type="button"
              onClick={refreshAll}
              disabled={loading || messagesLoading}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <FiRefreshCw className={loading || messagesLoading ? 'animate-spin' : ''} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>

        {openSupportCases.length > 0 ? (
          <div className="mb-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Open cases ({openSupportCases.length})</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Open cases">
              {openSupportCases.map(caseButton)}
            </div>
          </div>
        ) : null}

        {pastSupportCases.length > 0 ? (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowPastCases((current) => !current)}
              aria-expanded={showPastCases}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              <FiArchive aria-hidden="true" /> {showPastCases ? 'Hide' : 'Show'} past cases ({pastSupportCases.length})
            </button>
            {showPastCases ? (
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Past cases">
                {pastSupportCases.map(caseButton)}
              </div>
            ) : null}
          </div>
        ) : null}

        {!activeSupportCase ? (
          <div className="mb-4 grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,160px)_minmax(0,150px)_minmax(0,240px)]">
            <p className="text-sm font-semibold text-slate-800 md:col-span-2 lg:col-span-4">New case: fill this in, then write your message below.</p>
            <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">
              Subject
              <input
                value={supportForm.subject}
                maxLength={160}
                onChange={(event) => setSupportForm((current) => ({ ...current, subject: event.target.value }))}
                placeholder={supportCategoryLabels[supportForm.category] || 'Need support'}
                className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base font-normal text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:text-sm"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">
              Category
              <select
                value={supportForm.category}
                onChange={(event) => {
                  const nextCategory = event.target.value;
                  setSupportForm((current) => {
                    const currentSubject = current.subject.trim();
                    const shouldAutoFillSubject = !currentSubject || supportCategorySubjectValues.includes(currentSubject);
                    return {
                      ...current,
                      category: nextCategory,
                      subject: shouldAutoFillSubject ? supportCategoryLabels[nextCategory] || '' : current.subject
                    };
                  });
                }}
                className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base font-normal text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:text-sm"
              >
                <option value="general">Need support</option>
                <option value="billing">Purchase record</option>
                <option value="schedule">Schedule</option>
                <option value="technical">Technical help</option>
                <option value="complaint">Service concern</option>
                <option value="warranty">Warranty</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">
              Priority
              <select
                value={supportForm.priority}
                onChange={(event) => setSupportForm((current) => ({ ...current, priority: event.target.value }))}
                className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base font-normal text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">
              Related request
              <select
                value={supportForm.ticket_id}
                onChange={(event) => setSupportForm((current) => ({ ...current, ticket_id: event.target.value }))}
                className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base font-normal text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:text-sm"
              >
                <option value="">No related request</option>
                {clientTickets.map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>
                    {ticket.requestId ? formatRequestId(ticket.requestId) : `Ticket ${ticket.id}`} · {ticket.service || 'Service'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">
                <span className="mr-2 text-slate-500">[{caseCode(activeSupportCase)}]</span>
                {activeSupportCase.subject}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <CaseStatus status={activeSupportCase.status} />
                <span>{supportCategoryLabels[activeSupportCase.category] || activeSupportCase.category}</span>
                <span>· {PRIORITY_LABELS[activeSupportCase.priority] || activeSupportCase.priority} priority</span>
                <span>· Opened {formatStamp(activeSupportCase.created_at)}</span>
                {linkedRequestId ? (
                  <Link to={`/client/requests/${linkedRequestId}?entity=request`} className="inline-flex min-h-11 items-center font-semibold text-blue-600 hover:text-blue-700">
                    · {formatRequestId(linkedRequestId)}{ticketsById.get(Number(activeSupportCase.ticket_id))?.service ? ` (${ticketsById.get(Number(activeSupportCase.ticket_id)).service})` : ''}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div ref={conversationRef} className="h-[350px] space-y-3 overflow-y-auto pr-1 md:h-[450px]" aria-live="polite">
            {messagesLoading ? (
              <ListSkeleton rows={3} compact />
            ) : supportMessages.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                {activeSupportCase ? 'No messages in this case yet.' : 'Your conversation will appear here after you send your first message.'}
              </p>
            ) : (
              supportMessages.map((message) => {
                const sentByClient = Number(message.senderId) === Number(user?.id);
                return (
                  <div key={message.id} className={`flex ${sentByClient ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm ${
                      sentByClient ? 'bg-brand-600 text-white' : 'bg-white text-slate-800'
                    }`}>
                      <div className={`mb-1 text-xs font-semibold ${sentByClient ? 'text-blue-100' : 'text-slate-500'}`}>
                        {sentByClient ? 'You' : (message.senderName || 'Customer Service')}
                      </div>
                      <p className="whitespace-pre-wrap break-words">{message.text}</p>
                      <time dateTime={message.timestamp || undefined} className={`mt-1 block text-xs ${sentByClient ? 'text-blue-100' : 'text-slate-400'}`}>
                        {formatStamp(message.timestamp)}
                      </time>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {activeIsClosed ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <span>This case is {CASE_STATUS_LABELS[activeSupportCase.status]?.toLowerCase() || 'closed'}. Start a new case if you still need help.</span>
              <button type="button" onClick={startNewCase} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white hover:bg-emerald-700">
                <FiPlus aria-hidden="true" /> Start new case
              </button>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <textarea
                value={supportText}
                onChange={(event) => setSupportText(event.target.value)}
                placeholder="Write your customer service concern..."
                aria-label="Your message"
                maxLength={5000}
                rows={2}
                className="min-h-[48px] min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:text-sm"
              />
              <button
                type="button"
                onClick={handleSendSupportMessage}
                disabled={messageSending || !supportText.trim()}
                className="inline-flex min-h-11 items-center gap-2 self-end rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FiMessageSquare size={16} aria-hidden="true" />
                {messageSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          )}
          {messageNotice ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{messageNotice}</p> : null}
        </div>
      </div>
    </Layout>
  );
}
