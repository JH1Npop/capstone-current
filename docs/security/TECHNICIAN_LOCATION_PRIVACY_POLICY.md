# Technician Location Privacy and Retention Policy

Status: Operational baseline requiring organization approval before production

## Purpose and scope

The system collects a technician's device location only for dispatch
coordination, job navigation, arrival support, and technician safety. It must
not be used for off-duty monitoring, employee performance scoring unrelated to
service delivery, or any purpose that has not been disclosed to field staff.

Location sharing starts only after the technician selects **Start location
sharing** on the Navigation page. It stops when the technician selects **Stop
sharing**, leaves the page, or closes the browser context. Browser permission
alone does not silently activate application sharing.

## Data and access

Each accepted update contains latitude, longitude, device-reported accuracy,
technician identity, and server timestamp. The technician's current-location
profile is updated from that record.

Only the technician who supplied the location and authenticated supervisors
with the tracking capability may read location history. Client accounts and
administrators without tracking authority are denied. Location information
must not be copied into general notes, exports, or messaging unless required
for a documented safety or service incident.

## Retention and deletion

The default retention period is **30 days**, configured with
`TECHNICIAN_LOCATION_RETENTION_DAYS`. The daily operational automation runs
`purge_technician_locations`, which deletes older history rows and clears an
expired current-location profile. The setting accepts 1 through 3,650 days;
the organization should choose the shortest period that supports its documented
operational need.

The supervisor map displays a recent trail whose default window is 60 minutes,
configured with `TECHNICIAN_LOCATION_TRAIL_MINUTES` from 5 through 480 minutes.
This display window does not extend database retention.

Deletion may be suspended only for a documented legal or safety hold approved
by the organization. A hold and its release must be recorded outside ordinary
application notes and reviewed by the responsible owner.

## Regional boundary

`TRACKING_REGION_NAME`, the four `TRACKING_REGION_*` coordinate edges, and
`TRACKING_REGION_MIN_ZOOM` define the operating map returned by the authenticated
API. The application validates latitude/longitude ranges and rejects reversed
bounds at startup. Deployments serving a different territory must update and
verify the complete region configuration before launch.

## Staff notice and operational responsibilities

Before production use, the organization must give this policy to technicians,
identify the responsible privacy/operations contact, and document how staff can
ask questions or report incorrect use. Supervisors must use tracking access only
for active service operations and safety. Access grants must be removed when a
role no longer requires them.

This document is an application operating policy, not legal advice. The
organization must have its responsible owner review the final wording and any
jurisdiction-specific notice, consent, labor, or records obligations before
production activation.
