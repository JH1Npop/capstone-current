"""Service catalog: checklist steps, tool rows and deleting an unused service."""

from ._imports import *  # noqa: F403,F405


class ServiceCatalogValidationTests(APITestCase):
    def setUp(self):
        self.superadmin = User.objects.create_user(username='catalog_super', password='pass', role='superadmin')
        self.client.force_authenticate(self.superadmin)

    def _create(self, **extra):
        payload = {
            'name': extra.pop('name', 'Catalog Check Service'),
            'description': 'x',
            'estimated_duration': 60,
            'estimated_cost': 100,
            'max_daily_assignments': 3,
            'deposit_policy': 'none',
            'deposit_value': 0,
            **extra,
        }
        return self.client.post('/api/admin/services/', payload, format='json')

    def test_blank_checklist_steps_are_dropped_and_renumbered(self):
        response = self._create(procedures=[
            {'step': 1, 'title': 'Inspect panels', 'description': '', 'requires_photo': True},
            {'step': 2, 'title': '   ', 'description': 'left blank'},
            {'step': 3, 'title': 'Test output'},
        ])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        steps = ServiceType.objects.get(pk=response.data['id']).procedures
        self.assertEqual([step['title'] for step in steps], ['Inspect panels', 'Test output'])
        self.assertEqual([step['step'] for step in steps], [1, 2])
        self.assertTrue(steps[0]['requires_photo'])
        self.assertFalse(steps[1]['requires_photo'])

    def test_blank_tool_rows_are_dropped_and_quantities_checked(self):
        response = self._create(required_equipment=[{'name': 'Multimeter', 'quantity': '2'}, {'name': '', 'quantity': 1}])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(ServiceType.objects.get(pk=response.data['id']).required_equipment, [{'name': 'Multimeter', 'quantity': 2}])
        for bad in (0, -1, 'two', 1.5):
            with self.subTest(quantity=bad):
                rejected = self._create(name=f'Catalog Bad {bad}', required_equipment=[{'name': 'Ladder', 'quantity': bad}])
                self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('Ladder', str(rejected.data))

    def test_an_unused_service_can_be_deleted_but_a_used_one_cannot(self):
        unused = self._create(name='Catalog Unused').data
        self.assertTrue(unused['can_delete'])
        deleted = self.client.delete(f"/api/admin/services/{unused['id']}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(deleted.content, b'')  # a 204 response must not carry a body
        used = ServiceType.objects.create(name='Catalog Used', estimated_duration=60)
        client_user = User.objects.create_user(username='catalog_client', password='pass', role='client')
        ServiceRequest.objects.create(client=client_user, service_type=used, description='x', status='Pending')
        response = self.client.delete(f'/api/admin/services/{used.id}/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(ServiceType.objects.filter(pk=used.id).exists())
