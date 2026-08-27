export const getGPSNotice = ({ status, error, location }) => {
  if (location) return null;

  const secureContextBlocked =
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (secureContextBlocked) {
    return {
      tone: 'amber',
      title: 'GPS needs HTTPS on this device',
      message:
        'Phone browsers block live GPS on local HTTP links, so the permission prompt cannot open here. Use the deployed HTTPS site for full GPS tracking.'
    };
  }

  if (status === 'denied') {
    return {
      tone: 'red',
      title: 'GPS permission is turned off',
      message:
        'Please enable Location/GPS for this browser in phone settings, then refresh this page.',
      canRequestAccess: false
    };
  }

  if (error) {
    return {
      tone: 'amber',
      title: 'GPS is not available yet',
      message:
        error.message || 'Please turn on Location/GPS and allow browser location access.',
      canRequestAccess: true
    };
  }

  if (status === 'prompt' || status === 'unknown') {
    return {
      tone: 'amber',
      title: 'Turn on GPS to continue tracking',
      message:
        'Please turn on Location/GPS and allow location access when the browser asks.',
      canRequestAccess: true
    };
  }

  return null;
};

export const GPSNotice = ({ status, error, location, onRequestAccess, className = '' }) => {
  const notice = getGPSNotice({ status, error, location });
  if (!notice) return null;

  const toneClass =
    notice.tone === 'red'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-amber-200 bg-amber-50 text-amber-900';
  const buttonClass =
    notice.tone === 'red'
      ? 'bg-rose-600 hover:bg-rose-700'
      : 'bg-amber-600 hover:bg-amber-700';

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass} ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-1 leading-5">{notice.message}</p>
        </div>
        {notice.canRequestAccess && onRequestAccess && (
          <button
            type="button"
            onClick={onRequestAccess}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${buttonClass}`}
          >
            Allow GPS
          </button>
        )}
      </div>
    </div>
  );
};

const GPSStatusIndicator = ({ status, accuracy, className = '' }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'granted': return 'text-green-600';
      case 'prompt': return 'text-yellow-600';
      case 'denied': return 'text-red-600';
      case 'unknown': return 'text-yellow-600';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'granted': return 'GPS Active';
      case 'prompt': return 'GPS Permission Needed';
      case 'denied': return 'GPS Denied';
      case 'unknown': return 'GPS Unknown';
      default: return 'GPS Off';
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`h-2 w-2 rounded-full ${getStatusColor().replace('text-', 'bg-')}`} />
      <span className={`text-sm font-medium ${getStatusColor()}`}>
        {getStatusText()}
      </span>
      {accuracy && (
        <span className="text-xs text-gray-500">
          +/-{Math.round(accuracy)}m
        </span>
      )}
    </div>
  );
};

export default GPSStatusIndicator;
