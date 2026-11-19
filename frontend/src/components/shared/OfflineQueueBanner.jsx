import { useCallback, useEffect, useState } from 'react';
import { FiAlertTriangle, FiUploadCloud, FiX } from 'react-icons/fi';
// Importing the technician API registers how each saved action is sent.
import '../../api/technician';
import { formatTicketId } from '../../utils/roleIds';
import {
  OFFLINE_QUEUE_EVENT,
  dismissFailedAction,
  flushOfflineQueue,
  listFailedActions,
  listPendingActions,
} from '../../utils/offlineQueue';

const RETRY_MS = 30000;

// Technician-only: what was saved on this phone while offline, and what the server refused later.
export default function OfflineQueueBanner() {
  const [pendingActions, setPendingActions] = useState([]);
  const [failedActions, setFailedActions] = useState([]);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    const [waiting, refused] = await Promise.all([listPendingActions(), listFailedActions()]);
    setPendingActions(waiting);
    setFailedActions(refused);
  }, []);

  const send = useCallback(async () => {
    setSending(true);
    try {
      await flushOfflineQueue();
    } finally {
      setSending(false);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    send();
    const onChange = () => refresh();
    const onOnline = () => send();
    window.addEventListener(OFFLINE_QUEUE_EVENT, onChange);
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => {
      listPendingActions().then((waiting) => { if (waiting.length) send(); });
    }, RETRY_MS);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, onChange);
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [refresh, send]);

  if (!pendingActions.length && !failedActions.length) return null;

  return (
    <div className="mb-3 space-y-2" data-testid="offline-queue">
      {pendingActions.length ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex items-center gap-2">
            <FiUploadCloud aria-hidden="true" />
            {pendingActions.length} action{pendingActions.length === 1 ? '' : 's'} saved on this phone ({pendingActions.map((action) => `${action.label} ${formatTicketId(action.ticketId)}`).join(', ')}). They are sent when you have signal.
          </span>
          <button type="button" onClick={send} disabled={sending} className="min-h-11 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
            {sending ? 'Sending...' : 'Send now'}
          </button>
        </div>
      ) : null}
      {failedActions.map((action) => (
        <div key={action.id} role="alert" className="flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="flex items-start gap-2">
            <FiAlertTriangle className="mt-0.5 shrink-0" aria-hidden="true" />
            <span><strong>{action.label} for {formatTicketId(action.ticketId)} was not saved:</strong> {action.reason} Open the job to check it.</span>
          </span>
          <button type="button" onClick={() => dismissFailedAction(action.id)} aria-label="Dismiss" className="min-h-11 rounded-lg px-2 text-red-700"><FiX /></button>
        </div>
      ))}
    </div>
  );
}
