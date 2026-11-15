"""Keep a navigating technician's road route current, and reroute when they leave it.

The route (`ServiceTicket.route_geometry`, GeoJSON LineString of [lng, lat], technician to
job site) used to be computed once at assignment. Now, whenever a navigating technician's
location is accepted, the route is recomputed from where they are if there is none yet or they
are clearly off it. Rerouting is limited to once a minute per ticket to protect the routing
service quota. The admin map trims the route to the technician's position between reroutes.
"""

import logging
import math
from threading import Thread

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

# Farther than this (or 1.5x the GPS accuracy, if larger) from the planned road means off route.
OFF_ROUTE_METERS = 200
# At most one reroute per ticket in this many seconds.
REROUTE_COOLDOWN_SECONDS = 60
NAVIGATING_STATUS = 'Navigating'


def _to_xy(lat, lng, ref_lat):
    """Project to local metres (equirectangular; fine over a few kilometres)."""
    x = math.radians(lng) * 6371000 * math.cos(math.radians(ref_lat))
    y = math.radians(lat) * 6371000
    return x, y


def distance_to_route_meters(lat, lng, geometry):
    """Shortest distance from the point to the route line, or None without a usable route."""
    coordinates = (geometry or {}).get('coordinates') if isinstance(geometry, dict) else None
    if not coordinates or len(coordinates) < 2:
        return None
    px, py = _to_xy(lat, lng, lat)
    best = None
    previous = None
    for point in coordinates:
        try:
            x, y = _to_xy(float(point[1]), float(point[0]), lat)
        except (TypeError, ValueError, IndexError):
            previous = None
            continue
        if previous is not None:
            ax, ay = previous
            dx, dy = x - ax, y - ay
            length_sq = dx * dx + dy * dy
            t = 0.0 if length_sq == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
            distance = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            best = distance if best is None else min(best, distance)
        previous = (x, y)
    return best


def reroute_reason(ticket, lat, lng, accuracy=0):
    """'no_route' or 'off_route' when the ticket needs a new route from this point, else None."""
    if ticket.status != NAVIGATING_STATUS:
        return None
    distance = distance_to_route_meters(lat, lng, ticket.route_geometry)
    if distance is None:
        return 'no_route'
    if distance > max(OFF_ROUTE_METERS, 1.5 * float(accuracy or 0)):
        return 'off_route'
    return None


def store_route(ticket_id, start_coords, end_coords, reason):
    """Compute the route (start and end are (lng, lat)) and save it with when and why."""
    from services.models import ServiceTicket
    from services.ors_utils import get_route, is_road_route

    try:
        route = get_route(start_coords, end_coords)
        # If ORS and OSRM both failed, keep the previous route rather than saving a straight
        # line as the road; the admin map then shows the dashed direct line until a retry.
        if not is_road_route(route):
            return
        feature = route['features'][0]
        geometry = dict(feature.get('geometry') or {})
        segment = (feature.get('properties', {}).get('segments') or [{}])[0]
        # Extra keys beside the GeoJSON type/coordinates: the admin map shows "Rerouted ... ago".
        geometry['computed_at'] = timezone.now().isoformat()
        geometry['reason'] = reason
        ServiceTicket.objects.filter(pk=ticket_id).update(
            route_geometry=geometry,
            route_distance=segment.get('distance'),
            route_duration=segment.get('duration'),
        )
    except Exception as exc:  # routing is best effort; tracking must keep working
        logger.warning('Route update failed for ticket %s: %s', ticket_id, exc)


def maybe_reroute(technician, lat, lng, accuracy=0):
    """After an accepted location: reroute the technician's navigating ticket(s) if needed."""
    from services.models import ServiceTicket

    tickets = ServiceTicket.objects.filter(technician=technician, status=NAVIGATING_STATUS).select_related('request__location')
    for ticket in tickets:
        location = getattr(ticket.request, 'location', None)
        if not location or location.latitude is None or location.longitude is None:
            continue
        reason = reroute_reason(ticket, float(lat), float(lng), accuracy)
        if not reason:
            continue
        # cache.add only succeeds when the key is absent: one reroute per ticket per cooldown.
        if not cache.add(f'route-tracking:reroute:{ticket.id}', 1, REROUTE_COOLDOWN_SECONDS):
            continue
        start = (float(lng), float(lat))
        end = (float(location.longitude), float(location.latitude))
        if getattr(settings, 'IS_TEST', False):
            store_route(ticket.id, start, end, reason)
        else:
            transaction.on_commit(lambda ticket_id=ticket.id, start=start, end=end, reason=reason: Thread(
                target=store_route, args=(ticket_id, start, end, reason), daemon=True,
            ).start())
