import { FiWifiOff } from 'react-icons/fi';
import useOnlineStatus from '../../hooks/useOnlineStatus';

export default function OnlineStatusBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
      <FiWifiOff className="shrink-0" size={16} />
      <span>You are offline. Cached records may be shown, and updates will need a connection.</span>
    </div>
  );
}
