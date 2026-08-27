"""Consistent human-readable labels for users (e.g. technicians) in API payloads."""


def client_technician_label(user):
    """
    Prefer first + last name, then get_full_name(), then username.
    Returns None when user is missing or has no usable label.
    """
    if not user:
        return None
    first = (getattr(user, 'first_name', None) or '').strip()
    last = (getattr(user, 'last_name', None) or '').strip()
    if first or last:
        return f'{first} {last}'.strip()
    full_name = user.get_full_name().strip() if hasattr(user, 'get_full_name') else ''
    if full_name:
        return full_name
    username = (getattr(user, 'username', None) or '').strip()
    return username or None
