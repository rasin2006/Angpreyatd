import io
import json
import os
import unittest
from unittest.mock import patch

import app as attendance_app


class ChatAssistantTests(unittest.TestCase):
    def setUp(self):
        self.client = attendance_app.app.test_client()

    def test_chat_mode_gemini(self):
        with patch.dict(os.environ, {'GEMINI_API_URL': 'https://example.com/v1/generate', 'GEMINI_API_KEY': 'test-key'}, clear=False):
            response = self.client.get('/api/chat/mode')
            data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['mode'], 'gemini')
        self.assertEqual(data['endpoint'], 'https://example.com/v1/generate')

    def test_chat_mode_none(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.get('/api/chat/mode')
            data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['mode'], 'none')
        self.assertEqual(data['endpoint'], '')
        self.assertIn('Gemini is not configured', data['status'])

    def test_chat_assistant_hello(self):
        response = self.client.post('/api/chat/assistant', json={'message': 'Hello'})
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['reply'], 'Hello! How can I help you today?')

    def test_chat_assistant_uses_local_reply_for_general_questions(self):
        response = self.client.post('/api/chat/assistant', json={'message': 'Tell me about the school'})
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertIn('school', data['reply'].lower())
        self.assertNotIn('gemini is not configured', data['reply'].lower())

    def test_chat_assistant_uses_gemini_when_configured(self):
        expected_reply = 'This is a Gemini reply.'

        class DummyResponse(io.StringIO):
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_val, exc_tb):
                self.close()

        def fake_urlopen(request, timeout=None):
            body = json.dumps({'response': expected_reply})
            return DummyResponse(body)

        with patch.dict(os.environ, {'GEMINI_API_URL': 'https://example.com/v1/generate', 'GEMINI_API_KEY': 'test-key'}, clear=False):
            with patch('urllib.request.urlopen', fake_urlopen):
                response = self.client.post('/api/chat/assistant', json={'message': 'What is the attendance policy?'})
                data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['reply'], expected_reply)

    def test_chat_assistant_uses_google_gemini_format(self):
        expected_reply = 'This is a Google Gemini reply.'
        captured = {}

        class DummyResponse(io.StringIO):
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_val, exc_tb):
                self.close()

        def fake_urlopen(request, timeout=None):
            captured['url'] = request.full_url
            captured['headers'] = dict(request.header_items())
            captured['body'] = json.loads(request.data.decode('utf-8'))
            body = json.dumps({
                'candidates': [{
                    'content': {'parts': [{'text': expected_reply}]}
                }]
            })
            return DummyResponse(body)

        with patch.dict(os.environ, {'GEMINI_API_URL': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', 'GEMINI_API_KEY': 'test-key'}, clear=False):
            with patch('urllib.request.urlopen', fake_urlopen):
                response = self.client.post('/api/chat/assistant', json={'message': 'What is the attendance policy?'})
                data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['reply'], expected_reply)
        self.assertIn('generativelanguage.googleapis.com', captured['url'])
        self.assertEqual(captured['headers']['X-goog-api-key'], 'test-key')
        self.assertIn('contents', captured['body'])

    def test_chat_assistant_uses_local_reply_without_gemini(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.post('/api/chat/assistant', json={'message': 'What is the attendance policy?'})
            data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertIn('attendance', data['reply'].lower())
        self.assertNotIn('gemini is not configured', data['reply'].lower())

    def test_admin_students_endpoint_returns_roster(self):
        with patch('app.extract_admin_token', return_value='token-1'), \
             patch('app.get_admin_user', return_value={'username': 'admin'}), \
             patch('app.check_admin_rate', return_value=(True, 5)), \
             patch('app.load_students', return_value=[
                 {'student_id': 'APY1001', 'name': 'Alice', 'schedule': 'Grade 1'},
                 {'student_id': 'APY1002', 'name': 'Bob', 'schedule': 'Grade 2'}
             ]):
            response = self.client.get('/api/admin/students')
            data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data[0]['id'], 'APY1001')
        self.assertEqual(data[0]['name'], 'Alice')
        self.assertEqual(data[0]['schedule'], 'Grade 1')
        self.assertEqual(data[1]['id'], 'APY1002')

    def test_student_profile_api_includes_editable_fields(self):
        with patch('app.load_students', return_value=[{
            'student_id': 'APY1001',
            'name': 'Alice',
            'dob': '2014-06-10',
            'schedules': ['Grade 1'],
            'desk_ids': {'Grade 1': 'A1'},
            'archived': False
        }]):
            response = self.client.get('/api/student/APY1001')
            data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['dob'], '2014-06-10')
        self.assertEqual(data['desk_ids']['Grade 1'], 'A1')
        self.assertFalse(data['archived'])


if __name__ == '__main__':
    unittest.main()
