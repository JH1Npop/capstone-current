import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  ADMIN_JOB_HISTORY_CAPABILITIES,
  INVENTORY_VIEW_CAPABILITIES,
  DOCUMENTS_VIEW_CAPABILITIES,
  ANALYTICS_VIEW_CAPABILITIES,
  REPORTS_VIEW_CAPABILITIES,
  AUDIT_VIEW_CAPABILITIES,
  SERVICE_CATALOG_VIEW_CAPABILITIES,
  PUBLIC_SITE_VIEW_CAPABILITIES,
  AFTER_SALES_CASE_CAPABILITIES,
  SUPERVISOR_DISPATCH_CAPABILITIES,
  SUPERVISOR_TRACKING_CAPABILITIES,
  SUPERVISOR_TICKETS_CAPABILITIES,
  TECHNICIAN_CHECKLIST_CAPABILITIES,
  TECHNICIAN_DASHBOARD_CAPABILITIES,
  TECHNICIAN_HISTORY_CAPABILITIES,
  TECHNICIAN_JOBS_CAPABILITIES,
  TECHNICIAN_MESSAGES_CAPABILITIES,
  TECHNICIAN_NAVIGATION_CAPABILITIES,
  TECHNICIAN_PROFILE_CAPABILITIES,
  TECHNICIAN_SCHEDULE_CAPABILITIES,
  USER_DIRECTORY_CAPABILITIES,
  canAccessAdminWorkspace,
  hasAnyCapability
} from './rbac';
import { RouteSkeleton } from './components/ui/LoadingSkeleton';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const Login = lazy(() => import('./pages/Login'));
const AboutPage = lazy(() => import('./pages/AboutUs'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminCalendar = lazy(() => import('./pages/admin/AdminCalendar'));
const TechnicianDashboard = lazy(() => import('./pages/technician/TechnicianDashboard'));
const ClientDashboard = lazy(() => import('./pages/client/ClientDashboard'));
const FollowUpCases = lazy(() => import('./pages/follow_up/FollowUpCases'));
const ClientRequestTracking = lazy(() => import('./pages/client/ClientRequestTracking'));
const ClientRequestDetail = lazy(() => import('./pages/client/ClientRequestDetail'));
const ClientServiceHistory = lazy(() => import('./pages/client/ClientServiceHistory'));
const ClientNotifications = lazy(() => import('./pages/client/ClientNotifications'));
const ClientProfile = lazy(() => import('./pages/client/ClientProfile'));
const ClientSupport = lazy(() => import('./pages/client/ClientSupport'));
const AdminServiceTickets = lazy(() => import('./pages/admin/AdminServiceTickets'));
const AdminTechnicianTracking = lazy(() => import('./pages/admin/AdminTechnicianTracking'));
const AdminServices = lazy(() => import('./pages/admin/AdminServices'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminOperationsReport = lazy(() => import('./pages/admin/AdminOperationsReport'));
const AdminUserManagement = lazy(() => import('./pages/admin/AdminUserManagement'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminLandingPage = lazy(() => import('./pages/admin/AdminLandingPage'));
const AdminActivityLogs = lazy(() => import('./pages/admin/AdminActivityLogs'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));
const AdminClientSupport = lazy(() => import('./pages/admin/AdminClientSupport'));
const CoverageHeatmap = lazy(() => import('./pages/admin/CoverageHeatmap'));
const AdminDispatchBoard = lazy(() => import('./pages/admin/AdminDispatchBoard'));
const TechnicianJobs = lazy(() => import('./pages/technician/TechnicianJobs'));
const ClientServiceRequests = lazy(() => import('./pages/client/ClientServiceRequests'));
const ClientSolarEstimates = lazy(() => import('./pages/client/ClientSolarEstimates'));
const TechnicianSchedule = lazy(() => import('./pages/technician/TechnicianSchedule'));
const TechnicianMapNavigation = lazy(() => import('./pages/technician/TechnicianMapNavigation'));
const TechnicianChecklist = lazy(() => import('./pages/technician/TechnicianChecklist'));
const TechnicianInspectionChecklist = lazy(() => import('./pages/technician/TechnicianInspectionChecklist'));
const TechnicianMessages = lazy(() => import('./pages/technician/TechnicianMessages'));
const TechnicianJobHistory = lazy(() => import('./pages/technician/TechnicianJobHistory'));
const TechnicianProfile = lazy(() => import('./pages/technician/TechnicianProfile'));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory'));
const AdminJobHistory = lazy(() => import('./pages/admin/AdminJobHistory'));
const AdminDocuments = lazy(() => import('./pages/admin/AdminDocuments'));

const getDashboardPath = (user) => {
  if (!user) {
    return '/login';
  }

  if (canAccessAdminWorkspace(user)) {
    return '/admin/dashboard';
  }

  if (user.role === 'technician') {
    if (hasAnyCapability(user, TECHNICIAN_DASHBOARD_CAPABILITIES)) {
      return '/technician/dashboard';
    }
    if (hasAnyCapability(user, TECHNICIAN_JOBS_CAPABILITIES)) {
      return '/technician/my-jobs';
    }
    if (hasAnyCapability(user, TECHNICIAN_SCHEDULE_CAPABILITIES)) {
      return '/technician/schedule';
    }
    if (hasAnyCapability(user, TECHNICIAN_NAVIGATION_CAPABILITIES)) {
      return '/technician/map-navigation';
    }
    if (hasAnyCapability(user, TECHNICIAN_CHECKLIST_CAPABILITIES)) {
      return '/technician/checklist';
    }
    if (hasAnyCapability(user, TECHNICIAN_MESSAGES_CAPABILITIES)) {
      return '/technician/messages';
    }
    if (hasAnyCapability(user, TECHNICIAN_HISTORY_CAPABILITIES)) {
      return '/technician/job-history';
    }
    if (hasAnyCapability(user, TECHNICIAN_PROFILE_CAPABILITIES)) {
      return '/technician/profile';
    }
  }

  if (user.role === 'client') {
    return '/client/dashboard';
  }

  return '/login';
};

function RoleRedirect() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div>Loading...</div>;
  }

  const target = user ? getDashboardPath(user) : '/login';

  // STOP infinite redirect
  if (location.pathname === target) {
    return null;
  }

  return <Navigate to={target} replace />;
}

const ProtectedRoute = ({ role, allowedRoles = [], requiredAnyCapability = [], children }) => {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const isRoleAllowed = role
    ? user.role === role
    : (allowedRoles.length > 0 ? allowedRoles.includes(user.role) : true);
  const isCapabilityAllowed =
    requiredAnyCapability.length > 0 ? hasAnyCapability(user, requiredAnyCapability) : true;

  if (!isRoleAllowed || !isCapabilityAllowed) {
    return <Navigate to={getDashboardPath(user)} replace />;
  }

  return children;
};

function AppRoutes() {
  const { user, isAuthenticated } = useAuth();

  return (
    <>
      <Suspense fallback={<RouteSkeleton />}>
        <Routes>
          <Route path="/" element={isAuthenticated? <RoleRedirect user={user} />: <LandingPage />}/>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/about-us" element={<AboutPage />} />
          <Route path="/solar-calculator" element={<LandingPage />} />

          <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/calendar" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={SUPERVISOR_DISPATCH_CAPABILITIES}><AdminCalendar /></ProtectedRoute>} />
          <Route path="/admin/service-tickets" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={SUPERVISOR_TICKETS_CAPABILITIES}><AdminServiceTickets /></ProtectedRoute>} />
          <Route path="/admin/dispatch-board" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={SUPERVISOR_DISPATCH_CAPABILITIES}><AdminDispatchBoard /></ProtectedRoute>} />
          <Route path="/admin/technician-tracking" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={SUPERVISOR_TRACKING_CAPABILITIES}><AdminTechnicianTracking /></ProtectedRoute>} />
          <Route
            path="/admin/technicians"
            element={<ProtectedRoute role="superadmin"><Navigate to="/admin/user-management?role=technician" replace /></ProtectedRoute>}
          />
          <Route
            path="/admin/clients"
            element={<ProtectedRoute role="superadmin"><Navigate to="/admin/user-management?role=client" replace /></ProtectedRoute>}
          />
          <Route path="/admin/services" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={SERVICE_CATALOG_VIEW_CAPABILITIES}><AdminServices /></ProtectedRoute>} />
          <Route path="/admin/inventory" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={INVENTORY_VIEW_CAPABILITIES}><AdminInventory /></ProtectedRoute>} />
          <Route path="/admin/documents" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={DOCUMENTS_VIEW_CAPABILITIES}><AdminDocuments /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={ANALYTICS_VIEW_CAPABILITIES}><AdminAnalytics /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={REPORTS_VIEW_CAPABILITIES}><AdminReports /></ProtectedRoute>} />
          <Route path="/admin/operations-report" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={REPORTS_VIEW_CAPABILITIES}><AdminOperationsReport /></ProtectedRoute>} />
          <Route path="/admin/after-sales-cases" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={AFTER_SALES_CASE_CAPABILITIES}><FollowUpCases /></ProtectedRoute>} />
          <Route path="/supervisor/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/supervisor/dispatch-board" element={<Navigate to="/admin/dispatch-board" replace />} />
          <Route path="/supervisor/technician-tracking" element={<Navigate to="/admin/technician-tracking" replace />} />
          <Route path="/supervisor/service-tickets" element={<Navigate to="/admin/service-tickets" replace />} />
          <Route path="/supervisor/user-access" element={<Navigate to="/admin/user-management" replace />} />
          <Route
            path="/admin/user-management"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={USER_DIRECTORY_CAPABILITIES}>
                <AdminUserManagement />
              </ProtectedRoute>
            }
          />
          <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminSettings /></ProtectedRoute>} />
          <Route path="/admin/landing-page" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={PUBLIC_SITE_VIEW_CAPABILITIES}><AdminLandingPage /></ProtectedRoute>} />
          <Route path="/admin/landing-page/preview" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={PUBLIC_SITE_VIEW_CAPABILITIES}><LandingPage /></ProtectedRoute>} />
          <Route path="/admin/activity-logs" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={AUDIT_VIEW_CAPABILITIES}><AdminActivityLogs /></ProtectedRoute>} />
          <Route path="/admin/profile" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminProfile /></ProtectedRoute>} />
          <Route path="/admin/notifications" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><ClientNotifications /></ProtectedRoute>} />
          <Route path="/admin/messages" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><TechnicianMessages /></ProtectedRoute>} />
          <Route path="/admin/client-support" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminClientSupport /></ProtectedRoute>} />
          <Route path="/admin/support" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><Navigate to="/admin/client-support" replace /></ProtectedRoute>} />
          <Route path="/admin/coverage-heatmap" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={SUPERVISOR_TRACKING_CAPABILITIES}><CoverageHeatmap /></ProtectedRoute>} />
          <Route path="/admin/job-history" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={ADMIN_JOB_HISTORY_CAPABILITIES}><AdminJobHistory /></ProtectedRoute>} />
          <Route path="/follow-up/dashboard" element={<Navigate to="/admin/dashboard#after-sales" replace />} />
          <Route path="/follow-up/cases" element={<Navigate to="/admin/after-sales-cases" replace />} />

          <Route path="/technician/dashboard" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_DASHBOARD_CAPABILITIES}><TechnicianDashboard /></ProtectedRoute>} />
          <Route path="/technician/my-jobs" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_JOBS_CAPABILITIES}><TechnicianJobs /></ProtectedRoute>} />
          <Route path="/technician/schedule" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_SCHEDULE_CAPABILITIES}><TechnicianSchedule /></ProtectedRoute>} />
          <Route path="/technician/map-navigation" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_NAVIGATION_CAPABILITIES}><TechnicianMapNavigation /></ProtectedRoute>} />
          <Route path="/technician/map" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_NAVIGATION_CAPABILITIES}><Navigate to="/technician/map-navigation" replace /></ProtectedRoute>} />
          <Route path="/technician/checklist" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_CHECKLIST_CAPABILITIES}><TechnicianChecklist /></ProtectedRoute>} />
          <Route path="/technician/inspection-checklist" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_CHECKLIST_CAPABILITIES}><TechnicianInspectionChecklist /></ProtectedRoute>} />
          <Route path="/technician/notifications" element={<ProtectedRoute role="technician"><ClientNotifications /></ProtectedRoute>} />
          <Route path="/technician/messages" element={<ProtectedRoute allowedRoles={['technician', 'admin', 'superadmin']} requiredAnyCapability={TECHNICIAN_MESSAGES_CAPABILITIES}><TechnicianMessages /></ProtectedRoute>} />
          <Route path="/technician/job-history" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_HISTORY_CAPABILITIES}><TechnicianJobHistory /></ProtectedRoute>} />
          <Route path="/technician/profile" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_PROFILE_CAPABILITIES}><TechnicianProfile /></ProtectedRoute>} />

          <Route path="/client/dashboard" element={<ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>} />
          <Route path="/client/service-requests" element={<ProtectedRoute role="client"><ClientServiceRequests /></ProtectedRoute>} />
          <Route path="/client/solar-estimates" element={<ProtectedRoute role="client"><ClientSolarEstimates /></ProtectedRoute>} />
          <Route path="/client/requests" element={<ProtectedRoute role="client"><ClientRequestTracking /></ProtectedRoute>} />
          <Route path="/client/requests/:requestId" element={<ProtectedRoute role="client"><ClientRequestDetail /></ProtectedRoute>} />
          <Route path="/client/service-history" element={<ProtectedRoute role="client"><ClientServiceHistory /></ProtectedRoute>} />
          <Route path="/client/support" element={<ProtectedRoute role="client"><ClientSupport /></ProtectedRoute>} />
          <Route path="/client/notifications" element={<ProtectedRoute role="client"><ClientNotifications /></ProtectedRoute>} />
          <Route path="/client/profile" element={<ProtectedRoute role="client"><ClientProfile /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
