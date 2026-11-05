import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TECHNICAL_DATA_SHEET_SCHEMA,
  adaptTechnicalDataSheetDraft,
  buildTechnicalDataSheetRecord,
  serializeTechnicalDataSheetDraft,
} from '../src/documents/technicalDataSheetSchema.js';
import {
  INSTALLATION_CONTRACT_SCHEMA,
  buildInstallationContractRecord,
  serializeInstallationContractDraft,
} from '../src/documents/installationContractSchema.js';
import {
  QUOTATION_SCHEMA,
  addQuotationRow,
  buildQuotationRecord,
  createQuotationDraft,
  createQuotationRow,
  removeQuotationRow,
  serializeQuotationDraft,
} from '../src/documents/quotationSchema.js';
import {
  TURNOVER_ACCEPTANCE_SCHEMA,
  addTurnoverRow,
  buildTurnoverRecord,
  createTurnoverDraft,
  createTurnoverRow,
  removeTurnoverRow,
  serializeTurnoverDraft,
} from '../src/documents/turnoverAcceptanceSchema.js';

test('remaining Phase 1 schemas declare versioned ownership and protected workflow states', () => {
  assert.deepEqual(
    [
      TECHNICAL_DATA_SHEET_SCHEMA.code,
      INSTALLATION_CONTRACT_SCHEMA.code,
      QUOTATION_SCHEMA.code,
      TURNOVER_ACCEPTANCE_SCHEMA.code,
    ],
    ['technical_data_sheet', 'installation_contract', 'quotation_proposal', 'turnover_acceptance'],
  );
  assert.ok([
    TECHNICAL_DATA_SHEET_SCHEMA,
    INSTALLATION_CONTRACT_SCHEMA,
    QUOTATION_SCHEMA,
    TURNOVER_ACCEPTANCE_SCHEMA,
  ].every((schema) => schema.version === 1 && schema.dataOwnership.workflowRecord));
  assert.ok(TECHNICAL_DATA_SHEET_SCHEMA.statuses.includes('reviewed'));
  assert.ok(INSTALLATION_CONTRACT_SCHEMA.statuses.includes('signed'));
  assert.ok(QUOTATION_SCHEMA.statuses.includes('Accepted'));
  assert.ok(TURNOVER_ACCEPTANCE_SCHEMA.statuses.includes('finalized'));
});

test('Technical Data Sheet adapts legacy rows and separates canonical data from printable metadata', () => {
  const draft = adaptTechnicalDataSheetDraft({
    firstName: 'Ana',
    legacyLayoutNote: 'preserve me',
    purposeOther: 'Backup during outages',
    loadRows: [{ id: 'old-load', appliance: 'Freezer', quantity: '2' }],
  });
  const printable = serializeTechnicalDataSheetDraft(draft);
  const record = buildTechnicalDataSheetRecord(draft, '630', 'submitted');

  assert.equal(draft.loadRows[0].appliance, 'Freezer');
  assert.equal(draft.legacyLayoutNote, 'preserve me');
  assert.deepEqual(printable._documentSchema, { code: 'technical_data_sheet', version: 1 });
  assert.equal(record.ticket, 630);
  assert.equal(record.status, 'submitted');
  assert.deepEqual(record.purpose_of_going_solar, ['Backup during outages']);
  assert.equal(record._documentSchema, undefined);
});

test('Installation Contract normalizes canonical money and version-stamps its printable draft', () => {
  const data = {
    scopeNotes: 'Supply and install',
    estimatedCompletionTime: '12',
    totalContractAmount: 'PHP 125,500.75',
    upfrontPayment: '50,000',
    legalPresentationNote: 'preserve this wording',
  };
  const record = buildInstallationContractRecord(data, 630, 'draft');
  const printable = serializeInstallationContractDraft(data);

  assert.equal(record.ticket, 630);
  assert.equal(record.estimated_completion_days, 12);
  assert.equal(record.total_contract_amount, '125500.75');
  assert.equal(record.payment_terms_upfront, '50000.00');
  assert.equal(record.legalPresentationNote, undefined);
  assert.equal(printable.legalPresentationNote, 'preserve this wording');
  assert.deepEqual(printable._documentSchema, { code: 'installation_contract', version: 1 });
});

test('Quotation schema preserves presentation data while projecting authoritative commercial fields', () => {
  let draft = createQuotationDraft();
  draft = { ...draft, legacyPresentationNote: 'keep', paymentTerms: '50/50' };
  draft.priceRows[0].totalPrice = '84500.00';
  const added = createQuotationRow('bom', 7);
  draft = addQuotationRow(draft, 'bomRows', added);
  // A new quotation starts with one empty equipment row (no sample products), so adding one makes two.
  assert.equal(draft.bomRows.length, 2);

  const record = buildQuotationRecord(draft, 630, 14, 'Sent');
  const printable = serializeQuotationDraft(draft);
  assert.equal(record.total_amount, '84500.00');
  assert.equal(record.bill_of_materials.length, 2);
  assert.equal(record.legacyPresentationNote, undefined);
  assert.equal(printable.legacyPresentationNote, 'keep');
  assert.deepEqual(printable._documentSchema, { code: 'quotation_proposal', version: 1 });

  const reduced = removeQuotationRow(draft, 'bomRows', added.id);
  assert.equal(reduced.bomRows.length, 1);
  const oneRow = { ...draft, bomRows: [draft.bomRows[0]] };
  assert.equal(removeQuotationRow(oneRow, 'bomRows', oneRow.bomRows[0].id), oneRow);
});

test('Turnover schema manages all repeating sections and projects only finalization inputs', () => {
  let draft = createTurnoverDraft();
  draft = {
    ...draft,
    id: 12,
    clientName: 'Client One',
    dateOfTurnover: '2026-11-03',
    legacyPresentationNote: 'keep',
  };
  const added = createTurnoverRow('documents', 7);
  draft = addTurnoverRow(draft, 'documentsRows', added);
  const record = buildTurnoverRecord(draft, 630);
  const printable = serializeTurnoverDraft(draft);

  assert.equal(record.id, 12);
  assert.equal(record.ticket, 630);
  assert.equal(record.warranty_start_date, '2026-11-03');
  assert.equal(record.legacyPresentationNote, undefined);
  assert.equal(printable.documentsRows.length, 7);
  assert.equal(printable.legacyPresentationNote, 'keep');
  assert.deepEqual(printable._documentSchema, { code: 'turnover_acceptance', version: 1 });

  const reduced = removeTurnoverRow(draft, 'documentsRows', added.id);
  assert.equal(reduced.documentsRows.length, 6);
});
