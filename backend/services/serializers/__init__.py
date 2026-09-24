"""Public serializer API grouped into domain-focused modules."""

from .requests import (
    ServiceTypeSerializer,
    ServiceLocationSerializer,
    SLARuleSerializer,
    ServiceRequestServiceSerializer,
    SolarEstimateSerializer,
    ServiceRequestSerializer,
)
from .field_operations import (
    TechnicianSkillSerializer,
    ServiceStatusHistorySerializer,
    InspectionChecklistSerializer,
    SolarCommissioningChecklistSerializer,
    TurnoverAcceptanceSerializer,
)
from .commercial_records import (
    TechnicalDataSheetSerializer,
    QuotationRecordSerializer,
    SalesRecordLineSerializer,
    SalesRecordSerializer,
    GeneratedDocumentSerializer,
)
from .tickets import (
    TechnicianLocationHistorySerializer,
    ServiceTicketReportSerializer,
    ServiceTicketSerializer,
)
from .after_sales import (
    AfterSalesCaseEventSerializer,
    FollowUpCaseSerializer,
)
from .analytics import (
    AutoAssignSerializer,
    ServiceAnalyticsSerializer,
    TechnicianPerformanceSerializer,
    DemandForecastSerializer,
    ServiceTrendSerializer,
)
from .project_records import (
    InstalledEquipmentSerializer,
    InstallationContractSerializer,
    SolarProjectProfileSerializer,
    FieldServiceReportSerializer,
)

__all__ = [
    "ServiceTypeSerializer",
    "ServiceLocationSerializer",
    "SLARuleSerializer",
    "ServiceRequestServiceSerializer",
    "SolarEstimateSerializer",
    "ServiceRequestSerializer",
    "TechnicianSkillSerializer",
    "ServiceStatusHistorySerializer",
    "InspectionChecklistSerializer",
    "SolarCommissioningChecklistSerializer",
    "TurnoverAcceptanceSerializer",
    "TechnicalDataSheetSerializer",
    "QuotationRecordSerializer",
    "SalesRecordLineSerializer",
    "SalesRecordSerializer",
    "GeneratedDocumentSerializer",
    "TechnicianLocationHistorySerializer",
    "ServiceTicketReportSerializer",
    "ServiceTicketSerializer",
    "AfterSalesCaseEventSerializer",
    "FollowUpCaseSerializer",
    "AutoAssignSerializer",
    "ServiceAnalyticsSerializer",
    "TechnicianPerformanceSerializer",
    "DemandForecastSerializer",
    "ServiceTrendSerializer",
    "InstalledEquipmentSerializer",
    "InstallationContractSerializer",
    "SolarProjectProfileSerializer",
    "FieldServiceReportSerializer",
]
