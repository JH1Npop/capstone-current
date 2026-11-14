import { useState } from 'react';
import { FiDownload, FiX } from 'react-icons/fi';
import usePwaInstallPrompt from '../../hooks/usePwaInstallPrompt';

// Always visible until the app is installed. With a browser prompt it installs in one tap;
// otherwise (iPhone Safari, or a browser that has not offered the prompt) it shows the steps.
export default function InstallAppButton({ className = '', label = 'Install app', labelClassName = '' }) {
  const { canInstall, isInstalled, isIos, install } = usePwaInstallPrompt();
  const [helpOpen, setHelpOpen] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (canInstall) {
      await install();
      return;
    }
    setHelpOpen((open) => !open);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        aria-expanded={canInstall ? undefined : helpOpen}
        className={className || 'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-brand-50 hover:text-brand-700'}
      >
        <FiDownload size={16} aria-hidden="true" />
        <span className={labelClassName}>{label}</span>
      </button>
      {helpOpen && !canInstall && (
        <div
          role="dialog"
          aria-label="How to install the app"
          className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 text-left text-sm text-slate-700 shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-slate-900">Install AFN SERVE</p>
            <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700">
              <FiX size={16} />
            </button>
          </div>
          {isIos ? (
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Open this page in <strong>Safari</strong>.</li>
              <li>Tap the <strong>Share</strong> button.</li>
              <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
            </ol>
          ) : (
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Open this page in <strong>Chrome</strong> or <strong>Edge</strong>.</li>
              <li>Open the browser menu (<strong>⋮</strong>).</li>
              <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
