import { FIELD_SERVICE_REPORT_SCHEMA } from './fieldServiceReportSchema.js';
import { INSTALLATION_CONTRACT_SCHEMA } from './installationContractSchema.js';
import { QUOTATION_SCHEMA } from './quotationSchema.js';
import { SOLAR_COMMISSIONING_SCHEMA } from './solarCommissioningSchema.js';
import { TECHNICAL_DATA_SHEET_SCHEMA } from './technicalDataSheetSchema.js';
import { TURNOVER_ACCEPTANCE_SCHEMA } from './turnoverAcceptanceSchema.js';

const CORE_SCHEMAS = Object.freeze([
  FIELD_SERVICE_REPORT_SCHEMA,
  QUOTATION_SCHEMA,
  INSTALLATION_CONTRACT_SCHEMA,
  SOLAR_COMMISSIONING_SCHEMA,
  TECHNICAL_DATA_SHEET_SCHEMA,
  TURNOVER_ACCEPTANCE_SCHEMA,
]);

const CORE_SCHEMA_BY_CODE = Object.freeze(Object.fromEntries(
  CORE_SCHEMAS.map((schema) => [schema.code, schema]),
));

export const getCoreDocumentSchema = (code) => CORE_SCHEMA_BY_CODE[code] || null;
export const isCoreDocumentCode = (code) => Boolean(getCoreDocumentSchema(code));

export const summarizeCoreDocumentSchema = (code) => {
  const schema = getCoreDocumentSchema(code);
  if (!schema) return null;
  const collections = Object.values(schema.collections || {});
  return {
    code: schema.code,
    name: schema.name,
    description: schema.description || schema.dataOwnership?.rule || '',
    fieldCount: (schema.fields || []).length,
    collectionCount: collections.length,
    collectionLabels: collections.map((collection) => collection.label),
    actionLabels: (schema.actions || []).map((action) => action.label),
  };
};

export const CORE_DOCUMENT_CODES = Object.freeze(CORE_SCHEMAS.map((schema) => schema.code));
