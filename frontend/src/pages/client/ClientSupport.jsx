import { useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { createCustomerSupportCase, fetchCustomerSupportCases, fetchMessages, sendMessage } from '../../api/api';
import { fetchServiceTickets } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { FiMessageSquare, FiRefreshCw } from 'react-icons/fi';
import { formatSupportCaseId, formatTicketId } from '../../utils/roleIds';

const statusLabels = {
  pending: 'Pending Review',
  approved: 'Approved',
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const supportCategoryLabels = {
  general: 'Need support',
  billing: 'Purchase record',
  schedule: 'Schedule',
  technical: 'Technical help',
  complaint: 'Service concern',
  warranty: 'Warranty'
};

const supportCategorySubjectValues = Object.values(supportCategoryLabels);

const CLOSED_SUPPORT_STATUSES = ['resolved', 'closed'];
const isOpenSupportCase = (supportCase) => !CLOSED_SUPPORT_STATUSES.includes(String(supportCase?.status || '').toLowerCase());

export default function ClientSupport() {
  const { user } = useAuth();
  const [supportCases, setSupportCases] = useState([]);
  const [clientTickets, setClientTickets] = useState([]);
  const [activeSupportCase, setActiveSupportCase] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportForm, setSupportForm] = useState({ subject: '', category: 'general', priority: 'normal', ticket_id: '' });
  const [supportText, setSupportText] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messageSending, setMessageSending] = useState(false);
  const [error, setError] = useState('');
  const [messageNotice, setMessageNotice] = useState('');

  const supportGroupKey = activeSupportCase?.group_key || '';
  const openSupportCases = supportCases.filter(isOpenSupportCase);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([
        loadSupportCases(),
        loadClientTickets()
      ]);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load your support records.');
    } finally {
      setLoading(false);
    }
  };

  const loadClientTickets = async () => {
    try {
      const tickets = await fetchServiceTickets({ client_id: user?.id });
      setClientTickets(tickets);
    } catch {
      setClientTickets([]);
    }
  };

  const loadSupportCases = async () => {
    try {
      const cases = await fetchCustomerSupportCases();
      setSupportCases(cases);
      setActiveSupportCase((current) => {
        const activeCases = cases.filter(isOpenSupportCase);
        if (current) {
          const refreshedCurrent = activeCases.find((item) => item.id === current.id);
          if (refreshedCurrent) return refreshedCurrent;
        }
        return activeCases[0] || null;
      });
    } catch {
      setSupportCases([]);
      setActiveSupportCase(null);
    }
  };

  const loadSupportMessages = async (silent = false) => {
    if (!supportGroupKey) {
      setSupportMessages([]);
      if (!silent) setMessagesLoading(false);
      return;
    }
    if (!silent && supportMessages.length === 0) setMessagesLoading(true);
    try {
      const allMessages = await fetchMessages('client');
      setSupportMessages(
        allMessages
          .filter((message) => message.roomType === 'group' && message.groupKey === supportGroupKey && !message.ticketId)
          .sort((first, second) => new Date(first.timestamp) - new Date(second.timestamp))
      );
    } catch {
      setSupportMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadSupportMessages(false);
    const interval = window.setInterval(() => {
      if (supportGroupKey) loadSupportMessages(true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [supportGroupKey]);

  const handleSendSupportMessage = async () => {
    if (!supportText.trim()) return;

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
        setActiveSupportCase(targetCase);
        setSupportCases((current) => [targetCase, ...current]);
      }
      const sentMessage = await sendMessage({
        roomType: 'group',
        groupKey: targetCase.group_key,
        text: supportText.trim(),
      });
      setSupportMessages((current) => [...current, sentMessage]);
      setSupportText('');
      setSupportForm({ subject: '', category: 'general', priority: 'normal', ticket_id: '' });
      setMessageNotice('');
      loadSupportCases();
    } catch (sendError) {
      setMessageNotice(sendError.message || 'Unable to send customer service message.');
    } finally {
      setMessageSending(false);
    }
  };

  const refreshAll = () => {
    load();
    loadSupportCases();
    loadSupportMessages();
  };

  return (
    <Layout>
      {error ? (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Message Customer Service</h3>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading || messagesLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <FiRefreshCw className={loading || messagesLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {openSupportCases.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {openSupportCases.slice(0, 5).map((supportCase) => (
              <button
                key={supportCase.id}
                type="button"
                onClick={() => setActiveSupportCase(supportCase)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  activeSupportCase?.id === supportCase.id
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="max-w-[180px] truncate">
                  [{supportCase.case_code || formatSupportCaseId(supportCase.id)}] {supportCase.subject}
                </span>
                <span className="capitalize text-slate-400">/ {supportCase.status.replace('_', ' ')}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setActiveSupportCase(null);
                setSupportMessages([]);
              }}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
            >
              New case
            </button>
          </div>
        ) : null}

        {!activeSupportCase ? (
          <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-[1fr_160px_150px_200px]">
            <input
              value={supportForm.subject}
              onChange={(event) => setSupportForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder={supportCategoryLabels[supportForm.category] || 'Need support'}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
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
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="general">Need support</option>
              <option value="billing">Purchase record</option>
              <option value="schedule">Schedule</option>
              <option value="technical">Technical</option>
              <option value="complaint">Service concern</option>
              <option value="warranty">Warranty</option>
            </select>
            <select
              value={supportForm.priority}
              onChange={(event) => setSupportForm((current) => ({ ...current, priority: event.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <select
              value={supportForm.ticket_id}
              onChange={(event) => setSupportForm((current) => ({ ...current, ticket_id: event.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">No related ticket</option>
              {clientTickets.map((ticket) => (
                <option key={ticket.id} value={ticket.id}>
                  {formatTicketId(ticket.id)} ({ticket.service || 'Service'})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">
                  <span className="mr-2 text-slate-500">[{activeSupportCase.case_code || formatSupportCaseId(activeSupportCase.id)}]</span>
                  {activeSupportCase.subject}
                </p>
                <p className="text-xs capitalize text-slate-500">
                  {supportCategoryLabels[activeSupportCase.category] || activeSupportCase.category} / {activeSupportCase.priority} priority / {activeSupportCase.status.replace('_', ' ')} {activeSupportCase.ticket_code && ` / ${activeSupportCase.ticket_code}`}
                </p>
              </div>
              <button type="button" onClick={() => setActiveSupportCase(null)} className="text-sm font-semibold text-blue-600">
                Start new case
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="h-[350px] space-y-3 overflow-y-auto pr-1 md:h-[450px]">
            {messagesLoading ? (
              <ListSkeleton rows={3} compact />
            ) : supportMessages.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No customer service messages yet.</p>
            ) : (
              supportMessages.map((message) => {
                const sentByClient = Number(message.senderId) === Number(user?.id);
                return (
                  <div key={message.id} className={`flex ${sentByClient ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm ${
                      sentByClient ? 'bg-blue-600 text-white' : 'bg-white text-slate-800'
                    }`}>
                      <div className={`mb-1 text-xs font-semibold ${sentByClient ? 'text-blue-100' : 'text-slate-500'}`}>
                        {sentByClient ? 'You' : (message.senderName || 'Customer Service')}
                      </div>
                      <p>{message.text}</p>
                      <div className={`mt-1 text-[11px] ${sentByClient ? 'text-blue-100' : 'text-slate-400'}`}>
                        {message.timestamp ? new Date(message.timestamp).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <textarea
              value={supportText}
              onChange={(event) => setSupportText(event.target.value)}
              placeholder="Write your customer service concern..."
              rows={2}
              className="min-h-[48px] flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={handleSendSupportMessage}
              disabled={messageSending || !supportText.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiMessageSquare size={16} />
              {messageSending ? 'Sending...' : 'Send'}
            </button>
          </div>
          {messageNotice ? <p className="mt-3 text-sm font-medium text-slate-600">{messageNotice}</p> : null}
        </div>
      </div>
    </Layout>
  );
}
