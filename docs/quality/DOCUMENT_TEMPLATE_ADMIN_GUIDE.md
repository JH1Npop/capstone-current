# AFN Document Template Administrator Guide

For everyday staff use (plain `[Field Name]` fields, the checklist, one-click **Use this design**, filling blank lines, placing PDF fields), see `DOCUMENT_TEMPLATE_STAFF_GUIDE.md`. This guide covers the administrator and operator details.

## Core templates

For an ordinary replacement, open **Admin Documents**, select a representative ticket, then choose **Replace design**. The guided flow asks you to select one of the six protected document types and its design, upload a macro-free `.docx` or a `.pdf`, review validation/configuration, download a real test generated from the selected ticket, and deliberately activate the tested version.

Use **Template library** for advanced work: creating additional designs, registering custom document types, editing PDF field mappings, reviewing complete history, or deleting an unused unreferenced design.

An upload is never activated automatically. DOCX files show their detected approved placeholders. PDF files must have at least one saved field mapping. Use the wizard's **Generate test** action with a real permission-scoped ticket, inspect the downloaded Word/PDF file, and activate it only when the result is correct. Activation retires the previous version without deleting it. The final wizard step and Template library both expose eligible earlier versions for rollback.

Core designs also have mandatory AFN connections. The final step blocks activation and names anything still missing. Word designs must include required scalar placeholders and balanced markers for required repeating sections. PDFs must map the required scalar values; fixed printed tables still require human review because AFN does not pretend they can expand. The server enforces the same rule even when the API is called directly.

The advanced **Template library** uses that same server decision. Each version shows a plain-language checklist; **Use this design** (which checks the draft again, activates it, makes its design the default and enables it) is refused with that checklist while anything required is missing. To start from AFN's own layout, use **Download the original design** (the six built-in documents) or **Download the design in use**. A previously published historical version can still be selected for rollback, preserving recovery from older approved designs.

When configuring a PDF, click near a printed label such as **Customer Name** or **Total Amount**. AFN may suggest an approved field and shows why it matched plus a High, Medium, or Low confidence label. A suggestion is only guidance: select **Yes, use this field** to accept it, change the source if necessary, then save. If AFN cannot find a reliable match, choose the fill method/source manually. The system does not send document text to an external AI service.

Use the minus/plus controls to zoom from 75% to 175%; **Fit page** returns to 100%. The page toolbar lists saved fields on the current page so you can select one without finding its box. Drag a saved field for broad movement, then use the arrow and size controls for precise adjustment. Changes are not permanent until **Save field** is selected.

For Word templates, the wizard lists the document areas and repeating sections it actually detected. AFN preserves Word fonts, colors, logos, tables, headers, footers, margins, and page flow, but it does not recreate Word as a browser editor. Always inspect the generated test DOCX in a compatible word processor.

Before testing, review the missing-content notice and select **I reviewed these field connections**. A missing notice means the system did not see a known important connection; it does not prove the printed document lacks that wording. The generated test file is the final check, especially for fixed PDF tables and Word repeating sections.

For a newly migrated environment, an operator can validate the six protected repository baselines without writing anything:

```powershell
python manage.py import_legacy_document_templates
```

After reviewing the dry run, register missing baselines as inactive versions with an auditable administrator identity:

```powershell
python manage.py import_legacy_document_templates --apply --actor <admin-username>
```

The command is checksum-idempotent and never activates a template. Use the normal Test DOCX, visual review, activation, replacement, and rollback workflow afterward.

## Register a custom document

1. In **Template library**, choose **New document type**.
2. Enter a clear name and description, then select its source: service ticket, client, or project. Choose **Create document type**.
3. Choose **Download a blank starter file**, restyle it in Word, and upload it as the design. Fields can also be written as plain names such as `[Site Note]`; the checklist offers **Add as fields** for new ones. The manual **Field key** form remains for exact control. Field keys cannot be renamed after use.
4. Optionally test with **Test DOCX**, then choose **Use this design**. It activates the version, makes the design the default and enables the document (enabling needs the definitions-manage permission).

New definitions stay inactive until an enabled default design has an active validated version. **Disable document** hides a type and keeps its history; **Delete document type** removes a type only if it has never produced a document or prepared instance.

## Placeholder authoring

Use a plain name in square brackets, for example `[Client Name]`, or the technical double-brace form, for example `{{client_name}}` or `{{maintenance_summary}}`. Choose fields only from the definition's **Fields you can use** / **Approved placeholders** lists. Bracketed text that is not a known field prints as typed. Unknown fields, expressions, macros, embedded packages, external relationships, and unsafe archives are rejected.

Expand **Approved placeholders** to review each field's source, value type, formatting rule, applicability, required status, and whether it is a repeating collection. Templates display canonical financial values; they must not calculate or override them.

For repeating data, place the opening and closing markers in otherwise empty table rows or paragraphs. Put the row or paragraphs to repeat between them. For example:

```text
{{#bom_rows}}
{{description}} | {{qty}} | {{unit_price}} | {{amount}}
{{/bom_rows}}
```

The opening and closing names must match. Do not add other text to their marker rows/paragraphs, and do not use conditions, filters, functions, or arbitrary Jinja expressions.

Word may split visible text into internal runs; AFN's renderer handles ordinary split placeholders, but the safest authoring method is still to type each placeholder as one continuous piece of text and avoid placing it across styled fragments.

## Generate a custom document

From Admin Documents, select a ticket and choose **Fill template**. For one of the six protected documents, the window shows the active final design and sends you to its interactive editor. Change and save the document data there so quotation, contract, commissioning, turnover, and report rules remain in force. Use **Generate active design** after saving to download the published DOCX/PDF layout from the saved business data. Browser **Print** remains the current editor-paper print action; it is separate from active-design generation.

Active registered custom documents also appear after the six protected documents in the Documents row. Select that numbered document to open **Fill template** directly on its configured dynamic fields. You can also use the general **Fill template** button and choose the document there. Complete its fields, select an active design if needed, save, preview, and generate. Each custom generation creates a new private archive record tied to the exact template version and source snapshot.

Supporting PDF, DOCX, PNG, JPEG, WebP, and UTF-8 text files can be attached to the instance. These files are private and available only through authorized downloads.

Templates, generated outputs, and supporting attachments are stored as private authenticated objects. Do not copy storage-provider URLs; use AFN's authorized download actions, which obtain short-lived server-generated access.

## Installed custom example: Preventive Maintenance Report

Local development now includes **Preventive Maintenance Report** as the seventh visible document type. It was created through the same administrator workflow described above—not through a new Django model or hardcoded React editor.

Its active **AFN Standard** DOCX automatically fills ticket number, client, service, technician, addresses, and contact information. It appears as **7 Preventive Maintenance Report** in the Documents row for users allowed to manage documents; selecting it opens the same generic Smart Documents workspace. Staff complete these registered document fields there:

- maintenance date and maintenance type;
- equipment condition and safety-check confirmation;
- work performed, findings, and recommendations;
- next maintenance date; and
- technician confirmation and client acknowledgment.

Generating the report creates the normal immutable private output history tied to its exact template version and ticket snapshot. It records maintenance evidence only; it does not change ticket completion, maintenance scheduling, warranty, quotation, payment, or dispatch state.

## Release sign-off for a final company design

The repository's six baseline documents have passed technical Word pagination and configured private-storage checks. Each future company replacement still needs a short design-specific sign-off:

1. Use **Replace design** and upload the actual approved DOCX or PDF without activating it.
2. Complete its field connections, select a representative real ticket, and generate the test file.
3. Open the downloaded artifact in the office/PDF software the company uses. Check every page, logo, signature area, long paragraph, currency value, and repeating table.
4. Activate only after that review. Generate one normal document through **Fill template** and confirm its authorized download.
5. Keep the former active version until an administrator has successfully exercised **Roll back** or confirmed the rollback choice is available.

The technical baseline check does not automatically approve a later uploaded design. AFN's deliberate activation remains the final acceptance record.

## Operational cautions

- Custom documents do not change ticket, quotation, deposit, dispatch, completion, payment, or turnover status.
- Do not upload secrets that are unnecessary for the document.
- Do not disable or replace a template until its replacement has been test-rendered.
- Do not treat a structurally valid baseline import as visual approval; inspect the actual downloaded Word output.
- Keep the previous active version available for rollback.
- The browser's existing Editor preview is not an exact rendering of an uploaded Word layout.
- The PDF mapper previews the source for field placement, but the generated PDF/DOCX download remains the acceptance artifact.

