"""Real image uploads for completion workflows (never placeholder evidence URLs)."""
import struct
import zlib

from django.core.files.uploadedfile import SimpleUploadedFile


def completion_photo():
    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))

    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(b'\x00\x00\xff\x00'))
        + chunk(b'IEND', b'')
    )
    return SimpleUploadedFile('completion.png', png, content_type='image/png')
