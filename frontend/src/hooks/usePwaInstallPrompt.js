import { useEffect, useState } from 'react';

export default function usePwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches
  ));

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) {
      return false;
    }

    promptEvent.prompt();
    const result = await promptEvent.userChoice;
    setPromptEvent(null);
    return result?.outcome === 'accepted';
  };

  return {
    canInstall: Boolean(promptEvent) && !isInstalled,
    install,
  };
}
