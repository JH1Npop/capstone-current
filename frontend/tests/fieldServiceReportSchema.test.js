import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_SERVICE_REPORT_SCHEMA,
  adaptFieldServiceReportDraft,
  addFieldServiceReportRow,
  createFieldServiceReportDraft,
  removeFieldServiceReportRow,
  serializeFieldServiceReportDraft,
  updateFieldServiceReportRow,
} from '../src/documents/fieldServiceReportSchema.js';

test('Field Service Report schema describes its workflow fields and repeating readings', () => {
  assert.equal(FIELD_SERVICE_REPORT_SCHEMA.code, 'field_service_report');
  assert.equal(FIELD_SERVICE_REPORT_SCHEMA.version, 1);
  assert.equal(FIELD_SERVICE_REPORT_SCHEMA.collections.rows.type, 'repeating_table');
  assert.deepEqual(
    FIELD_SERVICE_REPORT_SCHEMA.collections.rows.columns.map(({ key }) => key),
    ['brandModel', 'trHp', 'serialNumber', 'indoorTemp', 'outdoorTemp', 'ampere', 'others', 'recommendation'],
  );
  assert.match(FIELD_SERVICE_REPORT_SCHEMA.dataOwnership.rule, /technician report remains authoritative/i);
});

test('legacy unversioned drafts load without losing rows or unknown presentation values', () => {
  const legacy = {
    clientName: 'Legacy Client',
    legacyPresentationNote: 'Keep this value',
    rows: [
      { id: 'legacy-1', brandModel: 'Aircon A', serialNumber: 'SN-1' },
      { id: 'legacy-2', brandModel: 'Aircon B', recommendation: 'Clean filter' },
    ],
  };

  const adapted = adaptFieldServiceReportDraft(legacy);

  assert.equal(adapted.clientName, 'Legacy Client');
  assert.equal(adapted.legacyPresentationNote, 'Keep this value');
  assert.equal(adapted.rows.length, 2);
  assert.equal(adapted.rows[0].serialNumber, 'SN-1');
  assert.equal(adapted.rows[0].recommendation, '');
});

test('schema adapter adds, updates, removes and version-stamps repeating rows', () => {
  let draft = createFieldServiceReportDraft();
  assert.equal(draft.rows.length, 12);
  draft = addFieldServiceReportRow(draft);
  assert.equal(draft.rows.length, 13);

  const addedId = draft.rows.at(-1).id;
  draft = updateFieldServiceReportRow(draft, addedId, 'brandModel', 'Schema test unit');
  const serialized = serializeFieldServiceReportDraft(draft);

  assert.equal(serialized.rows.at(-1).brandModel, 'Schema test unit');
  assert.deepEqual(serialized._documentSchema, { code: 'field_service_report', version: 1 });

  draft = removeFieldServiceReportRow(draft, addedId);
  assert.equal(draft.rows.length, 12);

  const oneRowDraft = { ...draft, rows: [draft.rows[0]] };
  assert.equal(removeFieldServiceReportRow(oneRowDraft, oneRowDraft.rows[0].id), oneRowDraft);
});

