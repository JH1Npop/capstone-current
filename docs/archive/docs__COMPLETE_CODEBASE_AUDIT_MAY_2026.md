# Complete Codebase Audit - May 13, 2026

## Executive Summary
**AFN Service Management** is a full-stack Django + React application for managing service requests, technician dispatch, inventory, and customer communication. The system uses role-based access control with 6 user types and capability-based feature gating.

**Status:** Operational with recent enhancements to technician dashboard and sidebar navigation.

---

## 1. ARCHITECTURE OVERVIEW

### Technology Stack
| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend** | Django REST Framework | 4.2.29 |
| **Frontend** | React + Vite | Latest |
| **Database** | SQLite (dev) / PostgreSQL (prod-ready) | - |
| **Authentication** | Token-based (DRF) | - |
| **Real-time** | Django Channels + Redis | - |
| **Maps** | Leaflet + OpenRouteService API | - |
| **Styling** | TailwindCSS | - |
| **Package Mgmt** | npm + pip | - |

### System Architecture Flow
```
┌─────────────────────────────────────────────────────────┐
│               FRONTEND (React 5173)                     │
│  - Login → AuthContext → Token Storage → API Calls     │
│  - Role-based routing (admin/supervisor/technician)     │
│  - Lazy-loaded pages with Suspense                      │
└─────────────────────────────────────────────────────────┘
                         ↕
              Axios HTTP + Token Auth
                         ↕
┌─────────────────────────────────────────────────────────┐
│          BACKEND API (Django 8000)                      │
│  - REST endpoints with permission classes              │
│  - Role-based access control (RBAC)                    │
│  - Capability grants for fine-grained permissions      │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│         DATABASE (SQLite/PostgreSQL)                    │
│  - User (role-based single model)                      │
│  - ServiceRequest → ServiceTicket → Technician         │
│  - Inventory, Notifications, Messages                  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. BACKEND STRUCTURE

### Django Apps (Installed)
| App | Purpose | Status |
|-----|---------|--------|
| `users` | Authentication, roles, capabilities | ✅ Core |
| `services` | Service tickets, requests, dispatch | ✅ Core |
| `inventory` | Stock management, reservations | ✅ Active |
| `notifications` | User alerts | ✅ Active |
| `messages_app` | Inter-user messaging | ✅ Re-enabled |
| `progress` | Job progress tracking | ⏸️ Disabled |
| `history` | Service history logs | ⏸️ Disabled |
| `forecast` | Demand forecasting | ⏸️ Disabled |

### User Model & Roles
**File:** `backend/users/models.py`

**Role Hierarchy:**
```
superadmin (owner, full access)
├─ admin (operations, staff management)
├─ supervisor (team management, dispatch)
├─ technician (field work, job execution)
├─ follow_up (after-sales service)
└─ client (service requests, tracking)
```

**Key Fields:**
- `role` (CharField: 6 choices)
- `admin_scope` (CharField: service_follow_up | task_management | operations | general)
- `phone`, `address`, `status` (active/inactive)
- `current_latitude`, `current_longitude` (technician GPS)
- `is_available` (technician availability flag)

### API Endpoints Structure
**File:** `backend/api/urls.py`, `backend/services/urls.py`, `backend/users/urls.py`

**Auth Routes:**
- `POST /api/users/login/` → Token authentication
- `POST /api/users/register/` → Create new user (client default)
- `POST /api/users/password_reset_request/` → Email reset link
- `GET /api/users/me/` → Current user profile

**Service Management:**
- `GET /api/services/service-tickets/` → Filtered by user role
- `POST /api/services/service-tickets/{id}/assign/` → Dispatch technician
- `POST /api/services/service-tickets/{id}/auto_assign/` → Smart assignment
- `POST /api/services/service-tickets/{id}/complete_work/` → Mark done

**Technician Dashboard:**
- `GET /api/services/technician/dashboard/` → Full dashboard data
- `GET /api/services/technician/jobs/` → Current jobs
- `GET /api/services/technician/schedule/` → Scheduled work

**Admin Management:**
- `GET /api/admin/technicians/` → List all technicians
- `GET /api/admin/clients/` → List all clients
- `GET /api/admin/analytics/` → Dashboard stats
- `PUT /api/admin/settings/` → System configuration

**Tracking & Mapping:**
- `GET /api/tracking/` → Technician locations + ticket markers
- `GET /api/dashboard/stats/` → Role-specific statistics

---

## 3. FRONTEND STRUCTURE

### Folder Organization
```
frontend/src/
├── pages/
│   ├── admin/          (AdminDashboard, AdminServiceTickets, DispatchBoard, etc.)
│   ├── supervisor/     (SupervisorDashboard, SupervisorTracking)
│   ├── technician/     (TechnicianDashboard, TechnicianJobs, TechnicianSchedule)
│   ├── client/         (ClientDashboard, ClientRequestTracking)
│   ├── follow_up/      (FollowUpDashboard, FollowUpCases)
│   ├── Login.jsx, Register.jsx, ResetPassword.jsx
│   └── shared/         (SharedOperationsDashboard)
├── components/
│   ├── Layout.jsx      (Sidebar + Topbar wrapper)
│   ├── Sidebar.jsx     (Role-based navigation menu)
│   ├── Topbar.jsx      (Notifications, user dropdown)
│   ├── StatusBadge.jsx, SLABadge.jsx
│   └── ... (UI components)
├── context/
│   └── AuthContext.jsx (Global auth state, token management)
├── api/
│   ├── core.js         (Axios instance, error handling)
│   ├── services.js     (Service ticket endpoints)
│   ├── admin.js        (Admin endpoints)
│   ├── technician.js   (Technician endpoints)
│   └── ... (other API modules)
├── rbac.js             (Role-based capabilities, permission checks)
├── hooks/              (useAuth, useGPSTracking, useFirebase)
└── utils/              (Helpers, formatters, dashboardHelpers.js)
```

### Authentication Flow
1. User logs in → `POST /api/users/login/`
2. Backend returns `{token, user, ...}`
3. **AuthContext** stores token in localStorage
4. Axios default header: `Authorization: Token {token}`
5. Each API call includes authentication
6. On logout: clear token, clear localStorage, redirect to `/login`

### Role-Based Routing
**File:** `frontend/src/App.jsx`

**Protected Route Component:**
```jsx
<ProtectedRoute role="technician">
  <TechnicianDashboard />
</ProtectedRoute>
```

Routes per role:
- **Superadmin/Admin:** `/admin/*` (dashboard, tickets, dispatch, users, settings)
- **Supervisor:** `/supervisor/*` (dashboard, tracking, dispatch)
- **Technician:** `/technician/*` (dashboard, jobs, schedule, map, checklist, messages)
- **Client:** `/client/*` (dashboard, requests, history, messages)
- **Follow-up:** `/follow-up/*` (cases dashboard)

### Capability-Based Feature Gating
**File:** `frontend/src/rbac.js`

Each feature has required capabilities:
```javascript
TECHNICIAN_DASHBOARD_CAPABILITIES = ['technician.dashboard.view']
TECHNICIAN_JOBS_CAPABILITIES = ['technician.jobs.view']
SUPERVISOR_TRACKING_CAPABILITIES = ['supervisor.tracking.view']
```

Components check capabilities before rendering:
```javascript
if (hasAnyCapability(user, TECHNICIAN_JOBS_CAPABILITIES)) {
  // Show "My Jobs" link in sidebar
}
```

---

## 4. DATA MODELS & RELATIONSHIPS

### Core Models
**File:** `backend/services/models.py`, `backend/users/models.py`

```
User (Single model for all roles)
  ├─ TechnicianProfile (GPS, availability data)
  ├─ ClientProfile (optional extended fields)
  └─ UserCapabilityGrant (many-to-many capabilities)

ServiceRequest
  ├─ client (FK → User)
  ├─ service_type (FK → ServiceType)
  ├─ location (1-to-1 → ServiceLocation)
  ├─ status (pending → approved → assigned → completed)
  └─ auto_ticket_created (boolean)

ServiceTicket (created from ServiceRequest)
  ├─ request (FK → ServiceRequest)
  ├─ technician (FK → User, role='technician')
  ├─ crew_assignments (1-to-many → TicketCrewAssignment)
  ├─ status (not_started → in_progress → completed → on_hold)
  ├─ scheduled_date, scheduled_time, scheduled_time_slot
  ├─ start_time, end_time
  ├─ completion_proof_images (JSON list)
  ├─ completion_notes (text)
  └─ service_status_history (1-to-many → ServiceStatusHistory)

InspectionChecklist
  ├─ service_type (FK → ServiceType)
  └─ items (1-to-many → ChecklistItem)

Inventory
  ├─ Item (stock)
  ├─ InventoryTransaction (usage log)
  ├─ InventoryReservation (allocated for job)
  └─ ServiceTypeRequirement (auto-reserve rules)

Notification
  ├─ user (FK → User)
  ├─ status (read/unread)
  └─ created_at

Message
  ├─ sender (FK → User)
  ├─ receiver (FK → User)
  └─ conversation_id (group chat)
```

### Recent Changes (May 2026)
**Modified:** `backend/services/views/technician.py`
- Dashboard API now returns `full_name` instead of ID for technician
- Client data structured as `{id, full_name}` object

**Modified:** `frontend/src/pages/technician/*.jsx`
- All client references use fallback: `client?.full_name || client`
- Handles both object and string client formats

**Fixed:** Sidebar navigation for technician role
- Added explicit `getTechnicianMenu(user)` call for role='technician'
- Removed redundant role label in header

---

## 5. AUTHENTICATION & PERMISSIONS

### Token-Based Auth
- **Method:** Django REST Framework Token Authentication
- **Storage:** localStorage (afn_token, afn_user)
- **Expiration:** No built-in expiry (configure for production)
- **Invalidation:** Manual logout clears token

### RBAC System
**File:** `backend/users/rbac.py`

**Capability Grants:**
- Each user can have multiple `UserCapabilityGrant` records
- Superadmin assigns capabilities to other users
- Capabilities follow pattern: `{resource}.{action}.{scope}`

Example:
```python
'technician.dashboard.view'
'technician.jobs.edit'
'supervisor.dispatch.manage'
'admin.users.manage'
'after_sales.cases.view'
```

**Role Capabilities:**
- **Superadmin:** All capabilities by default
- **Admin:** Configurable by superadmin (via capabilities)
- **Supervisor:** Team management, dispatch, tracking
- **Technician:** Own job management, profile
- **Client:** Service requests, self-tracking
- **Follow-up:** After-sales case management

### Permission Classes
**File:** `backend/users/permissions.py`, `backend/services/permissions.py`

Endpoints check permissions via:
```python
@permission_classes([IsAuthenticated, CanViewTechnicianJobs])
def technician_jobs(request):
    pass
```

---

## 6. KEY FEATURES & WORKFLOWS

### Service Request Workflow
1. **Client submits request** → `POST /api/services/service-requests/`
   - Auto-creates ServiceTicket if `auto_ticket_created=True`
   - Sends notification to admin/supervisors
2. **Admin approves request** → `POST /api/.../approve/`
3. **Auto-assign or manual dispatch** → `POST /api/.../assign/`
   - Algorithm: skills match + availability + distance + workload
4. **Technician starts work** → `POST /api/.../start_work/`
5. **Technician completes** → `POST /api/.../complete_work/`
   - Requires proof images
   - Updates completion_notes
6. **Client notified** → Notification sent

### Technician Dashboard
**Data returned:**
- Real technician name (not ID)
- Assigned jobs (today + active + completed)
- Next scheduled appointment
- GPS coordinates (live from tracking)
- Quick access to jobs, schedule, map, checklist

**Recent Fix:** Dashboard API now includes `full_name` for technician and client instead of just IDs.

### Dispatch Board
**Admin/Supervisor view:**
- List of unassigned tickets (status = "Not Started" or "Assigned")
- Available technicians (filtered by skill, availability, distance)
- Manual dispatch or auto-assign
- Real-time map view (Leaflet) with technician markers

### Inventory Management
- **Stock tracking** per item
- **Service requirements** (auto-reserve rules)
- **Transactions** (usage log with technician/date)
- **Reservations** (allocated for specific jobs)

### After-Sales Cases
- Triggered on ticket completion
- **Follow-up specialist** assigned
- **Case status** (open/pending/resolved)
- **Timeline** (created, due, resolved dates)

---

## 7. CONFIGURATION & SETTINGS

### Environment Variables (`.env`)
**Essential:**
```bash
DJANGO_ENV=development
DEBUG=True
SECRET_KEY=...
ALLOWED_HOSTS=localhost,127.0.0.1,testserver

# Database
DATABASE_ENGINE=sqlite3
SQLITE_DB_PATH=db.sqlite3

# API Keys (optional but recommended)
OPENROUTESERVICE_API_KEY=... (for route optimization)
GOOGLE_MAPS_API_KEY=... (optional)
FIREBASE_PROJECT_ID=... (for push notifications)
TWILIO_ACCOUNT_SID=... (for SMS, optional)

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:5173,...
CSRF_TRUSTED_ORIGINS=http://localhost:5173,...
```

### Django Settings Highlights
**File:** `backend/afn_service_management/settings.py`

- **REST_FRAMEWORK:** Token auth, 20-item pagination, JSON default renderer
- **INSTALLED_APPS:** 14 apps (users, services, inventory, etc.)
- **DATABASES:** SQLite (dev), PostgreSQL-ready (production)
- **CHANNELS:** Redis-backed WebSocket for real-time updates
- **SECURITY:** HSTS, XSS protection, CSRF validation

---

## 8. RECENT UPDATES (May 13, 2026)

### Changes Made
1. **Technician Dashboard API** - Returns full names instead of IDs
2. **Frontend Client Rendering** - Added fallback logic for both object/string formats
3. **Sidebar Navigation** - Fixed technician role menu visibility
4. **Data Structures** - Client now `{id, full_name}` instead of string

### Files Modified
- `backend/services/views/technician.py`
- `backend/services/views/tickets.py`
- `backend/services/views/inspection.py`
- `frontend/src/pages/technician/*.jsx` (5 files)
- `frontend/src/components/layout/Sidebar.jsx`

### Test Results
- ✅ `test_technician_dashboard_endpoint_returns_200_for_granted_technician` PASSED
- ✅ Auto-assign query fixed (technician_profile__is_available)
- ✅ Sidebar renders correctly for technician role

---

## 9. POTENTIAL ISSUES & RECOMMENDATIONS

### High Priority
1. **Token Expiration:** Implement token rotation or expiry for security
2. **ORS API Key:** Empty string fallback may cause issues; validate in settings
3. **Database:** SQLite in production is not recommended; migrate to PostgreSQL
4. **CORS:** Current origins include localhost; restrict for production

### Medium Priority
1. **Email Configuration:** Console backend active; configure real SMTP for production
2. **Firebase:** Credentials placeholder; populate for notifications to work
3. **WebSocket:** Redis dependency not installed; needed for real-time features
4. **Logging:** Info level default; increase verbosity for debugging

### Code Quality
1. **Disabled Apps:** Progress, history, forecast disabled but code remains; cleanup
2. **Test Coverage:** Limited test suite; add integration tests
3. **Error Handling:** Some endpoints lack detailed error messages
4. **Documentation:** API docs missing; add OpenAPI/Swagger

---

## 10. DEPLOYMENT NOTES

### Development
```bash
# Backend
cd backend
python manage.py migrate
python manage.py runserver

# Frontend
cd frontend
npm install
npm run dev
```

### Production Checklist
- [ ] Set `DEBUG=False`
- [ ] Configure `SECRET_KEY` (random, long string)
- [ ] Update `ALLOWED_HOSTS` with domain
- [ ] Switch to PostgreSQL
- [ ] Set `SECURE_SSL_REDIRECT=True`
- [ ] Configure email backend (SendGrid, AWS SES, etc.)
- [ ] Add Redis for Channels + caching
- [ ] Set up Firebase credentials
- [ ] Configure ORS/Google Maps API keys
- [ ] Run `npm run build` for frontend
- [ ] Serve with Gunicorn/uWSGI + Nginx
- [ ] Enable HTTPS/SSL

### Hosting Options
- **PythonAnywhere:** Simple deployment (documented in PYTHONANYWHERE_DEPLOYMENT.md)
- **Heroku:** Easy GitHub integration
- **AWS/DigitalOcean:** More control, higher complexity
- **Vercel:** Frontend only (documented in vercel.json)

---

## 11. KEY FILES REFERENCE

| Purpose | File | Lines |
|---------|------|-------|
| User model & roles | `backend/users/models.py` | ~200 |
| Service models | `backend/services/models.py` | ~1000 |
| API routing | `backend/api/urls.py` | ~300 |
| Auth context | `frontend/src/context/AuthContext.jsx` | ~200 |
| RBAC system | `frontend/src/rbac.js` | ~300 |
| Main app router | `frontend/src/App.jsx` | ~270 |
| Layout wrapper | `frontend/src/components/Layout.jsx` | ~20 |
| Sidebar menu | `frontend/src/components/Sidebar.jsx` | ~400 |

---

## 12. SYSTEM HEALTH SNAPSHOT

| Component | Status | Notes |
|-----------|--------|-------|
| Backend API | ✅ Running | Port 8000, development mode |
| Frontend | ✅ Running | Port 5173, Vite dev server |
| Database | ✅ SQLite | 14 MB, development only |
| Auth | ✅ Token-based | No expiry configured |
| Real-time | ⚠️ Channels | Redis not configured |
| Notifications | ⚠️ Firebase | Credentials placeholder |
| Maps | ✅ Leaflet | ORS API key in env |
| Tests | ⚠️ Limited | Targeted tests pass |

---

## Summary
AFN Service Management is a comprehensive, role-based service dispatch platform. Recent updates improved data display accuracy and sidebar navigation. The system is functional for development and demonstration but requires hardening for production use. Priority areas for improvement: token security, database migration, email/notification setup, and expanded test coverage.

**Last Updated:** May 13, 2026
**Next Review:** June 2026
