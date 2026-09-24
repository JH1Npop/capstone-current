from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from services.models import ServiceRequest, ServiceTicket, ServiceType
from users.models import ActivityLog, User, UserCapabilityGrant
from users.rbac import (
    ANALYTICS_VIEW,
    AUDIT_VIEW,
    PUBLIC_SITE_VIEW,
    REPORTS_EXPORT,
    REPORTS_VIEW,
)


class ReportingCapabilityTests(APITestCase):
    analytics_url = '/api/admin/analytics/'
    performance_url = '/api/services/technician-performance/performance_breakdown/'
    report_url = '/api/services/service-tickets/report/'
    audit_url = '/api/admin/activity-logs/'

    def create_admin(self, username, *capabilities):
        user = User.objects.create_user(username=username, password='pass', role='admin')
        for capability in capabilities:
            UserCapabilityGrant.objects.create(user=user, capability_code=capability)
        return user

    def test_analytics_viewer_can_open_analytics_but_not_reports_or_audit(self):
        user = self.create_admin('analytics-viewer', ANALYTICS_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.analytics_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get('/api/dashboard/stats/', {'role': 'admin'}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(self.performance_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.report_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(self.audit_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_performance_breakdown_accepts_scheduled_date_without_assigned_datetime(self):
        admin = self.create_admin('analytics-scheduled-date', ANALYTICS_VIEW)
        technician = User.objects.create_user(username='scheduled-tech', password='pass', role='technician')
        client = User.objects.create_user(username='scheduled-client', password='pass', role='client')
        service_type = ServiceType.objects.create(name='Scheduled date regression')
        service_request = ServiceRequest.objects.create(
            client=client,
            service_type=service_type,
            description='Ticket without assigned_at',
            status='Approved',
        )
        ServiceTicket.objects.create(
            request=service_request,
            technician=technician,
            scheduled_date=date.today(),
            assigned_at=None,
            status='Ready for Service',
        )
        self.client.force_authenticate(admin)

        response = self.client.get(
            self.performance_url,
            {'start_date': date.today().isoformat(), 'end_date': date.today().isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        technician_result = next(item for item in response.data if item['technician_id'] == technician.id)
        self.assertEqual(technician_result['total_jobs'], 1)

    def test_report_viewer_can_read_report_but_not_other_reporting_areas(self):
        user = self.create_admin('report-viewer', REPORTS_VIEW)
        client = User.objects.create_user(username='report-client', password='pass', role='client')
        service_type = ServiceType.objects.create(name='Report serializer regression')
        service_request = ServiceRequest.objects.create(
            client=client,
            service_type=service_type,
            description='Ticket that exercises report serialization',
            status='Approved',
        )
        ServiceTicket.objects.create(
            request=service_request,
            scheduled_date=date.today(),
            status='Ready for Service',
        )
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.report_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.analytics_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(self.audit_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_report_export_capability_includes_report_view_access(self):
        user = self.create_admin('report-exporter', REPORTS_EXPORT)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.report_url).status_code, status.HTTP_200_OK)

    def test_audit_viewer_can_read_activity_logs_only(self):
        user = self.create_admin('audit-viewer', AUDIT_VIEW)
        ActivityLog.objects.create(
            actor=user,
            category='security',
            action='login',
            message='Audit capability test event.',
        )
        self.client.force_authenticate(user)

        response = self.client.get(self.audit_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['count'], 1)
        self.assertTrue(
            any(item['message'] == 'Audit capability test event.' for item in response.data['results'])
        )
        self.assertEqual(self.client.get(self.report_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(self.analytics_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_unrelated_configured_admin_is_denied_direct_api_access(self):
        user = self.create_admin('reporting-denied', PUBLIC_SITE_VIEW)
        self.client.force_authenticate(user)

        for url in (self.analytics_url, self.performance_url, self.report_url, self.audit_url):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
