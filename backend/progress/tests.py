from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from services.models import ServiceRequest, ServiceTicket, ServiceType, TicketCrewAssignment
from users.models import User

from .models import TicketProgress


class TicketProgressAccessTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='progress_admin',
            password='StrongPass123!',
            role='admin',
            email_verified=True,
        )
        self.client_user = User.objects.create_user(
            username='progress_client',
            password='StrongPass123!',
            role='client',
            email_verified=True,
        )
        self.other_client = User.objects.create_user(
            username='other_progress_client',
            password='StrongPass123!',
            role='client',
            email_verified=True,
        )
        self.lead = User.objects.create_user(
            username='progress_lead',
            password='StrongPass123!',
            role='technician',
            email_verified=True,
        )
        self.crew = User.objects.create_user(
            username='progress_crew',
            password='StrongPass123!',
            role='technician',
            email_verified=True,
        )
        self.unassigned = User.objects.create_user(
            username='progress_unassigned',
            password='StrongPass123!',
            role='technician',
            email_verified=True,
        )

        service_type = ServiceType.objects.create(name='Progress Test Service')
        request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=service_type,
            description='Owned progress test request',
            status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=request,
            technician=self.lead,
            assigned_admin=self.admin,
            scheduled_date=timezone.localdate(),
            # Progress is reported while a job is under way.
            status='In Progress',
        )
        TicketCrewAssignment.objects.create(ticket=self.ticket, technician=self.crew)
        self.progress = TicketProgress.objects.create(
            ticket=self.ticket,
            updated_by=self.lead,
            progress_status='Assigned',
            comment='Initial assignment',
        )

        other_request = ServiceRequest.objects.create(
            client=self.other_client,
            service_type=service_type,
            description='Other progress test request',
            status='Approved',
        )
        other_ticket = ServiceTicket.objects.create(
            request=other_request,
            technician=self.unassigned,
            assigned_admin=self.admin,
            scheduled_date=timezone.localdate(),
        )
        self.other_progress = TicketProgress.objects.create(
            ticket=other_ticket,
            updated_by=self.unassigned,
            progress_status='Assigned',
        )

        self.list_url = reverse('ticketprogress-list')

    def authenticate(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_client_can_only_read_progress_for_owned_tickets(self):
        self.authenticate(self.client_user)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result_ids = {item['id'] for item in response.data['results']}
        self.assertEqual(result_ids, {self.progress.id})

    def test_client_cannot_create_progress(self):
        self.authenticate(self.client_user)

        response = self.client.post(self.list_url, {
            'ticket': self.ticket.id,
            'progress_status': 'Client supplied update',
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unassigned_technician_cannot_create_progress(self):
        self.authenticate(self.unassigned)

        response = self.client.post(self.list_url, {
            'ticket': self.ticket.id,
            'progress_status': 'Unauthorized update',
                    'comment': 'Mounted the rails on the east roof.',
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_lead_and_crew_can_append_progress_for_assigned_ticket(self):
        for user in (self.lead, self.crew):
            with self.subTest(user=user.username):
                self.authenticate(user)
                response = self.client.post(self.list_url, {
                    'ticket': self.ticket.id,
                    'progress_status': f'Update by {user.username}',
                    'comment': 'Mounted the rails on the east roof.',
                    'updated_by': self.admin.id,
                })

                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                created = TicketProgress.objects.get(pk=response.data['id'])
                self.assertEqual(created.updated_by, user)

    def test_admin_can_append_progress(self):
        self.authenticate(self.admin)

        response = self.client.post(self.list_url, {
            'ticket': self.ticket.id,
            'progress_status': 'Administrative update',
            'comment': 'Crew confirmed the second roof section.',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TicketProgress.objects.get(pk=response.data['id']).updated_by, self.admin)

    def test_progress_records_cannot_be_edited_or_deleted(self):
        self.authenticate(self.admin)
        detail_url = reverse('ticketprogress-detail', args=[self.progress.id])

        patch_response = self.client.patch(detail_url, {'comment': 'Rewritten history'})
        delete_response = self.client.delete(detail_url)

        self.assertEqual(patch_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(delete_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.progress.refresh_from_db()
        self.assertEqual(self.progress.comment, 'Initial assignment')


class LongJobProgressReportTests(APITestCase):
    """Technicians report progress on long jobs: a percent, a note, photos; the client is told."""

    def setUp(self):
        from notifications.models import Notification  # noqa: F401  (imported for the assertions below)

        self.client_user = User.objects.create_user(username='report_client', password='StrongPass123!', role='client', email_verified=True)
        self.lead = User.objects.create_user(username='report_lead', password='StrongPass123!', role='technician', email_verified=True)
        service_type = ServiceType.objects.create(name='Long Report Service', estimated_duration=20 * 480)
        request = ServiceRequest.objects.create(client=self.client_user, service_type=service_type, description='x', status='Approved')
        self.ticket = ServiceTicket.objects.create(
            request=request, technician=self.lead, scheduled_date=timezone.localdate(), status='In Progress',
        )
        token, _ = Token.objects.get_or_create(user=self.lead)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.url = reverse('ticketprogress-list')

    def test_a_report_with_percent_and_photo_is_saved_and_the_client_is_told(self):
        from io import BytesIO

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        from notifications.models import Notification

        buffer = BytesIO()
        Image.new('RGB', (4, 4), (200, 120, 40)).save(buffer, format='PNG')
        photo = SimpleUploadedFile('rails.png', buffer.getvalue(), content_type='image/png')

        response = self.client.post(self.url, {
            'ticket': self.ticket.id, 'percent_complete': 40, 'comment': 'Rails mounted on the east roof.', 'photo_files': [photo],
        }, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        report = TicketProgress.objects.get(pk=response.data['id'])
        self.assertEqual(report.percent_complete, 40)
        self.assertEqual(len(report.photo_urls), 1)
        self.assertIsNotNone(report.work_date)
        self.assertEqual(response.data['updated_by_name'], 'report_lead')
        notice = Notification.objects.filter(user=self.client_user, title='Job progress update').first()
        self.assertIsNotNone(notice)
        self.assertIn('40% done', notice.message)

    def test_reports_need_a_note_or_percent_and_a_job_under_way(self):
        empty = self.client.post(self.url, {'ticket': self.ticket.id}, format='multipart')
        self.assertEqual(empty.status_code, status.HTTP_400_BAD_REQUEST)
        too_high = self.client.post(self.url, {'ticket': self.ticket.id, 'percent_complete': 140}, format='multipart')
        self.assertEqual(too_high.status_code, status.HTTP_400_BAD_REQUEST)

        ServiceTicket.objects.filter(pk=self.ticket.pk).update(status='Completed')
        finished = self.client.post(self.url, {'ticket': self.ticket.id, 'comment': 'Late note.'}, format='multipart')
        self.assertEqual(finished.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reports_can_be_listed_for_one_ticket(self):
        TicketProgress.objects.create(ticket=self.ticket, updated_by=self.lead, progress_status='Progress update', comment='Day one.')
        response = self.client.get(self.url, {'ticket': self.ticket.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item['comment'] for item in response.data['results']], ['Day one.'])
        self.assertEqual(self.client.get(self.url, {'ticket': 'abc'}).data['results'], [])


class ReportedProgressBarTests(APITestCase):
    def test_the_progress_bar_follows_the_latest_report_while_work_is_under_way(self):
        from services.job_progress import get_ticket_workflow_progress

        client_user = User.objects.create_user(username='bar_client', password='StrongPass123!', role='client')
        lead = User.objects.create_user(username='bar_lead', password='StrongPass123!', role='technician')
        service_type = ServiceType.objects.create(name='Bar Service', estimated_duration=960)
        request = ServiceRequest.objects.create(client=client_user, service_type=service_type, description='x', status='Approved')
        ticket = ServiceTicket.objects.create(request=request, technician=lead, scheduled_date=timezone.localdate(), status='In Progress')

        self.assertEqual(get_ticket_workflow_progress(ticket)['percent'], 70)
        TicketProgress.objects.create(ticket=ticket, updated_by=lead, progress_status='Progress update', percent_complete=50)
        halfway = get_ticket_workflow_progress(ticket)
        self.assertEqual(halfway['percent'], 85)
        self.assertEqual(halfway['label'], 'Work underway — 50% done')
        self.assertEqual(halfway['basis'], 'technician_report')

        TicketProgress.objects.create(ticket=ticket, updated_by=lead, progress_status='Progress update', percent_complete=100)
        self.assertEqual(get_ticket_workflow_progress(ticket)['percent'], 99)  # 100 only when completed
        ticket.status = 'Completed'
        self.assertEqual(get_ticket_workflow_progress(ticket)['percent'], 100)
