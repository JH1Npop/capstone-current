# Document Visual Fidelity Phase

## Status

The automatic data pipeline is now working at a baseline level:

- selected `ServiceTicket`
- saved backend data
- `document-prefill`
- backend DOCX generation
- exported `.docx`

The next phase is **visual fidelity**, not pipeline redesign.

## Rule

Keep the current autofill pipeline intact.

Do not:

- hardcode document values
- remove working placeholder mappings
- rename `document-prefill` keys unless generator mappings are updated at the same time
- rebuild templates from scratch when an original AFN Word template already exists

## Source Template Override Workflow

The generator now supports a custom template override folder:

- `backend/document_templates/originals/`

If a file with the same name exists there, the generator will use it instead of the baseline template in:

- `backend/document_templates/`

Supported filenames:

- `field_service_report.docx`
- `quotation_proposal.docx`
- `solar_installation_contract.docx`
- `technical_data_sheet.docx`
- `pv_solar_commissioning_checklist.docx`
- `turnover_acceptance_form.docx`

## What To Preserve In Original AFN Templates

- AFN logo
- header layout
- footer layout
- blue bars
- official wording
- table widths
- spacing
- font sizes
- page breaks
- signature lines

Only replace fillable blanks or empty cells with placeholders.

## Placeholder Rules

Use placeholders that match the backend context keys exactly.

Examples:

- `{{ client_name }}`
- `{{ client_address }}`
- `{{ ticket_number }}`
- `{{ service_date }}`

Loop blocks are supported with XML comments:

```text
<!-- {{#service_rows}} -->
...row content using {{ brand_model }}, {{ serial_number }}, etc...
<!-- {{/service_rows}} -->
```

The renderer also processes:

- `word/document.xml`
- `word/header*.xml`
- `word/footer*.xml`

That means AFN header/footer templates can contain placeholders too.

## Recommended Order

1. `field_service_report.docx`
2. `quotation_proposal.docx`
3. `solar_installation_contract.docx`
4. `technical_data_sheet.docx`
5. `pv_solar_commissioning_checklist.docx`
6. `turnover_acceptance_form.docx`

## Manual Verification Loop

For each template:

1. Fill and save the related form in the system.
2. Open `GET /api/services/service-tickets/{ticketId}/document-prefill/`.
3. Confirm the needed value exists in JSON.
4. Generate the DOCX.
5. Confirm the value appears in the exported DOCX.
6. Compare the exported DOCX side-by-side with the original AFN template.

## Field Service Report First

For the first visual-fidelity pass, update:

- `backend/document_templates/originals/field_service_report.docx`

Make sure it preserves the AFN layout while still mapping:

- `ticket_number`
- `client_name`
- `client_address`
- `client_contact_number`
- `technician_name`
- `service_date`
- `service_rows[*].brand_model`
- `service_rows[*].tr_hp`
- `service_rows[*].serial_number`
- `service_rows[*].indoor_temp`
- `service_rows[*].outdoor_temp`
- `service_rows[*].ampere`
- `service_rows[*].others_specify`
- `service_rows[*].recommendation`
- `service_rows[*].in_reading`
- `service_rows[*].out_reading`

## Current Blocker

The repository currently does **not** contain separate original AFN office-designed DOCX masters.

So the next practical step is:

1. gather the real AFN source DOCX files
2. place them into `backend/document_templates/originals/`
3. replace only the fillable areas with placeholders
4. re-run export verification
