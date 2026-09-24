from pathlib import Path

from rest_framework.exceptions import ValidationError


IMAGE_FORMATS = {
    'JPEG': ('image/jpeg', '.jpg'),
    'PNG': ('image/png', '.png'),
    'WEBP': ('image/webp', '.webp'),
    'GIF': ('image/gif', '.gif'),
}


def validate_image_upload(uploaded_file, *, max_bytes, allowed_formats=None, field_name='image'):
    allowed_formats = set(allowed_formats or IMAGE_FORMATS)
    if getattr(uploaded_file, 'size', 0) > max_bytes:
        raise ValidationError({field_name: f'Image must be {max_bytes // (1024 * 1024)} MB or smaller.'})

    uploaded_file.seek(0)
    header = uploaded_file.read(32)
    image_format = None
    if header.startswith(b'\xff\xd8\xff'):
        image_format = 'JPEG'
    elif header.startswith(b'\x89PNG\r\n\x1a\n') and header[12:16] == b'IHDR':
        image_format = 'PNG'
    elif header.startswith((b'GIF87a', b'GIF89a')):
        image_format = 'GIF'
    elif header.startswith(b'RIFF') and header[8:12] == b'WEBP':
        image_format = 'WEBP'
    uploaded_file.seek(0)

    if image_format is None:
        raise ValidationError({field_name: 'The uploaded file is not a valid supported image.'})

    if image_format not in allowed_formats:
        allowed_label = ', '.join(sorted(allowed_formats))
        raise ValidationError({field_name: f'Upload one of these image formats: {allowed_label}.'})

    expected_content_type, safe_extension = IMAGE_FORMATS[image_format]
    supplied_content_type = str(getattr(uploaded_file, 'content_type', '') or '').lower()
    if supplied_content_type and supplied_content_type != expected_content_type:
        raise ValidationError({field_name: 'The image content does not match its declared file type.'})

    original_stem = Path(getattr(uploaded_file, 'name', '') or 'image').stem
    return image_format, expected_content_type, safe_extension, original_stem


def validate_video_upload(uploaded_file, *, max_bytes, field_name='video_files'):
    if getattr(uploaded_file, 'size', 0) > max_bytes:
        raise ValidationError({field_name: f'Video must be {max_bytes // (1024 * 1024)} MB or smaller.'})

    uploaded_file.seek(0)
    header = uploaded_file.read(32)
    uploaded_file.seek(0)
    content_type = str(getattr(uploaded_file, 'content_type', '') or '').lower()

    is_mp4_or_mov = len(header) >= 12 and header[4:8] == b'ftyp'
    is_webm = header.startswith(b'\x1aE\xdf\xa3')
    if content_type in {'video/mp4', 'video/quicktime'} and is_mp4_or_mov:
        return '.mov' if content_type == 'video/quicktime' else '.mp4'
    if content_type == 'video/webm' and is_webm:
        return '.webm'
    raise ValidationError({field_name: 'The uploaded file is not a valid MP4, MOV, or WebM video.'})
