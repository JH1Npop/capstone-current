import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findNearbyPdfLabel,
  getMissingRequiredMappings,
  suggestFieldMappings,
} from '../src/documents/documentFieldSuggestions.js';

const fields = [
  { key: 'client_name', label: 'Client Name', value_type: 'text', is_collection: false },
  { key: 'total_price', label: 'Total Price', value_type: 'currency', is_collection: false },
  { key: 'bom_rows', label: 'Bill of Materials', value_type: 'collection', is_collection: true },
];

test('exact and alias labels produce explainable confidence-ranked suggestions', () => {
  const customer = suggestFieldMappings('Customer', fields, 'quotation_proposal');
  assert.equal(customer[0].key, 'client_name');
  assert.equal(customer[0].confidence, 'high');
  assert.equal(customer[0].needsConfirmation, true);
  assert.match(customer[0].explanation, /exactly matches/i);

  const total = suggestFieldMappings('Total Amount Due', fields, 'quotation_proposal');
  assert.equal(total[0].key, 'total_price');
  assert.equal(total[0].confidence, 'medium');
});

test('weak unrelated text is not presented as a mapping', () => {
  assert.deepEqual(suggestFieldMappings('Thank you for your business', fields), []);
});

test('nearby PDF label selection is deterministic and bounded', () => {
  const items = [
    { text: 'Customer Name', x: 0.1, y: 0.2, width: 0.15, height: 0.03 },
    { text: 'Total Amount', x: 0.1, y: 0.8, width: 0.15, height: 0.03 },
  ];
  assert.equal(findNearbyPdfLabel(items, { x: 0.28, y: 0.22 })?.text, 'Customer Name');
  assert.equal(findNearbyPdfLabel(items, { x: 0.9, y: 0.5 }), null);
});

test('required component detection reports only absent mappings', () => {
  assert.deepEqual(
    getMissingRequiredMappings('quotation_proposal', ['client_name', 'price_rows']),
    ['bom_rows'],
  );
});

