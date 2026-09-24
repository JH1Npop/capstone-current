from django.conf import settings


def get_tracking_config():
    """Return the non-secret location contract used by authenticated workspaces."""
    return {
        'region': {
            'name': settings.TRACKING_REGION_NAME,
            'southWest': [
                settings.TRACKING_REGION_SOUTH_LAT,
                settings.TRACKING_REGION_WEST_LNG,
            ],
            'northEast': [
                settings.TRACKING_REGION_NORTH_LAT,
                settings.TRACKING_REGION_EAST_LNG,
            ],
            'minZoom': settings.TRACKING_REGION_MIN_ZOOM,
        },
        'policy': {
            'retentionDays': settings.TECHNICIAN_LOCATION_RETENTION_DAYS,
            'recentTrailMinutes': settings.TECHNICIAN_LOCATION_TRAIL_MINUTES,
            'collectionPurpose': 'Dispatch coordination, job navigation, arrival support, and technician safety.',
            'visibleTo': 'Authorized supervisors and the technician who supplied the location.',
            'collectionTrigger': 'Only while the technician explicitly starts location sharing on the Navigation page.',
        },
    }
