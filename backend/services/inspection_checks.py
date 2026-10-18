"""Service-specific site-inspection checks.

Every inspection asks the built-in general checks (site access, electrical supply, safety equipment).
Each requested service may add its own Yes/No checks (``ServiceType.inspection_procedures``). Answers
are stored in ``InspectionChecklist.checklist_items`` as::

    {'service_type_id': 3, 'service_name': 'Solar Install', 'title': 'Roof can carry the array',
     'answer': True, 'notes': ''}
"""


def ticket_service_types(ticket):
    service_types = [
        item.service_type
        for item in ticket.request.service_items.all()
        if item.service_type_id and item.service_type
    ]
    if not service_types and ticket.request.service_type_id:
        service_types = [ticket.request.service_type]
    return service_types


def expected_inspection_checks(ticket):
    checks = []
    for service_type in ticket_service_types(ticket):
        for entry in service_type.inspection_procedures or []:
            title = str((entry.get('title') if isinstance(entry, dict) else entry) or '').strip()
            if title:
                checks.append({
                    'service_type_id': service_type.id,
                    'service_name': service_type.name,
                    'title': title,
                })
    return checks


def _as_bool(value):
    if isinstance(value, bool):
        return value
    text = str(value or '').strip().lower()
    if text in {'true', 'yes', '1'}:
        return True
    if text in {'false', 'no', '0'}:
        return False
    return None


def normalize_inspection_answers(ticket, items):
    """Return (answers, errors). Every configured check needs Yes/No; a No needs a note."""
    if items in (None, ''):
        items = []
    if not isinstance(items, list):
        return [], ['Service checks must be a list.']

    submitted = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        key = (str(item.get('service_type_id') or ''), str(item.get('title') or '').strip())
        submitted[key] = item

    answers, errors = [], []
    for check in expected_inspection_checks(ticket):
        item = submitted.get((str(check['service_type_id']), check['title']))
        answer = _as_bool(item.get('answer')) if item else None
        notes = str((item or {}).get('notes') or '').strip()[:1000]
        if answer is None:
            errors.append(f"Answer Yes or No for \"{check['title']}\" ({check['service_name']}).")
        elif answer is False and not notes:
            errors.append(f"Explain the problem for \"{check['title']}\" ({check['service_name']}).")
        answers.append({**check, 'answer': answer, 'notes': notes})
    return answers, errors


def describe_inspection_answers(items):
    """Short text lines for the append-only findings history."""
    lines = []
    for item in items or []:
        if not isinstance(item, dict) or 'answer' not in item or not item.get('title'):
            continue
        text = f"{item['title']}: {'Yes' if item.get('answer') else 'No'}"
        if item.get('notes'):
            text = f"{text} ({item['notes']})"
        lines.append(text)
    return lines
