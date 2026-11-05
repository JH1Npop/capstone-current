import { schemaAction, schemaField, stampDocumentDraft, updateDocumentField } from './documentSchemaHelpers.js';

const SCHEMA_CODE = 'installation_contract';
const SCHEMA_VERSION = 1;

const today = () => new Date().toISOString().slice(0, 10);

export const INSTALLATION_CONTRACT_SCHEMA = Object.freeze({
  code: SCHEMA_CODE,
  version: SCHEMA_VERSION,
  name: 'Solar Installation Contract',
  dataOwnership: Object.freeze({
    workflowRecord: 'InstallationContract',
    printableDraft: 'GeneratedDocument.data_json',
    rule: 'The canonical contract owns scope, dates, financial values, warranty, and lifecycle status. The printable draft owns presentation and legal wording; signed contracts remain immutable.',
  }),
  fields: Object.freeze([
    schemaField('contractDate', 'Contract Date', 'date', 'installation_contract.start_date'),
    schemaField('clientName', 'Client Name', 'text', 'client.full_name'),
    schemaField('clientAddress', 'Client Address', 'multiline', 'client.address'),
    schemaField('propertyAddress', 'Property Address', 'multiline', 'service_location.address'),
    schemaField('serviceType', 'Service Type', 'text', 'ticket.service_type'),
    schemaField('projectLocation', 'Project Location', 'multiline', 'service_location.address'),
    schemaField('startDate', 'Start Date', 'date', 'installation_contract.start_date'),
    schemaField('estimatedCompletionTime', 'Estimated Completion Days', 'number', 'installation_contract.estimated_completion_days'),
    schemaField('totalContractAmount', 'Total Contract Amount', 'currency', 'installation_contract.total_contract_amount', { required: true }),
    schemaField('currency', 'Currency', 'select', 'installation_contract.currency'),
    schemaField('paymentMethod', 'Payment Method', 'text', 'installation_contract.payment_method'),
    schemaField('upfrontPayment', 'Upfront Payment', 'currency', 'installation_contract.payment_terms_upfront'),
    schemaField('completionPayment', 'Completion Payment', 'currency', 'installation_contract.payment_terms_completion'),
    schemaField('finalPayment', 'Final Payment', 'currency', 'installation_contract.payment_terms_final'),
    schemaField('finalInspectionDays', 'Final Inspection Days', 'number', 'installation_contract.final_inspection_days'),
    schemaField('systemCapacity', 'System Capacity', 'text', 'ticket.project_details.system_capacity_kwp'),
    schemaField('systemDescription', 'System Description', 'multiline', 'ticket.service_type'),
    schemaField('warrantyPeriod', 'Warranty Period', 'text', 'installation_contract.warranty_period'),
    schemaField('terminationNoticePeriod', 'Termination Notice Period', 'number', 'installation_contract.termination_notice_period'),
    schemaField('governingLawJurisdiction', 'Governing Law', 'text', 'installation_contract.governing_law'),
    schemaField('mediationOrganization', 'Mediation Organization', 'text', 'installation_contract.mediation_organization'),
    schemaField('companyName', 'Company Name', 'text', 'company.name'),
    schemaField('companyAddress', 'Company Address', 'multiline', 'company.address'),
    schemaField('companyContact', 'Company Contact', 'multiline', 'company.contact'),
    schemaField('authorizedPerson', 'Authorized Person', 'text', 'company.authorized_person'),
    schemaField('authorizedTitle', 'Authorized Title', 'text', 'company.authorized_title'),
    schemaField('clientRepresentative', 'Client Representative', 'text', 'client.full_name'),
    schemaField('clientRepresentativeTitle', 'Client Representative Title', 'text', 'client.representative_title'),
    schemaField('quotationReference', 'Quotation Reference', 'text', 'quotation.quotation_number'),
    schemaField('appendices', 'Appendices', 'text', 'installation_contract.appendices'),
    schemaField('scopeNotes', 'Scope of Work', 'multiline', 'installation_contract.scope_of_work'),
    schemaField('contractStatus', 'Contract Status', 'select', 'installation_contract.status', { manualEdit: false }),
  ]),
  statuses: Object.freeze(['draft', 'finalized', 'signed']),
  actions: Object.freeze([
    schemaAction('save', 'Save contract', 'installation_contract'),
    schemaAction('print', 'Print', 'browser'),
    schemaAction('generate', 'Generate file', 'document_generation'),
  ]),
});

export const createInstallationContractDraft = () => ({
  contractDate: today(), clientName: '', clientAddress: '', propertyAddress: '', serviceType: '', projectLocation: '',
  startDate: '', estimatedCompletionTime: '', totalContractAmount: '', currency: 'Philippine Peso', paymentMethod: 'bank transfer',
  upfrontPayment: '', completionPayment: '', finalPayment: '', finalInspectionDays: '', systemCapacity: '',
  systemDescription: 'solar photovoltaic system', warrantyPeriod: '', terminationNoticePeriod: '30',
  governingLawJurisdiction: 'Republic of the Philippines', mediationOrganization: '',
  companyName: 'AFN Solar Power Engineering Services', companyAddress: 'Lot2a9, Brgy. Bigo, Pagbilao, Quezon',
  companyContact: '09171460224 / (042)9111107 | afnsunenergyserv@gmail.com',
  authorizedPerson: 'C/ENGR. ARVIN F. NAPENAS', authorizedTitle: 'General Manager', clientRepresentative: '',
  clientRepresentativeTitle: '', quotationReference: '', appendices: 'Appendix A', scopeNotes: '', contractStatus: 'draft', contractId: null,
});

export const adaptInstallationContractDraft = (data) => ({
  ...createInstallationContractDraft(),
  ...((data && typeof data === 'object') ? data : {}),
});

export const serializeInstallationContractDraft = (data) => (
  stampDocumentDraft(INSTALLATION_CONTRACT_SCHEMA, adaptInstallationContractDraft(data))
);

const moneyForApi = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(/[^0-9.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount.toFixed(2) : null;
};

export const buildInstallationContractRecord = (data, ticketId, status = 'draft') => {
  const draft = adaptInstallationContractDraft(data);
  const estimatedDays = Number.parseInt(draft.estimatedCompletionTime, 10);
  return {
    ticket: Number(ticketId),
    scope_of_work: draft.scopeNotes || '',
    start_date: draft.startDate || null,
    estimated_completion_days: Number.isFinite(estimatedDays) && estimatedDays > 0 ? estimatedDays : null,
    total_contract_amount: moneyForApi(draft.totalContractAmount),
    payment_terms_upfront: moneyForApi(draft.upfrontPayment),
    payment_terms_completion: moneyForApi(draft.completionPayment),
    payment_terms_final: moneyForApi(draft.finalPayment),
    warranty_period: draft.warrantyPeriod || '',
    status,
  };
};

export const updateInstallationContractField = updateDocumentField;
