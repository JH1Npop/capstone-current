import localforage from 'localforage';

// Offline field recording. When a technician's field action (arrival, start/pause/finish, the
// service checklist, the inspection report) fails because there is no network, it is saved on the
// phone (IndexedDB, photos included) and sent later: when the browser comes back online, when the
// app opens, and every 30 seconds while something is waiting.
//
// Replay rules:
// - actions go in the order they were taken, per job;
// - still offline: stop and try again later;
// - the server refuses an action: if the job is already where the action would have put it (for
//   example it was already marked arrived), it counts as done; otherwise the action and the rest of
//   that job's actions are moved to "needs attention" with the server's reason. They are never
//   retried on their own.
// - times are the server's time at replay, not when the action was taken on the phone.

const pending = localforage.createInstance({ name: 'afn-field', storeName: 'pending_actions' });
const failed = localforage.createInstance({ name: 'afn-field', storeName: 'failed_actions' });

export const OFFLINE_QUEUE_EVENT = 'afn:offline-queue-changed';
const executors = {};
const doneChecks = {};
let flushing = null;

// Each saved action belongs to the technician who took it. Another person signing in on the same
// phone never sends (or sees) it; it waits until its owner signs in again.
const currentUserId = () => {
  try {
    const user = JSON.parse(sessionStorage.getItem('afn_user') || 'null');
    return user?.id != null ? String(user.id) : '';
  } catch {
    return '';
  }
};
const isMine = (action) => Boolean(action.ownerId) && action.ownerId === currentUserId();

const notify = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
};

export const isNetworkFailure = (error) => Boolean(error)
  && !error.response
  && (
    error.code === 'ERR_NETWORK'
    || error.code === 'ECONNABORTED'
    || error.message === 'Network Error'
    || (typeof navigator !== 'undefined' && navigator.onLine === false)
  );

/**
 * Register how an action type is sent (`run(...args)` must throw the raw API error) and, optionally,
 * how to tell from the job's current status that it already happened (`isDone(job, ...args)`).
 */
export const registerOfflineAction = (type, run, isDone = null) => {
  executors[type] = run;
  if (isDone) doneChecks[type] = isDone;
};

const sortByTime = (items) => items.sort((first, second) => (first.createdAt < second.createdAt ? -1 : first.createdAt > second.createdAt ? 1 : 0));

const readAll = async (store) => {
  const items = [];
  try {
    await store.iterate((value) => { items.push(value); });
  } catch {
    return [];
  }
  return sortByTime(items);
};

export const listPendingActions = async () => (await readAll(pending)).filter(isMine);
export const listFailedActions = async () => (await readAll(failed)).filter(isMine);

export const dismissFailedAction = async (id) => {
  await failed.removeItem(id);
  notify();
};

/** Save an action for later. `args` may contain Files; functions are not kept. */
export const queueAction = async (type, ticketId, args, label) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pending.setItem(id, {
    id,
    ownerId: currentUserId(),
    type,
    ticketId: String(ticketId),
    args,
    label: label || type,
    createdAt: new Date().toISOString(),
  });
  notify();
  return { queued: true, queuedId: id };
};

/**
 * Try `run(...args)`; when it fails for lack of network, save it for later and return
 * `{ queued: true }`. Other failures are thrown unchanged.
 */
export const runOrQueue = async ({ type, ticketId, args, label }) => {
  try {
    return await executors[type](...args);
  } catch (error) {
    if (isNetworkFailure(error)) return queueAction(type, ticketId, args, label);
    throw error;
  }
};

const serverReason = (error) => {
  const data = error?.response?.data;
  if (data && typeof data === 'object') return data.error || data.detail || JSON.stringify(data).slice(0, 200);
  return error?.message || 'The server refused this action.';
};

/** Send what is waiting. Safe to call often; only one run at a time. */
export const flushOfflineQueue = async () => {
  if (flushing) return flushing;
  flushing = (async () => {
    const blockedTickets = new Set();
    let sent = 0;
    for (const action of (await readAll(pending)).filter(isMine)) {
      if (blockedTickets.has(action.ticketId)) continue;
      const run = executors[action.type];
      if (!run) continue;
      try {
        await run(...action.args);
        await pending.removeItem(action.id);
        sent += 1;
      } catch (error) {
        if (isNetworkFailure(error)) break; // still no signal: try again later
        let alreadyDone = false;
        try {
          alreadyDone = Boolean(await doneChecks[action.type]?.(action.ticketId, ...action.args));
        } catch {
          alreadyDone = false;
        }
        if (alreadyDone) {
          await pending.removeItem(action.id);
          continue;
        }
        blockedTickets.add(action.ticketId);
        const reason = serverReason(error);
        // This action and the rest of the job's waiting actions need the technician's attention.
        for (const later of (await readAll(pending)).filter(isMine)) {
          if (later.ticketId !== action.ticketId) continue;
          await failed.setItem(later.id, { ...later, reason: later.id === action.id ? reason : 'Not sent because an earlier action for this job was refused.' });
          await pending.removeItem(later.id);
        }
      }
    }
    notify();
    return sent;
  })();
  try {
    return await flushing;
  } finally {
    flushing = null;
  }
};
