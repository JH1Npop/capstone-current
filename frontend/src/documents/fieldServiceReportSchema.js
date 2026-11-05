const SCHEMA_CODE = 'field_service_report';
const SCHEMA_VERSION = 1;

const textField = (key, label, source, options = {}) => ({
  key,
  label,
  type: 'text',
  source,
  required: false,
  manualEdit: true,
  ...options,
});

export const FIELD_SERVICE_REPORT_SCHEMA = Object.freeze({
  code: SCHEMA_CODE,
  version: SCHEMA_VERSION,
  name: 'Field Service Report',
  description: 'Printable office copy of technician-authored service readings.',
  dataOwnership: Object.freeze({
    workflowRecord: 'FieldServiceReport',
    printableDraft: 'GeneratedDocument.data_json',
    rule: 'The technician report remains authoritative for acknowledgment and locking. The printable draft controls presentation only.',
  }),
  fields: Object.freeze([
    textField('clientName', 'Client', 'client.full_name', { required: true }),
    textField('address', 'Address', 'service_location.address', { required: true }),
    textField('contactNumber', 'Contact number', 'client.phone'),
    textField('technician', 'Technician', 'ticket.assigned_technician'),
    textField('documentDate', 'Service date', 'ticket.scheduled_date', { type: 'date' }),
    textField('systemCapacity', 'System capacity', 'ticket.project_details.system_capacity_kwp'),
    textField('ticketNumber', 'Ticket number', 'ticket.ticket_number', { required: true, manualEdit: false }),
    textField('serviceType', 'Service type', 'ticket.service_type', { required: true }),
    textField('reference', 'Reference', 'ticket.related_reference'),
  ]),
  collections: Object.freeze({
    rows: Object.freeze({
      key: 'rows',
      label: 'Equipment readings',
      type: 'repeating_table',
      outputBinding: 'service_rows',
      minimumRows: 1,
      initialRows: 12,
      columns: Object.freeze([
        textField('brandModel', 'Brand / Model', 'field_service_report.brand_model', { width: '16%' }),
        textField('trHp', 'TR/HP', 'installed_equipment.capacity', { width: '7%' }),
        textField('serialNumber', 'Serial #', 'field_service_report.serial_number', { width: '9%' }),
        textField('indoorTemp', 'Indoor temp', 'field_service_report.indoor_temp', { width: '11%' }),
        textField('outdoorTemp', 'Outdoor temp', 'field_service_report.outdoor_temp', { width: '11%' }),
        textField('ampere', 'Ampere', 'field_service_report.ampere_reading', { width: '8%' }),
        textField('others', 'Others specify', 'field_service_report.voltage_reading', { width: '15%' }),
        textField('recommendation', 'Recommendation', 'field_service_report.recommendation', { width: '23%', type: 'multiline' }),
      ]),
    }),
  }),
  actions: Object.freeze([
    Object.freeze({ key: 'save_draft', label: 'Save draft', authority: 'generated_document' }),
    Object.freeze({ key: 'print', label: 'Print', authority: 'browser' }),
    Object.freeze({ key: 'generate', label: 'Generate file', authority: 'document_generation' }),
  ]),
});

const rowColumns = FIELD_SERVICE_REPORT_SCHEMA.collections.rows.columns;

const defaultRowValues = (index) => ({
  brandModel: '',
  trHp: '',
  serialNumber: '',
  indoorTemp: index === 0 ? 'In' : index === 4 ? 'Out' : '',
  outdoorTemp: index === 0 ? 'In' : index === 4 ? 'Out' : '',
  ampere: '',
  others: '',
  recommendation: '',
});

export const createFieldServiceReportRow = (index = 0, values = {}, id = null) => ({
  id: id || `fsr-row-${Date.now()}-${index}`,
  ...defaultRowValues(index),
  ...(values || {}),
});

export const createFieldServiceReportRows = () => (
  Array.from(
    { length: FIELD_SERVICE_REPORT_SCHEMA.collections.rows.initialRows },
    (_, index) => createFieldServiceReportRow(index, {}, `row-${index + 1}`),
  )
);

export const createFieldServiceReportDraft = () => ({
  clientName: '',
  address: '',
  contactNumber: '',
  technician: '',
  documentDate: '',
  systemCapacity: '',
  ticketNumber: '',
  serviceType: '',
  reference: '',
  rows: createFieldServiceReportRows(),
});

const normalizeRow = (row, index) => {
  const input = row && typeof row === 'object' ? row : {};
  const normalized = createFieldServiceReportRow(index, input, input.id || `row-${index + 1}`);
  rowColumns.forEach(({ key }) => {
    if (normalized[key] === null || normalized[key] === undefined) normalized[key] = '';
  });
  return normalized;
};

export const adaptFieldServiceReportDraft = (data) => {
  const input = data && typeof data === 'object' ? data : {};
  const suppliedRows = Array.isArray(input.rows) && input.rows.length ? input.rows : createFieldServiceReportRows();
  return {
    ...createFieldServiceReportDraft(),
    ...input,
    rows: suppliedRows.map(normalizeRow),
  };
};

export const serializeFieldServiceReportDraft = (data) => {
  const normalized = adaptFieldServiceReportDraft(data);
  return {
    ...normalized,
    rows: normalized.rows.map((row, index) => normalizeRow(row, index)),
    _documentSchema: {
      code: SCHEMA_CODE,
      version: SCHEMA_VERSION,
    },
  };
};

export const updateFieldServiceReportField = (draft, key, value) => ({
  ...draft,
  [key]: value,
});

export const updateFieldServiceReportRow = (draft, rowId, key, value) => ({
  ...draft,
  rows: draft.rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
});

export const addFieldServiceReportRow = (draft) => ({
  ...draft,
  rows: [...draft.rows, createFieldServiceReportRow(draft.rows.length)],
});

export const removeFieldServiceReportRow = (draft, rowId) => {
  if (draft.rows.length <= FIELD_SERVICE_REPORT_SCHEMA.collections.rows.minimumRows) return draft;
  return { ...draft, rows: draft.rows.filter((row) => row.id !== rowId) };
};

