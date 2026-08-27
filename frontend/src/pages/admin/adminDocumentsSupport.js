export const TEMPLATE_OPTIONS = [
  { id: 'field_service_report', label: 'Field Service Report' },
  { id: 'turnover_acceptance', label: 'Turnover / Acceptance Form' },
  { id: 'commissioning_checklist', label: 'PV Solar Site Commissioning Checklist' },
  { id: 'technical_data_sheet', label: 'TDS - Technical Data Sheet' },
  { id: 'installation_contract', label: 'Solar Installation Contract' },
  { id: 'quotation_proposal', label: 'Quotation Proposal' }
];

export const PAPER_SIZE_OPTIONS = [
  { value: 'a4', label: 'A4', cssSize: 'A4 portrait', previewWidth: '900px', pageHeight: '297mm', pageHeightMm: 297 },
  { value: 'letter', label: 'Letter', cssSize: 'Letter portrait', previewWidth: '925px', pageHeight: '279.4mm', pageHeightMm: 279.4 },
  { value: 'long', label: 'Long Bond', cssSize: '8.5in 13in', previewWidth: '925px', pageHeight: '330.2mm', pageHeightMm: 330.2 }
];

export const COMMISSIONING_TEMPLATE_ITEMS = [
  { item_no: 1, section: 'Safety', description: 'AC & DC disconnects are in the open position.' },
  { item_no: 2, section: 'Safety', description: 'All combiner fuses holders are open.' },
  { item_no: 3, section: 'Safety', description: 'No voltage is present at either the AC or DC Disconnects.' },
  { item_no: 4, section: 'Safety', description: 'If disconnects are not in sight during testing use LOTO.' },
  { item_no: 5, section: 'Plan Review', description: 'Review "As Built" Plan changes.' },
  { item_no: 6, section: 'Plan Review', description: 'Equipment locations, model #s and specifications as per Plan.' },
  { item_no: 7, section: 'Plan Review', description: 'OCP amperage and voltage as per Plan.' },
  { item_no: 8, section: 'Plan Review', description: 'Conduit sizes and materials as per Plan.' },
  { item_no: 9, section: 'Plan Review', description: 'Current carrying conductor size and type as per Plan.' },
  { item_no: 10, section: 'Plan Review', description: 'Grounding and Bonding Conductor - Size and Type as per Plan.' },
  { item_no: 11, section: 'Plan Review', description: 'Equipment and Conduits Grounded or Bonded as per Plan.' },
  { item_no: 12, section: 'Inverter Output and AC Disconnects', description: 'Net Metered OCP is installed in the correct panel location and is properly labeled.' },
  { item_no: 13, section: 'Inverter Output and AC Disconnects', description: 'All Code and PSS required labels are on the AC disconnect cover.' },
  { item_no: 14, section: 'Inverter Output and AC Disconnects', description: 'AC disconnect terminations have been torqued and labeled.' },
  { item_no: 15, section: 'Inverter Output and AC Disconnects', description: 'The AC disconnect is wired as per Plan.' },
  { item_no: 16, section: 'Inverter Output and AC Disconnects', description: 'The AC disconnect is securely attached and neat.' },
  { item_no: 17, section: 'Inverter', description: "The inverter is properly sited and secured with all manufacturer's required clearances." },
  { item_no: 18, section: 'Inverter', description: "Isolation transformer terminations are as per manufacturer's instructions and torqued." },
  { item_no: 19, section: 'Inverter', description: "AC & DC terminations are as per manufacturer's instructions, torqued and labeled." },
  { item_no: 20, section: 'Inverter', description: 'Visually inspect the inverter enclosure for signs of damage in shipping or siting and that all doors open freely.' },
  { item_no: 21, section: 'Inverter', description: 'Visually inspect the interior of the inverter and check for loose sub-assemblies and connections.' },
  { item_no: 22, section: 'Inverter', description: 'Inverter ventilation fans move freely and filters are in-place.' },
  { item_no: 23, section: 'Inverter', description: 'All Code and PSS required labels are on the inverter doors.' },
  { item_no: 24, section: 'Inverter', description: "Bender RCMS Unit and combiner power supply is properly installed as per PSS's installation instructions." },
  { item_no: 25, section: 'PV Output to Inverter', description: 'Junction box terminations are torqued, cables are labeled and properly grounded.' },
  { item_no: 26, section: 'PV Output to Inverter', description: 'Cables routed through conduit bodies are neat and not damaging cable insulation.' },
  { item_no: 27, section: 'PV Output to Inverter', description: "Expansion joints are installed as per manufacturer's instructions and per Plans." },
  { item_no: 28, section: 'PV Output to Inverter', description: 'Conduit runs are per Plan, neat, supported properly and the conduit fittings are tight.' },
  { item_no: 29, section: 'PV Output to Inverter', description: 'The DC disconnect is securely attached and neat.' },
  { item_no: 30, section: 'PV Output to Inverter', description: "The DC disconnect is wired as per manufacturer's and PSS's instructions." },
  { item_no: 31, section: 'PV Output to Inverter', description: 'DC disconnect terminations have been torqued and labeled.' },
  { item_no: 32, section: 'PV Output to Inverter', description: 'All Code and PSS required labels are on the DC disconnect cover.' },
  { item_no: 33, section: 'PV Output to Inverter', description: "The module's nameplate specification is as per the Plans." },
  { item_no: 34, section: 'PV Output to Inverter', description: "Modules are installed and mounted as per the manufacturer's instructions." },
  { item_no: 35, section: 'PV Array', description: 'PV array layout matches the approved plan and string grouping.' },
  { item_no: 36, section: 'PV Array', description: 'There are no damaged or misaligned modules in the array.' },
  { item_no: 37, section: 'PV Array', description: "PV connectors are installed as per the manufacturer's instructions and fully engaged." },
  { item_no: 38, section: 'PV Array', description: 'PV Wiring is properly supported, neat and there are no points where the insulation could become damaged.' },
  { item_no: 39, section: 'PV Array', description: 'Array combiners are terminated as per Plans and are neat.' },
  { item_no: 40, section: 'PV Array', description: 'Combiner terminations have been torqued and labeled.' },
  { item_no: 41, section: 'PV Array', description: 'All Code and PSS required labels are on the combiner cover.' },
  { item_no: 42, section: 'PV Array', description: 'Review the String Open Circuit Voltage and Short Circuit Amperage Test Results.' },
  { item_no: 43, section: 'PV Array', description: 'Review DC Array Megger Test results.' },
  { item_no: 44, section: 'Inverter Start-up', description: 'Close the inverter AC disconnects and power-up the inverter AC side, record the line voltages.' },
  { item_no: 45, section: 'Inverter Start-up', description: 'Turn on the inverter and test all safety interlocks (door switches, Bender, Anti-Islanding, etc).' },
  { item_no: 46, section: 'Inverter Start-up', description: 'Close all combiner fuse holders and any manual disconnects.' },
  { item_no: 47, section: 'Inverter Start-up', description: 'Confirm DC voltage and polarity at the DC disconnect and at the inverter.' },
  { item_no: 48, section: 'Inverter Start-up', description: 'Confirm the AC and DC Surge Protection is operational.' },
  { item_no: 49, section: 'Inverter Start-up', description: 'Close the inverter DC disconnects and put the inverter on line.' },
  { item_no: 50, section: 'Inverter Start-up', description: 'Confirm inverter display voltages and check inverter output.' },
  { item_no: 51, section: 'Inverter Start-up', description: 'Complete Performance Testing.' },
  { item_no: 52, section: 'Monitoring Equipment', description: "Weather Station equipment is installed and wired as per the manufacturer's instructions." },
  { item_no: 53, section: 'Monitoring Equipment', description: "Power Monitoring equipment is installed and wired as per the manufacturer's instructions." },
  { item_no: 54, section: 'Monitoring Equipment', description: 'Monitoring from the inverter and the Gateway is complete and operational.' },
];

export const createRows = () =>
  Array.from({ length: 12 }, (_, index) => ({
    id: `row-${index + 1}`,
    brandModel: '',
    trHp: '',
    serialNumber: '',
    indoorTemp: index === 0 ? 'In' : index === 4 ? 'Out' : '',
    outdoorTemp: index === 0 ? 'In' : index === 4 ? 'Out' : '',
    ampere: '',
    others: '',
    recommendation: ''
  }));

export const createEmptyRow = (index = 0) => ({
  id: `row-${Date.now()}-${index}`,
  brandModel: '',
  trHp: '',
  serialNumber: '',
  indoorTemp: '',
  outdoorTemp: '',
  ampere: '',
  others: '',
  recommendation: ''
});

export const createInitialForm = () => ({
  clientName: '',
  address: '',
  contactNumber: '',
  technician: '',
  documentDate: '',
  systemCapacity: '',
  ticketNumber: '',
  serviceType: '',
  reference: '',
  rows: createRows()
});

export const createTdsLoadRows = () =>
  Array.from({ length: 7 }, (_, index) => ({
    id: `tds-load-${index + 1}`,
    appliance: '',
    quantity: '',
    inverterType: '',
    wattage: '',
    usageDay: '',
    usageNight: '',
    remarks: ''
  }));

export const createTdsPurposeRows = () => ([
  { id: 'tds-purpose-1', label: 'Primary Source of Power during the Day', mark: '' },
  { id: 'tds-purpose-2', label: 'Primary Source of Power 24/7 both Day and Night', mark: '' },
  { id: 'tds-purpose-3', label: 'Energy Savings and Efficiency', mark: '' },
  { id: 'tds-purpose-4', label: 'DENR Compliance', mark: '' },
  { id: 'tds-purpose-5', label: 'Others please specify', mark: '' }
]);

export const createInitialTdsForm = () => ({
  lastName: '',
  firstName: '',
  middleName: '',
  mobileNumber: '',
  emailAddress: '',
  sitePremisePlan: '',
  sitePremiseCategory: '',
  ownershipStatus: '',
  completeAddress: '',
  primaryElectricSupply: '',
  acSupplyType: '',
  solarInstallLocation: '',
  rooftopType: '',
  averageMonthlyBill: '',
  electricityHoursPerDay: '',
  frequentBrownouts: '',
  brownoutFrequencyPerWeek: '',
  batteryPreference: '',
  loadRows: createTdsLoadRows(),
  hasGenerator: '',
  generatorBrandName: '',
  generatorCapacity: '',
  generatorFuelType: '',
  generatorDatePurchased: '',
  purposeRows: createTdsPurposeRows(),
  purposeOther: '',
  attachElectricBill: '',
  attachSitePhoto: '',
  clientConfirmationName: '',
  confirmationDate: '',
  clientSignature: ''
});

export const splitClientName = (fullName = '') => {
  const trimmed = String(fullName).trim();
  if (!trimmed) {
    return { lastName: '', firstName: '', middleName: '' };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { lastName: parts[0], firstName: '', middleName: '' };
  }

  return {
    lastName: parts[parts.length - 1],
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' ')
  };
};

export const formatTicketDateForInput = (value) => {
  if (!value) {
    return '';
  }

  const stringValue = String(value);
  return stringValue.includes('T') ? stringValue.slice(0, 10) : stringValue;
};

export const hasValue = (value) => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
};

export const pickFirstValue = (...values) => values.find((value) => hasValue(value));

export const pickNumericId = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    const text = String(value).trim();
    if (/^\d+$/.test(text)) {
      return text;
    }
  }
  return '';
};

export const getProjectDetails = (ticket) => ticket?.project_details || ticket?.projectDetails || {};

export const getProjectDetail = (ticket, ...keys) => {
  const projectDetails = getProjectDetails(ticket);
  return pickFirstValue(...keys.map((key) => projectDetails?.[key]));
};

export const getTicketClientName = (ticket) =>
  ticket?.clientFullname || ticket?.client || '';

export const getTicketContactNumber = (ticket) =>
  ticket?.request_details?.client_phone ||
  ticket?.request_details?.contact_number ||
  '';

export const getTicketAddress = (ticket) =>
  ticket?.locationDesc || ticket?.request_details?.client_address || '';

export const getLatestFieldServiceReport = (reports) =>
  Array.isArray(reports) && reports.length ? reports[reports.length - 1] : null;

export const getFieldServiceReportById = (reports, reportId) => {
  if (!Array.isArray(reports) || !reportId || reportId === 'latest') {
    return getLatestFieldServiceReport(reports);
  }
  return reports.find((report) => String(report?.id) === String(reportId)) || getLatestFieldServiceReport(reports);
};

export const normalizeQuotationRecords = (data) => {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.results)) {
    return data.results;
  }
  return data ? [data] : [];
};

export const mapStoredRows = (rows, factory) =>
  Array.isArray(rows) && rows.length
    ? rows.map((row, index) => factory(row, index))
    : null;

export const normalizePurposeOfGoingSolar = (value) => {
  if (!value) {
    return { matchedLabels: new Set(), otherText: '' };
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return {
      matchedLabels: normalized ? new Set([normalized]) : new Set(),
      otherText: ''
    };
  }

  if (Array.isArray(value)) {
    const matchedLabels = new Set();
    let otherText = '';

    value.forEach((item) => {
      if (typeof item === 'string') {
        const normalized = item.trim().toLowerCase();
        if (normalized) {
          matchedLabels.add(normalized);
        }
        return;
      }

      if (item && typeof item === 'object') {
        const label = String(item.label || item.name || '').trim();
        const rawMark = item.mark ?? item.value ?? item.checked ?? '';
        const mark = String(rawMark).trim().toLowerCase();
        const isChecked = ['x', 'check', 'checked', 'true', '1', 'yes'].includes(mark);

        if (label && isChecked) {
          matchedLabels.add(label.toLowerCase());
        }

        if (!otherText && label.toLowerCase().includes('others')) {
          const candidate = String(item.other_text || item.otherText || '').trim();
          if (candidate) {
            otherText = candidate;
          }
        }
      }
    });

    return { matchedLabels, otherText };
  }

  return { matchedLabels: new Set(), otherText: '' };
};

export const formatPaymentSchedule = (form) => {
  const entries = [
    hasValue(form?.upfrontPayment) ? `Upfront: ${form.upfrontPayment}` : '',
    hasValue(form?.completionPayment) ? `Completion: ${form.completionPayment}` : '',
    hasValue(form?.finalPayment) ? `Final: ${form.finalPayment}` : '',
  ].filter(Boolean);
  return entries.join('\n');
};

export const findRowByLabel = (rows, label) =>
  Array.isArray(rows)
    ? rows.find((row) => String(row?.label || '').trim().toLowerCase() === label.trim().toLowerCase())
    : null;

export const compactProjectDetails = (details) =>
  Object.fromEntries(
    Object.entries(details).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (value && typeof value === 'object') {
        return Object.keys(value).length > 0;
      }
      return hasValue(value);
    })
  );
