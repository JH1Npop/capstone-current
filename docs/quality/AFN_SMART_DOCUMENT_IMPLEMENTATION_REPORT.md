# AFN Smart Document Templates: implementation report

Date: 2026-11-05. Status: steps 1-5 and 7 done; step 6 done for Word (blank lines become fields) and for text-based PDFs (boxes placed after labels). Unused custom document types can be deleted. Nothing is committed.

## Goal

AFN's client must be able to change the look of any of the six documents, or add their own document, using a Word file, without learning placeholders or configuration. The six keep their money and workflow rules.

## What was built

| Step | Result | Where |
| --- | --- | --- |
| 1. Plain names | `[Client Name]` works like `{{ client_name }}`. Only names that match an approved field are converted; other brackets stay as typed. | `backend/services/document_templates.py` (`convert_plain_names`), `dynamic_document_generation.py` |
| 2. Plain checker | Every version has a `checklist` in everyday wording; only essentials block a design. | `build_design_checklist`, `frontend/src/components/admin/DesignChecklist.jsx` |
| 3. One click | `Use this design` replaces check, activate, set default, enable. `Check again` and `Add as fields` added. Same server rules apply. | `views/document_templates.py` (`revalidate`, `accept-fields`, `use-design`) |
| 4. Helpers | `Fields you can use` list with Copy, `Download the design in use`, `Download a blank starter file` for new document types. | `build_starter_docx`, `starter` action, `DocumentTemplateManager.jsx` |
| 5. Proof | Replaced designs keep all rows, money, deposits, old outputs, and roll back cleanly. | `backend/services/tests/test_replaced_design_integrity.py` |
| 6. Word suggestions | `Client Name: ____` and bare `Ticket Number:` lines are offered as fields; one click saves a new version, original kept. | `backend/services/blank_suggestions.py`, `fill-blanks` action |
| 6b. PDF suggestions | Labels like `Client Name:` on text PDFs get a box after them; one click places them, staff review in Set up fields. | `backend/services/pdf_suggestions.py`, `place-fields` action |
| 7. Guide | `DOCUMENT_TEMPLATE_STAFF_GUIDE.md` (staff) and this report. | `docs/quality/` |

Core documents get no blank starter, because their required tables make a blank file invalid. Staff download the design in use, or **Download the original design** (AFN's own Word design, served by `GET /document-definitions/<id>/built-in-design/`) while the document still uses the built-in layout.

## Review of 2026-11-06

A second review of the Documents page found and fixed:

- AFN's own Technical Data Sheet, Commissioning Checklist and Field Service Report designs failed their own required-field check. The TDS names the client in separate last/first/middle boxes and the commissioning checklist identifies the job by site, so those now count as the client (`REQUIRED_COMPONENT_ALIASES`). The Field Service Report design had no service-type line; `Service Type: {{ service_type }}` was added after the Date line in `backend/document_templates/field_service_report.docx`. All six built-in designs now pass the check unchanged (test `BuiltInDesignTests`).
- There was no way to download a starting design for a built-in document that had nothing in use (fresh install or legacy fallback). Added the built-in design download.
- After saving a design, the next step (checklist and **Use this design**) was below the visible area and the message said field setup was optional. The manager now scrolls to the new version and the message points to the checklist.
- **Enable document** could be clicked before any design was in use and then failed. It is now disabled with an explanation until a design is in use.
- The on-screen hint and guide told staff to rebuild repeating tables by copying markers, which cannot work without the column field names. Both now say to keep AFN's tables and leave rebuilding to an administrator.

## Verification

- New backend tests: `test_plain_name_fields` (31), `test_blank_suggestions` (6), `test_pdf_suggestions` (5), `test_starter_design` (starter, delete type, built-in designs), `test_replaced_design_integrity` (5).
- Integrity tests prove, with a replaced Word design: a quotation with 3 price rows and 40 equipment rows prints every row; quotation total, required deposit, status and the deposit gate are unchanged; the archived snapshot matches the saved draft; an old archived file keeps its hash after a new design is used; roll back restores the old design; a Field Service Report with 60 rows prints 60 rows; a contract with 400 clauses and 120 filler paragraphs keeps all text; a design that cannot be used is refused and the previous design stays in use.
- Browser tests (`e2e/12-documents-calendar-controls.spec.js`): 12.16 builds a new document from scratch with the buttons and generates a Word file; 12.17 checks the Copy button, the design-in-use download and the starter download; 12.18 uploads a finished design with blank lines, fills them with one click, keeps the original and uses the new version.

## Known limits

- Plain names cover single fields. Repeating tables keep the technical markers; the Fields box offers them to copy.
- Word documents cannot be rendered to a picture on this machine (no LibreOffice), so visual layout was checked structurally, not by eye. Open a generated file in Word once with the client's real design.
- The checklist sits low in the manager, and the technical "Field key" form is still visible. Moving the checklist up and hiding that form under Advanced is not done.
- Escape does not close the Replace design wizard the same way as other dialogs.
- Test 3.9b (draft saved message) failed once in a combined run and passed on fresh reruns; judged unrelated.

## Open decisions

1. PDF suggestions work for text-based PDFs only; scanned PDFs still need boxes placed by hand (no text recognition available).
2. Are new document types fields-only (no calculated totals)? Assumed yes.
