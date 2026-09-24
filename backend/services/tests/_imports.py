"""Shared imports preserved from the former services.tests monolith."""

from django.test import TestCase
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from datetime import datetime, time, timedelta
import base64
from decimal import Decimal
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from django.utils import timezone
from notifications.models import Notification
from users.models import User
from users.models import UserCapabilityGrant
from users.rbac import (
    AFTER_SALES_CASES_MANAGE,
    AFTER_SALES_CASES_VIEW,
    AFTER_SALES_DASHBOARD_VIEW,
    ADMIN_JOB_HISTORY_VIEW,
    SUPERVISOR_DASHBOARD_VIEW,
    SUPERVISOR_TICKETS_VIEW,
    SUPERVISOR_DISPATCH_VIEW,
    SUPERVISOR_TRACKING_VIEW,
    TECHNICIAN_DASHBOARD_VIEW,
    TECHNICIAN_PROFILE_VIEW,
)
from services import ors_utils
from services.models import (
    AfterSalesCase as FollowUpCase,
    AfterSalesCaseEvent,
    InspectionChecklist,
    MaintenanceSchedule,
    ServiceType,
    ServiceRequest,
    ServiceTicket,
    ServiceLocation,
    ServiceStatusHistory,
    TechnicianSkill,
    TicketCrewAssignment,
    GeneratedDocument,
    InstalledEquipment,
    TurnoverAcceptance,
)
from services.sla import (
    evaluate_service_request_sla,
    evaluate_service_ticket_sla,
    get_ticket_dispatch_state,
)
