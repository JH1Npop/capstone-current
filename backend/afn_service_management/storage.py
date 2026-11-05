import time
from pathlib import Path

import cloudinary.uploader
import cloudinary.utils
import requests
from django.core.files.base import ContentFile
from cloudinary_storage.storage import MediaCloudinaryStorage
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class AFNMediaCloudinaryStorage(MediaCloudinaryStorage):
    """Route media by resource type and keep document assets authenticated."""

    PROTECTED_DOCUMENT_ROOTS = {
        'document_templates',
        'generated_documents',
        'document_attachments',
    }

    IMAGE_EXTENSIONS = {
        '.avif',
        '.bmp',
        '.gif',
        '.heic',
        '.heif',
        '.jpeg',
        '.jpg',
        '.png',
        '.svg',
        '.tif',
        '.tiff',
        '.webp',
    }
    VIDEO_EXTENSIONS = {
        '.3gp',
        '.avi',
        '.m4v',
        '.mkv',
        '.mov',
        '.mp4',
        '.mpeg',
        '.mpg',
        '.webm',
    }

    def _get_resource_type(self, name):
        extension = Path(name).suffix.lower()
        if extension in self.IMAGE_EXTENSIONS:
            return 'image'
        if extension in self.VIDEO_EXTENSIONS:
            return 'video'
        return 'raw'

    def _is_protected_document(self, name):
        normalized = str(name or '').replace('\\', '/').strip('/')
        prefix = self._get_prefix().strip('/')
        if prefix and normalized.startswith(f'{prefix}/'):
            normalized = normalized[len(prefix) + 1:]
        return normalized.split('/', 1)[0] in self.PROTECTED_DOCUMENT_ROOTS

    def _delivery_type(self, name):
        return 'authenticated' if self._is_protected_document(name) else 'upload'

    def _upload(self, name, content):
        options = {
            'use_filename': True,
            'resource_type': self._get_resource_type(name),
            'tags': self.TAG,
            'type': self._delivery_type(name),
        }
        folder = str(Path(name).parent).replace('\\', '/')
        if folder and folder != '.':
            options['folder'] = folder
        return cloudinary.uploader.upload(content, **options)

    def _resource_url(self, name, delivery_type=None):
        name = self._prepend_prefix(name)
        delivery_type = delivery_type or self._delivery_type(name)
        if delivery_type == 'authenticated':
            return cloudinary.utils.private_download_url(
                name,
                None,
                resource_type=self._get_resource_type(name),
                type='authenticated',
                expires_at=int(time.time()) + 300,
            )
        url, _options = cloudinary.utils.cloudinary_url(
            name,
            resource_type=self._get_resource_type(name),
            type=delivery_type,
            sign_url=False,
            secure=True,
            # A delivery-type migration creates a new Cloudinary asset version,
            # while Django's FileField stores only the stable public ID.
            force_version=False,
        )
        return url

    def _get_url(self, name):
        return self._resource_url(name)

    @staticmethod
    def _request(method, url):
        retries = Retry(
            total=3,
            connect=3,
            read=3,
            status=3,
            backoff_factor=0.25,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({'GET', 'HEAD'}),
        )
        with requests.Session() as session:
            session.mount('https://', HTTPAdapter(max_retries=retries))
            return session.request(method, url, timeout=(5, 30))

    def _request_document(self, method, name):
        response = self._request(method, self._resource_url(name, 'authenticated'))
        if response.status_code == 404:
            # Compatibility for document assets created before authenticated
            # delivery was introduced. These are migrated separately.
            response = self._request(method, self._resource_url(name, 'upload'))
        return response

    def _open(self, name, mode='rb'):
        if not self._is_protected_document(name):
            return super()._open(name, mode)
        response = self._request_document('GET', name)
        if response.status_code == 404:
            raise IOError
        response.raise_for_status()
        file = ContentFile(response.content)
        file.name = name
        file.mode = mode
        return file

    def exists(self, name):
        if not self._is_protected_document(name):
            return super().exists(name)
        response = self._request_document('HEAD', name)
        if response.status_code == 404:
            return False
        response.raise_for_status()
        return True

    def size(self, name):
        if not self._is_protected_document(name):
            return super().size(name)
        response = self._request_document('HEAD', name)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return int(response.headers['content-length'])

    def delete(self, name):
        if not self._is_protected_document(name):
            return super().delete(name)
        resource_type = self._get_resource_type(name)
        authenticated = cloudinary.uploader.destroy(
            name,
            invalidate=True,
            resource_type=resource_type,
            type='authenticated',
        )
        if authenticated.get('result') == 'ok':
            return True
        legacy = cloudinary.uploader.destroy(
            name,
            invalidate=True,
            resource_type=resource_type,
            type='upload',
        )
        return legacy.get('result') == 'ok'
