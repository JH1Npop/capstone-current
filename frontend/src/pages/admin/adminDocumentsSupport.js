import {
  createFieldServiceReportDraft,
  createFieldServiceReportRow,
  createFieldServiceReportRows,
} from '../../documents/fieldServiceReportSchema';
import {
  createTechnicalDataSheetDraft,
  createTdsLoadRows as createSchemaTdsLoadRows,
  createTdsPurposeRows as createSchemaTdsPurposeRows,
} from '../../documents/technicalDataSheetSchema';

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

export const createRows = createFieldServiceReportRows;

export const createEmptyRow = createFieldServiceReportRow;

export const createInitialForm = createFieldServiceReportDraft;

export const createTdsLoadRows = createSchemaTdsLoadRows;

export const createTdsPurposeRows = createSchemaTdsPurposeRows;

export const createInitialTdsForm = createTechnicalDataSheetDraft;

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
