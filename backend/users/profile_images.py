"""Public URL of a user's profile photo, shared by every API that shows who someone is.

Profile, technician tracking and messages all read the photo through this so a new upload
shows everywhere on the next load. Returns '' when there is no usable photo; the UI then
falls back to initials.
"""
from django.core.files.storage import FileSystemStorage


def profile_image_url(user):
    image = getattr(user, 'profile_image', None)
    if not image:
        return ''

    image_name = str(image.name or '').lstrip('/')
    while image_name.startswith('media/'):
        image_name = image_name[len('media/'):]
    if not image_name:
        return ''

    storage = image.storage
    if isinstance(storage, FileSystemStorage) and not storage.exists(image_name):
        return ''

    try:
        return storage.url(image_name)
    except (NotImplementedError, ValueError):
        return ''
