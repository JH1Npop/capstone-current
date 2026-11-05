import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOLAR_COMMISSIONING_SCHEMA,
  adaptSolarCommissioningDraft,
  createSolarCommissioningDraft,
  serializeSolarCommissioningRecord,
  updateSolarCommissioningItem,
  updateSolarCommissioningReading,
} from '../src/documents/solarCommissioningSchema.js';

test('Solar Commissioning schema describes the canonical workflow and all 54 fixed items', () => {
  const checklist = SOLAR_COMMISSIONING_SCHEMA.collections.checklist_items_json;

  assert.equal(SOLAR_COMMISSIONING_SCHEMA.code, 'commissioning_checklist');
  assert.equal(SOLAR_COMMISSIONING_SCHEMA.version, 1);
  assert.equal(checklist.type, 'fixed_checklist');
  assert.equal(checklist.templateItems.length, 54);
  assert.deepEqual(checklist.columns.map(({ key }) => key), ['item_no', 'description', 'check_status']);
  assert.match(SOLAR_COMMISSIONING_SCHEMA.dataOwnership.rule, /finalized records remain immutable/i);
});

test('legacy technician values adapt to the canonical API shape without losing notes', () => {
  const adapted = adaptSolarCommissioningDraft({
    id: 18,
    ticket: 630,
    items: [
      { item_no: 1, check_type: 'Yes' },
      { item_no: 2, check_type: 'No', remarks: 'Needs correction' },
    ],
    weather_condition: 'Sunny',
    solar_irradiance: '810',
    remarks: 'Legacy technician note',
  });

  assert.equal(adapted.checklist_items_json.length, 54);
  assert.equal(adapted.checklist_items_json[0].check_status, 'Pass');
  assert.equal(adapted.checklist_items_json[1].check_status, 'Fail');
  assert.equal(adapted.checklist_items_json[1].remarks, 'Needs correction');
  assert.equal(adapted.irradiance, '810');
  assert.equal(adapted.readings_json.weather_condition, 'Sunny');
  assert.equal(adapted.readings_json.remarks, 'Legacy technician note');
});

test('schema helpers update readings and serialize only canonical model fields', () => {
  let draft = createSolarCommissioningDraft();
  draft = updateSolarCommissioningItem(draft, 54, 'check_status', 'N/A');
  draft = updateSolarCommissioningReading(draft, 'field_measured', 'phase_c_current', '12.4');
  const payload = serializeSolarCommissioningRecord({ ...draft, unknown_ui_value: 'do not send' }, 99);

  assert.equal(payload.ticket, 99);
  assert.equal(payload.checklist_items_json[53].check_status, 'N/A');
  assert.equal(payload.readings_json.field_measured.phase_c_current, '12.4');
  assert.equal(payload.unknown_ui_value, undefined);
  assert.equal(payload._documentSchema, undefined);
});
