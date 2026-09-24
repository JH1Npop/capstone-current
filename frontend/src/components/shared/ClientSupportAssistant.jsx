import { useEffect, useRef, useState } from 'react';
import { FiMessageCircle, FiRefreshCw, FiSend, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { fetchCustomerSupportCases } from '../../api/api';
import { fetchServiceTickets } from '../../api/services';
import { formatTicketId } from '../../utils/roleIds';

const QUICK_QUESTIONS = [
  'What is my latest request status?',
  'How do I request service?',
  'When is my appointment?',
  'How do I contact support?',
  'Where can I see what I purchased?'
];

const CLOSED_TICKET_STATUSES = new Set(['completed', 'cancelled', 'turned_over_/_accepted']);
const CLOSED_SUPPORT_STATUSES = new Set(['resolved', 'closed']);

const formatStatus = (value) => String(value || 'pending')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const formatDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const containsAny = (text, terms) => terms.some((term) => text.includes(term));

const buildAnswer = (question, tickets, supportCases, availability) => {
  const normalized = question.toLowerCase();
  const latestTicket = tickets[0] || null;
  const activeTickets = tickets.filter((ticket) => !CLOSED_TICKET_STATUSES.has(ticket.status));
  const openCases = supportCases.filter((supportCase) => (
    !CLOSED_SUPPORT_STATUSES.has(String(supportCase?.status || '').toLowerCase())
  ));

  if (containsAny(normalized, ['password', 'api key', 'secret', 'token', 'credential', 'other client', 'all account'])) {
    return {
      text: "I cannot show passwords, secret keys, credentials, or another customer's information. You can update your own password from Profile, or contact customer service for account help.",
      action: { label: 'Open profile', path: '/client/profile' }
    };
  }

  if (containsAny(normalized, ['latest', 'status', 'track', 'progress', 'request update'])) {
    if (!availability.tickets) {
      return {
        text: 'I could not refresh your ticket information right now. Open My Requests to retry securely, or contact customer service if the problem continues.',
        action: { label: 'View my requests', path: '/client/requests' }
      };
    }
    if (!latestTicket) {
      return {
        text: 'You do not have a service ticket yet. You can create a service request from the client portal.',
        action: { label: 'Request service', path: '/client/service-requests' }
      };
    }
    return {
      text: `Your latest ticket is ${formatTicketId(latestTicket.id)} for ${latestTicket.service}. Its status is ${formatStatus(latestTicket.status)}. You currently have ${activeTickets.length} active ${activeTickets.length === 1 ? 'ticket' : 'tickets'}.`,
      action: { label: 'View my requests', path: '/client/requests' }
    };
  }

  if (containsAny(normalized, ['appointment', 'schedule', 'scheduled', 'visit', 'technician arrive'])) {
    if (!availability.tickets) {
      return {
        text: 'I could not refresh your appointment information right now. Open My Requests to retry securely, or contact customer service for schedule confirmation.',
        action: { label: 'View my requests', path: '/client/requests' }
      };
    }
    const scheduledTicket = tickets.find((ticket) => ticket.scheduledDate);
    if (!scheduledTicket) {
      return {
        text: 'I cannot find a scheduled appointment on your current tickets. Customer service can confirm availability or help with rescheduling.',
        action: { label: 'Contact support', path: '/client/support' }
      };
    }
    const time = scheduledTicket.scheduledTimeSlot || scheduledTicket.scheduledTime || 'time to be confirmed';
    return {
      text: `Your next visible appointment is for ${formatTicketId(scheduledTicket.id)} on ${formatDate(scheduledTicket.scheduledDate)}, ${time}. Open request tracking for the latest schedule and technician updates.`,
      action: { label: 'View appointment', path: '/client/requests' }
    };
  }

  if (containsAny(normalized, ['request service', 'new request', 'book service', 'repair', 'installation'])) {
    return {
      text: 'Open Request Service, select the service you need, provide the site and preferred schedule, then submit it. You can track the request afterward from My Requests.',
      action: { label: 'Request service', path: '/client/service-requests' }
    };
  }

  if (containsAny(normalized, ['support', 'human', 'agent', 'complaint', 'concern', 'help desk', 'contact'])) {
    return {
      text: availability.supportCases
        ? `You can message customer service through Client Support. You currently have ${openCases.length} open support ${openCases.length === 1 ? 'case' : 'cases'}. For faster handling, choose a category, priority, and related ticket before sending your concern.`
        : 'You can message customer service through Client Support. I could not refresh your open-case count right now, but the support page will retry securely. Choose a category, priority, and related ticket before sending your concern.',
      action: { label: 'Contact support', path: '/client/support' }
    };
  }

  if (containsAny(normalized, ['warranty', 'after sales', 'after-sales', 'maintenance'])) {
    if (!availability.tickets) {
      return {
        text: 'I could not refresh your warranty information right now. Open Service History to retry securely, or contact support for an account review.',
        action: { label: 'View service history', path: '/client/service-history' }
      };
    }
    const warrantyTickets = tickets.filter((ticket) => ticket.warrantyStatus === 'active');
    return {
      text: `I found ${warrantyTickets.length} ${warrantyTickets.length === 1 ? 'ticket with an active warranty' : 'tickets with active warranties'} in your portal. Open Service History for completed work and warranty details, or contact support to report an after-sales concern.`,
      action: { label: 'View service history', path: '/client/service-history' }
    };
  }

  if (containsAny(normalized, ['solar', 'estimate', 'quotation', 'quote'])) {
    return {
      text: 'You can create and review preliminary solar estimates in Solar Estimates. A final quotation may still require site validation by the service team.',
      action: { label: 'Open solar estimates', path: '/client/solar-estimates' }
    };
  }

  if (containsAny(normalized, ['purchase', 'purchased', 'sold', 'product record', 'service record', 'bill', 'billing', 'payment', 'invoice', 'receipt', 'refund', 'price', 'cost'])) {
    return {
      text: 'This portal does not process billing or payments. It keeps service and installed-product records connected to completed work. Open Service History to review what was delivered, or ask customer service for a purchase-record or document correction.',
      action: { label: 'View purchase records', path: '/client/purchase-records' }
    };
  }

  if (containsAny(normalized, ['notification', 'alert', 'update'])) {
    return {
      text: 'Your Notifications page contains service, schedule, support, and account updates sent to your client account.',
      action: { label: 'View notifications', path: '/client/notifications' }
    };
  }

  if (containsAny(normalized, ['emergency', 'fire', 'smoke', 'sparking', 'electric shock', 'danger'])) {
    return {
      text: 'If there is fire, smoke, sparking, electric-shock risk, or another immediate danger, move to a safe location and contact local emergency services. Do not touch damaged electrical or solar equipment. You can also notify customer service after you are safe.',
      action: { label: 'Contact support', path: '/client/support' }
    };
  }

  return {
    text: 'I can help with service requests, ticket status, appointments, support cases, warranties, solar estimates, purchase records, and notifications. This portal records delivered products and services but does not process billing or payments.',
    action: { label: 'Contact support', path: '/client/support' }
  };
};

export default function ClientSupportAssistant() {
  const navigate = useNavigate();
  const messageListRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [tickets, setTickets] = useState([]);
  const [supportCases, setSupportCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [availability, setAvailability] = useState({ tickets: false, supportCases: false });
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: 'Hi! I can help you use the client portal, check your service information, or connect you with customer service.'
    }
  ]);

  const loadClientData = async () => {
    setLoading(true);
    const [ticketResult, supportResult] = await Promise.allSettled([
      fetchServiceTickets(),
      fetchCustomerSupportCases()
    ]);
    setTickets(ticketResult.status === 'fulfilled'
      ? [...ticketResult.value].sort((left, right) => Number(right.id || 0) - Number(left.id || 0))
      : []);
    setSupportCases(supportResult.status === 'fulfilled' ? supportResult.value : []);
    setAvailability({
      tickets: ticketResult.status === 'fulfilled',
      supportCases: supportResult.status === 'fulfilled'
    });
    setDataLoaded(true);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen && !dataLoaded && !loading) loadClientData();
  }, [isOpen, dataLoaded, loading]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const askQuestion = (question) => {
    const text = String(question || '').trim();
    if (!text) return;
    const answer = buildAnswer(text, tickets, supportCases, availability);
    setMessages((current) => [...current, { sender: 'user', text }, { sender: 'assistant', ...answer }].slice(-10));
    setInput('');
  };

  const followAction = (path) => {
    setIsOpen(false);
    navigate(path);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-3 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-white shadow-xl shadow-brand-900/20 transition hover:bg-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-200 sm:bottom-20 sm:right-5 lg:bottom-8 lg:right-8"
        aria-label="Open client support assistant"
      >
        <FiMessageCircle size={24} />
      </button>
    );
  }

  return (
    <section
      className="fixed bottom-3 right-3 z-40 flex h-[min(570px,calc(100dvh-1.5rem))] w-[calc(100vw-1.5rem)] max-w-[31rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:bottom-6 sm:right-5 sm:h-[min(570px,calc(100dvh-3rem))] sm:w-[31rem] lg:bottom-8 lg:right-8"
      aria-label="Client support assistant"
    >
      <div className="flex items-start gap-3 border-b border-slate-100 p-4">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-50 text-brand-600">
          <FiMessageCircle />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">Client Support Assistant</h3>
          <p className="mt-1 text-xs text-slate-500">Portal guidance and summaries from your own service records.</p>
        </div>
        <button
          type="button"
          onClick={loadClientData}
          disabled={loading}
          className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
          aria-label="Refresh client assistant data"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          aria-label="Close client support assistant"
        >
          <FiX />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1">
          {QUICK_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => askQuestion(question)}
              disabled={!dataLoaded || loading}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-wait disabled:opacity-60"
            >
              {question}
            </button>
          ))}
        </div>

        <div ref={messageListRef} className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl bg-slate-50 p-3" aria-live="polite">
          {messages.map((message, index) => (
            <div key={`${message.sender}-${index}`} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.sender === 'user'
                  ? 'bg-brand-500 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}>
                <p className="whitespace-pre-line break-words">{message.text}</p>
                {message.action ? (
                  <button
                    type="button"
                    onClick={() => followAction(message.action.path)}
                    className="mt-2 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
                  >
                    {message.action.label}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? <p className="text-center text-xs font-medium text-slate-500">Refreshing your portal information...</p> : null}
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
            placeholder="Ask about your service or support..."
            aria-label="Ask the client support assistant"
            disabled={!dataLoaded || loading}
          />
          <button
            type="submit"
            disabled={!dataLoaded || loading || !input.trim()}
            className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="Send question to client support assistant"
          >
            <FiSend />
          </button>
        </form>
      </div>
    </section>
  );
}
