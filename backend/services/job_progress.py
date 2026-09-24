"""Canonical, evidence-based service-ticket workflow progress."""

ACTIVE_TICKET_STATUSES = [
    'Not Started',
    'For Inspection',
    'Inspection Completed',
    'Ready for Service',
    'Awaiting Materials',
    'Navigating',
    'Arrived on Site',
    'In Progress',
    'On Hold',
]


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


def get_ticket_workflow_progress(ticket):
    """Describe progress using persisted lifecycle evidence, never elapsed time."""
    status = getattr(ticket, 'status', '')
    track, track_label, workflow_stages = _progress_track(ticket)
    if status != 'On Hold':
        percent, label = workflow_stages.get(status, (0, status or 'Status unavailable'))
        return {
            'percent': percent,
            'label': label,
            'basis': 'workflow_status',
            'is_paused': False,
            'track': track,
            'track_label': track_label,
        }

    previous_status = _last_achieved_status(ticket, workflow_stages)
    percent, previous_label = workflow_stages.get(previous_status, (35, 'Current stage'))
    return {
        'percent': percent,
        'label': f'Paused — {previous_label}',
        'basis': 'workflow_status',
        'is_paused': True,
        'track': track,
        'track_label': track_label,
    }
