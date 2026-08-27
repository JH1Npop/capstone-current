# Documentation

Documentation is grouped by purpose so implementation notes do not get mixed with deployment instructions or academic deliverables.

## Sections

- `architecture/` — data models, database diagrams, context diagrams, DFDs, and system design.
- `features/` — analytics, dispatch/SLA, after-sales, and document workflow specifications and audits.
- `deployment/` — hosting, administrator bootstrap, email, and external-service setup.
- `development/` — cleanup reports, naming guidance, migration notes, and workspace change records.
- `academic/` — capstone chapters, requirements modeling, and technical background.
- `archive/` — historical notes retained for reference but no longer treated as current specifications.
- `models/` — supporting model documentation.

The active analytics specification is [features/ANALYTICS_DASHBOARD_BLUEPRINT.md](features/ANALYTICS_DASHBOARD_BLUEPRINT.md).

## Active Implementation Plans

- [System end-to-end implementation plan](SYSTEM_END_TO_END_IMPLEMENTATION_PLAN.md)
- [Solar workflow implementation subplan](SOLAR_SYSTEM_IMPLEMENTATION_PLAN.md)

## Document Workflow and Templates

Document workflow notes:

- [Document visual fidelity phase](features/DOCUMENT_VISUAL_FIDELITY_PHASE.md)
- [Document prefill phase 1 plan](features/DOCUMENT_PREFILL_PHASE_1_PLAN.md)
- [Document autofill audit](features/DOCUMENT_AUTOFILL_AUDIT.md)

DOCX templates are stored in `backend/document_templates/`:

- `field_service_report.docx`
- `quotation_proposal.docx`
- `solar_installation_contract.docx`
- `technical_data_sheet.docx`
- `pv_solar_commissioning_checklist.docx`
- `turnover_acceptance_form.docx`

Original AFN template overrides, when available, are stored in `backend/document_templates/originals/`.
