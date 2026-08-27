# Changes - 2026-05-13

## Admin Reports

- Fixed `GET /api/services/service-tickets/report/` returning `500`.
- Imported `ServiceTicketReportSerializer` in the split ticket views module.
- Fixed the report permission check by returning `IsAdmin()` instead of the permission class.
- Added `created_at` to the service ticket report API payload.
- Added a `Date` column to the Admin Reports table.
- Added `Date` to the Admin Reports CSV export.

## Technician Dashboard

- Removed the quick navigation card grid from the Technician Dashboard.
- Removed unused dashboard quick-link imports and setup code.
- Removed `History` from the technician sidebar menu.

## Technician Job Equipment Visibility

- Added `inventory_reservations` to the technician jobs API response.
- Prefetched reservation item and technician data for technician job list/detail endpoints.
- Normalized technician job inventory reservations on the frontend.
- Added an **Equipment to Bring** section in Technician > My Jobs > Details.
- The equipment section shows item name, quantity, SKU, needed date, and reservation status.

## Verification

- `python manage.py check` passed.
- Technician jobs API returned `inventory_reservations` for assigned jobs.
- `npm run build` passed after frontend changes.

## Known Existing Warning

- Firebase Admin SDK still logs a development warning because `.env` contains a placeholder/invalid `FIREBASE_PRIVATE_KEY`.
