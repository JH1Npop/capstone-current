import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PDF_ZOOM,
  MIN_PDF_ZOOM,
  clampPdfZoom,
  movePdfField,
  resizePdfField,
} from '../src/documents/pdfFieldPlacement.js';

test('PDF zoom remains inside the supported lightweight preview range', () => {
  assert.equal(clampPdfZoom(0.2), MIN_PDF_ZOOM);
  assert.equal(clampPdfZoom(3), MAX_PDF_ZOOM);
  assert.equal(clampPdfZoom(1.25), 1.25);
});

test('PDF fields move precisely without leaving the page', () => {
  const placement = { x: 0.7, y: 0.8, width: 0.25, height: 0.1 };
  assert.deepEqual(movePdfField(placement, 0.2, 0.2), { ...placement, x: 0.75, y: 0.9 });
  assert.deepEqual(movePdfField(placement, -1, -1), { ...placement, x: 0, y: 0 });
});

test('PDF fields resize without becoming unusable or overflowing', () => {
  const placement = { x: 0.8, y: 0.9, width: 0.1, height: 0.05 };
  assert.deepEqual(resizePdfField(placement, 0.5, 0.5), { ...placement, width: 0.2, height: 0.1 });
  assert.deepEqual(resizePdfField(placement, -1, -1), { ...placement, width: 0.03, height: 0.02 });
});
