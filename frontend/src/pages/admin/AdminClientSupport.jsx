import { useEffect, useMemo, useState } from 'react';
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
import { FiCheckCircle, FiClock, FiMessageSquare, FiRefreshCw, FiSend } from 'react-icons/fi';

const CLOSED_STATUSES = ['resolved', 'closed'];

const STATUS_LABELS = {
  open: 'Open',
  in_review: 'In Review',
  resolved: 'Resolved',
  closed: 'Closed'
};

const CATEGORY_LABELS = {
  general: 'General',
  billing: 'Billing',
  schedule: 'Schedule',
  technical: 'Technical',
  complaint: 'Service concern',
  warranty: 'Warranty'
};



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

export default function AdminClientSupport() {
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  const selectedCase = cases.find((supportCase) => supportCase.id === selectedCaseId) || null;
  const selectedMessages = selectedCase
    ? messages
        .filter((message) => message.roomType === 'group' && message.groupKey === selectedCase.group_key && !message.ticketId)
        .sort((first, second) => new Date(first.timestamp) - new Date(second.timestamp))
    : [];

  const filteredCases = useMemo(() => {
    const visible = statusFilter === 'open'
      ? cases.filter(isOpenCase)
      : statusFilter === 'closed'
        ? cases.filter((supportCase) => !isOpenCase(supportCase))
        : cases;

    return [...visible].sort((first, second) => new Date(second.updated_at || 0) - new Date(first.updated_at || 0));
  }, [cases, statusFilter]);

  const stats = useMemo(() => ({
    open: cases.filter((supportCase) => supportCase.status === 'open').length,
    inReview: cases.filter((supportCase) => supportCase.status === 'in_review').length,
    resolved: cases.filter((supportCase) => supportCase.status === 'resolved').length,
  }), [cases]);

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
        setNotice(error.message || 'Unable to load client support.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    const interval = window.setInterval(() => {
      load(true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [user?.username]);

  useEffect(() => {
    if (filteredCases.length > 0 && !filteredCases.some((supportCase) => supportCase.id === selectedCaseId)) {
      setSelectedCaseId(filteredCases[0].id);
    } else if (filteredCases.length === 0) {
      setSelectedCaseId(null);
    }
  }, [filteredCases, selectedCaseId]);

  const updateStatus = async (status) => {
    if (!selectedCase) return;
    try {
      const updatedCase = await updateCustomerSupportCase(selectedCase.id, { status });
      setCases((current) => current.map((item) => (item.id === updatedCase.id ? updatedCase : item)));
      setNotice(`Support case marked ${STATUS_LABELS[status] || status}.`);
    } catch (error) {
      setNotice(error.message || 'Unable to update support case.');
    }
  };

  const sendReply = async () => {
    if (!selectedCase || !replyText.trim()) return;
    setSending(true);
    try {
      const sentMessage = await sendMessage({
        roomType: 'group',
        groupKey: selectedCase.group_key,
        text: replyText.trim(),
      });
      setMessages((current) => [...current, sentMessage]);
      setReplyText('');
      if (selectedCase.status === 'open') {
        await updateStatus('in_review');
      }
    } catch (error) {
      setNotice(error.message || 'Unable to send reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      {notice ? (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.includes('Unable') ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          {notice}
        </div>
      ) : null}

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Client Support</h1>
        <p className="text-sm text-slate-500">Respond to customer support cases, status updates, and ongoing conversations.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Open</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{stats.open}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">In Review</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">{stats.inReview}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Resolved</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{stats.resolved}</p>
        </div>
      </section>

      <section className="mt-6 grid h-[34rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[40rem] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-h-0 flex flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="flex-none flex items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Client Support</h2>
              <p className="text-xs text-slate-500">General inquiries and service questions</p>
            </div>
            <button
              type="button"
              onClick={load}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label="Refresh client support"
            >
              <FiRefreshCw size={15} />
            </button>
          </div>
          <div className="flex-none flex gap-2 border-b border-slate-100 p-3">
            {[
              ['open', 'Open'],
              ['closed', 'Closed'],
              ['all', 'All']
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  statusFilter === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <ListSkeleton rows={5} compact />
            ) : filteredCases.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">No client support cases here.</div>
            ) : (
              filteredCases.map((supportCase) => (
                <button
                  key={supportCase.id}
                  type="button"
                  onClick={() => setSelectedCaseId(supportCase.id)}
                  className={`w-full rounded-xl p-3 text-left transition ${
                    selectedCase?.id === supportCase.id ? 'bg-sky-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {supportCase.case_code ? `[${supportCase.case_code}] ` : ''}{supportCase.subject}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">{supportCase.client_name}</p>
                    </div>
                    <StatusBadge status={supportCase.priority} size="sm" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{CATEGORY_LABELS[supportCase.category] || supportCase.category}</span>
                    <StatusBadge status={supportCase.status} size="sm" />
                    <span>{formatDate(supportCase.updated_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="min-h-0 flex h-full flex-col bg-slate-50">
          {selectedCase ? (
            <>
              <header className="border-b border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FiMessageSquare className="text-slate-400" />
                      <h3 className="truncate text-base font-semibold text-slate-950">
                        {selectedCase.case_code ? `[${selectedCase.case_code}] ` : ''}{selectedCase.subject}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedCase.client_name} / {CATEGORY_LABELS[selectedCase.category] || selectedCase.category} / {selectedCase.priority} priority
                    </p>
                    {selectedCase.ticket_id ? (
                      <div className="mt-2">
                        <Link
                          to={`/admin/services/tickets/${selectedCase.ticket_id}`}
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
                        <FiClock size={14} /> Mark in review
                      </button>
                    ) : null}
                    {!CLOSED_STATUSES.includes(selectedCase.status) ? (
                      <button
                        type="button"
                        onClick={() => updateStatus('resolved')}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <FiCheckCircle size={14} /> Resolve
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

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
                {selectedMessages.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-slate-500">No messages yet.</div>
                ) : (
                  selectedMessages.map((message) => {
                    const sentByStaff = message.senderId === user?.id;
                    return (
                      <div key={message.id} className={`flex ${sentByStaff ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[86%] rounded-2xl px-4 py-2.5 shadow-sm ${
                          sentByStaff ? 'rounded-br-md bg-sky-600 text-white' : 'rounded-bl-md bg-white text-slate-950'
                        }`}>
                          <p className="mb-1 text-[11px] font-semibold opacity-70">{sentByStaff ? 'You' : message.senderName}</p>
                          <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.isDeleted ? 'Message unsent' : message.text}</p>
                          <p className={`mt-1 text-[11px] ${sentByStaff ? 'text-sky-100' : 'text-slate-400'}`}>{formatTime(message.timestamp)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-slate-200 bg-white p-3">
                <div className="flex items-end gap-2 rounded-2xl bg-slate-100 p-1.5">
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
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
                    className="grid h-10 w-10 place-items-center rounded-full bg-sky-600 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    aria-label="Send reply"
                  >
                    <FiSend size={17} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-slate-500">Select a support case.</div>
          )}
        </main>
      </section>
    </Layout>
  );
}
