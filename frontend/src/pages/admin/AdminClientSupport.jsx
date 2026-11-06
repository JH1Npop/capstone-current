import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import {
  fetchCustomerSupportCases,
  fetchMessages,
  sendMessage,
  updateCustomerSupportCase
} from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/ui/StatusBadge';
import { FiCheckCircle, FiClock, FiMessageSquare, FiRefreshCw, FiSearch, FiSend } from 'react-icons/fi';
import { formatSupportCaseId } from '../../utils/roleIds';
import { MESSAGES_CHANGED_EVENT, startLiveRefresh } from '../../utils/liveUpdates';

const CLOSED_STATUSES = ['resolved', 'closed'];
const MAX_REPLY_LENGTH = 5000;

const STATUS_LABELS = {
  open: 'Open',
  in_review: 'In Review',
  resolved: 'Resolved',
  closed: 'Closed'
};

const CATEGORY_LABELS = {
  general: 'General',
  billing: 'Purchase record',
  schedule: 'Schedule',
  technical: 'Technical',
  complaint: 'Service concern',
  warranty: 'Warranty'
};

const FILTERS = [
  ['open', 'Open'],
  ['waiting', 'Waiting for reply'],
  ['new', 'New'],
  ['in_review', 'In review'],
  ['closed', 'Closed'],
  ['all', 'All'],
];

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const isOpenCase = (supportCase) => !CLOSED_STATUSES.includes(String(supportCase?.status || '').toLowerCase());
const caseCode = (supportCase) => supportCase.case_code || formatSupportCaseId(supportCase.id);

export default function AdminClientSupport() {
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // Messages carry their tone; guessing from the word "Unable" showed some errors in green.
  const [notice, setNoticeState] = useState({ text: '', tone: 'success' });
  const setNotice = (text, tone = 'success') => setNoticeState({ text: text || '', tone });
  const replyRef = useRef(null);
  const refocusReply = useRef(false);

  // Messages per support thread, oldest first.
  const messagesByThread = useMemo(() => {
    const threads = new Map();
    messages.forEach((message) => {
      if (message.roomType !== 'group' || message.ticketId) return;
      const list = threads.get(message.groupKey) || [];
      list.push(message);
      threads.set(message.groupKey, list);
    });
    threads.forEach((list) => list.sort((first, second) => new Date(first.timestamp) - new Date(second.timestamp)));
    return threads;
  }, [messages]);

  // A case is waiting when it is open and the client wrote the latest message.
  const isWaiting = (supportCase) => {
    if (!isOpenCase(supportCase)) return false;
    const thread = (messagesByThread.get(supportCase.group_key) || []).filter((message) => !message.isDeleted);
    const latest = thread[thread.length - 1];
    return Boolean(latest && Number(latest.senderId) === Number(supportCase.client));
  };

  const selectedCase = cases.find((supportCase) => supportCase.id === selectedCaseId) || null;
  const replyText = selectedCaseId == null ? '' : (replyDrafts[selectedCaseId] || '');
  const selectedMessages = selectedCase ? (messagesByThread.get(selectedCase.group_key) || []) : [];

  const filteredCases = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const visible = cases.filter((supportCase) => {
      if (statusFilter === 'open' && !isOpenCase(supportCase)) return false;
      if (statusFilter === 'waiting' && !isWaiting(supportCase)) return false;
      if (statusFilter === 'new' && supportCase.status !== 'open') return false;
      if (statusFilter === 'in_review' && supportCase.status !== 'in_review') return false;
      if (statusFilter === 'closed' && isOpenCase(supportCase)) return false;
      if (!needle) return true;
      return [caseCode(supportCase), supportCase.subject, supportCase.client_name, supportCase.ticket_code, CATEGORY_LABELS[supportCase.category]]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
    // Waiting cases first, then most recently updated.
    return [...visible].sort((first, second) => (
      Number(isWaiting(second)) - Number(isWaiting(first))
      || new Date(second.updated_at || 0) - new Date(first.updated_at || 0)
    ));
  }, [cases, statusFilter, search, messagesByThread]);

  const stats = useMemo(() => ({
    open: cases.filter((supportCase) => supportCase.status === 'open').length,
    inReview: cases.filter((supportCase) => supportCase.status === 'in_review').length,
    waiting: cases.filter(isWaiting).length,
    resolved: cases.filter((supportCase) => supportCase.status === 'resolved').length,
  }), [cases, messagesByThread]);

  const load = async (silent = false) => {
    if (!silent && cases.length === 0) setLoading(true);
    try {
      const [caseList, messageList] = await Promise.all([
        fetchCustomerSupportCases(),
        fetchMessages('staff', user?.username)
      ]);
      const supportMessages = messageList.filter((message) => (
        message.roomType === 'group' &&
        String(message.groupKey || '').startsWith('customer_support_client_') &&
        !message.ticketId
      ));
      setCases(caseList);
      setMessages(supportMessages);
      setSelectedCaseId((current) => current || caseList.find(isOpenCase)?.id || caseList[0]?.id || null);
      if (!silent) setNotice('');
    } catch (error) {
      if (!silent) {
        setCases([]);
        setMessages([]);
        setNotice(error.message || 'Unable to load client support.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    return startLiveRefresh(() => {
      load(true);
    }, { eventName: MESSAGES_CHANGED_EVENT });
  }, [user?.username]);

  useEffect(() => {
    if (filteredCases.length > 0 && !filteredCases.some((supportCase) => supportCase.id === selectedCaseId)) {
      setSelectedCaseId(filteredCases[0].id);
    } else if (filteredCases.length === 0) {
      setSelectedCaseId(null);
    }
  }, [filteredCases, selectedCaseId]);

  useEffect(() => {
    if (sending || !refocusReply.current) return;
    refocusReply.current = false;
    replyRef.current?.focus();
  }, [sending]);

  const updateStatus = async (status, { quiet = false } = {}) => {
    if (!selectedCase) return;
    try {
      const updatedCase = await updateCustomerSupportCase(selectedCase.id, { status });
      setCases((current) => current.map((item) => (item.id === updatedCase.id ? updatedCase : item)));
      if (!quiet) setNotice(`${caseCode(selectedCase)} marked ${STATUS_LABELS[status] || status}.`);
    } catch (error) {
      setNotice(error.message || 'Unable to update support case.', 'error');
    }
  };

  const sendReply = async () => {
    if (!selectedCase || !replyText.trim()) return;
    const targetCase = selectedCase;
    const targetText = replyText.trim();
    setSending(true);
    try {
      const sentMessage = await sendMessage({
        roomType: 'group',
        groupKey: targetCase.group_key,
        text: targetText,
      });
      setMessages((current) => (
        current.some((message) => String(message.id) === String(sentMessage.id))
          ? current.map((message) => (String(message.id) === String(sentMessage.id) ? sentMessage : message))
          : [...current, sentMessage]
      ));
      setReplyDrafts((current) => {
        const next = { ...current };
        delete next[targetCase.id];
        return next;
      });
      if (targetCase.status === 'open') {
        await updateStatus('in_review', { quiet: true });
        setNotice(`Reply sent to ${targetCase.client_name}. ${caseCode(targetCase)} is now In Review.`);
      } else {
        setNotice(`Reply sent to ${targetCase.client_name}.`);
      }
    } catch (error) {
      setNotice(error.message || 'Unable to send reply.', 'error');
    } finally {
      refocusReply.current = true;
      setSending(false);
    }
  };

  const summaryCards = [
    ['New', stats.open, 'new'],
    ['In Review', stats.inReview, 'in_review'],
    ['Waiting for reply', stats.waiting, 'waiting'],
    ['Resolved', stats.resolved, 'closed'],
  ];

  return (
    <Layout>
      {notice.text ? (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <section aria-label="Client support summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryCards.map(([label, value, filter]) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusFilter(filter)}
            aria-pressed={statusFilter === filter}
            className={`rounded-xl border bg-white p-5 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md ${statusFilter === filter ? 'border-brand-400 ring-1 ring-brand-200' : 'border-slate-200'}`}
          >
            <span className="block text-sm font-medium text-slate-500">{label}</span>
            <span className="mt-2 block text-3xl font-bold text-slate-900">{value}</span>
          </button>
        ))}
      </section>

      <section className="mt-6 grid min-w-0 h-[34rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[40rem] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-h-0 min-w-0 flex flex-col border-b border-slate-200 lg:border-b-0 lg:border-r" aria-label="Support cases">
          <div className="flex-none flex items-center justify-between gap-3 border-b border-slate-100 p-4">
            <h2 className="min-w-0 text-base font-semibold text-slate-950">Cases <span className="text-sm font-normal text-slate-500">({filteredCases.length})</span></h2>
            <button
              type="button"
              onClick={() => load(false)}
              className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label="Refresh client support"
            >
              <FiRefreshCw size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-none space-y-2 border-b border-slate-100 p-3">
            <label className="relative block">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <span className="sr-only">Search support cases</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search client, subject or case no."
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={statusFilter === value}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    statusFilter === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <ListSkeleton rows={5} compact />
            ) : filteredCases.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">{search.trim() ? `No support case matches "${search.trim()}".` : 'No client support cases here.'}</div>
            ) : (
              filteredCases.map((supportCase) => {
                const waiting = isWaiting(supportCase);
                return (
                  <button
                    key={supportCase.id}
                    type="button"
                    onClick={() => setSelectedCaseId(supportCase.id)}
                    aria-current={selectedCase?.id === supportCase.id ? 'true' : undefined}
                    className={`min-w-0 w-full overflow-hidden rounded-xl p-3 text-left transition ${
                      selectedCase?.id === supportCase.id ? 'bg-sky-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          [{caseCode(supportCase)}] {supportCase.subject}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">{supportCase.client_name}</p>
                      </div>
                      <StatusBadge status={supportCase.priority} size="sm" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{CATEGORY_LABELS[supportCase.category] || supportCase.category}</span>
                      <StatusBadge status={supportCase.status} size="sm" />
                      {waiting ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Client waiting</span> : null}
                      <span>{formatDate(supportCase.updated_at)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="min-h-0 min-w-0 flex h-full flex-col bg-slate-50">
          {selectedCase ? (
            <>
              <header className="border-b border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FiMessageSquare className="text-slate-400" aria-hidden="true" />
                      <h3 className="truncate text-base font-semibold text-slate-950">
                        [{caseCode(selectedCase)}] {selectedCase.subject}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedCase.client_name} / {CATEGORY_LABELS[selectedCase.category] || selectedCase.category} / {selectedCase.priority} priority / {STATUS_LABELS[selectedCase.status] || selectedCase.status}
                    </p>
                    {selectedCase.ticket_id ? (
                      <div className="mt-2">
                        <Link
                          to={`/admin/service-tickets?ticketId=${selectedCase.ticket_id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          🎫 Related to {selectedCase.ticket_code}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedCase.status === 'open' ? (
                      <button
                        type="button"
                        onClick={() => updateStatus('in_review')}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <FiClock size={14} aria-hidden="true" /> Mark in review
                      </button>
                    ) : null}
                    {!CLOSED_STATUSES.includes(selectedCase.status) ? (
                      <button
                        type="button"
                        onClick={() => updateStatus('resolved')}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <FiCheckCircle size={14} aria-hidden="true" /> Resolve
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateStatus('open')}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6" aria-label={`Conversation with ${selectedCase.client_name}`}>
                {selectedMessages.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-slate-500">No messages yet.</div>
                ) : (
                  selectedMessages.map((message) => {
                    const fromClient = Number(message.senderId) === Number(selectedCase.client);
                    const fromMe = message.senderId === user?.id;
                    // Staff replies (yours or a colleague's) sit on the right; the client on the left.
                    const author = fromMe ? 'You' : fromClient ? message.senderName : `${message.senderName} (staff)`;
                    return (
                      <div key={message.id} className={`flex ${fromClient ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[86%] rounded-2xl px-4 py-2.5 shadow-sm ${
                          fromClient
                            ? 'rounded-bl-md bg-white text-slate-950'
                            : fromMe
                              ? 'rounded-br-md bg-sky-600 text-white'
                              : 'rounded-br-md bg-indigo-100 text-indigo-950'
                        }`}>
                          <p className="mb-1 text-xs font-semibold opacity-70">{author}</p>
                          <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.isDeleted ? 'Message unsent' : message.text}</p>
                          <p className={`mt-1 text-xs ${fromMe ? 'text-sky-100' : 'text-slate-500'}`}>{formatTime(message.timestamp)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right padding keeps Send clear of the floating analytics assistant button. */}
              <div className="border-t border-slate-200 bg-white p-3 pr-20">
                {!isOpenCase(selectedCase) ? (
                  <p className="mb-2 text-xs text-slate-500">This case is {STATUS_LABELS[selectedCase.status]?.toLowerCase() || 'closed'}. A reply keeps it that way; use Reopen if more work is needed.</p>
                ) : null}
                {replyText.length > MAX_REPLY_LENGTH - 500 ? (
                  <p className="mb-1 text-right text-xs text-slate-500">{replyText.length} / {MAX_REPLY_LENGTH} characters</p>
                ) : null}
                <div className="flex items-end gap-2 rounded-2xl bg-slate-100 p-1.5">
                  <textarea
                    ref={replyRef}
                    aria-label={`Reply to ${selectedCase.client_name}`}
                    maxLength={MAX_REPLY_LENGTH}
                    value={replyText}
                    onChange={(event) => {
                      const nextText = event.target.value;
                      setReplyDrafts((current) => ({ ...current, [selectedCase.id]: nextText }));
                    }}
                    rows={1}
                    disabled={sending}
                    placeholder={`Reply to ${selectedCase.client_name}...`}
                    className="min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-slate-400"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendReply();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={sendReply}
                    disabled={sending || !replyText.trim()}
                    className="grid h-10 w-10 flex-none place-items-center rounded-full bg-sky-600 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    aria-label="Send reply"
                  >
                    <FiSend size={17} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-slate-500">Select a support case.</div>
          )}
        </div>
      </section>
    </Layout>
  );
}
