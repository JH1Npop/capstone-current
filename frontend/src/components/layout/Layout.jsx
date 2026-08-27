import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '../../context/AuthContext';
import OnlineStatusBanner from '../shared/OnlineStatusBanner';

const SystemAssistant = lazy(() => import('../shared/SystemAssistant'));

export default function Layout({ children }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' && localStorage.getItem('afn_sidebar_collapsed') === 'true'
  ));
  const [sidebarAnimating, setSidebarAnimating] = useState(false);
  const [assistantReady, setAssistantReady] = useState(false);
  const animationTimer = useRef(null);
  const showSystemAssistant = ['admin', 'superadmin'].includes(user?.role);
  const adminWorkspace = ['admin', 'superadmin'].includes(user?.role);
  const collapsibleWorkspace = Boolean(user?.role);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((value) => !value), []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarAnimating(true);
    window.clearTimeout(animationTimer.current);
    animationTimer.current = window.setTimeout(() => setSidebarAnimating(false), 320);

    setSidebarCollapsed((value) => {
      const nextValue = !value;
      localStorage.setItem('afn_sidebar_collapsed', String(nextValue));
      return nextValue;
    });
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(animationTimer.current);
  }, []);

  useEffect(() => {
    if (!showSystemAssistant) {
      setAssistantReady(false);
      return undefined;
    }

    const startAssistant = () => setAssistantReady(true);
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(startAssistant, { timeout: 2500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(startAssistant, 900);
    return () => window.clearTimeout(timeoutId);
  }, [showSystemAssistant]);

  return (
    <div className="min-h-dvh bg-brand-900 p-1 sm:p-2">
      <div className="min-h-[calc(100dvh-0.5rem)] rounded-[14px] bg-gradient-to-br from-brand-100 via-slate-50 to-brand-200 sm:min-h-[calc(100dvh-1rem)] sm:rounded-[18px] lg:flex lg:h-[calc(100dvh-1rem)] lg:min-h-0 lg:overflow-hidden">
        <Sidebar
          user={user}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={collapsibleWorkspace && sidebarCollapsed}
          animate={sidebarAnimating}
        />

        <div className={`flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden ${sidebarAnimating ? 'transition-[margin] duration-300 ease-in-out' : ''} ${collapsibleWorkspace && sidebarCollapsed ? 'lg:ml-14' : 'lg:ml-64'}`}>
          <Topbar
            toggleSidebar={toggleSidebar}
            toggleSidebarCollapsed={toggleSidebarCollapsed}
            sidebarCollapsed={collapsibleWorkspace && sidebarCollapsed}
            canCollapseSidebar={collapsibleWorkspace}
          />

          <main className={`min-h-0 flex-1 touch-pan-y overflow-visible px-2 pb-4 pt-1 sm:px-4 md:px-5 lg:overflow-y-auto lg:overscroll-contain lg:px-6 lg:pb-6 lg:pt-1 ${adminWorkspace ? 'admin-workspace-density' : ''}`}>
            <div className="mx-auto w-full max-w-[1500px]">
              <OnlineStatusBanner />
              {children}
            </div>
          </main>
        </div>
      </div>
      {showSystemAssistant && assistantReady ? (
        <Suspense fallback={null}>
          <SystemAssistant />
        </Suspense>
      ) : null}
    </div>
  );
}
