import {
  addDocumentRow,
  removeDocumentRow,
  schemaAction,
  schemaField,
  stampDocumentDraft,
  updateDocumentField,
  updateDocumentRow,
} from './documentSchemaHelpers.js';

const SCHEMA_CODE = 'turnover_acceptance';
const SCHEMA_VERSION = 1;

export const createTurnoverComponentsRows = () => ([
  { id: 'turnover-component-1', label: 'Number of Solar Panels', valueA: '', valueB: '' },
  { id: 'turnover-component-2', label: 'Number of Inverters', valueA: '', valueB: '' },
  { id: 'turnover-component-3', label: 'Mounting Structure', valueA: '', valueB: '' },
  { id: 'turnover-component-4', label: 'Other Components', valueA: '', valueB: '' },
  { id: 'turnover-component-5', label: 'Location of Panels', valueA: '', valueB: '' },
  { id: 'turnover-component-6', label: 'Inverter Location', valueA: '', valueB: '' },
]);

export const createTurnoverPerformanceRows = () => ([
  { id: 'turnover-performance-1', label: 'Expected Energy Production (Estimated Daily/Monthly/Annual energy harvest)', daily: '', monthly: '', annual: '' },
  { id: 'turnover-performance-2', label: 'Inverter Output Power (rated power)', daily: '', monthly: '', annual: '' },
  { id: 'turnover-performance-3', label: 'System Voltage (Single Phase/Three Phase)', daily: '', monthly: '', annual: '' },
  { id: 'turnover-performance-4', label: 'Performance Monitoring System (software or app used if applicable)', daily: '', monthly: '', annual: '' },
  { id: 'turnover-performance-5', label: 'Net Metering Status (if applicable)', daily: '', monthly: '', annual: '' },
]);

export const createTurnoverCommissioningRows = () => ([
  { id: 'turnover-commissioning-1', label: 'Inverter Commissioning', dateConducted: '', values: '', results: '' },
  { id: 'turnover-commissioning-2', label: 'System Performance Test', dateConducted: '', values: '', results: '' },
  { id: 'turnover-commissioning-3', label: 'Voltage and Current Measurements (per string)', dateConducted: '', values: 'Ioc / Voc / Imp / Vmp', results: '' },
  { id: 'turnover-commissioning-4', label: 'Insulation Resistance Test (if applicable)', dateConducted: '', values: '', results: '' },
  { id: 'turnover-commissioning-5', label: 'Safety and Grounding Check', dateConducted: '', values: '', results: '' },
  { id: 'turnover-commissioning-6', label: 'System Energization', dateConducted: '', values: '', results: '' },
]);

export const createTurnoverDocumentsRows = () => ([
  { id: 'turnover-document-1', label: 'As-built Electrical Plans (if applicable)', status: '', date: '' },
  { id: 'turnover-document-2', label: 'Installation Diagram (if applicable)', status: '', date: '' },
  { id: 'turnover-document-3', label: 'Equipment Manuals (Inverters, Panels, etc.)', status: '', date: '' },
  { id: 'turnover-document-4', label: 'Maintenance Guidelines', status: '', date: '' },
  { id: 'turnover-document-5', label: 'Warranty Certificates', status: '', date: '' },
  { id: 'turnover-document-6', label: 'Net Metering Application (if applicable)', status: '', date: '' },
]);

const collection = (key, label, columns) => Object.freeze({
  key, label, type: 'repeating_table', minimumRows: 1, columns: Object.freeze(columns),
});

export const TURNOVER_ACCEPTANCE_SCHEMA = Object.freeze({
  code: SCHEMA_CODE,
  version: SCHEMA_VERSION,
  name: 'Turnover / Acceptance Form',
  dataOwnership: Object.freeze({
    workflowRecord: 'TurnoverAcceptance',
    printableDraft: 'GeneratedDocument.data_json',
    rule: 'TurnoverAcceptance owns finalization, warranty start, ticket transition, and client confirmation. The printable draft owns the detailed presentation tables; finalized or accepted records remain immutable.',
  }),
  fields: Object.freeze([
    schemaField('projectInstallationOf', 'Project Installation Of', 'text', 'ticket.service_type'),
    schemaField('locationAddress', 'Location Address', 'multiline', 'service_location.address'),
    schemaField('dateOfCompletion', 'Date of Completion', 'date', 'ticket.completed_date'),
    schemaField('dateOfTurnover', 'Date of Turnover', 'date', 'turnover.turnover_date'),
    schemaField('clientName', 'Client Name', 'text', 'turnover.accepted_by_client_name'),
    schemaField('clientContactPerson', 'Client Contact Person', 'text', 'client.full_name'),
    schemaField('clientContactNumber', 'Client Contact Number', 'text', 'turnover.accepted_by_client_contact'),
    schemaField('systemCapacity', 'System Capacity', 'text', 'ticket.project_details.system_capacity_kwp'),
    schemaField('warrantyStartDate', 'Warranty Start Date', 'date', 'turnover.warranty_start_date'),
    schemaField('installerPartner', 'Installer Partner', 'text', 'company.name'),
    schemaField('installerContactPerson', 'Installer Contact Person', 'text', 'ticket.assigned_technician'),
    schemaField('installerContactNumber', 'Installer Contact Number', 'text', 'technician.phone'),
    schemaField('installerSignature', 'Installer Signature', 'signature', 'turnover.installer_signature'),
    schemaField('installerDate', 'Installer Date', 'date', 'ticket.completed_date'),
    schemaField('clientSignature', 'Client Signature', 'signature', 'turnover.client_signature'),
    schemaField('clientSignatureDate', 'Client Signature Date', 'date', 'turnover.client_confirmed_at'),
    schemaField('confirmationSystemName', 'Confirmation System Name', 'text', 'ticket.service_type'),
    schemaField('warrantyOnInverters', 'Inverter Warranty', 'multiline', 'turnover.warranty_terms'),
    schemaField('systemWarranty', 'System Warranty', 'multiline', 'turnover.warranty_terms'),
  ]),
  collections: Object.freeze({
    componentsRows: collection('componentsRows', 'Installed Components', [
      schemaField('label', 'Component', 'text', 'turnover.components'),
      schemaField('valueA', 'Value A', 'text', 'turnover.components'),
      schemaField('valueB', 'Value B', 'text', 'turnover.components'),
    ]),
    performanceRows: collection('performanceRows', 'Performance Summary', [
      schemaField('label', 'Metric', 'text', 'turnover.performance'),
      schemaField('daily', 'Daily', 'text', 'turnover.performance'),
      schemaField('monthly', 'Monthly', 'text', 'turnover.performance'),
      schemaField('annual', 'Annual', 'text', 'turnover.performance'),
    ]),
    commissioningRows: collection('commissioningRows', 'Commissioning Results', [
      schemaField('label', 'Test', 'text', 'turnover.commissioning'),
      schemaField('dateConducted', 'Date Conducted', 'date', 'turnover.commissioning'),
      schemaField('values', 'Values', 'text', 'turnover.commissioning'),
      schemaField('results', 'Results', 'text', 'turnover.commissioning'),
    ]),
    documentsRows: collection('documentsRows', 'Turnover Documents', [
      schemaField('label', 'Document', 'text', 'turnover.documents'),
      schemaField('status', 'Status', 'text', 'turnover.documents'),
      schemaField('date', 'Date', 'date', 'turnover.documents'),
    ]),
  }),
  statuses: Object.freeze(['draft', 'finalized', 'accepted']),
  actions: Object.freeze([
    schemaAction('save_draft', 'Save draft', 'turnover_acceptance'),
    schemaAction('finalize', 'Finalize project handover', 'turnover_acceptance.finalize'),
    schemaAction('client_confirm', 'Confirm handover', 'turnover_acceptance.client_confirm'),
    schemaAction('print', 'Print', 'browser'),
    schemaAction('generate', 'Generate file', 'document_generation'),
  ]),
});

export const createTurnoverDraft = () => ({
  id: null, status: 'draft', projectInstallationOf: '', locationAddress: '', dateOfCompletion: '', dateOfTurnover: '',
  clientName: '', clientContactPerson: '', clientContactNumber: '', systemCapacity: '', warrantyStartDate: '',
  installerPartner: 'AFN Solar Power Engineering Services', installerContactPerson: '', installerContactNumber: '',
  installerSignature: '', installerDate: '', clientSignature: '', clientSignatureDate: '', confirmationSystemName: '',
  warrantyOnInverters: '', systemWarranty: '', componentsRows: createTurnoverComponentsRows(),
  performanceRows: createTurnoverPerformanceRows(), commissioningRows: createTurnoverCommissioningRows(), documentsRows: createTurnoverDocumentsRows(),
});

const normalizeRows = (rows, defaults, prefix) => {
  const supplied = Array.isArray(rows) && rows.length ? rows : defaults();
  return supplied.map((row, index) => ({ id: row?.id || `${prefix}-${index + 1}`, ...(row || {}) }));
};

export const adaptTurnoverDraft = (data) => {
  const input = data && typeof data === 'object' ? data : {};
  return {
    ...createTurnoverDraft(),
    ...input,
    componentsRows: normalizeRows(input.componentsRows, createTurnoverComponentsRows, 'turnover-component'),
    performanceRows: normalizeRows(input.performanceRows, createTurnoverPerformanceRows, 'turnover-performance'),
    commissioningRows: normalizeRows(input.commissioningRows, createTurnoverCommissioningRows, 'turnover-commissioning'),
    documentsRows: normalizeRows(input.documentsRows, createTurnoverDocumentsRows, 'turnover-document'),
  };
};

export const serializeTurnoverDraft = (data) => stampDocumentDraft(TURNOVER_ACCEPTANCE_SCHEMA, adaptTurnoverDraft(data));

export const buildTurnoverRecord = (data, ticketId) => {
  const draft = adaptTurnoverDraft(data);
  const turnoverDate = draft.dateOfTurnover || null;
  const payload = {
    ticket: Number(ticketId),
    turnover_date: turnoverDate,
    accepted_by_client_name: draft.clientName || '',
    accepted_by_client_contact: draft.clientContactNumber || '',
    warranty_start_date: draft.warrantyStartDate || turnoverDate,
  };
  if (draft.id) payload.id = draft.id;
  return payload;
};

export const createTurnoverRow = (type, index = 0) => {
  const suffix = `${Date.now()}-${index}`;
  if (type === 'components') return { id: `turnover-component-${suffix}`, label: '', valueA: '', valueB: '' };
  if (type === 'performance') return { id: `turnover-performance-${suffix}`, label: '', daily: '', monthly: '', annual: '' };
  if (type === 'commissioning') return { id: `turnover-commissioning-${suffix}`, label: '', dateConducted: '', values: '', results: '' };
  return { id: `turnover-document-${suffix}`, label: '', status: '', date: '' };
};

export const updateTurnoverField = updateDocumentField;
export const updateTurnoverRow = updateDocumentRow;
export const addTurnoverRow = (draft, collectionKey, row) => addDocumentRow(draft, collectionKey, row);
export const removeTurnoverRow = (draft, collectionKey, rowId) => removeDocumentRow(draft, collectionKey, rowId, 1);
