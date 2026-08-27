"""
Services views package.
Split from the original monolithic services/views.py for maintainability.
All classes are re-exported here so existing imports continue to work.
"""

# Shared helpers and utilities
from services.views.helpers import *  # noqa: F401,F403

# analytics.py
from services.views.analytics import (
    GISDashboardView,
    ServiceAnalyticsViewSet,
    TechnicianPerformanceViewSet,
    DemandForecastViewSet,
    ServiceTrendViewSet,
)

# inspection.py
from services.views.inspection import (
    TechnicianSkillViewSet,
    ServiceStatusHistoryViewSet,
    InspectionChecklistViewSet,
    SolarCommissioningChecklistViewSet,
    TurnoverAcceptanceViewSet,
    TechnicalDataSheetViewSet,
    TechnicianLocationHistoryViewSet,
    InstallationContractViewSet,
)

# reports.py
from services.views.reports import (
    StatusReportsViewSet,
    CoverageHeatmapViewSet,
    ORSViewSet,
)

# service_requests.py
from services.views.service_requests import (
    ServiceRequestViewSet,
)

# service_types.py
from services.views.service_types import (
    ServiceTypeViewSet,
    SLARuleViewSet,
)

# technician.py
from services.views.technician import (
    TechnicianClientsView,
    TechnicianDashboardView,
    TechnicianJobsView,
    TechnicianScheduleView,
    TechnicianProfileView,
    TechnicianHistoryView,
)

# tickets.py
from services.views.tickets import (
    ServiceLocationViewSet,
    ServiceTicketViewSet,
)
