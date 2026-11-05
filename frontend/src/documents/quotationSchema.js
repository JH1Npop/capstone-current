import {
  addDocumentRow,
  removeDocumentRow,
  schemaAction,
  schemaField,
  stampDocumentDraft,
  updateDocumentField,
  updateDocumentRow,
} from './documentSchemaHelpers.js';

const SCHEMA_CODE = 'quotation_proposal';
const SCHEMA_VERSION = 1;

export const createQuotationPriceRows = () => ([
  { id: 'quote-price-1', description: 'SUPPLY, INSTALLATION AND COMMISSIONING OF SOLAR PV SYSTEM', unit: '1 lot', totalPrice: '' },
]);

// Product, brand and equipment rows start empty: staff choose them per quotation. Only AFN's own standard
// workmanship warranty (not a product choice) is pre-filled.
export const createQuotationBrandRows = () => ([
  { id: 'quote-brand-1', label: '', value: '' },
]);

export const createQuotationBomRows = () => ([
  { id: 'quote-bom-1', itemNo: '1', description: '', unit: '', qty: '', unitPrice: '', amount: '' },
]);

export const createQuotationWarrantyRows = () => ([
  { id: 'quote-warranty-1', item: '', brand: '', period: '' },
  { id: 'quote-warranty-2', item: 'PV System Workmanship', brand: 'AFN Solar Power Engineering Services', period: '1 Year semi-annual O&M after project acceptance' },
]);

const collection = (key, label, columns) => Object.freeze({
  key, label, type: 'repeating_table', minimumRows: 1, columns: Object.freeze(columns),
});

export const QUOTATION_SCHEMA = Object.freeze({
  code: SCHEMA_CODE,
  version: SCHEMA_VERSION,
  name: 'Quotation / Proposal',
  dataOwnership: Object.freeze({
    workflowRecord: 'QuotationRecord',
    printableDraft: 'GeneratedDocument.data_json',
    rule: 'QuotationRecord owns the official total, bill of materials, deposit snapshot, response state, and dispatch gate. The printable draft owns presentation text and tables; templates and manual draft fields cannot override server-calculated commercial state.',
  }),
  fields: Object.freeze([
    schemaField('quotationNumber', 'Quotation Number', 'text', 'quotation.quotation_number', { manualEdit: false }),
    schemaField('quotationDate', 'Quotation Date', 'date', 'ticket.scheduled_date'),
    schemaField('attention', 'Attention', 'text', 'client.full_name'),
    schemaField('subject', 'Subject', 'text', 'ticket.service_type'),
    schemaField('location', 'Location', 'multiline', 'service_location.address'),
    schemaField('projectDescription', 'Project Description', 'multiline', 'ticket.service_type'),
    schemaField('validity', 'Validity', 'multiline', 'quotation.validity_days'),
    schemaField('deliveryTimeline', 'Delivery Timeline', 'multiline', 'quotation.delivery_timeline'),
    schemaField('paymentOrder', 'Purchase Order', 'multiline', 'quotation.payment_order'),
    schemaField('paymentTerms', 'Payment Terms', 'multiline', 'quotation.payment_terms'),
    schemaField('forceMajeure', 'Force Majeure', 'multiline', 'quotation.force_majeure'),
    schemaField('cancellationTerms', 'Cancellation Terms', 'multiline', 'quotation.cancellation_terms'),
    schemaField('inclusions', 'Inclusions', 'multiline', 'quotation.inclusions'),
    schemaField('exclusions', 'Exclusions', 'multiline', 'quotation.exclusions'),
    schemaField('warrantyNotes', 'Warranty Notes', 'multiline', 'quotation.warranty_notes'),
    schemaField('preparedBy', 'Prepared By', 'text', 'company.authorized_person'),
    schemaField('preparedTitle', 'Prepared Title', 'text', 'company.authorized_title'),
  ]),
  collections: Object.freeze({
    brandRows: collection('brandRows', 'System Brands', [
      schemaField('label', 'Item', 'text', 'quotation.brand_rows'),
      schemaField('value', 'Brand', 'text', 'quotation.brand_rows'),
    ]),
    priceRows: collection('priceRows', 'Price', [
      schemaField('description', 'Description', 'multiline', 'quotation.price_rows'),
      schemaField('unit', 'Unit', 'text', 'quotation.price_rows'),
      schemaField('totalPrice', 'Total Price', 'currency', 'quotation.total_amount', { required: true }),
    ]),
    bomRows: collection('bomRows', 'Bill of Materials', [
      schemaField('itemNo', 'Item No.', 'text', 'quotation.bill_of_materials'),
      schemaField('description', 'Description', 'text', 'inventory.item'),
      schemaField('unit', 'Unit', 'text', 'inventory.unit'),
      schemaField('qty', 'Qty', 'number', 'quotation.bill_of_materials'),
      schemaField('unitPrice', 'Unit Price', 'currency', 'inventory.unit_price'),
      schemaField('amount', 'Total Amount', 'currency', 'quotation.calculated_line_total', { manualEdit: false }),
    ]),
    warrantyRows: collection('warrantyRows', 'Warranty Terms', [
      schemaField('item', 'Item', 'text', 'quotation.warranty_rows'),
      schemaField('brand', 'Brand', 'text', 'quotation.warranty_rows'),
      schemaField('period', 'Warranty Period', 'multiline', 'quotation.warranty_rows'),
    ]),
  }),
  statuses: Object.freeze(['Draft', 'Sent', 'Accepted', 'Rejected']),
  actions: Object.freeze([
    schemaAction('save_draft', 'Save draft', 'generated_document'),
    schemaAction('send', 'Send quotation to client', 'quotation'),
    schemaAction('respond', 'Accept or decline', 'quotation.respond'),
    schemaAction('record_deposit', 'Record deposit payment', 'quotation.deposit_payments'),
    schemaAction('print', 'Print', 'browser'),
    schemaAction('generate', 'Generate file', 'document_generation'),
  ]),
});

export const createQuotationDraft = () => ({
  quotationNumber: '', quotationDate: '', attention: '', subject: '', location: '', projectDescription: '',
  validity: 'Within Thirty (30) days from the date of issue, thereafter subject for price and delivery confirmation.',
  deliveryTimeline: 'Three (3) to seven days (7) upon confirmation of orders.',
  paymentOrder: 'Purchase Order: To be addressed to AFN Solar Power Engineering Services.',
  paymentTerms: 'Terms of Payment: 50% down payment\n50% after commissioning (payable in 3 mos. with PDC)',
  forceMajeure: 'This offer is subject to reservation for force majeure namely, earthquake, typhoon, lightning surge, power surge, use of excessive force, burnt circuitry or other circumstances beyond our control which may prevent or injure its performance. In this case, warranty will be void.',
  cancellationTerms: '30% of PO value if cancellation is made 3 days after receipt of PO.\n80% of PO value if cancellation is made between 7 days to 4 days before mobilization.\n100% of PO value if cancellation is made between 3 days to 1 day before mobilization.',
  inclusions: '• Management & Supervision\n• Plant, equipment and tools\n• Mobilization\n• Site Operating Expenses\n• One (1) year semi-annual O&M (Cleaning of solar panels)',
  exclusions: '• Replacement and repair of any electrical devices and other materials to be found defective during installation (breakers, cables, fuse, roofs)\n• Structural reinforcement\n• Civil works such as construction of Solar Panels concrete foundation, clearing, backfilling and other\n• LGU permits or any government permits\n• Net Metering application\n• Any items not mentioned in this proposal are excluded.',
  warrantyNotes: 'All materials and works are guaranteed to be free from defects and/or faulty workmanship, however faults caused by any of the following are not covered by this warranty:\n\n1. Unauthorized operation, revision or tampering.\n2. Unauthorized servicing, cleaning and other repair or maintenance works.\n3. Improper operation, negligence and abuse.\n4. Force majeure.',
  preparedBy: 'C/ENGR. ARVIN F. NAPENAS', preparedTitle: 'General Manager',
  brandRows: createQuotationBrandRows(), priceRows: createQuotationPriceRows(), bomRows: createQuotationBomRows(), warrantyRows: createQuotationWarrantyRows(),
});

const normalizeRows = (rows, defaults, prefix) => {
  const supplied = Array.isArray(rows) && rows.length ? rows : defaults();
  return supplied.map((row, index) => ({ id: row?.id || `${prefix}-${index + 1}`, ...(row || {}) }));
};

export const adaptQuotationDraft = (data) => {
  const input = data && typeof data === 'object' ? data : {};
  return {
    ...createQuotationDraft(),
    ...input,
    brandRows: normalizeRows(input.brandRows, createQuotationBrandRows, 'quote-brand'),
    priceRows: normalizeRows(input.priceRows, createQuotationPriceRows, 'quote-price'),
    bomRows: normalizeRows(input.bomRows, createQuotationBomRows, 'quote-bom'),
    warrantyRows: normalizeRows(input.warrantyRows, createQuotationWarrantyRows, 'quote-warranty'),
  };
};

export const serializeQuotationDraft = (data) => stampDocumentDraft(QUOTATION_SCHEMA, adaptQuotationDraft(data));

export const buildQuotationRecord = (data, ticketId, clientId, status = 'Sent') => {
  const draft = adaptQuotationDraft(data);
  return {
    ticket: Number(ticketId),
    client: Number(clientId),
    total_amount: draft.priceRows?.[0]?.totalPrice || '',
    payment_terms: draft.paymentTerms,
    bill_of_materials: draft.bomRows,
    status,
  };
};

export const createQuotationRow = (type, index = 0) => {
  const suffix = `${Date.now()}-${index}`;
  if (type === 'brand') return { id: `quote-brand-${suffix}`, label: '', value: '' };
  if (type === 'price') return { id: `quote-price-${suffix}`, description: '', unit: '', totalPrice: '' };
  if (type === 'bom') return { id: `quote-bom-${suffix}`, itemNo: String(index || ''), description: '', unit: '', qty: '', unitPrice: '', amount: '' };
  return { id: `quote-warranty-${suffix}`, item: '', brand: '', period: '' };
};

export const updateQuotationField = updateDocumentField;
export const updateQuotationRow = updateDocumentRow;
export const addQuotationRow = (draft, collectionKey, row) => addDocumentRow(draft, collectionKey, row);
export const removeQuotationRow = (draft, collectionKey, rowId) => removeDocumentRow(draft, collectionKey, rowId, 1);
