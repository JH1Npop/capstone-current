# ERD Tool Guide

## Best Tool

Use **dbdiagram.io** for the ERD.

Reason: ERDs should be generated from table definitions and relationships. Figma is better for visual models, but dbdiagram.io is better for database diagrams.

## File To Use

Paste this file into dbdiagram.io:

`docs/models/AFN_ERD.dbml`

## Steps

1. Go to `https://dbdiagram.io/`.
2. Create a new diagram.
3. Delete the sample code.
4. Paste the content of `AFN_ERD.dbml`.
5. Let dbdiagram.io generate the ERD.
6. Arrange the tables into groups:
   - Users and roles
   - Service request and ticket flow
   - Technician checklist and inventory
   - After-sales and maintenance
   - Messages, notifications, logs, analytics
7. Export as PNG or SVG.
8. Insert into Chapter III.

## Suggested Caption

**Figure X. Entity Relationship Diagram of the Proposed AFN Service Management System**

## Optional Simplification

If the ERD looks too crowded, hide these analytics tables from the final figure:

- `services_serviceanalytics`
- `services_technicianperformance`

Keep them only if your adviser wants analytics data included in the ERD.

