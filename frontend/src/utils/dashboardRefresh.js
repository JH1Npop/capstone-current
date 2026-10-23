import { fetchDashboardChanges } from '../api/api';
import { startVisibleInterval } from './visibleInterval';

// Check a cheap server change token every `intervalMs` and reload the full dashboard
// only when it differs. The token also rolls over each minute, so time-based states
// (SLA warnings, overdue schedules) still refresh. If the check fails, reload anyway
// so the dashboard never goes staler than the plain interval would allow.
export function startDashboardRefresh(reload, workspace, intervalMs) {
  let lastToken = null;
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const token = await fetchDashboardChanges(workspace);
      if (lastToken !== null && token !== lastToken) reload();
      lastToken = token;
    } catch {
      reload();
    } finally {
      checking = false;
    }
  };
  check();
  return startVisibleInterval(check, intervalMs);
}
