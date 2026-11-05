import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPLACEMENT_STEPS,
  canActivateReplacement,
  canPublishTemplateVersion,
  canRollbackTemplateVersion,
  canTestReplacement,
  describeTemplateValidation,
  getActivationMissingComponents,
  getTemplatePlaceholders,
  isTemplateConfigured,
} from '../src/documents/templateReplacementWizard.js';

test('replacement wizard exposes the complete six-step Phase 2 journey', () => {
  assert.deepEqual(REPLACEMENT_STEPS.map(({ key }) => key), [
    'document', 'upload', 'validation', 'configuration', 'test', 'activate',
  ]);
});

test('validation messages remain understandable and preserve backend diagnostics', () => {
  const invalid = describeTemplateValidation({
    validation_report: { errors: [{ message: 'Unknown fields were found.' }] },
  });
  assert.equal(invalid.tone, 'error');
  assert.deepEqual(invalid.messages, ['Unknown fields were found.']);

  const valid = describeTemplateValidation({ validation_status: 'valid', validation_report: {} });
  assert.equal(valid.tone, 'success');
});

test('DOCX is configured after validation while PDF requires field setup', () => {
  assert.equal(isTemplateConfigured({ file_format: 'docx', validation_status: 'valid' }), true);
  assert.equal(isTemplateConfigured({ file_format: 'pdf', validation_status: 'valid', readiness_status: 'saved' }), false);
  assert.equal(isTemplateConfigured({ file_format: 'pdf', validation_status: 'valid', readiness_status: 'ready_fill' }), true);
  assert.equal(isTemplateConfigured({ file_format: 'docx', validation_status: 'invalid' }), false);
});

test('testing requires a ticket and activation requires that exact version to pass testing', () => {
  const version = { id: 7, file_format: 'docx', validation_status: 'valid' };
  assert.equal(canTestReplacement({ version, ticketId: null }), false);
  assert.equal(canTestReplacement({ version, ticketId: 630 }), true);
  assert.equal(canActivateReplacement({ version, testedVersionId: 6 }), false);
  assert.equal(canActivateReplacement({ version, testedVersionId: 7 }), true);
  assert.deepEqual(getTemplatePlaceholders({ placeholder_manifest: { placeholders: ['client_name'] } }), ['client_name']);
});

test('activation uses backend blockers and keeps historical rollback compatibility', () => {
  const incomplete = {
    id: 7,
    version_number: 2,
    file_format: 'docx',
    validation_status: 'valid',
    activation_missing_components: ['price_rows', 'bom_rows'],
  };
  assert.deepEqual(getActivationMissingComponents(incomplete), ['price_rows', 'bom_rows']);
  assert.equal(canPublishTemplateVersion(incomplete), false);
  assert.equal(canActivateReplacement({ version: incomplete, testedVersionId: 7 }), false);
  assert.equal(canRollbackTemplateVersion({
    version: { ...incomplete, id: 6, version_number: 1, activated_at: '2026-11-01T00:00:00Z' },
    versions: [incomplete],
    activeVersionId: 7,
  }), true);
});
