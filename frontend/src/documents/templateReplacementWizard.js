export const REPLACEMENT_STEPS = Object.freeze([
  { key: 'document', label: 'Choose document' },
  { key: 'upload', label: 'Upload design' },
  { key: 'validation', label: 'Check file' },
  { key: 'configuration', label: 'Confirm fields' },
  { key: 'test', label: 'Test document' },
  { key: 'activate', label: 'Save and use' },
]);

const messages = (items) => (Array.isArray(items) ? items : [])
  .map((item) => (typeof item === 'string' ? item : item?.message))
  .filter(Boolean);

export const describeTemplateValidation = (version) => {
  const report = version?.validation_report || {};
  const errors = messages(report.errors);
  const warnings = messages(report.warnings);
  if (errors.length) return { tone: 'error', title: 'This file needs attention', messages: errors };
  if (warnings.length) return { tone: 'warning', title: 'The file is safe, but setup is still needed', messages: warnings };
  if (version?.validation_status === 'valid') return { tone: 'success', title: 'The file passed validation', messages: [] };
  return { tone: 'neutral', title: 'Validation has not finished', messages: [] };
};

export const getTemplatePlaceholders = (version) => (
  Array.isArray(version?.placeholder_manifest?.placeholders)
    ? version.placeholder_manifest.placeholders
    : []
);

export const isTemplateConfigured = (version) => {
  if (!version || version.validation_status !== 'valid') return false;
  if (version.file_format === 'pdf') return ['ready_fill', 'ready_auto'].includes(version.readiness_status);
  return version.file_format === 'docx';
};

export const getActivationMissingComponents = (version) => (
  Array.isArray(version?.activation_missing_components)
    ? version.activation_missing_components
    : []
);

export const canPublishTemplateVersion = (version) => (
  isTemplateConfigured(version) && getActivationMissingComponents(version).length === 0
);

export const canRollbackTemplateVersion = ({ version, versions = [], activeVersionId }) => (
  Boolean(version)
  && version.validation_status === 'valid'
  && isTemplateConfigured(version)
  && (getActivationMissingComponents(version).length === 0 || Boolean(version.activated_at))
  && Number(activeVersionId) !== Number(version.id)
  && versions.some((item) => item.version_number > version.version_number)
);

export const canTestReplacement = ({ version, ticketId }) => (
  Boolean(ticketId) && isTemplateConfigured(version)
);

export const canActivateReplacement = ({ version, testedVersionId }) => (
  canPublishTemplateVersion(version) && Number(testedVersionId) === Number(version?.id)
);

