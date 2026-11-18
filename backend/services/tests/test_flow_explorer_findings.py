"""Bugs the flow explorer found (2026-11-18), pinned as plain tests."""

from services.models import InspectionChecklist, ServiceTicket
from users.models import User

from .test_job_type_cancel_matrix import JobWalker


class FlowExplorerFindingsTests(JobWalker):
    def reported_inspection(self):
        job = self.new_job('inspection first')
        for stage in ('pending', 'approved', 'insp_assigned', 'insp_navigating', 'insp_arrived', 'insp_in_progress', 'insp_on_hold', 'insp_completed'):
            self.step(job, stage)
        job['ticket'].refresh_from_db()
        self.assertEqual(job['ticket'].status, 'Inspection Completed')
        return job

    def test_a_reported_inspection_cannot_be_travelled_or_worked_again(self):
        """A stray "Start travel" took the visit out of review; the office could no longer decide it."""
        job = self.reported_inspection()
        ticket_id = job['ticket'].id
        travel = self.as_(job['lead']).post(f'/api/technician/jobs/{ticket_id}/start-navigation/', {}, format='json')
        self.assertEqual(travel.status_code, 400, travel.data)
        self.assertIn('office reviews it next', travel.data['error'])
        for new_status in ('Navigating', 'Arrived on Site'):
            office = self.as_(self.office).post(f'/api/services/service-tickets/{ticket_id}/update_status/', {'status': new_status, 'reason': 'Try it.'}, format='json')
            self.assertEqual(office.status_code, 400, (new_status, office.data))
        self.assertEqual(ServiceTicket.objects.get(pk=ticket_id).status, 'Inspection Completed')

        # The office review is still open.
        review = self.as_(self.office).post(f'/api/services/service-tickets/{ticket_id}/inspection_decision/', {
            'decision': 'cancel', 'notes': 'Roof not feasible.',
        }, format='json')
        self.assertEqual(review.status_code, 200, review.data)

    def test_a_manual_status_change_cannot_skip_the_inspection_review(self):
        """Manual "Ready for Service" left an inspection visit in service work that could never finish."""
        job = self.reported_inspection()
        ticket_id = job['ticket'].id
        for new_status in ('Ready for Service', 'Awaiting Materials'):
            response = self.as_(self.office).post(f'/api/services/service-tickets/{ticket_id}/update_status/', {'status': new_status, 'reason': 'Skip it.'}, format='json')
            self.assertEqual(response.status_code, 400, (new_status, response.data))
            self.assertIn('Use Review Inspection', response.data['error'])
        cancel = self.as_(self.office).post(f'/api/services/service-tickets/{ticket_id}/update_status/', {'status': 'Cancelled', 'reason': 'Office cancelled: not feasible.'}, format='json')
        self.assertEqual(cancel.status_code, 200, cancel.data)

    def inspection_in_progress(self):
        job = self.new_job('inspection first')
        for stage in ('pending', 'approved', 'insp_assigned', 'insp_navigating', 'insp_arrived', 'insp_in_progress'):
            self.step(job, stage)
        job['ticket'].refresh_from_db()
        self.assertEqual((job['ticket'].status, job['ticket'].ticket_type), ('In Progress', 'inspection'))
        return job

    def test_the_service_checklist_is_refused_on_an_inspection_visit(self):
        """It marked the shared record complete, so the inspection report could no longer move the visit."""
        job = self.inspection_in_progress()
        response = self.as_(job['lead']).post('/api/checklist/', {
            'jobId': job['ticket'].id, 'completed': {'0': True},
            'checklist_items': [{'index': 0, 'label': 'Do the work', 'completed': True}],
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('Submit the inspection report', response.data['error'])
        self.assertFalse(InspectionChecklist.objects.filter(ticket=job['ticket'], is_completed=True).exists())

    def test_the_report_still_moves_a_visit_whose_record_was_already_marked_complete(self):
        """Repairs visits stuck that way before the fix."""
        job = self.inspection_in_progress()
        InspectionChecklist.objects.create(ticket=job['ticket'], is_completed=True)
        report = InspectionChecklist.objects.get(ticket=job['ticket'])
        response = self.as_(job['lead']).post(f'/api/services/inspections/{report.id}/complete/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        job['ticket'].refresh_from_db()
        self.assertEqual(job['ticket'].status, 'Inspection Completed')

    def test_completing_an_inspection_report_you_cannot_see_answers_404_not_500(self):
        job = self.reported_inspection()
        report = InspectionChecklist.objects.get(ticket=job['ticket'])
        outsider = User.objects.create_user(username='fx-outsider', password='x', role='technician', status='active')
        for path in (f'/api/services/inspections/{report.id}/complete/', '/api/services/inspections/999999/complete/'):
            response = self.as_(outsider).post(path, {}, format='json')
            self.assertEqual(response.status_code, 404, (path, response.status_code))
        missing = self.as_(self.office).post('/api/services/turnover-acceptances/999999/finalize/', {}, format='json')
        self.assertIn(missing.status_code, (404, 405))
        self.assertEqual(self.as_(self.office).delete('/api/services/document-definitions/999999/').status_code, 404)
        self.assertEqual(self.as_(self.office).delete('/api/services/document-templates/999999/').status_code, 404)
