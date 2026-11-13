"""Canonical, evidence-based service-ticket workflow progress."""

from services.ticket_status import ACTIVE_TICKET_STATUSES  # noqa: F401  (re-exported)


SERVICE_WORKFLOW_STAGES = {
    'Not Started': (0, 'Scheduled'),
    'For Inspection': (10, 'Inspection required'),
    'Inspection Completed': (20, 'Inspection complete'),
    'Awaiting Materials': (25, 'Waiting for materials'),
    'Ready for Service': (30, 'Ready for service'),
    'Navigating': (40, 'Technician en route'),
    'Arrived on Site': (55, 'Technician on site'),
    'In Progress': (70, 'Work underway'),
    'Completed': (100, 'Work completed'),
    'Turned Over / Accepted': (100, 'Turned over and accepted'),
    'Cancelled': (0, 'Cancelled'),
}

INSPECTION_WORKFLOW_STAGES = {
    'Not Started': (0, 'Inspection scheduled'),
    'For Inspection': (15, 'Ready for inspection'),
    'Navigating': (35, 'Inspector en route'),
    'Arrived on Site': (55, 'Inspector on site'),
    'In Progress': (75, 'Inspection underway'),
    'Inspection Completed': (90, 'Inspection submitted for review'),
    'Completed': (100, 'Inspection completed'),
    'Turned Over / Accepted': (100, 'Inspection accepted'),
    'Cancelled': (0, 'Cancelled'),
}


def _progress_track(ticket):
    if getattr(ticket, 'ticket_type', 'installation') == 'inspection':
        return 'inspection', 'Inspection visit', INSPECTION_WORKFLOW_STAGES
    return 'service', 'Service job', SERVICE_WORKFLOW_STAGES


def _last_achieved_status(ticket, workflow_stages):
    """Return the most recent non-hold stage recorded before a hold."""
    history_manager = getattr(ticket, 'status_history', None)
    if history_manager is None:
        return None

    # Materializing honors an existing prefetch cache and avoids one query per
    # paused card. Status history uses an increasing BigAutoField identifier.
    events = sorted(
        history_manager.all(),
        key=lambda event: getattr(event, 'id', 0),
        reverse=True,
    )

    for event in events:
        if event.status not in {'On Hold', 'Cancelled'} and event.status in workflow_stages:
            return event.status
    return None


def _latest_reported_percent(ticket):
    """The technician's most recent "percent complete" report for this job, if any."""
    if not getattr(ticket, 'pk', None):
        return None
    loaded = (getattr(ticket, '_prefetched_objects_cache', None) or {}).get('progress_updates')
    if loaded is not None:
        # Loaded with prefetch_related('progress_updates'): no query per job.
        reports = [row for row in loaded if row.percent_complete is not None]
        if not reports:
            return None
        return max(reports, key=lambda row: (row.updated_at, row.pk)).percent_complete
    try:
        latest = (
            ticket.progress_updates.filter(percent_complete__isnull=False)
            .order_by('-updated_at', '-pk')
            .values_list('percent_complete', flat=True)
            .first()
        )
    except Exception:
        return None
    return latest


def _with_report(percent, label, status, workflow_stages, ticket):
    """While work is under way, move within the In Progress stage by the reported percent.

    The bar never reaches 100 before the job is completed: a report of 100% shows as 99%.
    """
    if status != 'In Progress':
        return percent, label, 'workflow_status'
    reported = _latest_reported_percent(ticket)
    if reported is None:
        return percent, label, 'workflow_status'
    base = workflow_stages['In Progress'][0]
    # Round half up (Python's round() rounds 84.5 down to 84).
    return min(99, base + (reported * (99 - base) + 50) // 100), f'{label} — {reported}% done', 'technician_report'


def get_ticket_workflow_progress(ticket):
    """Describe progress using persisted lifecycle evidence, never elapsed time.

    Inside the "In Progress" stage, the technician's latest progress report (percent complete)
    moves the bar, so a job that takes weeks shows how far along it is.
    """
    status = getattr(ticket, 'status', '')
    track, track_label, workflow_stages = _progress_track(ticket)
    if status != 'On Hold':
        percent, label = workflow_stages.get(status, (0, status or 'Status unavailable'))
        percent, label, basis = _with_report(percent, label, status, workflow_stages, ticket)
        return {
            'percent': percent,
            'label': label,
            'basis': basis,
            'is_paused': False,
            'track': track,
            'track_label': track_label,
        }

    previous_status = _last_achieved_status(ticket, workflow_stages)
    percent, previous_label = workflow_stages.get(previous_status, (35, 'Current stage'))
    percent, previous_label, basis = _with_report(percent, previous_label, previous_status, workflow_stages, ticket)
    return {
        'percent': percent,
        'label': f'Paused — {previous_label}',
        'basis': basis,
        'is_paused': True,
        'track': track,
        'track_label': track_label,
    }
