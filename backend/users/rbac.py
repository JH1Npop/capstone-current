from collections import OrderedDict

SUPERADMIN_ROLE = 'superadmin'
ADMIN_ROLE = 'admin'
ADMIN_WORKSPACE_ROLES = {SUPERADMIN_ROLE, ADMIN_ROLE}
ADMIN_SCOPED_ROLES = set(ADMIN_WORKSPACE_ROLES)
ADMIN_SCOPE_DEFAULTS = {
    SUPERADMIN_ROLE: 'general',
    ADMIN_ROLE: 'general',
}
DELEGATED_AUTHORITY_ROLES = {ADMIN_ROLE}

AFTER_SALES_DASHBOARD_VIEW = 'after_sales.dashboard.view'
AFTER_SALES_CASES_VIEW = 'after_sales.cases.view'
AFTER_SALES_CASES_MANAGE = 'after_sales.cases.manage'
SUPERVISOR_DASHBOARD_VIEW = 'supervisor.dashboard.view'
SUPERVISOR_TICKETS_VIEW = 'supervisor.tickets.view'
SERVICE_REQUEST_REVIEW = 'services.requests.review'
SERVICE_TICKET_MANAGE = 'services.tickets.manage'
SUPERVISOR_DISPATCH_VIEW = 'supervisor.dispatch.view'
SUPERVISOR_TRACKING_VIEW = 'supervisor.tracking.view'
TECHNICIAN_DASHBOARD_VIEW = 'technician.dashboard.view'
TECHNICIAN_JOBS_VIEW = 'technician.jobs.view'
TECHNICIAN_SCHEDULE_VIEW = 'technician.schedule.view'
TECHNICIAN_NAVIGATION_VIEW = 'technician.navigation.view'
TECHNICIAN_CHECKLIST_VIEW = 'technician.checklist.view'
TECHNICIAN_MESSAGES_VIEW = 'technician.messages.view'
TECHNICIAN_HISTORY_VIEW = 'technician.history.view'
TECHNICIAN_PROFILE_VIEW = 'technician.profile.view'
ADMIN_JOB_HISTORY_VIEW = 'admin.job_history.view'
MANAGE_STAFF_CAPABILITIES = 'users.capabilities.manage_staff'
USER_DIRECTORY_VIEW = 'users.directory.view'
USER_MANAGEMENT_MANAGE = 'users.directory.manage'
PUBLIC_SITE_VIEW = 'public_site.view'
PUBLIC_SITE_MANAGE = 'public_site.manage'
INVENTORY_VIEW = 'inventory.view'
INVENTORY_MANAGE = 'inventory.manage'
SERVICE_CATALOG_VIEW = 'services.catalog.view'
SERVICE_CATALOG_MANAGE = 'services.catalog.manage'
DOCUMENTS_VIEW = 'documents.view'
DOCUMENTS_MANAGE = 'documents.manage'
ANALYTICS_VIEW = 'analytics.view'
REPORTS_VIEW = 'reports.view'
REPORTS_EXPORT = 'reports.export'
AUDIT_VIEW = 'audit.view'
ADMIN_CONFIGURED_MARKER = 'admin.configured'


CAPABILITY_DEFINITIONS = OrderedDict([
    (
        AFTER_SALES_DASHBOARD_VIEW,
        {
            'label': 'View after-sales dashboard',
            'description': 'Open the after-sales dashboard and review case health.',
            'category': 'After Sales',
            'assignable': True,
        },
    ),
    (
        AFTER_SALES_CASES_VIEW,
        {
            'label': 'View after-sales cases',
            'description': 'Open the after-sales queue and review customer recovery cases.',
            'category': 'After Sales',
            'assignable': True,
        },
    ),
    (
        AFTER_SALES_CASES_MANAGE,
        {
            'label': 'Manage after-sales cases',
            'description': 'Create and update after-sales cases for completed tickets.',
            'category': 'After Sales',
            'assignable': True,
        },
    ),
    (
        SUPERVISOR_DASHBOARD_VIEW,
        {
            'label': 'Open admin operations dashboard',
            'description': 'View the admin operations dashboard and queue health.',
            'category': 'Operations',
            'assignable': True,
        },
    ),
    (
        SUPERVISOR_TICKETS_VIEW,
        {
            'label': 'Open admin tickets',
            'description': 'Review service tickets inside the admin workspace.',
            'category': 'Operations',
            'assignable': True,
        },
    ),
    (
        SUPERVISOR_DISPATCH_VIEW,
        {
            'label': 'Open dispatch board',
            'description': 'Assign technicians and manage dispatch decisions.',
            'category': 'Operations',
            'assignable': True,
        },
    ),
    (
        SUPERVISOR_TRACKING_VIEW,
        {
            'label': 'Open technician tracking',
            'description': 'Monitor technician locations and live movement.',
            'category': 'Operations',
            'assignable': True,
        },
    ),
    (
        TECHNICIAN_DASHBOARD_VIEW,
        {
            'label': 'Open technician dashboard',
            'description': 'View the technician dashboard and daily workload.',
            'category': 'Technician',
            'assignable': True,
        },
    ),
    (
        TECHNICIAN_JOBS_VIEW,
        {
            'label': 'Open technician jobs',
            'description': 'Open the My Jobs page and update assigned work.',
            'category': 'Technician',
            'assignable': True,
        },
    ),
    (
        TECHNICIAN_SCHEDULE_VIEW,
        {
            'label': 'Open technician schedule',
            'description': 'Review the technician schedule and upcoming appointments.',
            'category': 'Technician',
            'assignable': True,
        },
    ),
    (
        TECHNICIAN_NAVIGATION_VIEW,
        {
            'label': 'Open technician navigation',
            'description': 'Open route guidance for assigned technician jobs.',
            'category': 'Technician',
            'assignable': True,
        },
    ),
    (
        TECHNICIAN_CHECKLIST_VIEW,
        {
            'label': 'Open technician checklist',
            'description': 'Use the technician checklist and proof-of-work flow.',
            'category': 'Technician',
            'assignable': True,
        },
    ),
    (
        TECHNICIAN_MESSAGES_VIEW,
        {
            'label': 'Open technician messages',
            'description': 'Open the technician messaging view.',
            'category': 'Technician',
            'assignable': True,
        },
    ),
    (
        TECHNICIAN_HISTORY_VIEW,
        {
            'label': 'Open technician history',
            'description': 'Review completed technician jobs and recent history.',
            'category': 'Technician',
            'assignable': True,
        },
    ),
    (
        TECHNICIAN_PROFILE_VIEW,
        {
            'label': 'Open technician profile',
            'description': 'Open and update the technician profile page.',
            'category': 'Technician',
            'assignable': True,
        },
    ),
    (
        MANAGE_STAFF_CAPABILITIES,
        {
            'label': 'Manage staff capabilities',
            'description': 'Grant and revoke approved staff capabilities.',
            'category': 'Operations',
            'assignable': True,
        },
    ),
    (
        USER_DIRECTORY_VIEW,
        {
            'label': 'View user directory',
            'description': 'Open the user directory and review internal and client accounts.',
            'category': 'Administration',
            'assignable': True,
        },
    ),
    (
        USER_MANAGEMENT_MANAGE,
        {
            'label': 'Manage users',
            'description': 'Create, edit, and deactivate other users in the directory.',
            'category': 'Administration',
            'assignable': True,
        },
    ),
    (
        ADMIN_JOB_HISTORY_VIEW,
        {
            'label': 'View job history & heatmap',
            'description': 'Open the completed job history page and service location heatmap.',
            'category': 'Administration',
            'assignable': True,
        },
    ),
    (
        PUBLIC_SITE_VIEW,
        {
            'label': 'View public site editor',
            'description': 'Open the landing-page editor and preview published website content.',
            'category': 'Public Site',
            'assignable': True,
        },
    ),
    (
        SERVICE_REQUEST_REVIEW,
        {
            'label': 'Review service requests',
            'description': 'Approve, reject, and cancel service requests in the operations queue.',
            'category': 'Operations',
            'assignable': True,
        },
    ),
    (
        SERVICE_TICKET_MANAGE,
        {
            'label': 'Manage service tickets',
            'description': 'Create, edit, reschedule, and make operational decisions on service tickets.',
            'category': 'Operations',
            'assignable': True,
        },
    ),
    (
        PUBLIC_SITE_MANAGE,
        {
            'label': 'Manage public site',
            'description': 'Publish landing-page content, promotions, and solar calculator settings.',
            'category': 'Public Site',
            'assignable': True,
        },
    ),
    (
        INVENTORY_VIEW,
        {
            'label': 'View inventory',
            'description': 'Review inventory items, availability, reservations, and stock history.',
            'category': 'Inventory',
            'assignable': True,
        },
    ),
    (
        INVENTORY_MANAGE,
        {
            'label': 'Manage inventory',
            'description': 'Create items and categories, adjust stock, and manage reservations.',
            'category': 'Inventory',
            'assignable': True,
        },
    ),
    (
        SERVICE_CATALOG_VIEW,
        {
            'label': 'View service catalog',
            'description': 'Review active and inactive services, procedures, and requirements.',
            'category': 'Services',
            'assignable': True,
        },
    ),
    (
        SERVICE_CATALOG_MANAGE,
        {
            'label': 'Manage service catalog',
            'description': 'Create, edit, deactivate, and configure service definitions.',
            'category': 'Services',
            'assignable': True,
        },
    ),
    (
        DOCUMENTS_VIEW,
        {
            'label': 'View project documents',
            'description': 'Review project drafts, quotations, reports, contracts, commissioning, and turnover records.',
            'category': 'Documents',
            'assignable': True,
        },
    ),
    (
        DOCUMENTS_MANAGE,
        {
            'label': 'Manage project documents',
            'description': 'Create, edit, finalize, and generate project and commercial records.',
            'category': 'Documents',
            'assignable': True,
        },
    ),
    (
        ANALYTICS_VIEW,
        {
            'label': 'View analytics',
            'description': 'Open analytics dashboards and review operational trends and forecasts.',
            'category': 'Reporting',
            'assignable': True,
        },
    ),
    (
        REPORTS_VIEW,
        {
            'label': 'View reports',
            'description': 'Open operational reports and review report data.',
            'category': 'Reporting',
            'assignable': True,
        },
    ),
    (
        REPORTS_EXPORT,
        {
            'label': 'Export reports',
            'description': 'Print reports and export report data to files.',
            'category': 'Reporting',
            'assignable': True,
        },
    ),
    (
        AUDIT_VIEW,
        {
            'label': 'View activity logs',
            'description': 'Review administrative activity and audit history.',
            'category': 'Administration',
            'assignable': True,
        },
    ),
    (
        ADMIN_CONFIGURED_MARKER,
        {
            'label': 'Admin Configured',
            'description': 'Internal marker indicating custom capabilities have been set.',
            'category': 'System',
            'assignable': False,
        },
    ),
])


STAFF_ROLE_CAPABILITY_MAP = {
    'technician': {
        TECHNICIAN_DASHBOARD_VIEW,
        TECHNICIAN_JOBS_VIEW,
        TECHNICIAN_SCHEDULE_VIEW,
        TECHNICIAN_NAVIGATION_VIEW,
        TECHNICIAN_CHECKLIST_VIEW,
        TECHNICIAN_MESSAGES_VIEW,
        TECHNICIAN_HISTORY_VIEW,
        TECHNICIAN_PROFILE_VIEW,
    },
}

STAFF_ROLES = set(STAFF_ROLE_CAPABILITY_MAP.keys())

MANAGEABLE_STAFF_ROLES = {ADMIN_ROLE} | STAFF_ROLES

ADMIN_ASSIGNABLE_CAPABILITIES = {
    AFTER_SALES_DASHBOARD_VIEW,
    AFTER_SALES_CASES_VIEW,
    AFTER_SALES_CASES_MANAGE,
    SUPERVISOR_DASHBOARD_VIEW,
    SUPERVISOR_TICKETS_VIEW,
    SERVICE_REQUEST_REVIEW,
    SERVICE_TICKET_MANAGE,
    SUPERVISOR_DISPATCH_VIEW,
    SUPERVISOR_TRACKING_VIEW,
    USER_DIRECTORY_VIEW,
    USER_MANAGEMENT_MANAGE,
    ADMIN_JOB_HISTORY_VIEW,
    PUBLIC_SITE_VIEW,
    PUBLIC_SITE_MANAGE,
    INVENTORY_VIEW,
    INVENTORY_MANAGE,
    SERVICE_CATALOG_VIEW,
    SERVICE_CATALOG_MANAGE,
    DOCUMENTS_VIEW,
    DOCUMENTS_MANAGE,
    ANALYTICS_VIEW,
    REPORTS_VIEW,
    REPORTS_EXPORT,
    AUDIT_VIEW,
}

AFTER_SALES_VIEW_CAPABILITIES = {
    AFTER_SALES_DASHBOARD_VIEW,
    AFTER_SALES_CASES_VIEW,
    AFTER_SALES_CASES_MANAGE,
}

AFTER_SALES_MANAGE_CAPABILITIES = {
    AFTER_SALES_CASES_MANAGE,
}

SUPERVISOR_DASHBOARD_CAPABILITIES = {
    SUPERVISOR_DASHBOARD_VIEW,
}

SUPERVISOR_TICKET_CAPABILITIES = {
    SUPERVISOR_TICKETS_VIEW,
    SERVICE_REQUEST_REVIEW,
    SERVICE_TICKET_MANAGE,
    SUPERVISOR_DISPATCH_VIEW,
    SUPERVISOR_TRACKING_VIEW,
}

SERVICE_REQUEST_REVIEW_CAPABILITIES = {
    SERVICE_REQUEST_REVIEW,
}

SERVICE_TICKET_MANAGE_CAPABILITIES = {
    SERVICE_TICKET_MANAGE,
}

SUPERVISOR_DISPATCH_CAPABILITIES = {
    SUPERVISOR_DISPATCH_VIEW,
}

SUPERVISOR_TRACKING_CAPABILITIES = {
    SUPERVISOR_TRACKING_VIEW,
}

SUPERVISOR_TECHNICIAN_DIRECTORY_CAPABILITIES = {
    SUPERVISOR_DISPATCH_VIEW,
    SUPERVISOR_TRACKING_VIEW,
}

TECHNICIAN_DASHBOARD_CAPABILITIES = {
    TECHNICIAN_DASHBOARD_VIEW,
}

TECHNICIAN_JOBS_CAPABILITIES = {
    TECHNICIAN_JOBS_VIEW,
}

TECHNICIAN_JOB_DETAIL_CAPABILITIES = {
    TECHNICIAN_JOBS_VIEW,
    TECHNICIAN_NAVIGATION_VIEW,
    TECHNICIAN_CHECKLIST_VIEW,
}

TECHNICIAN_SCHEDULE_CAPABILITIES = {
    TECHNICIAN_SCHEDULE_VIEW,
}

TECHNICIAN_NAVIGATION_CAPABILITIES = {
    TECHNICIAN_NAVIGATION_VIEW,
}

TECHNICIAN_CHECKLIST_CAPABILITIES = {
    TECHNICIAN_CHECKLIST_VIEW,
}

TECHNICIAN_MESSAGES_CAPABILITIES = {
    TECHNICIAN_MESSAGES_VIEW,
}

TECHNICIAN_HISTORY_CAPABILITIES = {
    TECHNICIAN_HISTORY_VIEW,
}

TECHNICIAN_PROFILE_CAPABILITIES = {
    TECHNICIAN_PROFILE_VIEW,
}

USER_DIRECTORY_VIEW_CAPABILITIES = {
    USER_DIRECTORY_VIEW,
}

USER_MANAGEMENT_CAPABILITIES = {
    USER_MANAGEMENT_MANAGE,
}

ADMIN_JOB_HISTORY_CAPABILITIES = {
    ADMIN_JOB_HISTORY_VIEW,
}

PUBLIC_SITE_VIEW_CAPABILITIES = {
    PUBLIC_SITE_VIEW,
    PUBLIC_SITE_MANAGE,
}

PUBLIC_SITE_MANAGE_CAPABILITIES = {
    PUBLIC_SITE_MANAGE,
}

INVENTORY_VIEW_CAPABILITIES = {
    INVENTORY_VIEW,
    INVENTORY_MANAGE,
}

INVENTORY_MANAGE_CAPABILITIES = {
    INVENTORY_MANAGE,
}

SERVICE_CATALOG_VIEW_CAPABILITIES = {
    SERVICE_CATALOG_VIEW,
    SERVICE_CATALOG_MANAGE,
}

SERVICE_CATALOG_MANAGE_CAPABILITIES = {
    SERVICE_CATALOG_MANAGE,
}

DOCUMENTS_VIEW_CAPABILITIES = {
    DOCUMENTS_VIEW,
    DOCUMENTS_MANAGE,
}

DOCUMENTS_MANAGE_CAPABILITIES = {
    DOCUMENTS_MANAGE,
}

ANALYTICS_VIEW_CAPABILITIES = {ANALYTICS_VIEW}
REPORTS_VIEW_CAPABILITIES = {REPORTS_VIEW, REPORTS_EXPORT}
REPORTS_EXPORT_CAPABILITIES = {REPORTS_EXPORT}
AUDIT_VIEW_CAPABILITIES = {AUDIT_VIEW}


ROLE_CAPABILITY_MAP = {
    SUPERADMIN_ROLE: set(CAPABILITY_DEFINITIONS.keys()),
    ADMIN_ROLE: {
        code for code in CAPABILITY_DEFINITIONS.keys()
        if code not in {
            MANAGE_STAFF_CAPABILITIES,
            ADMIN_JOB_HISTORY_VIEW,
            PUBLIC_SITE_VIEW,
            PUBLIC_SITE_MANAGE,
        }
    } | AFTER_SALES_VIEW_CAPABILITIES | SUPERVISOR_DASHBOARD_CAPABILITIES | SUPERVISOR_TICKET_CAPABILITIES | SUPERVISOR_DISPATCH_CAPABILITIES | SUPERVISOR_TRACKING_CAPABILITIES,
    'technician': set(STAFF_ROLE_CAPABILITY_MAP['technician']),
    'client': set(),
}


def get_role_capabilities(role):
    return set(ROLE_CAPABILITY_MAP.get(role or '', set()))


def get_capability_catalog(*, include_non_assignable=False):
    catalog = []
    for code, metadata in CAPABILITY_DEFINITIONS.items():
        if not include_non_assignable and not metadata.get('assignable', False):
            continue
        catalog.append({
            'code': code,
            **metadata,
        })
    return catalog


def get_staff_role_capability_codes(role):
    return set(STAFF_ROLE_CAPABILITY_MAP.get(role or '', set()))


def is_superadmin_role(role):
    return (role or '') == SUPERADMIN_ROLE


def is_admin_workspace_role(role):
    return (role or '') in ADMIN_WORKSPACE_ROLES


def is_admin_scoped_role(role):
    return (role or '') in ADMIN_SCOPED_ROLES


def get_default_admin_scope_for_role(role):
    return ADMIN_SCOPE_DEFAULTS.get(role or '')


def can_receive_delegated_authority(role):
    return (role or '') in DELEGATED_AUTHORITY_ROLES


def is_staff_role(role):
    return (role or '') in STAFF_ROLES


def get_assignable_capability_codes(actor, target_user=None):
    if not actor or not getattr(actor, 'is_authenticated', False):
        return set()

    target_role = getattr(target_user, 'role', None)

    actor_role = getattr(actor, 'role', None)

    if is_superadmin_role(actor_role):
        if target_role == ADMIN_ROLE:
            return set(ADMIN_ASSIGNABLE_CAPABILITIES)
        if target_role and is_staff_role(target_role):
            return get_staff_role_capability_codes(target_role)
        return {
            item['code']
            for item in get_capability_catalog(include_non_assignable=False)
        }

    return set()


def normalize_capability_codes(capability_codes):
    normalized_codes = []
    for code in capability_codes or []:
        normalized_code = str(code or '').strip()
        if normalized_code and normalized_code not in normalized_codes:
            normalized_codes.append(normalized_code)
    return normalized_codes


def get_unknown_capability_codes(capability_codes):
    known_codes = set(CAPABILITY_DEFINITIONS.keys())
    return sorted(set(normalize_capability_codes(capability_codes)) - known_codes)


def get_user_direct_capability_codes(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return set()

    prefetched_grants = getattr(user, '_prefetched_objects_cache', {}).get('capability_grants')
    if prefetched_grants is not None:
        return {grant.capability_code for grant in prefetched_grants}

    return set(user.capability_grants.values_list('capability_code', flat=True))


def get_user_capability_codes(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return set()

    role = getattr(user, 'role', None)
    role_capabilities = get_role_capabilities(role)
    direct_capabilities = get_user_direct_capability_codes(user)

    if is_superadmin_role(role):
        return role_capabilities

    # Any direct grants mean the account has been explicitly scoped. They
    # replace broad legacy defaults instead of silently retaining authority
    # that the capability editor did not select. The marker represents an
    # intentionally configured account with no assignable grants.
    if direct_capabilities:
        return direct_capabilities - {ADMIN_CONFIGURED_MARKER}

    return role_capabilities


def user_has_capability(user, capability_code):
    return capability_code in get_user_capability_codes(user)


def user_has_any_capability(user, capability_codes):
    effective_capabilities = get_user_capability_codes(user)
    return bool(effective_capabilities.intersection(set(capability_codes or [])))


def user_has_role_capability(user, role, capability_code):
    return getattr(user, 'role', None) == role and user_has_capability(user, capability_code)


def user_has_any_role_capability(user, role, capability_codes):
    return getattr(user, 'role', None) == role and user_has_any_capability(user, capability_codes)


def can_manage_user_capabilities(actor, target_user):
    if not actor or not getattr(actor, 'is_authenticated', False):
        return False

    target_role = getattr(target_user, 'role', None) if target_user else None

    if is_superadmin_role(getattr(actor, 'role', None)):
        if target_user is None:
            return True
        return target_role in MANAGEABLE_STAFF_ROLES

    return False
