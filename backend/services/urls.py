from django.urls import path, include
from rest_framework import routers
from .views import (
    ServiceTypeViewSet, SLARuleViewSet, ServiceRequestViewSet, ServiceLocationViewSet,
    ServiceTicketViewSet, TechnicianSkillViewSet, ServiceStatusHistoryViewSet,
    InspectionChecklistViewSet, SolarCommissioningChecklistViewSet, TurnoverAcceptanceViewSet, TechnicalDataSheetViewSet, InstallationContractViewSet, TechnicianLocationHistoryViewSet, GISDashboardView,
    ServiceAnalyticsViewSet, TechnicianPerformanceViewSet, DemandForecastViewSet, ServiceTrendViewSet,
    TechnicianClientsView, StatusReportsViewSet, ORSViewSet, CoverageHeatmapViewSet,
    TechnicianDashboardView, TechnicianJobsView, TechnicianScheduleView
)
from .views_follow_up import FollowUpCaseViewSet
from .views_dashboard import DashboardView
from .views.solar_estimates import SolarEstimateViewSet
from .views.sales_records import SalesRecordViewSet

router = routers.DefaultRouter()
router.register(r'service-types', ServiceTypeViewSet)
router.register(r'sla-rules', SLARuleViewSet)
router.register(r'service-requests', ServiceRequestViewSet)
router.register(r'service-locations', ServiceLocationViewSet)
router.register(r'service-tickets', ServiceTicketViewSet)
router.register(r'technician-skills', TechnicianSkillViewSet)
router.register(r'status-history', ServiceStatusHistoryViewSet)
router.register(r'inspections', InspectionChecklistViewSet)
router.register(r'solar-commissioning-checklists', SolarCommissioningChecklistViewSet)
router.register(r'turnover-acceptances', TurnoverAcceptanceViewSet)
router.register(r'technical-data-sheets', TechnicalDataSheetViewSet)
router.register(r'installation-contracts', InstallationContractViewSet)
router.register(r'technician-locations', TechnicianLocationHistoryViewSet)
router.register(r'gis-dashboard', GISDashboardView, basename='gis-dashboard')
router.register(r'analytics', ServiceAnalyticsViewSet)
router.register(r'technician-performance', TechnicianPerformanceViewSet)
router.register(r'demand-forecasts', DemandForecastViewSet)
router.register(r'service-trends', ServiceTrendViewSet)
router.register(r'technician-dashboard', TechnicianDashboardView, basename='technician-dashboard')
router.register(r'technician-jobs', TechnicianJobsView, basename='technician-jobs')
router.register(r'technician-schedule', TechnicianScheduleView, basename='technician-schedule')
router.register(r'follow-up-cases', FollowUpCaseViewSet, basename='follow-up-cases')
router.register(r'solar-estimates', SolarEstimateViewSet, basename='solar-estimate')
router.register(r'sales-records', SalesRecordViewSet, basename='sales-record')
router.register(r'coverage-heatmap', CoverageHeatmapViewSet, basename='coverage-heatmap')
router.register(r'ors', ORSViewSet, basename='ors')

from .views.tickets import InstalledEquipmentViewSet, QuotationRecordViewSet, SolarProjectProfileViewSet, FieldServiceReportViewSet

router.register(r'installed-equipment', InstalledEquipmentViewSet, basename='installed-equipment')
router.register(r'quotations', QuotationRecordViewSet, basename='quotation-record')
router.register(r'solar-project-profiles', SolarProjectProfileViewSet, basename='solar-project-profile')
router.register(r'field-service-reports', FieldServiceReportViewSet, basename='field-service-report')


urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/', DashboardView.as_view(), name='role-dashboard'),
    path('technician/location/', TechnicianLocationHistoryViewSet.as_view({'post': 'update_location'}), name='technician-location'),
    path('technician-clients/', TechnicianClientsView.as_view({'get': 'list'}), name='technician-clients'),
]
