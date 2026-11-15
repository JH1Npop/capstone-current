"""CALABARZON city/municipality boundaries for the Coverage Heatmap.

The boundary file is trimmed from faeldon/philippines-json-maps (MIT License,
Copyright (c) James Faeldon; PSA/NAMRIA-derived, low resolution) to the five
CALABARZON provinces, with coordinates rounded to 4 decimals (about 11 m).
`frontend/src/data/calabarzonCityMunicipalities.json` is an identical copy that
the map draws; a test keeps the two files the same.

Jobs are placed by their saved map coordinates, not by typed city text, so a
misspelt or blank city still lands in the right area.
"""

import json
from functools import lru_cache
from pathlib import Path

BOUNDARY_FILE = Path(__file__).resolve().parent / 'data' / 'calabarzon_city_municipalities.json'
# Barangay outlines grouped by city/municipality PSGC (3,992 barangays). The frontend
# holds the same features as one file per town in `frontend/src/data/barangays/`.
BARANGAY_FILE = Path(__file__).resolve().parent / 'data' / 'calabarzon_barangays.json'


def _ring_contains(ring, lng, lat):
    """Ray-casting point-in-ring test; ring points are [lng, lat]."""
    inside = False
    previous_lng, previous_lat = ring[-1]
    for current_lng, current_lat in ring:
        if (current_lat > lat) != (previous_lat > lat):
            crossing = (previous_lng - current_lng) * (lat - current_lat) / (previous_lat - current_lat) + current_lng
            if lng < crossing:
                inside = not inside
        previous_lng, previous_lat = current_lng, current_lat
    return inside


def _polygon_contains(polygon, lng, lat):
    """A polygon is an outer ring followed by holes."""
    if not polygon or not _ring_contains(polygon[0], lng, lat):
        return False
    return not any(_ring_contains(hole, lng, lat) for hole in polygon[1:])


def _bounding_box(polygons):
    points = [point for polygon in polygons for point in polygon[0]]
    lngs = [point[0] for point in points]
    lats = [point[1] for point in points]
    return min(lngs), min(lats), max(lngs), max(lats)


def _area_from_feature(feature):
    geometry = feature.get('geometry') or {}
    if geometry.get('type') == 'Polygon':
        polygons = [geometry['coordinates']]
    elif geometry.get('type') == 'MultiPolygon':
        polygons = geometry['coordinates']
    else:
        return None
    properties = feature.get('properties') or {}
    return {
        'psgc': str(properties.get('psgc', '')),
        'name': str(properties.get('name', '')),
        'province': str(properties.get('province', '')),
        'municipality_psgc': str(properties.get('municipality_psgc', '')),
        'polygons': polygons,
        'bbox': _bounding_box(polygons),
    }


@lru_cache(maxsize=1)
def load_city_municipality_areas():
    """Return a tuple of areas: psgc, name, province, polygons and bounding box."""
    with BOUNDARY_FILE.open(encoding='utf-8') as handle:
        collection = json.load(handle)
    areas = (_area_from_feature(feature) for feature in collection.get('features', []))
    return tuple(area for area in areas if area)


@lru_cache(maxsize=1)
def load_barangay_areas():
    """Return {city/municipality psgc: tuple of barangay areas} for the drill-down level."""
    with BARANGAY_FILE.open(encoding='utf-8') as handle:
        collection = json.load(handle)
    grouped = {}
    for municipality_psgc, features in (collection.get('municipalities') or {}).items():
        areas = (_area_from_feature(feature) for feature in features)
        grouped[str(municipality_psgc)] = tuple(area for area in areas if area)
    return grouped


def _parse_point(latitude, longitude):
    try:
        return float(latitude), float(longitude)
    except (TypeError, ValueError):
        return None


def _first_containing(areas, lat, lng):
    for area in areas:
        min_lng, min_lat, max_lng, max_lat = area['bbox']
        if not (min_lng <= lng <= max_lng and min_lat <= lat <= max_lat):
            continue
        if any(_polygon_contains(polygon, lng, lat) for polygon in area['polygons']):
            return area
    return None


def find_city_municipality(latitude, longitude):
    """Return the area containing the point, or None when it is outside CALABARZON."""
    point = _parse_point(latitude, longitude)
    if point is None:
        return None
    return _first_containing(load_city_municipality_areas(), *point)


def find_barangay(latitude, longitude, municipality_psgc):
    """Return the barangay of that city/municipality containing the point, or None.

    Town and barangay outlines were simplified separately, so a point just inside a
    town edge can miss every barangay; callers count those as "not placed".
    """
    point = _parse_point(latitude, longitude)
    if point is None or not municipality_psgc:
        return None
    return _first_containing(load_barangay_areas().get(str(municipality_psgc), ()), *point)
