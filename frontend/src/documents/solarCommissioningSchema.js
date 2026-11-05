import { COMMISSIONING_TEMPLATE_ITEMS } from './solarCommissioningItems.js';

export { COMMISSIONING_TEMPLATE_ITEMS } from './solarCommissioningItems.js';

const SCHEMA_CODE = 'commissioning_checklist';
const SCHEMA_VERSION = 1;

const field = (key, label, type, source, options = {}) => Object.freeze({
  key,
  label,
  type,
  source,
  required: false,
  manualEdit: true,
  ...options,
});

const statusOptions = Object.freeze([
  Object.freeze({ value: 'draft', label: 'Draft' }),
  Object.freeze({ value: 'completed', label: 'Completed' }),
  Object.freeze({ value: 'finalized', label: 'Finalized' }),
]);

const checklistStatusOptions = Object.freeze([
  Object.freeze({ value: '', label: 'Select' }),
  Object.freeze({ value: 'Pass', label: 'Pass' }),
  Object.freeze({ value: 'Fail', label: 'Fail' }),
  Object.freeze({ value: 'N/A', label: 'N/A' }),
]);

const readingFields = Object.freeze([
  field('phase_a_voltage', 'AC Line Voltage - Phase A to Grid', 'text', 'solar_commissioning.readings'),
  field('phase_b_voltage', 'AC Line Voltage - Phase B to Grid', 'text', 'solar_commissioning.readings'),
  field('phase_c_voltage', 'AC Line Voltage - Phase C to Grid', 'text', 'solar_commissioning.readings'),
  field('phase_a_current', 'AC Line Current - Phase A', 'text', 'solar_commissioning.readings'),
  field('phase_b_current', 'AC Line Current - Phase B', 'text', 'solar_commissioning.readings'),
  field('phase_c_current', 'AC Line Current - Phase C', 'text', 'solar_commissioning.readings'),
]);

export const SOLAR_COMMISSIONING_SCHEMA = Object.freeze({
  code: SCHEMA_CODE,
  version: SCHEMA_VERSION,
  name: 'PV Solar Site Commissioning Checklist',
  description: 'Canonical commissioning record used by office and technician workspaces.',
  dataOwnership: Object.freeze({
    workflowRecord: 'SolarCommissioningChecklist',
    printableDraft: null,
    rule: 'The canonical checklist owns commissioning values and status. Finalized records remain immutable; templates only control generated presentation.',
  }),
  fields: Object.freeze([
    field('site_name', 'Site Name', 'text', 'service_location.address'),
    field('system_designation', 'System Designation', 'text', 'ticket.project_details.system_designation'),
    field('inverter_type', 'Inverter Type', 'text', 'ticket.project_details.inverter_type'),
    field('inverter_serial_number', 'Inverter Serial Number', 'text', 'ticket.project_details.inverter_serial_number'),
    field('commissioned_date', 'Commissioned Date', 'date', 'ticket.scheduled_date'),
    field('irradiance', 'Irradiance', 'text', 'solar_commissioning.irradiance'),
    field('ambient_temperature', 'Ambient Temperature', 'text', 'solar_commissioning.ambient_temperature'),
    field('status', 'Checklist Status', 'select', 'solar_commissioning.status', { options: statusOptions }),
  ]),
  collections: Object.freeze({
    checklist_items_json: Object.freeze({
      key: 'checklist_items_json',
      label: 'Commissioning items',
      type: 'fixed_checklist',
      outputBinding: 'checklist_rows',
      templateItems: COMMISSIONING_TEMPLATE_ITEMS,
      columns: Object.freeze([
        field('item_no', 'No.', 'number', 'commissioning_template.item_no', { manualEdit: false, width: '7%' }),
        field('description', 'Checklist Item', 'multiline', 'commissioning_template.description', { manualEdit: false, width: '73%' }),
        field('check_status', 'Check', 'select', 'solar_commissioning.check_status', { options: checklistStatusOptions, width: '20%' }),
      ]),
    }),
  }),
  readingGroups: Object.freeze([
    Object.freeze({ key: 'inverter_display', label: 'Readings from the Inverter Display', fields: readingFields }),
    Object.freeze({ key: 'field_measured', label: 'Field Measured Readings', fields: readingFields }),
  ]),
  actions: Object.freeze([
    Object.freeze({ key: 'save', label: 'Save checklist', authority: 'solar_commissioning_checklist' }),
    Object.freeze({ key: 'complete', label: 'Complete checklist', authority: 'solar_commissioning_checklist.complete' }),
    Object.freeze({ key: 'print', label: 'Print', authority: 'browser' }),
    Object.freeze({ key: 'generate', label: 'Generate file', authority: 'document_generation' }),
  ]),
});

const blankReadings = () => ({
  inverter_display: Object.fromEntries(readingFields.map(({ key }) => [key, ''])),
  field_measured: Object.fromEntries(readingFields.map(({ key }) => [key, ''])),
});

const normalizeChecklistStatus = (value) => {
  if (value === 'Yes') return 'Pass';
  if (value === 'No') return 'Fail';
  return checklistStatusOptions.some((option) => option.value === value) ? value : '';
};

export const createSolarCommissioningItems = () => (
  COMMISSIONING_TEMPLATE_ITEMS.map((item) => ({ ...item, check_status: '', remarks: '' }))
);

export const createSolarCommissioningDraft = () => ({
  id: null,
  ticket: null,
  site_name: '',
  inverter_type: '',
  system_designation: '',
  inverter_serial_number: '',
  commissioned_date: '',
  irradiance: '',
  ambient_temperature: '',
  status: 'draft',
  checklist_items_json: createSolarCommissioningItems(),
  readings_json: blankReadings(),
});

const normalizeChecklistItems = (items) => {
  const supplied = Array.isArray(items) ? items : [];
  return COMMISSIONING_TEMPLATE_ITEMS.map((templateItem) => {
    const saved = supplied.find((item) => Number(item?.item_no) === templateItem.item_no) || {};
    return {
      ...saved,
      ...templateItem,
      check_status: normalizeChecklistStatus(saved.check_status ?? saved.check_type ?? ''),
      remarks: saved.remarks || '',
    };
  });
};

export const adaptSolarCommissioningDraft = (data) => {
  const input = data && typeof data === 'object' ? data : {};
  const base = createSolarCommissioningDraft();
  const readings = input.readings_json && typeof input.readings_json === 'object' ? input.readings_json : {};
  const legacyItems = input.checklist_items_json ?? input.items;

  return {
    ...base,
    ...input,
    irradiance: input.irradiance ?? input.solar_irradiance ?? '',
    status: statusOptions.some((option) => option.value === input.status) ? input.status : 'draft',
    checklist_items_json: normalizeChecklistItems(legacyItems),
    readings_json: {
      ...readings,
      inverter_display: { ...base.readings_json.inverter_display, ...(readings.inverter_display || {}) },
      field_measured: { ...base.readings_json.field_measured, ...(readings.field_measured || {}) },
      weather_condition: readings.weather_condition ?? input.weather_condition ?? '',
      remarks: readings.remarks ?? input.remarks ?? '',
    },
  };
};

export const serializeSolarCommissioningRecord = (data, ticketId = null) => {
  const normalized = adaptSolarCommissioningDraft(data);
  const payload = {
    ticket: ticketId ?? normalized.ticket,
    site_name: normalized.site_name,
    inverter_type: normalized.inverter_type,
    system_designation: normalized.system_designation,
    inverter_serial_number: normalized.inverter_serial_number,
    commissioned_date: normalized.commissioned_date || null,
    irradiance: normalized.irradiance,
    ambient_temperature: normalized.ambient_temperature,
    status: normalized.status,
    checklist_items_json: normalized.checklist_items_json,
    readings_json: normalized.readings_json,
  };
  if (normalized.id) payload.id = normalized.id;
  return payload;
};

export const updateSolarCommissioningField = (draft, key, value) => ({
  ...draft,
  [key]: value,
});

export const updateSolarCommissioningItem = (draft, itemNo, key, value) => ({
  ...draft,
  checklist_items_json: draft.checklist_items_json.map((item) => (
    Number(item.item_no) === Number(itemNo) ? { ...item, [key]: value } : item
  )),
});

export const updateSolarCommissioningReading = (draft, group, key, value) => ({
  ...draft,
  readings_json: {
    ...draft.readings_json,
    [group]: {
      ...(draft.readings_json?.[group] || {}),
      [key]: value,
    },
  },
});

export const updateSolarCommissioningNote = (draft, key, value) => ({
  ...draft,
  readings_json: {
    ...draft.readings_json,
    [key]: value,
  },
});
