import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_DOCUMENT_CODES,
  getCoreDocumentSchema,
  isCoreDocumentCode,
  summarizeCoreDocumentSchema,
} from '../src/documents/coreDocumentWorkspace.js';

test('core document registry covers all six protected editors', () => {
  assert.deepEqual(CORE_DOCUMENT_CODES, [
    'field_service_report',
    'quotation_proposal',
    'installation_contract',
    'commissioning_checklist',
    'technical_data_sheet',
    'turnover_acceptance',
  ]);
  CORE_DOCUMENT_CODES.forEach((code) => assert.equal(getCoreDocumentSchema(code)?.code, code));
});

test('registered custom documents are not classified as core workflows', () => {
  assert.equal(isCoreDocumentCode('customer_warranty_note'), false);
  assert.equal(summarizeCoreDocumentSchema('customer_warranty_note'), null);
});

test('core summaries retain editor fields, repeating sections, and protected actions', () => {
  const quotation = summarizeCoreDocumentSchema('quotation_proposal');
  assert.ok(quotation.fieldCount > 0);
  assert.ok(quotation.collectionLabels.includes('Bill of Materials'));
  assert.ok(quotation.actionLabels.includes('Send quotation to client'));
  assert.ok(quotation.actionLabels.includes('Record deposit payment'));
});
