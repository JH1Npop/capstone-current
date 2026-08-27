from django.contrib.auth.hashers import PBKDF2PasswordHasher


class FastTestPBKDF2PasswordHasher(PBKDF2PasswordHasher):
    """PBKDF2-compatible hasher with minimal work, used only by test runs."""

    iterations = 1
