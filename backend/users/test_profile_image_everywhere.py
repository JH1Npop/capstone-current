"""A changed profile photo shows on Technician Tracking and in Messages on the next load."""
from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from messages_app.models import Message
from users.models import User


class ProfileImageEverywhereTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='photo-admin', password='pass', role='superadmin')
        self.technician = User.objects.create_user(
            username='photo-tech', password='pass', role='technician', first_name='Julius', last_name='White',
        )
        storage = User._meta.get_field('profile_image').storage
        patches = [
            patch.object(storage, 'exists', return_value=True),
            patch.object(storage, 'url', side_effect=lambda name: f'https://cdn.example.test/{name}'),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.client.force_authenticate(user=self.admin)

    def set_photo(self, name):
        User.objects.filter(pk=self.technician.pk).update(profile_image=name)

    def tracking_marker(self):
        response = self.client.get('/api/tracking/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return next(item for item in response.data['techMarkers'] if item['id'] == self.technician.id)

    def test_tracking_marker_carries_the_current_photo(self):
        self.assertEqual(self.tracking_marker()['profileImageUrl'], '')
        self.set_photo('media/profiles/first')
        self.assertEqual(self.tracking_marker()['profileImageUrl'], 'https://cdn.example.test/profiles/first')
        self.set_photo('media/profiles/second')
        self.assertEqual(self.tracking_marker()['profileImageUrl'], 'https://cdn.example.test/profiles/second')

    def test_message_participants_and_messages_carry_the_current_photo(self):
        Message.objects.create(sender=self.technician, receiver=self.admin, message_text='On my way', room_type='direct')
        self.set_photo('media/profiles/new-photo')

        participants = self.client.get('/api/messages/participants/')
        self.assertEqual(participants.status_code, status.HTTP_200_OK)
        row = next(item for item in participants.data if item['id'] == self.technician.id)
        self.assertEqual(row['profile_image_url'], 'https://cdn.example.test/profiles/new-photo')

        messages = self.client.get('/api/messages/', {'role': 'staff', 'page_size': 50})
        self.assertEqual(messages.status_code, status.HTTP_200_OK)
        results = messages.data.get('results', messages.data) if isinstance(messages.data, dict) else messages.data
        message = next(item for item in results if item['sender'] == self.technician.id)
        self.assertEqual(message['sender_profile_image_url'], 'https://cdn.example.test/profiles/new-photo')
        self.assertEqual(message['receiver_profile_image_url'], '')
