"""TOTP multi-factor authentication helpers.

The implementation follows RFC 6238 and deliberately keeps the pending setup
secret in a short-lived signed token. Confirmed secrets are encrypted at rest;
recovery codes are stored only as slow password hashes.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing


MFA_SETUP_SALT = 'users.mfa.setup.v1'
MFA_SETUP_MAX_AGE_SECONDS = 10 * 60
TOTP_PERIOD_SECONDS = 30
TOTP_DIGITS = 6
RECOVERY_CODE_COUNT = 10


def _fernet():
    configured_key = str(getattr(settings, 'MFA_ENCRYPTION_KEY', '') or '').strip()
    if configured_key:
        key = configured_key.encode('ascii')
    else:
        digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
        key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def generate_totp_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode('ascii').rstrip('=')


def encrypt_secret(secret):
    return _fernet().encrypt(secret.encode('ascii')).decode('ascii')


def decrypt_secret(value):
    try:
        return _fernet().decrypt(value.encode('ascii')).decode('ascii')
    except (InvalidToken, ValueError, TypeError) as exc:
        raise ValueError('The stored MFA secret cannot be decrypted.') from exc


def create_setup_token(user, secret):
    return signing.dumps({'user_id': user.pk, 'secret': secret}, salt=MFA_SETUP_SALT, compress=True)


def read_setup_token(user, token):
    payload = signing.loads(token, salt=MFA_SETUP_SALT, max_age=MFA_SETUP_MAX_AGE_SECONDS)
    if payload.get('user_id') != user.pk:
        raise signing.BadSignature('MFA setup token belongs to another user.')
    return payload['secret']


def provisioning_uri(user, secret):
    issuer = str(getattr(settings, 'MFA_ISSUER_NAME', 'AFN Service Management')).strip()
    account = user.email or user.username
    label = quote(f'{issuer}:{account}', safe='')
    return (
        f'otpauth://totp/{label}?secret={quote(secret)}'
        f'&issuer={quote(issuer)}&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_PERIOD_SECONDS}'
    )


def _totp_at(secret, counter):
    padding = '=' * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode((secret + padding).upper(), casefold=True)
    digest = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10 ** TOTP_DIGITS)).zfill(TOTP_DIGITS)


def verify_totp(secret, code, *, timestamp=None, window=1):
    normalized = ''.join(character for character in str(code or '') if character.isdigit())
    if len(normalized) != TOTP_DIGITS:
        return False
    counter = int(timestamp if timestamp is not None else time.time()) // TOTP_PERIOD_SECONDS
    return any(
        hmac.compare_digest(_totp_at(secret, counter + offset), normalized)
        for offset in range(-window, window + 1)
    )


def generate_recovery_codes():
    return [f'{secrets.token_hex(4)}-{secrets.token_hex(4)}' for _ in range(RECOVERY_CODE_COUNT)]


def hash_recovery_codes(codes):
    return [make_password(code.lower()) for code in codes]


def consume_recovery_code(hashes, code):
    normalized = str(code or '').strip().lower()
    for index, encoded in enumerate(hashes or []):
        if check_password(normalized, encoded):
            return list(hashes[:index]) + list(hashes[index + 1:])
    return None


def verify_mfa_code(user, code):
    try:
        secret = decrypt_secret(user.mfa_secret_encrypted)
    except ValueError:
        return False, None
    if verify_totp(secret, code):
        return True, None
    remaining_hashes = consume_recovery_code(user.mfa_recovery_code_hashes, code)
    return (remaining_hashes is not None), remaining_hashes
