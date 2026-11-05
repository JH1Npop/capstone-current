import {
  schemaAction,
  schemaField,
  stampDocumentDraft,
  updateDocumentField,
  updateDocumentRow,
} from './documentSchemaHelpers.js';

const SCHEMA_CODE = 'technical_data_sheet';
const SCHEMA_VERSION = 1;

const loadColumns = Object.freeze([
  schemaField('appliance', 'Appliance / Load', 'text', 'technical_data_sheet.load_schedule'),
  schemaField('quantity', 'Quantity', 'number', 'technical_data_sheet.load_schedule'),
  schemaField('inverterType', 'Inverter Type', 'text', 'technical_data_sheet.load_schedule'),
  schemaField('wattage', 'Wattage', 'number', 'technical_data_sheet.load_schedule'),
  schemaField('usageDay', 'Day Usage', 'text', 'technical_data_sheet.load_schedule'),
  schemaField('usageNight', 'Night Usage', 'text', 'technical_data_sheet.load_schedule'),
  schemaField('remarks', 'Remarks', 'multiline', 'technical_data_sheet.load_schedule'),
]);

const purposeLabels = Object.freeze([
  'Primary Source of Power during the Day',
  'Primary Source of Power 24/7 both Day and Night',
  'Energy Savings and Efficiency',
  'DENR Compliance',
  'Others please specify',
]);

export const TECHNICAL_DATA_SHEET_SCHEMA = Object.freeze({
  code: SCHEMA_CODE,
  version: SCHEMA_VERSION,
  name: 'TDS - Technical Data Sheet',
  dataOwnership: Object.freeze({
    workflowRecord: 'TechnicalDataSheet',
    printableDraft: 'GeneratedDocument.data_json',
    rule: 'The canonical TechnicalDataSheet owns technical values and draft/submitted/reviewed state. The printable draft preserves client-facing presentation fields; reviewed records remain immutable.',
  }),
  fields: Object.freeze([
    schemaField('lastName', 'Last Name', 'text', 'client.last_name'),
    schemaField('firstName', 'First Name', 'text', 'client.first_name'),
    schemaField('middleName', 'Middle Name', 'text', 'client.middle_name'),
    schemaField('companyName', 'Company Name', 'text', 'client.company'),
    schemaField('contactLandline', 'Landline', 'text', 'client.landline'),
    schemaField('mobileNumber', 'Mobile Number', 'text', 'client.phone'),
    schemaField('emailAddress', 'Email Address', 'text', 'client.email'),
    schemaField('completeAddress', 'Complete Address', 'multiline', 'service_location.address'),
    schemaField('sitePremisePlan', 'Site Premise Plan', 'text', 'technical_data_sheet.premise_type'),
    schemaField('sitePremiseCategory', 'Site Premise Category', 'text', 'technical_data_sheet.premise_category'),
    schemaField('ownershipStatus', 'Ownership Status', 'text', 'technical_data_sheet.ownership_type'),
    schemaField('primaryElectricSupply', 'Primary Electric Supply', 'text', 'technical_data_sheet.primary_electric_supply'),
    schemaField('acSupplyType', 'AC Supply Type', 'text', 'technical_data_sheet.ac_phase_power_supply'),
    schemaField('solarInstallLocation', 'Solar Installation Location', 'text', 'technical_data_sheet.solar_panel_installation_location'),
    schemaField('rooftopType', 'Rooftop Type', 'text', 'technical_data_sheet.rooftop_type'),
    schemaField('averageMonthlyBill', 'Average Monthly Bill', 'currency', 'technical_data_sheet.average_monthly_electric_bill'),
    schemaField('electricityHoursPerDay', 'Electricity Hours per Day', 'number', 'technical_data_sheet.electricity_required_hours_per_day'),
    schemaField('frequentBrownouts', 'Frequent Brownouts', 'select', 'technical_data_sheet.generator_details_json'),
    schemaField('brownoutFrequencyPerWeek', 'Brownout Frequency per Week', 'number', 'technical_data_sheet.brownout_frequency'),
    schemaField('batteryPreference', 'Battery Preference', 'text', 'technical_data_sheet.battery_preference'),
    schemaField('hasGenerator', 'Has Generator', 'select', 'technical_data_sheet.generator_details_json'),
    schemaField('generatorBrandName', 'Generator Brand', 'text', 'technical_data_sheet.generator_details_json'),
    schemaField('generatorCapacity', 'Generator Capacity', 'text', 'technical_data_sheet.generator_details_json'),
    schemaField('generatorFuelType', 'Generator Fuel Type', 'text', 'technical_data_sheet.generator_details_json'),
    schemaField('generatorDatePurchased', 'Generator Date Purchased', 'date', 'technical_data_sheet.generator_details_json'),
    schemaField('purposeOther', 'Other Solar Purpose', 'multiline', 'technical_data_sheet.purpose_of_going_solar'),
    schemaField('attachElectricBill', 'Electric Bill Attachment', 'text', 'technical_data_sheet.attachments_json'),
    schemaField('attachSitePhoto', 'Site Photo Attachment', 'text', 'technical_data_sheet.attachments_json'),
    schemaField('clientConfirmationName', 'Client Confirmation Name', 'text', 'technical_data_sheet.client_confirmed_name'),
    schemaField('confirmationDate', 'Confirmation Date', 'date', 'technical_data_sheet.client_confirmation_date'),
    schemaField('clientSignature', 'Client Signature', 'signature', 'technical_data_sheet.client_signature'),
  ]),
  collections: Object.freeze({
    loadRows: Object.freeze({ key: 'loadRows', label: 'Load Schedule', type: 'repeating_table', minimumRows: 1, initialRows: 7, columns: loadColumns }),
    purposeRows: Object.freeze({
      key: 'purposeRows',
      label: 'Purpose of Going Solar',
      type: 'fixed_checklist',
      templateItems: purposeLabels,
      columns: Object.freeze([
        schemaField('label', 'Purpose', 'text', 'technical_data_sheet.purpose_of_going_solar', { manualEdit: false }),
        schemaField('mark', 'Selected', 'checkbox', 'technical_data_sheet.purpose_of_going_solar'),
      ]),
    }),
  }),
  statuses: Object.freeze(['draft', 'submitted', 'reviewed']),
  actions: Object.freeze([
    schemaAction('save', 'Save data sheet', 'technical_data_sheet'),
    schemaAction('submit', 'Submit data sheet', 'technical_data_sheet.submit'),
    schemaAction('review', 'Review data sheet', 'technical_data_sheet.review'),
    schemaAction('print', 'Print', 'browser'),
    schemaAction('generate', 'Generate file', 'document_generation'),
  ]),
});

export const createTdsLoadRows = () => Array.from({ length: 7 }, (_, index) => ({
  id: `tds-load-${index + 1}`,
  appliance: '',
  quantity: '',
  inverterType: '',
  wattage: '',
  usageDay: '',
  usageNight: '',
  remarks: '',
}));

export const createTdsPurposeRows = () => purposeLabels.map((label, index) => ({
  id: `tds-purpose-${index + 1}`,
  label,
  mark: '',
}));

export const createTechnicalDataSheetDraft = () => ({
  lastName: '', firstName: '', middleName: '', companyName: '', contactLandline: '', mobileNumber: '', emailAddress: '',
  sitePremisePlan: '', sitePremiseCategory: '', ownershipStatus: '', completeAddress: '', primaryElectricSupply: '',
  acSupplyType: '', solarInstallLocation: '', rooftopType: '', averageMonthlyBill: '', electricityHoursPerDay: '',
  frequentBrownouts: '', brownoutFrequencyPerWeek: '', batteryPreference: '', loadRows: createTdsLoadRows(),
  hasGenerator: '', generatorBrandName: '', generatorCapacity: '', generatorFuelType: '', generatorDatePurchased: '',
  purposeRows: createTdsPurposeRows(), purposeOther: '', attachElectricBill: '', attachSitePhoto: '',
  clientConfirmationName: '', confirmationDate: '', clientSignature: '',
});

const normalizeLoadRows = (rows) => {
  const supplied = Array.isArray(rows) && rows.length ? rows : createTdsLoadRows();
  return supplied.map((row, index) => ({
    id: row?.id || `tds-load-${index + 1}`,
    appliance: '', quantity: '', inverterType: '', wattage: '', usageDay: '', usageNight: '', remarks: '',
    ...(row || {}),
  }));
};

const normalizePurposeRows = (rows) => {
  const supplied = Array.isArray(rows) ? rows : [];
  return createTdsPurposeRows().map((template) => {
    const saved = supplied.find((row) => row?.id === template.id || row?.label === template.label);
    return { ...template, ...(saved || {}) };
  });
};

export const adaptTechnicalDataSheetDraft = (data) => {
  const input = data && typeof data === 'object' ? data : {};
  return {
    ...createTechnicalDataSheetDraft(),
    ...input,
    loadRows: normalizeLoadRows(input.loadRows),
    purposeRows: normalizePurposeRows(input.purposeRows),
  };
};

export const serializeTechnicalDataSheetDraft = (data) => (
  stampDocumentDraft(TECHNICAL_DATA_SHEET_SCHEMA, adaptTechnicalDataSheetDraft(data))
);

export const buildTechnicalDataSheetRecord = (data, ticketId, status = 'draft') => {
  const draft = adaptTechnicalDataSheetDraft(data);
  const purposes = draft.purposeRows
    .filter((row) => String(row.mark || '').trim() && !String(row.label || '').toLowerCase().startsWith('others'))
    .map((row) => row.label);
  if (String(draft.purposeOther || '').trim()) purposes.push(draft.purposeOther);
  return {
    ticket: Number(ticketId),
    status,
    premise_type: draft.sitePremisePlan || null,
    premise_category: draft.sitePremiseCategory || null,
    ownership_type: draft.ownershipStatus || null,
    primary_electric_supply: draft.primaryElectricSupply || null,
    ac_phase_power_supply: draft.acSupplyType || null,
    solar_panel_installation_location: draft.solarInstallLocation || null,
    rooftop_type: draft.rooftopType || null,
    average_monthly_electric_bill: draft.averageMonthlyBill || null,
    electricity_required_hours_per_day: draft.electricityHoursPerDay || null,
    brownout_frequency: draft.brownoutFrequencyPerWeek || null,
    battery_preference: draft.batteryPreference || null,
    purpose_of_going_solar: purposes,
    load_schedule_json: draft.loadRows,
    generator_details_json: {
      hasGenerator: draft.hasGenerator || '', brandName: draft.generatorBrandName || '', capacity: draft.generatorCapacity || '',
      fuelType: draft.generatorFuelType || '', datePurchased: draft.generatorDatePurchased || '',
      frequentBrownouts: draft.frequentBrownouts || '', brownoutFrequencyPerWeek: draft.brownoutFrequencyPerWeek || '',
    },
    attachments_json: { electricBill: draft.attachElectricBill || '', sitePhoto: draft.attachSitePhoto || '' },
    client_confirmation_date: draft.confirmationDate || null,
    client_confirmed_name: draft.clientConfirmationName || null,
  };
};

export const updateTechnicalDataSheetField = updateDocumentField;
export const updateTechnicalDataSheetRow = updateDocumentRow;
