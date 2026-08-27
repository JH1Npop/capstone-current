import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FiFileText, FiPlus, FiPrinter, FiRefreshCw, FiSave, FiTrash2, FiSearch, FiChevronDown, FiX } from 'react-icons/fi';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { DOCUMENTS_MANAGE_CAPABILITIES, hasAnyCapability } from '../../rbac';
import {
  fetchDocumentDraft,
  fetchDocumentPrefill,
  searchServiceTickets,
  fetchSolarCommissioningChecklist,
  saveDocumentDraft,
  saveSolarCommissioningChecklist,
  updateProjectDetails,
  fetchInstalledEquipment,
  registerInstalledEquipment,
  fetchQuotationRecord,
  saveQuotationRecord,
  saveTurnoverAcceptance,
  finalizeTurnoverAcceptance,
  saveTechnicalDataSheet,
  saveInstallationContract
} from '../../api/services';
import { fetchInventory } from '../../api/admin';
import {
  PAPER_SIZE_OPTIONS,
  TEMPLATE_OPTIONS,
  compactProjectDetails,
  createEmptyRow,
  createInitialForm,
  createInitialTdsForm,
  findRowByLabel,
  formatPaymentSchedule,
  getFieldServiceReportById,
  getLatestFieldServiceReport,
  getProjectDetail,
  hasValue,
  normalizeQuotationRecords,
} from './adminDocumentsSupport';
import {
  buildCommissioningFormFromTicket,
  buildFormFromTicket,
  buildInstallationContractFormFromTicket,
  buildQuotationFormFromTicket,
  buildTdsFormFromTicket,
  buildTicketContextFromPrefill,
  buildTurnoverFormFromTicket,
  createInitialCommissioningForm,
  createInitialInstallationContractForm,
  createInitialQuotationForm,
  createInitialTurnoverForm,
  createQuotationRow,
  createTurnoverRow,
  hydrateFieldServiceReportForm,
  hydrateInstallationContractForm,
  hydrateQuotationForm,
  hydrateTdsForm,
  hydrateTurnoverForm
} from './adminDocumentsBuilders';

const getPaperConfig = (paperSize) =>
  PAPER_SIZE_OPTIONS.find((option) => option.value === paperSize) || PAPER_SIZE_OPTIONS[0];

const buildPrintCss = (paperSize) => {
  const paper = getPaperConfig(paperSize);
  const documentPadding = '24px 18px 26px';
  return `
    @page {
      size: ${paper.cssSize};
      margin: 12mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background: #fff;
      color: #111;
      font-family: Arial, sans-serif;
      font-size: 12px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      --document-padding: ${documentPadding};
    }
    :root {
      --doc-input-border: rgba(15, 23, 42, 0.18);
      --doc-input-border-strong: rgba(37, 99, 235, 0.42);
      --doc-input-bg: rgba(248, 250, 252, 0.96);
      --doc-input-bg-focus: rgba(239, 246, 255, 0.98);
      --doc-input-shadow: 0 1px 1px rgba(15, 23, 42, 0.04);
      --doc-input-radius: 7px;
    }
    .document-paper {
      position: relative;
      width: 100%;
      max-width: none;
      margin: 0 auto;
      padding: 24px 18px 50px;
      background: #fff;
      display: flex;
      flex-direction: column;
      min-height: calc(${paper.pageHeight} - 24mm);
    }
    .afn-header {
      display: grid;
      grid-template-columns: 110px 1fr 110px;
      align-items: center;
      border-bottom: 1.5px solid #0057c2;
      padding-bottom: 10px;
      margin-bottom: 22px;
    }
    .afn-logo {
      width: 76px;
      height: 76px;
      object-fit: contain;
      display: block;
      margin-left: 8px;
    }
    .afn-company { text-align: center; }
    .afn-company-name {
      margin: 0 0 3px;
      color: #0057c2;
      font-size: 17px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .afn-company-meta {
      margin: 0;
      color: #333;
      font-size: 10px;
      line-height: 1.35;
    }
    .fsr-title {
      margin: 0 0 24px;
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      text-decoration: underline;
    }
    .fsr-info {
      display: grid;
      grid-template-columns: 1fr 170px;
      gap: 18px;
      margin-bottom: 22px;
    }
    .fsr-info p { margin: 0 0 3px; }
    .section-label {
      margin: 0 0 3px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #aaa;
      padding: 5px 7px;
      vertical-align: top;
      color: #111;
    }
    th {
      font-size: 10px;
      font-weight: 700;
      text-align: left;
      line-height: 1.25;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    td { font-size: 11px; }
    .table-cell-input {
      width: 100%;
      border: 1px solid rgba(148, 163, 184, 0.9);
      border-radius: 6px;
      padding: 2px 8px;
      background: #fff;
      box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.04);
      color: #111;
      font: inherit;
      line-height: 1.25;
      outline: none;
      resize: none;
      overflow: hidden;
      min-height: 26px;
      transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }
    .table-cell-input::placeholder {
      color: #94a3b8;
    }
    .table-cell-input:hover {
      border-color: rgba(100, 116, 139, 0.9);
    }
    .table-cell-input:focus {
      border-color: var(--doc-input-border-strong);
      background: #fff;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
    }
    textarea.table-cell-input,
    textarea.commissioning-inline-input,
    textarea.turnover-line-input {
      resize: none;
      overflow: hidden;
    }
    .print-value {
      display: block;
      width: 100%;
      min-height: 18px;
      line-height: 1.25;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .signatures { margin-top: 28px; }
    .table-actions-header,
    .table-actions-cell {
      width: 44px;
      text-align: center;
      vertical-align: middle;
    }
    .table-row-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: 0;
      background: transparent;
      color: #64748b;
      cursor: pointer;
    }
    .table-row-action:hover {
      color: #dc2626;
    }
    .signature-line {
      margin-top: 20px;
      font-weight: 700;
    }
    .line {
      display: inline-block;
      width: 190px;
      border-bottom: 1px solid #111;
      transform: translateY(-2px);
    }
    .simple-placeholder {
      min-height: 560px;
      border: 1px solid #aaa;
      padding: 18px;
      line-height: 1.6;
    }
    .commissioning-title {
      margin: 0 0 18px;
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .commissioning-meta {
      margin-bottom: 18px;
    }
    .commissioning-meta th,
    .commissioning-meta td,
    .commissioning-checklist th,
    .commissioning-checklist td,
    .commissioning-readings th,
    .commissioning-readings td {
      font-size: 10px;
    }
    .commissioning-checklist thead th {
      background: #2f75b5;
      color: #fff;
      font-weight: 700;
    }
    .commissioning-section-row td {
      background: #d9d9d9;
      font-weight: 700;
      text-transform: uppercase;
    }
    .commissioning-section-label {
      display: block;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #355f92;
      margin-bottom: 4px;
    }
    .commissioning-inline-input,
    .commissioning-inline-select {
      width: 100%;
      border: 1px solid rgba(148, 163, 184, 0.9);
      border-radius: 6px;
      background: #fff;
      box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.04);
      color: #111;
      font: inherit;
      outline: none;
      padding: 2px 8px;
      min-height: 26px;
      transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }
    .commissioning-inline-select {
      appearance: none;
      padding-right: 24px;
    }
    .commissioning-inline-input:hover,
    .commissioning-inline-select:hover {
      border-color: rgba(100, 116, 139, 0.9);
    }
    .commissioning-inline-input:focus,
    .commissioning-inline-select:focus {
      border-color: var(--doc-input-border-strong);
      background: #fff;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
    }
    .quotation-title {
      margin: 0 0 14px;
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      text-decoration: underline;
      text-transform: uppercase;
    }
    .contract-title {
      margin: 10px 0 20px;
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .contract-body,
    .contract-section p,
    .contract-signatures p {
      margin: 0 0 5px;
      font-size: 10.5px;
      line-height: 1.38;
      overflow-wrap: anywhere;
    }
    .contract-section-title {
      margin: 16px 0 7px;
      font-size: 11px;
      font-weight: 700;
    }
    .contract-line-input {
      display: inline-block;
      border: 1px solid rgba(148, 163, 184, 0.9);
      border-radius: 6px;
      background: #fff;
      box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.04);
      color: #111;
      font: inherit;
      outline: none;
      padding: 2px 8px;
      max-width: 100%;
      min-width: 0;
      vertical-align: bottom;
      min-height: 28px;
      transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }
    .contract-line-input:hover {
      border-color: rgba(100, 116, 139, 0.9);
    }
    .contract-line-input:focus {
      border-color: var(--doc-input-border-strong);
      background: #fff;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
    }
    .contract-line-input.short {
      width: min(110px, 100%);
    }
    .contract-line-input.medium {
      width: min(190px, 100%);
    }
    .contract-line-input.long {
      width: min(260px, 100%);
    }
    .contract-line-input.full {
      width: min(360px, 100%);
    }
    .contract-signatures {
      margin-top: 26px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 44px;
    }
    .contract-signature-party {
      margin-bottom: 10px;
      min-height: 20px;
    }
    .contract-signature-label {
      display: inline-block;
      min-width: 34px;
    }
    .contract-signature-line {
      display: inline-block;
      width: 170px;
      border-bottom: 1px solid #111;
      min-height: 16px;
      vertical-align: bottom;
    }
    .contract-signature-line.short {
      width: 120px;
    }
    .contract-signature-line.medium {
      width: 150px;
    }
    .contract-signature-fill {
      width: 100%;
      border: 1px solid rgba(148, 163, 184, 0.9);
      border-radius: 4px;
      background: #fff;
      box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.04);
      padding: 1px 6px;
      min-height: 24px;
    }
    .contract-signature-fill:focus {
      background: #fff;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
    }
    .contract-witness {
      margin-top: 14px;
    }
    .tds-title {
      margin: 8px 0 10px;
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      text-decoration: underline;
      text-transform: uppercase;
    }
    .tds-copy {
      margin: 0 0 5px;
      font-size: 10px;
      line-height: 1.28;
    }
    .tds-section-title {
      margin: 14px 0 4px;
      font-size: 11px;
      font-weight: 700;
      text-decoration: underline;
      text-transform: uppercase;
    }
    .tds-row,
    .tds-question,
    .tds-confirmation p {
      margin: 0 0 4px;
      font-size: 10px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .tds-question {
      margin-top: 3px;
    }
    .tds-line-input {
      display: inline-block;
      border: 1px solid rgba(148, 163, 184, 0.9);
      border-radius: 6px;
      background: #fff;
      box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.04);
      color: #111;
      font: inherit;
      outline: none;
      padding: 2px 8px;
      max-width: 100%;
      min-width: 0;
      vertical-align: bottom;
      min-height: 26px;
      transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }
    .tds-line-input:hover {
      border-color: rgba(100, 116, 139, 0.9);
    }
    .tds-line-input:focus {
      border-color: var(--doc-input-border-strong);
      background: #fff;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
    }
    .tds-line-input.short {
      width: min(80px, 100%);
    }
    .tds-line-input.medium {
      width: min(145px, 100%);
    }
    .tds-line-input.long {
      width: min(190px, 100%);
    }
    .tds-line-input.full {
      width: min(320px, 100%);
    }
    .tds-check-line {
      width: 30px;
      text-align: center;
    }
    .tds-load-table th,
    .tds-load-table td {
      font-size: 10px;
    }
    .tds-load-table thead th {
      background: #2f75b5;
      color: #fff;
      text-align: center;
      font-weight: 700;
    }
    .tds-generator-headings {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 12px;
      margin: 10px 0 4px;
      font-size: 9px;
      font-weight: 700;
      text-align: center;
    }
    .tds-generator-values {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 6px;
    }
    .tds-purpose-line {
      display: inline-block;
      width: 26px;
      border-bottom: 1px solid #111;
      margin-right: 8px;
      vertical-align: middle;
    }
    .tds-confirmation-signoff {
      display: grid;
      grid-template-columns: 1fr 200px;
      gap: 12px;
      align-items: end;
      margin-top: 42px;
    }
    .tds-signoff-line {
      border-top: 1px solid #111;
      padding-top: 4px;
      min-height: 22px;
    }
    .tds-signoff-label {
      font-size: 9px;
      font-weight: 700;
    }
    .tds-indent {
      padding-left: 16px;
    }
    .quotation-meta {
      margin-bottom: 18px;
      width: 100%;
      table-layout: fixed;
    }
    .quotation-meta td {
      border: 0;
      padding: 2px 0;
      font-size: 11px;
      vertical-align: top;
    }
    .quotation-label-cell {
      width: 115px;
      font-weight: 700;
      white-space: nowrap;
    }
    .quotation-colon-cell {
      width: 10px;
      text-align: left;
      font-weight: 700;
      white-space: nowrap;
    }
    .quotation-value-cell {
      width: auto;
      padding-left: 6px;
    }
    .quotation-section-title {
      margin: 18px 0 6px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .quotation-subtitle {
      margin: 10px 0 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .quotation-body-text {
      margin: 0 0 4px;
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .document-prose-input {
      display: block;
      width: 100%;
      min-height: 30px;
      margin: 0 0 8px;
      border: 0;
      border-bottom: 1px dashed transparent;
      border-radius: 0;
      padding: 2px 0;
      background: transparent;
      color: #111;
      font: inherit;
      font-size: 11px;
      line-height: 1.55;
      text-align: justify;
      white-space: pre-wrap;
      resize: none;
      overflow: hidden;
      outline: none;
    }
    .document-prose-input:hover { border-bottom-color: #cbd5e1; }
    .document-prose-input:focus {
      border-bottom-color: var(--doc-input-border-strong);
      background: rgba(239, 246, 255, 0.55);
    }
    .quotation-body-list {
      margin: 0;
      padding-left: 18px;
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .turnover-title {
      margin: 8px 0 14px;
      text-align: center;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .turnover-intro p,
    .turnover-confirmation p,
    .turnover-signature-block p {
      margin: 0 0 4px;
      font-size: 10px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .turnover-line-input {
      display: inline-block;
      border: 1px solid rgba(148, 163, 184, 0.9);
      border-radius: 6px;
      background: #fff;
      box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.04);
      font: inherit;
      color: #111;
      outline: none;
      padding: 2px 8px;
      max-width: 100%;
      min-width: 0;
      vertical-align: bottom;
      min-height: 26px;
      transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }
    .turnover-line-input:hover {
      border-color: rgba(100, 116, 139, 0.9);
    }
    .turnover-line-input:focus {
      border-color: var(--doc-input-border-strong);
      background: #fff;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
    }
    .turnover-line-input.full {
      width: min(300px, 100%);
    }
    .turnover-line-input.medium {
      width: min(190px, 100%);
    }
    .turnover-line-input.short {
      width: min(110px, 100%);
    }
    .turnover-table th,
    .turnover-table td {
      font-size: 9.5px;
    }
    .turnover-table thead th,
    .turnover-table .turnover-head-row th {
      background: #f3f4f6;
      color: #111;
      font-weight: 700;
    }
    .turnover-section-title {
      margin: 18px 0 8px;
      font-size: 11px;
      font-weight: 700;
    }
    .turnover-signature-grid {
      margin-top: 18px;
      display: grid;
      gap: 22px;
      grid-template-columns: 1fr;
    }
    .turnover-signature-line {
      display: inline-block;
      width: 130px;
      border-bottom: 1px solid #111;
      vertical-align: bottom;
    }
    .turnover-signature-line.long {
      width: 180px;
    }
    .turnover-signature-fill {
      width: 100%;
      border: 1px solid rgba(148, 163, 184, 0.9);
      border-radius: 4px;
      background: #fff;
      box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.04);
      padding: 1px 6px;
      min-height: 24px;
    }
    .turnover-signature-fill:focus {
      background: #fff;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
    }
    .quotation-brand-table td,
    .quotation-brand-table th,
    .quotation-main-table td,
    .quotation-main-table th,
    .quotation-warranty-table td,
    .quotation-warranty-table th {
      font-size: 10px;
    }
    .quotation-table-head th {
      background: #2f75b5;
      color: #fff;
      font-weight: 700;
      text-align: center;
    }
    .quotation-prepared {
      margin-top: 28px;
      font-size: 11px;
      line-height: 1.45;
    }
    .document-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      background: #2f75b5;
      color: #fff;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 18px;
      font-size: 10px;
      font-weight: 700;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .turnover-final-page {
      margin-top: 18px;
    }
    thead { display: table-header-group; }
    tr, .signatures { break-inside: avoid; page-break-inside: avoid; }
    .document-paper {
      box-shadow: 0 16px 44px rgba(15, 23, 42, 0.10);
    }
    @media print {
      html, body {
        background: #fff;
        padding: 0;
        min-height: 100%;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .table-cell-input,
      .commissioning-inline-input,
      .commissioning-inline-select,
      .contract-line-input,
      .tds-line-input,
      .turnover-line-input {
        box-shadow: none;
      }
      .table-actions-header,
      .table-actions-cell {
        display: none;
      }
      .commissioning-checklist thead th {
        background: #2f75b5 !important;
        color: #fff !important;
      }
      .commissioning-section-row td {
        background: #d9d9d9 !important;
      }
      .quotation-table-head th {
        background: #2f75b5 !important;
        color: #fff !important;
      }
      .tds-load-table thead th {
        background: #2f75b5 !important;
        color: #fff !important;
      }
      .turnover-table thead th,
      .turnover-table .turnover-head-row th {
        background: #d9d9d9 !important;
      }
      .contract-signatures {
        grid-template-columns: 1fr 1fr;
      }
      .document-paper {
        position: relative;
        width: 100%;
        max-width: none;
        margin: 0;
        padding: 24px 18px 50px;
        box-shadow: none;
        border: 0;
        min-height: calc(${paper.pageHeight} - 24mm);
      }
      .document-footer {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .turnover-final-page {
        min-height: calc(${paper.pageHeight} - 24mm);
        display: flex;
        flex-direction: column;
        break-inside: avoid;
        page-break-inside: avoid;
        position: relative;
      }
      .turnover-final-page .document-footer {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
      }
    }
  `;
};

function Header() {
  return (
    <header className="afn-header">
      <img className="afn-logo" src="/logo.png" alt="AFN logo" />
      <div className="afn-company">
        <p className="afn-company-name">AFN Solar Power Engineering Services</p>
        <p className="afn-company-meta">
          Lot2a9, Brgy. Bigo, Pagbilao, Quezon
          <br />
          09171460224 / (042)9111107 | afnsunenergyserv@gmail.com
        </p>
      </div>
      <div />
    </header>
  );
}

function Footer() {
  return (
    <div className="document-footer">
      <span>AFN Solar Power Engineering Services</span>
      <span>Email: afn.sunenergy@gmail.com</span>
    </div>
  );
}

function resizeTextareaField(field) {
  if (!field) {
    return;
  }

  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

function AutoGrowTextarea({ value, onChange, className, rows = 1, style, placeholder = '', guidePrint = '' }) {
  const fieldRef = useRef(null);

  useEffect(() => {
    resizeTextareaField(fieldRef.current);
  }, [value]);

  return (
    <textarea
      ref={fieldRef}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onInput={(event) => resizeTextareaField(event.target)}
      onFocus={(event) => resizeTextareaField(event.target)}
      className={className}
      style={style}
      placeholder={placeholder}
      data-guide-print={guidePrint || placeholder}
    />
  );
}

function TableCellInput({ value, onChange }) {
  return (
    <AutoGrowTextarea
      rows={1}
      value={value}
      onChange={onChange}
      className="table-cell-input"
    />
  );
}

function FieldServiceReport({ form, onUpdateRow, onAddRow, onRemoveRow }) {
  return (
    <main className="document-paper">
      <Header />
      <h1 className="fsr-title">----------&nbsp; Field Service Report &nbsp;----------</h1>
      <section className="fsr-info grid grid-cols-2 gap-4">
        <div>
          <p>Client: {form.clientName}</p>
          <p>Address: {form.address}</p>
          <p>Contact Number: {form.contactNumber}</p>
        </div>
        <div className="text-right">
          <p>Date: {form.documentDate}</p>
          <p>Technician: {form.technician}</p>
          <p>Ticket No: {form.ticketNumber}</p>
          <p>Service Type: {form.serviceType}</p>
          {form.reference && <p>Reference: {form.reference}</p>}
        </div>
      </section>
      <p className="section-label">Before Service:</p>
      <table>
        <colgroup>
          <col style={{ width: '16%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Brand / Model</th>
            <th>TR/HP</th>
            <th>Serial #</th>
            <th>Indoor temp</th>
            <th>Outdoor temp</th>
            <th>Ampere</th>
            <th>Others specify</th>
            <th>Recommendation</th>
            <th className="table-actions-header">
              <button
                type="button"
                onClick={onAddRow}
                className="table-row-action"
                aria-label="Add row"
                title="Add row"
              >
                <FiPlus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {form.rows.map((row) => (
            <tr key={row.id}>
              <td>
                <TableCellInput
                  value={row.brandModel}
                  onChange={(value) => onUpdateRow(row.id, 'brandModel', value)}
                />
              </td>
              <td>
                <TableCellInput
                  value={row.trHp}
                  onChange={(value) => onUpdateRow(row.id, 'trHp', value)}
                />
              </td>
              <td>
                <TableCellInput
                  value={row.serialNumber}
                  onChange={(value) => onUpdateRow(row.id, 'serialNumber', value)}
                />
              </td>
              <td>
                <TableCellInput
                  value={row.indoorTemp}
                  onChange={(value) => onUpdateRow(row.id, 'indoorTemp', value)}
                />
              </td>
              <td>
                <TableCellInput
                  value={row.outdoorTemp}
                  onChange={(value) => onUpdateRow(row.id, 'outdoorTemp', value)}
                />
              </td>
              <td>
                <TableCellInput
                  value={row.ampere}
                  onChange={(value) => onUpdateRow(row.id, 'ampere', value)}
                />
              </td>
              <td>
                <TableCellInput
                  value={row.others}
                  onChange={(value) => onUpdateRow(row.id, 'others', value)}
                />
              </td>
              <td>
                <TableCellInput
                  value={row.recommendation}
                  onChange={(value) => onUpdateRow(row.id, 'recommendation', value)}
                />
              </td>
              <td className="table-actions-cell">
                <button
                  type="button"
                  onClick={() => onRemoveRow(row.id)}
                  className="table-row-action"
                  aria-label="Remove row"
                  title="Remove row"
                >
                  <FiTrash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="signatures">
        <p className="signature-line">Signature of client: <span className="line" /></p>
        <p className="signature-line">Signature of Technician: <span className="line" /></p>
      </section>
      <Footer />
    </main>
  );
}

function SolarCommissioningChecklistPreview({
  form,
  onFieldChange,
  onChecklistItemChange,
  onReadingChange
}) {
  const renderReadingInput = (group, key) => (
    <AutoGrowTextarea
      rows={1}
      value={form.readings_json?.[group]?.[key] || ''}
      onChange={(value) => onReadingChange(group, key, value)}
      className="commissioning-inline-input"
    />
  );

  return (
    <main className="document-paper">
      <Header />
      <h1 className="commissioning-title">PV Solar Site Commissioning Checklist</h1>

      <table className="commissioning-meta">
        <tbody>
          <tr>
            <td><strong>Site Name:</strong></td>
            <td>
              <AutoGrowTextarea
                rows={1}
                value={form.site_name}
                onChange={(value) => onFieldChange('site_name', value)}
                className="commissioning-inline-input"
              />
            </td>
            <td><strong>Inverter Type:</strong></td>
            <td>
              <AutoGrowTextarea
                rows={1}
                value={form.inverter_type}
                onChange={(value) => onFieldChange('inverter_type', value)}
                className="commissioning-inline-input"
              />
            </td>
          </tr>
          <tr>
            <td><strong>System Designation:</strong></td>
            <td>
              <AutoGrowTextarea
                rows={1}
                value={form.system_designation}
                onChange={(value) => onFieldChange('system_designation', value)}
                className="commissioning-inline-input"
              />
            </td>
            <td><strong>Inverter SN:</strong></td>
            <td>
              <AutoGrowTextarea
                rows={1}
                value={form.inverter_serial_number}
                onChange={(value) => onFieldChange('inverter_serial_number', value)}
                className="commissioning-inline-input"
              />
            </td>
          </tr>
          <tr>
            <td><strong>Commissioned Date:</strong></td>
            <td>
              <input
                type="date"
                value={form.commissioned_date}
                onChange={(event) => onFieldChange('commissioned_date', event.target.value)}
                className="commissioning-inline-input"
              />
            </td>
            <td><strong>Status:</strong></td>
            <td>
              <select
                value={form.status}
                onChange={(event) => onFieldChange('status', event.target.value)}
                className="commissioning-inline-select"
              >
                <option value="draft">Draft</option>
                <option value="completed">Completed</option>
                <option value="finalized">Finalized</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="commissioning-checklist">
        <colgroup>
          <col style={{ width: '7%' }} />
          <col style={{ width: '73%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>No.</th>
            <th>Checklist Item</th>
            <th>Check</th>
          </tr>
        </thead>
        <tbody>
          {form.checklist_items_json.map((item, index) => {
            const previousSection = index > 0 ? form.checklist_items_json[index - 1].section : null;
            const showSection = item.section !== previousSection;

            return (
              <Fragment key={item.item_no}>
                {showSection ? (
                  <tr className="commissioning-section-row">
                    <td colSpan={3}>{item.section}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>{item.item_no}</td>
                  <td>{item.description}</td>
                  <td>
                    <select
                      value={item.check_status || ''}
                      onChange={(event) => onChecklistItemChange(item.item_no, 'check_status', event.target.value)}
                      className="commissioning-inline-select"
                    >
                      <option value="">Select</option>
                      <option value="Pass">Pass</option>
                      <option value="Fail">Fail</option>
                      <option value="N/A">N/A</option>
                    </select>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <table className="commissioning-readings" style={{ marginTop: '18px' }}>
        <tbody>
          <tr>
            <td><strong>Irradiance (Watt/m2):</strong></td>
            <td>
              <AutoGrowTextarea
                rows={1}
                value={form.irradiance}
                onChange={(value) => onFieldChange('irradiance', value)}
                className="commissioning-inline-input"
              />
            </td>
            <td><strong>Ambient Temp. (deg C):</strong></td>
            <td>
              <AutoGrowTextarea
                rows={1}
                value={form.ambient_temperature}
                onChange={(value) => onFieldChange('ambient_temperature', value)}
                className="commissioning-inline-input"
              />
            </td>
          </tr>
          <tr className="commissioning-section-row">
            <td colSpan={2}>Readings from the Inverter Display</td>
            <td colSpan={2}>Field Measured Readings</td>
          </tr>
          <tr>
            <td>AC Line Voltage - Phase A to Grid</td>
            <td>{renderReadingInput('inverter_display', 'phase_a_voltage')}</td>
            <td>AC Line Voltage - Phase A to Grid</td>
            <td>{renderReadingInput('field_measured', 'phase_a_voltage')}</td>
          </tr>
          <tr>
            <td>AC Line Voltage - Phase B to Grid</td>
            <td>{renderReadingInput('inverter_display', 'phase_b_voltage')}</td>
            <td>AC Line Voltage - Phase B to Grid</td>
            <td>{renderReadingInput('field_measured', 'phase_b_voltage')}</td>
          </tr>
          <tr>
            <td>AC Line Voltage - Phase C to Grid</td>
            <td>{renderReadingInput('inverter_display', 'phase_c_voltage')}</td>
            <td>AC Line Voltage - Phase C to Grid</td>
            <td>{renderReadingInput('field_measured', 'phase_c_voltage')}</td>
          </tr>
          <tr>
            <td>AC Line Current - Phase A</td>
            <td>{renderReadingInput('inverter_display', 'phase_a_current')}</td>
            <td>AC Line Current - Phase A</td>
            <td>{renderReadingInput('field_measured', 'phase_a_current')}</td>
          </tr>
          <tr>
            <td>AC Line Current - Phase B</td>
            <td>{renderReadingInput('inverter_display', 'phase_b_current')}</td>
            <td>AC Line Current - Phase B</td>
            <td>{renderReadingInput('field_measured', 'phase_b_current')}</td>
          </tr>
          <tr>
            <td>AC Line Current - Phase C</td>
            <td>{renderReadingInput('inverter_display', 'phase_c_current')}</td>
            <td>AC Line Current - Phase C</td>
            <td>{renderReadingInput('field_measured', 'phase_c_current')}</td>
          </tr>
        </tbody>
      </table>
      <Footer />
    </main>
  );
}

function QuotationProposalPreview({
  form,
  onFieldChange,
  onTableRowChange,
  onAddTableRow,
  onRemoveTableRow,
  inventoryItems
}) {
  return (
    <main className="document-paper">
      <Header />
      <h1 className="quotation-title">Quotation Proposal</h1>

      <table className="quotation-meta">
        <colgroup>
          <col style={{ width: '115px' }} />
          <col style={{ width: '14px' }} />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <td className="quotation-label-cell">Quotation No:</td>
            <td colSpan={2} className="quotation-value-cell">
              <AutoGrowTextarea
                rows={1}
                value={form.quotationNumber}
                onChange={(value) => onFieldChange('quotationNumber', value)}
                className="commissioning-inline-input"
              />
            </td>
          </tr>
          <tr>
            <td className="quotation-label-cell" />
            <td colSpan={2} className="quotation-value-cell">
              <input
                type="date"
                value={form.quotationDate}
                onChange={(event) => onFieldChange('quotationDate', event.target.value)}
                className="commissioning-inline-input"
              />
            </td>
          </tr>
          <tr>
            <td className="quotation-label-cell">Attention</td>
            <td className="quotation-colon-cell">:</td>
            <td className="quotation-value-cell">
              <AutoGrowTextarea
                rows={1}
                value={form.attention}
                onChange={(value) => onFieldChange('attention', value)}
                className="commissioning-inline-input"
              />
            </td>
          </tr>
          <tr>
            <td className="quotation-label-cell">Subject</td>
            <td className="quotation-colon-cell">:</td>
            <td className="quotation-value-cell">
              <AutoGrowTextarea
                rows={1}
                value={form.subject}
                onChange={(value) => onFieldChange('subject', value)}
                className="commissioning-inline-input"
              />
            </td>
          </tr>
          <tr>
            <td className="quotation-label-cell">Location</td>
            <td className="quotation-colon-cell">:</td>
            <td className="quotation-value-cell">
              <AutoGrowTextarea
                rows={1}
                value={form.location}
                onChange={(value) => onFieldChange('location', value)}
                className="commissioning-inline-input"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <p className="quotation-body-text">
        We are pleased to submit our proposal with the following terms and conditions for your consideration:
      </p>

      <p className="quotation-section-title">Terms and Conditions:</p>
      <p className="quotation-subtitle">Price</p>
      <p className="quotation-body-text">All prices are quoted in Philippine Peso and VAT Inclusive.</p>

      <p className="quotation-subtitle">Validity</p>
      <textarea
        rows={2}
        value={form.validity}
        onChange={(event) => onFieldChange('validity', event.target.value)}
        className="document-prose-input"
      />

      <p className="quotation-subtitle">Delivery/System Installation Completion</p>
      <textarea
        rows={2}
        value={form.deliveryTimeline}
        onChange={(event) => onFieldChange('deliveryTimeline', event.target.value)}
        className="document-prose-input"
      />

      <p className="quotation-subtitle">Brand</p>
      <table className="quotation-brand-table" style={{ marginBottom: '10px' }}>
        <colgroup>
          <col style={{ width: '24%' }} />
          <col style={{ width: '71%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <tbody>
          {form.brandRows.map((row) => (
            <tr key={row.id}>
              <td>
                <TableCellInput
                  value={row.label}
                  onChange={(value) => onTableRowChange('brandRows', row.id, 'label', value)}
                />
              </td>
              <td>
                <TableCellInput
                  value={row.value}
                  onChange={(value) => onTableRowChange('brandRows', row.id, 'value', value)}
                />
              </td>
              <td className="table-actions-cell">
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => onAddTableRow('brand')}
                    className="table-row-action"
                    title="Add brand row"
                  >
                    <FiPlus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveTableRow('brandRows', row.id)}
                    className="table-row-action"
                    title="Remove brand row"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="quotation-subtitle">Mode of Payment</p>
      <textarea
        rows={2}
        value={form.paymentOrder}
        onChange={(event) => onFieldChange('paymentOrder', event.target.value)}
        className="document-prose-input"
      />
      <textarea
        rows={3}
        value={form.paymentTerms}
        onChange={(event) => onFieldChange('paymentTerms', event.target.value)}
        className="document-prose-input"
      />

      <p className="quotation-subtitle">Force Majeure</p>
      <textarea
        rows={4}
        value={form.forceMajeure}
        onChange={(event) => onFieldChange('forceMajeure', event.target.value)}
        className="document-prose-input"
      />

      <p className="quotation-subtitle">Cancellation of Order</p>
      <textarea
        rows={3}
        value={form.cancellationTerms}
        onChange={(event) => onFieldChange('cancellationTerms', event.target.value)}
        className="document-prose-input"
      />

      <p className="quotation-subtitle">Inclusion</p>
      <textarea
        rows={5}
        value={form.inclusions}
        onChange={(event) => onFieldChange('inclusions', event.target.value)}
        className="document-prose-input"
      />

      <p className="quotation-subtitle">Exclusion</p>
      <textarea
        rows={6}
        value={form.exclusions}
        onChange={(event) => onFieldChange('exclusions', event.target.value)}
        className="document-prose-input"
      />

      <table className="quotation-main-table" style={{ marginTop: '16px' }}>
        <colgroup>
          <col style={{ width: '55%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <thead className="quotation-table-head">
          <tr>
            <th>Description</th>
            <th>Unit</th>
            <th>Total Amount</th>
            <th className="table-actions-header">
              <button type="button" onClick={() => onAddTableRow('price')} className="table-row-action" title="Add price row">
                <FiPlus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {form.priceRows.map((row) => (
            <tr key={row.id}>
              <td><TableCellInput value={row.description} onChange={(value) => onTableRowChange('priceRows', row.id, 'description', value)} /></td>
              <td><TableCellInput value={row.unit} onChange={(value) => onTableRowChange('priceRows', row.id, 'unit', value)} /></td>
              <td><TableCellInput value={row.totalPrice} onChange={(value) => onTableRowChange('priceRows', row.id, 'totalPrice', value)} /></td>
              <td className="table-actions-cell">
                <button type="button" onClick={() => onRemoveTableRow('priceRows', row.id)} className="table-row-action" title="Remove price row">
                  <FiTrash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <datalist id="inventory-items">
        {inventoryItems && inventoryItems.map((item) => (
          <option key={item.id} value={item.name}>{item.sku} - â‚±{Number(item.unit_price).toLocaleString()}</option>
        ))}
      </datalist>

      <p className="quotation-section-title">System Specifications & Bill of Materials</p>
      <table className="quotation-main-table">
        <colgroup>
          <col style={{ width: '7%' }} />
          <col style={{ width: '47%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <thead className="quotation-table-head">
          <tr>
            <th>Item No.</th>
            <th>Description</th>
            <th>Unit</th>
            <th>Qty</th>
            <th>Unit Price (â‚±)</th>
            <th>Total Amount</th>
            <th className="table-actions-header">
              <button type="button" onClick={() => onAddTableRow('bom')} className="table-row-action" title="Add BOM row">
                <FiPlus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {form.bomRows.map((row) => (
            <tr key={row.id}>
              <td><TableCellInput value={row.itemNo} onChange={(value) => onTableRowChange('bomRows', row.id, 'itemNo', value)} /></td>
              <td>
                <input
                  type="text"
                  list="inventory-items"
                  value={row.description}
                  onChange={(e) => onTableRowChange('bomRows', row.id, 'description', e.target.value)}
                  className="table-cell-input"
                />
              </td>
              <td><TableCellInput value={row.unit} onChange={(value) => onTableRowChange('bomRows', row.id, 'unit', value)} /></td>
              <td><TableCellInput value={row.qty} onChange={(value) => onTableRowChange('bomRows', row.id, 'qty', value)} /></td>
              <td><TableCellInput value={row.unitPrice} onChange={(value) => onTableRowChange('bomRows', row.id, 'unitPrice', value)} /></td>
              <td><TableCellInput value={row.amount} onChange={(value) => onTableRowChange('bomRows', row.id, 'amount', value)} /></td>
              <td className="table-actions-cell">
                <button type="button" onClick={() => onRemoveTableRow('bomRows', row.id)} className="table-row-action" title="Remove BOM row">
                  <FiTrash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="quotation-section-title">Warranty Terms</p>
      <table className="quotation-warranty-table">
        <colgroup>
          <col style={{ width: '23%' }} />
          <col style={{ width: '29%' }} />
          <col style={{ width: '43%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <thead className="quotation-table-head">
          <tr>
            <th>Item</th>
            <th>Brand</th>
            <th>Warranty Period</th>
            <th className="table-actions-header">
              <button type="button" onClick={() => onAddTableRow('warranty')} className="table-row-action" title="Add warranty row">
                <FiPlus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {form.warrantyRows.map((row) => (
            <tr key={row.id}>
              <td><TableCellInput value={row.item} onChange={(value) => onTableRowChange('warrantyRows', row.id, 'item', value)} /></td>
              <td><TableCellInput value={row.brand} onChange={(value) => onTableRowChange('warrantyRows', row.id, 'brand', value)} /></td>
              <td><TableCellInput value={row.period} onChange={(value) => onTableRowChange('warrantyRows', row.id, 'period', value)} /></td>
              <td className="table-actions-cell">
                <button type="button" onClick={() => onRemoveTableRow('warrantyRows', row.id)} className="table-row-action" title="Remove warranty row">
                  <FiTrash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <textarea
        rows={7}
        value={form.warrantyNotes}
        onChange={(event) => onFieldChange('warrantyNotes', event.target.value)}
        className="table-cell-input"
        style={{ marginTop: '12px' }}
      />

      <div className="quotation-prepared">
        <p><strong>Prepared By:</strong></p>
        <p style={{ marginTop: '36px' }}>(SGD)</p>
        <p>
          <AutoGrowTextarea
            rows={1}
            value={form.preparedBy}
            onChange={(value) => onFieldChange('preparedBy', value)}
            className="commissioning-inline-input"
            style={{ fontWeight: 700 }}
          />
        </p>
        <p>
          <AutoGrowTextarea
            rows={1}
            value={form.preparedTitle}
            onChange={(value) => onFieldChange('preparedTitle', value)}
            className="commissioning-inline-input"
          />
        </p>
      </div>

      <Footer />
    </main>
  );
}

function TurnoverAcceptancePreview({
  form,
  onFieldChange,
  onTableRowChange,
  onAddTableRow,
  onRemoveTableRow
}) {
  return (
    <main className="document-paper">
      <Header />
      <h1 className="turnover-title">Turnover / Acceptance Form for ___ kWp Solar PV System</h1>

      <section className="turnover-intro">
        <p>
          Project: Installation of{' '}
          <AutoGrowTextarea
            rows={1}
            value={form.projectInstallationOf}
            onChange={(value) => onFieldChange('projectInstallationOf', value)}
            className="turnover-line-input medium"
          />{' '}
          Solar Photovoltaic System
        </p>
        <p>
          Location Address:{' '}
          <AutoGrowTextarea
            rows={1}
            value={form.locationAddress}
            onChange={(value) => onFieldChange('locationAddress', value)}
            className="turnover-line-input full"
          />
        </p>
        <p>
          Date of Completion:{' '}
          <input
            type="date"
            value={form.dateOfCompletion}
            onChange={(event) => onFieldChange('dateOfCompletion', event.target.value)}
            className="turnover-line-input medium"
          />
        </p>
        <p>
          Date of Turnover:{' '}
          <input
            type="date"
            value={form.dateOfTurnover}
            onChange={(event) => onFieldChange('dateOfTurnover', event.target.value)}
            className="turnover-line-input medium"
          />
        </p>
      </section>

      <section className="turnover-section-title">Client Information</section>
      <section className="turnover-intro">
        <p>
          Client Name:{' '}
          <AutoGrowTextarea
            rows={1}
            value={form.clientName}
            onChange={(value) => onFieldChange('clientName', value)}
            className="turnover-line-input medium"
          />
        </p>
        <p>
          Contact Person:{' '}
          <AutoGrowTextarea
            rows={1}
            value={form.clientContactPerson}
            onChange={(value) => onFieldChange('clientContactPerson', value)}
            className="turnover-line-input medium"
          />
        </p>
        <p>
          Contact Number:{' '}
          <AutoGrowTextarea
            rows={1}
            value={form.clientContactNumber}
            onChange={(value) => onFieldChange('clientContactNumber', value)}
            className="turnover-line-input medium"
          />
        </p>
      </section>

      <section className="turnover-section-title">Project Details</section>
      <p className="quotation-body-text">
        Total System Capacity:{' '}
        <AutoGrowTextarea
          rows={1}
          value={form.systemCapacity}
          onChange={(value) => onFieldChange('systemCapacity', value)}
          className="turnover-line-input short"
        />{' '}
        Watts-peak
      </p>

      <section className="turnover-section-title">System Components Installed:</section>
      <table className="turnover-table">
        <colgroup>
          <col style={{ width: '36%' }} />
          <col style={{ width: '36%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <tbody>
          {form.componentsRows.map((row) => (
            <tr key={row.id}>
              <td><TableCellInput value={row.label} onChange={(value) => onTableRowChange('componentsRows', row.id, 'label', value)} /></td>
              <td><TableCellInput value={row.valueA} onChange={(value) => onTableRowChange('componentsRows', row.id, 'valueA', value)} /></td>
              <td><TableCellInput value={row.valueB} onChange={(value) => onTableRowChange('componentsRows', row.id, 'valueB', value)} /></td>
              <td className="table-actions-cell">
                <div className="flex items-center justify-center gap-1">
                  <button type="button" onClick={() => onAddTableRow('components')} className="table-row-action" title="Add components row">
                    <FiPlus size={14} />
                  </button>
                  <button type="button" onClick={() => onRemoveTableRow('componentsRows', row.id)} className="table-row-action" title="Remove components row">
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="turnover-section-title">System Performance and Parameters</section>
      <table className="turnover-table">
        <colgroup>
          <col style={{ width: '44%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '19%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th />
            <th>Daily</th>
            <th>Monthly</th>
            <th>Annual</th>
            <th className="table-actions-header">
              <button type="button" onClick={() => onAddTableRow('performance')} className="table-row-action" title="Add performance row">
                <FiPlus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {form.performanceRows.map((row) => (
            <tr key={row.id}>
              <td><TableCellInput value={row.label} onChange={(value) => onTableRowChange('performanceRows', row.id, 'label', value)} /></td>
              <td><TableCellInput value={row.daily} onChange={(value) => onTableRowChange('performanceRows', row.id, 'daily', value)} /></td>
              <td><TableCellInput value={row.monthly} onChange={(value) => onTableRowChange('performanceRows', row.id, 'monthly', value)} /></td>
              <td><TableCellInput value={row.annual} onChange={(value) => onTableRowChange('performanceRows', row.id, 'annual', value)} /></td>
              <td className="table-actions-cell">
                <button type="button" onClick={() => onRemoveTableRow('performanceRows', row.id)} className="table-row-action" title="Remove performance row">
                  <FiTrash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="turnover-section-title">Commissioning Tests Conducted</section>
      <table className="turnover-table">
        <colgroup>
          <col style={{ width: '27%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '28%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <thead className="turnover-head-row">
          <tr>
            <th />
            <th>Date Conducted</th>
            <th>Values</th>
            <th>Results</th>
            <th className="table-actions-header">
              <button type="button" onClick={() => onAddTableRow('commissioning')} className="table-row-action" title="Add commissioning row">
                <FiPlus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {form.commissioningRows.map((row) => (
            <tr key={row.id}>
              <td><TableCellInput value={row.label} onChange={(value) => onTableRowChange('commissioningRows', row.id, 'label', value)} /></td>
              <td><TableCellInput value={row.dateConducted} onChange={(value) => onTableRowChange('commissioningRows', row.id, 'dateConducted', value)} /></td>
              <td><TableCellInput value={row.values} onChange={(value) => onTableRowChange('commissioningRows', row.id, 'values', value)} /></td>
              <td><TableCellInput value={row.results} onChange={(value) => onTableRowChange('commissioningRows', row.id, 'results', value)} /></td>
              <td className="table-actions-cell">
                <button type="button" onClick={() => onRemoveTableRow('commissioningRows', row.id)} className="table-row-action" title="Remove commissioning row">
                  <FiTrash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="turnover-table" style={{ marginTop: '18px' }}>
        <tbody>
          <tr>
            <td style={{ width: '55%', fontWeight: 700 }}>Warranty on Inverters</td>
            <td>
              <TableCellInput value={form.warrantyOnInverters} onChange={(value) => onFieldChange('warrantyOnInverters', value)} />
            </td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700 }}>System Warranty</td>
            <td>
              <TableCellInput value={form.systemWarranty} onChange={(value) => onFieldChange('systemWarranty', value)} />
            </td>
          </tr>
        </tbody>
      </table>

      <section className="turnover-section-title">Documentation Provided:</section>
      <table className="turnover-table">
        <colgroup>
          <col style={{ width: '58%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '19%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <thead className="turnover-head-row">
          <tr>
            <th />
            <th>Status</th>
            <th>Date</th>
            <th className="table-actions-header">
              <button type="button" onClick={() => onAddTableRow('documents')} className="table-row-action" title="Add document row">
                <FiPlus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {form.documentsRows.map((row) => (
            <tr key={row.id}>
              <td><TableCellInput value={row.label} onChange={(value) => onTableRowChange('documentsRows', row.id, 'label', value)} /></td>
              <td><TableCellInput value={row.status} onChange={(value) => onTableRowChange('documentsRows', row.id, 'status', value)} /></td>
              <td><TableCellInput value={row.date} onChange={(value) => onTableRowChange('documentsRows', row.id, 'date', value)} /></td>
              <td className="table-actions-cell">
                <button type="button" onClick={() => onRemoveTableRow('documentsRows', row.id)} className="table-row-action" title="Remove document row">
                  <FiTrash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="turnover-final-page">
        <section className="turnover-section-title">Turnover Confirmation</section>
        <section className="turnover-confirmation">
          <p>
            By signing below, both the Installation Partner and the Client agree that the solar photovoltaic system has been
            installed in accordance with the project's terms, tested, and is ready for utilization.
          </p>
        </section>

        <div className="turnover-signature-grid">
          <section className="turnover-signature-block">
            <p><strong>Installer Details:</strong></p>
            <p>Installation Partner: <span className="turnover-signature-line long"><AutoGrowTextarea rows={1} value={form.installerPartner} onChange={(value) => onFieldChange('installerPartner', value)} className="turnover-signature-fill" /></span></p>
            <p>Contact Person: <span className="turnover-signature-line"><AutoGrowTextarea rows={1} value={form.installerContactPerson} onChange={(value) => onFieldChange('installerContactPerson', value)} className="turnover-signature-fill" /></span></p>
            <p>Contact Number: <span className="turnover-signature-line"><AutoGrowTextarea rows={1} value={form.installerContactNumber} onChange={(value) => onFieldChange('installerContactNumber', value)} className="turnover-signature-fill" /></span></p>
            <p>Signature: <span className="turnover-signature-line long"><AutoGrowTextarea rows={1} value={form.installerSignature} onChange={(value) => onFieldChange('installerSignature', value)} className="turnover-signature-fill" /></span></p>
            <p>Date: <span className="turnover-signature-line"><input type="date" value={form.installerDate} onChange={(event) => onFieldChange('installerDate', event.target.value)} className="turnover-signature-fill" /></span></p>
          </section>
          <section className="turnover-signature-block">
            <p><strong>Client Details:</strong></p>
            <p>Client Name: <span className="turnover-signature-line long"><AutoGrowTextarea rows={1} value={form.clientName} onChange={(value) => onFieldChange('clientName', value)} className="turnover-signature-fill" /></span></p>
            <p>Contact Person: <span className="turnover-signature-line"><AutoGrowTextarea rows={1} value={form.clientContactPerson} onChange={(value) => onFieldChange('clientContactPerson', value)} className="turnover-signature-fill" /></span></p>
            <p>Signature: <span className="turnover-signature-line long"><AutoGrowTextarea rows={1} value={form.clientSignature} onChange={(value) => onFieldChange('clientSignature', value)} className="turnover-signature-fill" /></span></p>
            <p>Date: <span className="turnover-signature-line"><input type="date" value={form.clientSignatureDate} onChange={(event) => onFieldChange('clientSignatureDate', event.target.value)} className="turnover-signature-fill" /></span></p>
          </section>
        </div>

        <section className="turnover-confirmation" style={{ marginTop: '18px' }}>
          <p>
            This document confirms that the{' '}
            <AutoGrowTextarea
              rows={1}
              value={form.confirmationSystemName}
              onChange={(value) => onFieldChange('confirmationSystemName', value)}
              className="turnover-line-input medium"
            />{' '}
            Solar PV System has been successfully turned over and is ready for full operation.
          </p>
        </section>

        <Footer />
      </section>
    </main>
  );
}

function TechnicalDataSheetPreview({ form, onFieldChange, onLoadRowChange, onPurposeRowChange }) {
  return (
    <main className="document-paper">
      <Header />
      <h1 className="tds-title">TDS - Technical Data Sheet</h1>

      <p className="tds-copy">
        <strong>Purpose.</strong> This questionnaire will enable our TECH TEAM to create a customized solution for your solar power
        requirement. This will serve as the basis of the requested price quotation and system proposal that will be sent to you.
      </p>
      <p className="tds-copy">
        <strong>Directions.</strong> Fill in all the blanks. Put a CHECK or ENCIRCLE items that may apply. Put N/A if Not Applicable.
      </p>

      <section className="tds-section-title">A. Client Information</section>
      <p className="tds-row">
        Complete Name: Last Name
        <AutoGrowTextarea rows={1} value={form.lastName} onChange={(value) => onFieldChange('lastName', value)} className="tds-line-input long" />
        {' '}First Name
        <AutoGrowTextarea rows={1} value={form.firstName} onChange={(value) => onFieldChange('firstName', value)} className="tds-line-input medium" />
        {' '}Middle Name
        <AutoGrowTextarea rows={1} value={form.middleName} onChange={(value) => onFieldChange('middleName', value)} className="tds-line-input medium" />
      </p>
      <p className="tds-row">
        Contact Details: Landline
        <AutoGrowTextarea rows={1} value={form.contactLandline || ''} onChange={(value) => onFieldChange('contactLandline', value)} className="tds-line-input medium" />
        {' '}Mobile
        <AutoGrowTextarea rows={1} value={form.mobileNumber} onChange={(value) => onFieldChange('mobileNumber', value)} className="tds-line-input medium" />
        {' '}E-mail Address:
        <AutoGrowTextarea rows={1} value={form.emailAddress} onChange={(value) => onFieldChange('emailAddress', value)} className="tds-line-input long" />
      </p>

      <section className="tds-section-title">B. Site Description</section>
      <p className="tds-question">
        1. What type of premise/establishment are you planning to solarize?
      </p>
      <p className="tds-row tds-indent">
        House / School / Clinic / Salon / Office / Water Station / Farm / Resort / Others
        <AutoGrowTextarea rows={1} value={form.sitePremisePlan} onChange={(value) => onFieldChange('sitePremisePlan', value)} className="tds-line-input medium" />
      </p>
      <p className="tds-question">
        2. Which category does your premise fall into?
      </p>
      <p className="tds-row tds-indent">
        Type of Premise:
        <AutoGrowTextarea rows={1} value={form.sitePremiseCategory} onChange={(value) => onFieldChange('sitePremiseCategory', value)} className="tds-line-input full" />
      </p>
      <p className="tds-row tds-indent">
        Ownership:
        <AutoGrowTextarea rows={1} value={form.ownershipStatus} onChange={(value) => onFieldChange('ownershipStatus', value)} className="tds-line-input full" />
      </p>
      <p className="tds-question">
        3. Specify COMPLETE Address or Coordinates of Site Location:
      </p>
      <p className="tds-row">
        <AutoGrowTextarea rows={1} value={form.completeAddress} onChange={(value) => onFieldChange('completeAddress', value)} className="tds-line-input full" />
      </p>

      <section className="tds-section-title">C. Technical - Electrical</section>
      <p className="tds-question">
        4. Primary source of Electric Supply?
      </p>
      <p className="tds-row tds-indent">
        <AutoGrowTextarea rows={1} value={form.primaryElectricSupply} onChange={(value) => onFieldChange('primaryElectricSupply', value)} className="tds-line-input full" />
      </p>
      <p className="tds-question">
        5. What type of AC Phase Power Supply does your premise have?
      </p>
      <p className="tds-row tds-indent">
        <AutoGrowTextarea rows={1} value={form.acSupplyType} onChange={(value) => onFieldChange('acSupplyType', value)} className="tds-line-input full" />
      </p>
      <p className="tds-question">
        6. Where do you intend to install the solar panels?
      </p>
      <p className="tds-row tds-indent">
        <AutoGrowTextarea rows={1} value={form.solarInstallLocation} onChange={(value) => onFieldChange('solarInstallLocation', value)} className="tds-line-input full" />
      </p>
      <p className="tds-question">
        7. What type of rooftop does your premise have?
      </p>
      <p className="tds-row tds-indent">
        <AutoGrowTextarea rows={1} value={form.rooftopType} onChange={(value) => onFieldChange('rooftopType', value)} className="tds-line-input full" />
      </p>
      <p className="tds-question">
        8. Average/Maximum electricity bill per month?
        {' '}
        <AutoGrowTextarea rows={1} value={form.averageMonthlyBill} onChange={(value) => onFieldChange('averageMonthlyBill', value)} className="tds-line-input long" />
      </p>
      <p className="tds-question">
        9. How many hours do you require electricity per day?
        {' '}
        <AutoGrowTextarea rows={1} value={form.electricityHoursPerDay} onChange={(value) => onFieldChange('electricityHoursPerDay', value)} className="tds-line-input medium" />
      </p>
      <p className="tds-question">
        10. Does you area experience frequent brownouts?
        {' '}
        <AutoGrowTextarea rows={1} value={form.frequentBrownouts} onChange={(value) => onFieldChange('frequentBrownouts', value)} className="tds-line-input short" />
        {' '}If Yes, How many times a week?
        {' '}
        <AutoGrowTextarea rows={1} value={form.brownoutFrequencyPerWeek} onChange={(value) => onFieldChange('brownoutFrequencyPerWeek', value)} className="tds-line-input medium" />
      </p>
      <p className="tds-question">
        11. Do you prefer to have batteries for your solar system?
        {' '}
        <AutoGrowTextarea rows={1} value={form.batteryPreference} onChange={(value) => onFieldChange('batteryPreference', value)} className="tds-line-input full" />
      </p>

      <section className="tds-section-title">D. Electrical Load Schedule (Attach a copy if necessary)</section>
      <p className="tds-copy">
        12. If the answer is YES, please list down the electrical appliances you intend to run longer during Nighttime. For Air-conditioners,
        Refrigerators/Freezers, identify if inverter or non-inverter and for all other heavier equipment, identify the wattages of each equipment.
      </p>
      <table className="tds-load-table">
        <colgroup>
          <col style={{ width: '14%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '18%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Appliance / Equipment</th>
            <th>How many Units</th>
            <th>Inverter (I) or Non Inverter (N.I.)</th>
            <th>Wattage</th>
            <th>Using more at Day</th>
            <th>Using more at Night</th>
            <th>Other Remarks</th>
          </tr>
        </thead>
        <tbody>
          {form.loadRows.map((row) => (
            <tr key={row.id}>
              <td><TableCellInput value={row.appliance} onChange={(value) => onLoadRowChange(row.id, 'appliance', value)} /></td>
              <td><TableCellInput value={row.quantity} onChange={(value) => onLoadRowChange(row.id, 'quantity', value)} /></td>
              <td><TableCellInput value={row.inverterType} onChange={(value) => onLoadRowChange(row.id, 'inverterType', value)} /></td>
              <td><TableCellInput value={row.wattage} onChange={(value) => onLoadRowChange(row.id, 'wattage', value)} /></td>
              <td><TableCellInput value={row.usageDay} onChange={(value) => onLoadRowChange(row.id, 'usageDay', value)} /></td>
              <td><TableCellInput value={row.usageNight} onChange={(value) => onLoadRowChange(row.id, 'usageNight', value)} /></td>
              <td><TableCellInput value={row.remarks} onChange={(value) => onLoadRowChange(row.id, 'remarks', value)} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="tds-question" style={{ marginTop: '16px' }}>
        13. Do you have an existing diesel generator?
        {' '}
        <AutoGrowTextarea rows={1} value={form.hasGenerator} onChange={(value) => onFieldChange('hasGenerator', value)} className="tds-line-input short" />
        {' '}If YES, kindly provide the following:
      </p>
      <div className="tds-generator-headings">
        <span>Brand Name</span>
        <span>How many kVA?</span>
        <span>Diesel or Gas</span>
        <span>Date Purchased</span>
      </div>
      <div className="tds-generator-values">
        <AutoGrowTextarea rows={1} value={form.generatorBrandName} onChange={(value) => onFieldChange('generatorBrandName', value)} className="tds-line-input medium" />
        <AutoGrowTextarea rows={1} value={form.generatorCapacity} onChange={(value) => onFieldChange('generatorCapacity', value)} className="tds-line-input medium" />
        <AutoGrowTextarea rows={1} value={form.generatorFuelType} onChange={(value) => onFieldChange('generatorFuelType', value)} className="tds-line-input medium" />
        <AutoGrowTextarea rows={1} value={form.generatorDatePurchased} onChange={(value) => onFieldChange('generatorDatePurchased', value)} className="tds-line-input medium" />
      </div>

      <section className="tds-section-title">E. Purpose and Confirmation</section>
      <p className="tds-question">14. What is the main purpose of going Solar? Put a check on items that may apply:</p>
      {form.purposeRows.map((row) => (
        <p className="tds-row tds-indent" key={row.id}>
          <span className="tds-purpose-line">
            <AutoGrowTextarea rows={1} value={row.mark} onChange={(value) => onPurposeRowChange(row.id, 'mark', value)} className="tds-line-input tds-check-line" />
          </span>
          {' '}{row.label}
          {row.label === 'Others please specify' ? (
            <>
              {' '}
              <AutoGrowTextarea rows={1} value={form.purposeOther} onChange={(value) => onFieldChange('purposeOther', value)} className="tds-line-input full" />
            </>
          ) : null}
        </p>
      ))}

      <section className="tds-section-title">F. Other References</section>
      <p className="tds-question">15. Attach a copy of the following.</p>
      <p className="tds-row">
        a. Electric Bill
        {' '}
        <AutoGrowTextarea rows={1} value={form.attachElectricBill} onChange={(value) => onFieldChange('attachElectricBill', value)} className="tds-line-input short" />
      </p>
      <p className="tds-row">
        b. Project Site Rooftop or Ground Photo as to where solar panels will be installed.
        {' '}
        <AutoGrowTextarea rows={1} value={form.attachSitePhoto} onChange={(value) => onFieldChange('attachSitePhoto', value)} className="tds-line-input short" />
      </p>

      <section className="tds-section-title">G. Client Confirmation</section>
      <section className="tds-confirmation">
        <p>
          I hereby certify that the information provided above is true and correct to the best of my knowledge and may be used by AFN Solar Power
          Engineering Services as the basis for recommendation and quotation.
        </p>
        <div className="tds-confirmation-signoff">
          <div>
            <div className="tds-signoff-line">
              <AutoGrowTextarea rows={1} value={form.clientConfirmationName} onChange={(value) => onFieldChange('clientConfirmationName', value)} className="tds-line-input full" />
            </div>
            <div className="tds-signoff-label">Client&apos;s Name &amp; Signature</div>
          </div>
          <div>
            <div className="tds-signoff-line">
              <input type="date" value={form.confirmationDate} onChange={(event) => onFieldChange('confirmationDate', event.target.value)} className="tds-line-input medium" />
            </div>
            <div className="tds-signoff-label">Date</div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function InstallationContractPreview({ form, onFieldChange }) {
  return (
    <main className="document-paper">
      <Header />
      <h1 className="contract-title">Solar Installation Contract</h1>

      <p className="contract-body">
        This Solar Installation Contract (hereinafter referred to as the "Contract") is entered into by and between{' '}
        <AutoGrowTextarea rows={1} value={form.companyName} onChange={(value) => onFieldChange('companyName', value)} className="contract-line-input long" placeholder="[Company Name]" />{' '}
        located at{' '}
        <AutoGrowTextarea rows={1} value={form.companyAddress} onChange={(value) => onFieldChange('companyAddress', value)} className="contract-line-input long" placeholder="[Company Address]" />{' '}
        (hereinafter referred to as the "Company"), and{' '}
        <AutoGrowTextarea rows={1} value={form.clientName} onChange={(value) => onFieldChange('clientName', value)} className="contract-line-input medium" placeholder="[Client Name]" />{' '}
        residing at{' '}
        <AutoGrowTextarea rows={1} value={form.clientAddress} onChange={(value) => onFieldChange('clientAddress', value)} className="contract-line-input long" placeholder="[Client Address]" />{' '}
        (hereinafter referred to as the "Client"), collectively referred to as the "Parties."
      </p>

      <section className="contract-section">
        <p className="contract-section-title">Scope of Work:</p>
        <p>
          1.1 The Company agrees to design, supply, and install a{' '}
          <AutoGrowTextarea rows={1} value={form.systemDescription} onChange={(value) => onFieldChange('systemDescription', value)} className="contract-line-input medium" placeholder="[Solar PV System Description]" />{' '}
          at the Client&apos;s property located at{' '}
          <AutoGrowTextarea rows={1} value={form.propertyAddress} onChange={(value) => onFieldChange('propertyAddress', value)} className="contract-line-input long" placeholder="[Property Address]" />.
        </p>
        <p>
          1.2 The System shall include, but not be limited to, solar panels, inverters, mounting equipment, wiring, and
          associated components necessary for a fully functional solar energy system.
        </p>
        <p>
          1.3 The Company shall obtain all necessary permits, approvals, and inspections required for the installation of the Net
          Metering System.
        </p>
        <p>
          1.4 The installation shall be carried out in accordance with industry standards, applicable codes, and regulations.
        </p>
        <p>
          1.5 Service Type:{' '}
          <AutoGrowTextarea rows={1} value={form.serviceType} onChange={(value) => onFieldChange('serviceType', value)} className="contract-line-input long" placeholder="[Service Type]" />
          {' '}System Capacity:{' '}
          <AutoGrowTextarea rows={1} value={form.systemCapacity} onChange={(value) => onFieldChange('systemCapacity', value)} className="contract-line-input medium" placeholder="[System Capacity]" />
        </p>
        {form.scopeNotes ? (
          <p>
          1.6 Additional Scope Notes:{' '}
            <AutoGrowTextarea rows={1} value={form.scopeNotes} onChange={(value) => onFieldChange('scopeNotes', value)} className="contract-line-input full" placeholder="[Additional Scope Notes]" />
          </p>
        ) : null}
      </section>

      <section className="contract-section">
        <p className="contract-section-title">Project Schedule:</p>
        <p>
          2.1 The Company shall commence the installation of the System on{' '}
          <input type="date" value={form.startDate} onChange={(event) => onFieldChange('startDate', event.target.value)} className="contract-line-input medium" data-guide-print="[Start Date]" />.
        </p>
        <p>
          2.2 The Company shall make reasonable efforts to complete the installation within{' '}
          <AutoGrowTextarea rows={1} value={form.estimatedCompletionTime} onChange={(value) => onFieldChange('estimatedCompletionTime', value)} className="contract-line-input medium" placeholder="[Estimated Completion Time]" />.
          However, the Parties acknowledge that unforeseen circumstances may cause delays. The Company shall promptly inform the
          Client of any such delays and provide a revised timeline.
        </p>
      </section>

      <section className="contract-section">
        <p className="contract-section-title">Payment Terms:</p>
        <p>
          3.1 The Client agrees to pay the Company the total amount of{' '}
          <AutoGrowTextarea rows={1} value={form.totalContractAmount} onChange={(value) => onFieldChange('totalContractAmount', value)} className="contract-line-input medium" placeholder="[Total Contract Amount]" />{' '}
          for the installation of the System, as specified in the attached quotation ({' '}
          <AutoGrowTextarea rows={1} value={form.appendices} onChange={(value) => onFieldChange('appendices', value)} className="contract-line-input short" placeholder="[Appendix A]" />).
        </p>
        <p>3.2 Payment shall be made as follows:</p>
        <p>
          a.{' '}
          <AutoGrowTextarea rows={1} value={form.upfrontPayment} onChange={(value) => onFieldChange('upfrontPayment', value)} className="contract-line-input medium" placeholder="[Percentage or Amount]" />{' '}
          as an upfront deposit upon signing this Contract.
        </p>
        <p>
          b.{' '}
          <AutoGrowTextarea rows={1} value={form.completionPayment} onChange={(value) => onFieldChange('completionPayment', value)} className="contract-line-input medium" placeholder="[Percentage or Amount]" />{' '}
          upon completion of the installation.
        </p>
        <p>
          c. The remaining balance of{' '}
          <AutoGrowTextarea rows={1} value={form.finalPayment} onChange={(value) => onFieldChange('finalPayment', value)} className="contract-line-input medium" placeholder="[Percentage or Amount]" />{' '}
          within{' '}
          <AutoGrowTextarea rows={1} value={form.finalInspectionDays} onChange={(value) => onFieldChange('finalInspectionDays', value)} className="contract-line-input short" placeholder="[Number of Days]" />{' '}
          days after the final inspection and approval of the System.
        </p>
        <p>
          3.3 All payments shall be made in{' '}
          <AutoGrowTextarea rows={1} value={form.currency} onChange={(value) => onFieldChange('currency', value)} className="contract-line-input medium" placeholder="[Currency]" />{' '}
          by{' '}
          <AutoGrowTextarea rows={1} value={form.paymentMethod} onChange={(value) => onFieldChange('paymentMethod', value)} className="contract-line-input medium" placeholder="[Payment Method]" />{' '}
          to the Company&apos;s designated bank account or as otherwise directed by the Company.
        </p>
      </section>

      <section className="contract-section">
        <p className="contract-section-title">Warranty:</p>
        <p>
          4.1 The Company warrants that the System shall be free from defects in materials and workmanship for a period of{' '}
          <AutoGrowTextarea rows={1} value={form.warrantyPeriod} onChange={(value) => onFieldChange('warrantyPeriod', value)} className="contract-line-input medium" placeholder="[Warranty Period]" />{' '}
          from the date of installation.
        </p>
        <p>
          4.2 In the event of any defects covered by the warranty, the Client shall promptly notify the Company, and the Company
          shall undertake necessary repairs or replacements at its expense.
        </p>
        <p>
          4.3 The warranty shall be void if the System has been tampered with, modified, or repaired by any party other than the
          Company without prior written consent.
        </p>
      </section>

      <section className="contract-section">
        <p className="contract-section-title">Limitation of Liability:</p>
        <p>
          5.1 The Company shall not be liable for any indirect, consequential, or incidental damages arising out of or in
          connection with this Contract, except in cases of willful misconduct or gross negligence.
        </p>
        <p>
          5.2 The Company&apos;s total liability under this Contract shall not exceed the total contract amount paid by the Client.
        </p>
      </section>

      <section className="contract-section">
        <p className="contract-section-title">Termination:</p>
        <p>
          6.1 Either Party may terminate this Contract in the event of a material breach by the other Party. Prior notice of{' '}
          <AutoGrowTextarea rows={1} value={form.terminationNoticePeriod} onChange={(value) => onFieldChange('terminationNoticePeriod', value)} className="contract-line-input short" />{' '}
          days shall be given in writing to the breaching Party, allowing them an opportunity to cure the breach.
        </p>
        <p>
          6.2 Either Party may terminate this Contract without cause by providing written notice of termination to the other Party
          at least{' '}
          <AutoGrowTextarea rows={1} value={form.terminationNoticePeriod} onChange={(value) => onFieldChange('terminationNoticePeriod', value)} className="contract-line-input short" />{' '}
          days in advance.
        </p>
      </section>

      <section className="contract-section">
        <p className="contract-section-title">Governing Law and Dispute Resolution:</p>
        <p>
          7.1 This Contract shall be governed by and construed in accordance with the laws of{' '}
          <AutoGrowTextarea rows={1} value={form.governingLawJurisdiction} onChange={(value) => onFieldChange('governingLawJurisdiction', value)} className="contract-line-input long" placeholder="[Governing Law Jurisdiction]" />.
        </p>
        <p>
          7.2 Any disputes arising out of or in connection with this Contract shall be resolved through amicable negotiations
          between the Parties. If the dispute remains unresolved, it shall be submitted to mediation or arbitration in accordance
          with the rules of{' '}
          <AutoGrowTextarea rows={1} value={form.mediationOrganization} onChange={(value) => onFieldChange('mediationOrganization', value)} className="contract-line-input long" placeholder="[Mediation/Arbitration Organization]" />{' '}
          before resorting to litigation.
        </p>
      </section>

      <section className="contract-section">
        <p className="contract-section-title">Entire Agreement:</p>
        <p>
          8.1 This Contract constitutes the entire agreement between the Parties and supersedes all prior oral or written
          agreements, understandings, or representations.
        </p>
        <p>
          8.2 Any modifications to this Contract must be made in writing and signed by both Parties.
        </p>
      </section>

      <section className="contract-section contract-witness">
        <p>
          IN WITNESS WHEREOF, the Parties hereto have executed this Solar Installation Contract as of the date first written
          above.
        </p>
      </section>

      <section className="contract-signatures">
        <div>
          <p className="contract-signature-party">
            <AutoGrowTextarea rows={1} value={form.companyName} onChange={(value) => onFieldChange('companyName', value)} className="contract-line-input long" placeholder="[Company Name]" />
          </p>
          <p>
            <span className="contract-signature-label">By:</span>
            <span className="contract-signature-line" />
          </p>
          <p>
            <span className="contract-signature-label">Name:</span>
            <span className="contract-signature-line">
              <AutoGrowTextarea rows={1} value={form.authorizedPerson} onChange={(value) => onFieldChange('authorizedPerson', value)} className="contract-signature-fill" placeholder="[Authorized Person]" />
            </span>
          </p>
          <p>
            <span className="contract-signature-label">Title:</span>
            <span className="contract-signature-line">
              <AutoGrowTextarea rows={1} value={form.authorizedTitle} onChange={(value) => onFieldChange('authorizedTitle', value)} className="contract-signature-fill" placeholder="[Authorized Title]" />
            </span>
          </p>
        </div>
        <div>
          <p className="contract-signature-party">
            <AutoGrowTextarea rows={1} value={form.clientName} onChange={(value) => onFieldChange('clientName', value)} className="contract-line-input long" placeholder="[Client Name]" />
          </p>
          <p>
            <span className="contract-signature-label">By:</span>
            <span className="contract-signature-line" />
          </p>
          <p>
            <span className="contract-signature-label">Name:</span>
            <span className="contract-signature-line">
              <AutoGrowTextarea rows={1} value={form.clientRepresentative} onChange={(value) => onFieldChange('clientRepresentative', value)} className="contract-signature-fill" placeholder="[Client Representative]" />
            </span>
          </p>
          <p>
            <span className="contract-signature-label">Title:</span>
            <span className="contract-signature-line">
              <AutoGrowTextarea rows={1} value={form.clientRepresentativeTitle} onChange={(value) => onFieldChange('clientRepresentativeTitle', value)} className="contract-signature-fill" placeholder="[Client Title]" />
            </span>
          </p>
          <p>
            <span className="contract-signature-label">Date:</span>
            <span className="contract-signature-line short">
              <input type="date" value={form.contractDate} onChange={(event) => onFieldChange('contractDate', event.target.value)} className="contract-signature-fill" data-guide-print="[Contract Date]" />
            </span>
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function SimpleTemplatePreview({ activeTemplate, form }) {
  const title = TEMPLATE_OPTIONS.find((template) => template.id === activeTemplate)?.label || 'AFN Document';
  return (
    <main className="document-paper">
      <Header />
      <h1 className="fsr-title">{title}</h1>
      <div className="simple-placeholder">
        <p>Client: {form.clientName}</p>
        <p>Address: {form.address}</p>
        <p>Contact Number: {form.contactNumber}</p>
        <p>Date: {form.documentDate}</p>
        <p>System Capacity: {form.systemCapacity}</p>
      </div>
      <Footer />
    </main>
  );
}

function DocumentPreview({
  activeTemplate,
  form,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  commissioningForm,
  onCommissioningFieldChange,
  onCommissioningItemChange,
  onCommissioningReadingChange,
  quotationForm,
  onQuotationFieldChange,
  onQuotationTableRowChange,
  onQuotationAddRow,
  onQuotationRemoveRow,
  tdsForm,
  onTdsFieldChange,
  onTdsLoadRowChange,
  onTdsPurposeRowChange,
  installationContractForm,
  onInstallationContractFieldChange,
  turnoverForm,
  onTurnoverFieldChange,
  onTurnoverTableRowChange,
  onTurnoverAddRow,
  onTurnoverRemoveRow,
  inventoryItems
}) {
  if (activeTemplate === 'field_service_report') {
    return (
      <FieldServiceReport
        form={form}
        onUpdateRow={onUpdateRow}
        onAddRow={onAddRow}
        onRemoveRow={onRemoveRow}
      />
    );
  }
  if (activeTemplate === 'commissioning_checklist') {
    return (
      <SolarCommissioningChecklistPreview
        form={commissioningForm}
        onFieldChange={onCommissioningFieldChange}
        onChecklistItemChange={onCommissioningItemChange}
        onReadingChange={onCommissioningReadingChange}
      />
    );
  }
  if (activeTemplate === 'quotation_proposal') {
    return (
      <QuotationProposalPreview
        form={quotationForm}
        onFieldChange={onQuotationFieldChange}
        onTableRowChange={onQuotationTableRowChange}
        onAddTableRow={onQuotationAddRow}
        onRemoveTableRow={onQuotationRemoveRow}
        inventoryItems={inventoryItems}
      />
    );
  }
  if (activeTemplate === 'technical_data_sheet') {
    return (
      <TechnicalDataSheetPreview
        form={tdsForm}
        onFieldChange={onTdsFieldChange}
        onLoadRowChange={onTdsLoadRowChange}
        onPurposeRowChange={onTdsPurposeRowChange}
      />
    );
  }
  if (activeTemplate === 'installation_contract') {
    return (
      <InstallationContractPreview
        form={installationContractForm}
        onFieldChange={onInstallationContractFieldChange}
      />
    );
  }
  if (activeTemplate === 'turnover_acceptance') {
    return (
      <TurnoverAcceptancePreview
        form={turnoverForm}
        onFieldChange={onTurnoverFieldChange}
        onTableRowChange={onTurnoverTableRowChange}
        onAddTableRow={onTurnoverAddRow}
        onRemoveTableRow={onTurnoverRemoveRow}
      />
    );
  }
  return <SimpleTemplatePreview activeTemplate={activeTemplate} form={form} />;
}

function TextField({ label, value, onChange, type = 'text' }) {
  const sharedClasses = 'w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {type === 'date' ? (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`h-10 ${sharedClasses}`}
        />
      ) : (
        <AutoGrowTextarea
          rows={1}
          value={value}
          onChange={onChange}
          className={`min-h-[40px] ${sharedClasses}`}
          style={{ paddingTop: '9px', paddingBottom: '9px' }}
        />
      )}
    </label>
  );
}

export default function AdminDocuments() {
  const { user } = useAuth();
  const canManageDocuments = hasAnyCapability(user, DOCUMENTS_MANAGE_CAPABILITIES);
  const [searchParams] = useSearchParams();
  const initialTemplate = searchParams.get('template');
  const [activeTemplate, setActiveTemplate] = useState(initialTemplate || 'field_service_report');
  const [paperSize, setPaperSize] = useState('letter');
  const [form, setForm] = useState(createInitialForm);
  const [commissioningForm, setCommissioningForm] = useState(createInitialCommissioningForm);
  const [commissioningBaseline, setCommissioningBaseline] = useState(createInitialCommissioningForm);
  const [quotationForm, setQuotationForm] = useState(createInitialQuotationForm);
  const [tdsForm, setTdsForm] = useState(createInitialTdsForm);
  const [installationContractForm, setInstallationContractForm] = useState(createInitialInstallationContractForm);
  const [turnoverForm, setTurnoverForm] = useState(createInitialTurnoverForm);
  const [documentPrefill, setDocumentPrefill] = useState(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState('');
  const [documentDraftLoading, setDocumentDraftLoading] = useState(false);
  const [documentDraftSaving, setDocumentDraftSaving] = useState(false);
  const [documentDraftMessage, setDocumentDraftMessage] = useState('');
  const [commissioningLoading, setCommissioningLoading] = useState(false);
  const [commissioningSaving, setCommissioningSaving] = useState(false);
  const [commissioningMessage, setCommissioningMessage] = useState('');
  const [turnoverSaving, setTurnoverSaving] = useState(false);
  const [turnoverMessage, setTurnoverMessage] = useState('');
  const [quotationRecords, setQuotationRecords] = useState([]);
  const [installedEquipmentRecords, setInstalledEquipmentRecords] = useState([]);
  const [selectedFieldServiceReportId, setSelectedFieldServiceReportId] = useState('latest');
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState('');
  const [ticketSearch, setTicketSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
  const dropdownRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    fetchInventory().then((items) => {
      if (isMounted) setInventoryItems(items);
    }).catch(console.error);
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      let isMounted = true;
      const doSearch = async () => {
        setTicketsLoading(true);
        try {
           const data = await searchServiceTickets(ticketSearch);
           if (isMounted) {
               setTickets((prev) => {
                 // merge to avoid losing the currently selected ticket if it's not in the new search
                 const newTickets = [...data];
                 if (selectedTicketId && !newTickets.find(t => String(t.id) === String(selectedTicketId))) {
                   const selected = prev.find(t => String(t.id) === String(selectedTicketId));
                   if (selected) newTickets.push(selected);
                 }
                 return newTickets;
               });
           }
        } catch(error) {
           if (isMounted) setTicketsError('Unable to load tickets.');
        } finally {
           if (isMounted) setTicketsLoading(false);
        }
      };
      if (ticketSearch !== '' || tickets.length === 0) {
          doSearch();
      }
      return () => { isMounted = false; };
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [ticketSearch, selectedTicketId]);

  const paper = getPaperConfig(paperSize);
  const printCss = useMemo(() => buildPrintCss(paperSize), [paperSize]);
  const currentMissingFields = documentPrefill?.missing_fields?.[activeTemplate] || [];
  const activeTemplateLabel = TEMPLATE_OPTIONS.find((template) => template.id === activeTemplate)?.label || 'AFN Document';

  const refreshTicketPrefill = async (ticketId, ticketList = tickets) => {
    const selectedTicketBase = ticketList.find((ticket) => String(ticket.id) === String(ticketId));
    if (!selectedTicketBase) {
      return;
    }

    setPrefillLoading(true);

    try {
      const prefill = await fetchDocumentPrefill(ticketId);
      const selectedTicket = buildTicketContextFromPrefill(selectedTicketBase, prefill);
      const commissioningSource = prefill?.solar_commissioning || null;

      let equipmentData = [];
      let quotationData = [];
      try {
        const clientId = pickNumericId(
          prefill?.client?.id,
          selectedTicket?.clientId,
          selectedTicket?.client_id,
          selectedTicket?.request_details?.client_id,
          selectedTicket?.request_details?.client,
          selectedTicketBase?.clientId,
          selectedTicketBase?.client_id,
          selectedTicketBase?.request_details?.client_id,
          selectedTicketBase?.request_details?.client,
          selectedTicketBase?.request?.client
        );
        if (clientId) {
          equipmentData = await fetchInstalledEquipment(clientId);
        }
        quotationData = normalizeQuotationRecords(await fetchQuotationRecord(ticketId));
      } catch (e) {
        console.error('Failed to fetch installed equipment or quotation', e);
      }

      setDocumentPrefill(prefill);
      setQuotationRecords(quotationData);
      setInstalledEquipmentRecords(equipmentData);
      const latestReport = prefill?.latest_field_service_report || getLatestFieldServiceReport(prefill?.field_service_reports);
      setSelectedFieldServiceReportId(latestReport?.id ? String(latestReport.id) : 'latest');
      setForm(
        buildFormFromTicket(
          selectedTicket,
          equipmentData,
          latestReport
        )
      );
      setCommissioningForm(buildCommissioningFormFromTicket(selectedTicket, commissioningSource));
      setCommissioningBaseline(buildCommissioningFormFromTicket(selectedTicket, commissioningSource));
      setQuotationForm(buildQuotationFormFromTicket(selectedTicket, quotationData[0] || null));
      setTdsForm(buildTdsFormFromTicket(selectedTicket, prefill?.technical_data_sheet));
      setInstallationContractForm(buildInstallationContractFormFromTicket(selectedTicket, quotationData));
      setTurnoverForm(buildTurnoverFormFromTicket(selectedTicket, commissioningSource, prefill?.turnover_acceptance || null));
      setPrefillError('');
    } catch (error) {
      setPrefillError(error.message || 'Unable to load document prefill data.');
      setDocumentPrefill(null);
      setQuotationRecords([]);
      setInstalledEquipmentRecords([]);
      setForm(buildFormFromTicket(selectedTicketBase, []));
      setCommissioningForm(buildCommissioningFormFromTicket(selectedTicketBase));
      setCommissioningBaseline(buildCommissioningFormFromTicket(selectedTicketBase));
      setQuotationForm(buildQuotationFormFromTicket(selectedTicketBase));
      setTdsForm(buildTdsFormFromTicket(selectedTicketBase));
      setInstallationContractForm(buildInstallationContractFormFromTicket(selectedTicketBase));
      setTurnoverForm(buildTurnoverFormFromTicket(selectedTicketBase));
    } finally {
      setPrefillLoading(false);
    }
  };

  const handleTicketSelection = async (ticketId, ticketList = tickets) => {
    setSelectedTicketId(ticketId);
    setCommissioningMessage('');
    setTurnoverMessage('');
    setDocumentDraftMessage('');
    setPrefillError('');

    if (!ticketId) {
      setForm(createInitialForm());
      setCommissioningForm(createInitialCommissioningForm());
      setCommissioningBaseline(createInitialCommissioningForm());
      setQuotationForm(createInitialQuotationForm());
      setTdsForm(createInitialTdsForm());
      setInstallationContractForm(createInitialInstallationContractForm());
      setTurnoverForm(createInitialTurnoverForm());
      setDocumentPrefill(null);
      setInstalledEquipmentRecords([]);
      setSelectedFieldServiceReportId('latest');
      setPrefillLoading(false);
      return;
    }

    const selectedTicketBase = ticketList.find((ticket) => String(ticket.id) === String(ticketId));
    if (!selectedTicketBase) {
      return;
    }

    await refreshTicketPrefill(ticketId, ticketList);
  };

  const applySavedDraft = (templateId, data) => {
    if (!data) {
      return;
    }

    if (templateId === 'field_service_report') {
      setForm(hydrateFieldServiceReportForm(data));
      return;
    }
    if (templateId === 'quotation_proposal') {
      setQuotationForm(hydrateQuotationForm(data));
      return;
    }
    if (templateId === 'technical_data_sheet') {
      setTdsForm(hydrateTdsForm(data));
      return;
    }
    if (templateId === 'installation_contract') {
      setInstallationContractForm(hydrateInstallationContractForm(data));
      return;
    }
    if (templateId === 'turnover_acceptance') {
      setTurnoverForm(hydrateTurnoverForm(data));
    }
  };

  const getActiveDraftPayload = () => {
    if (activeTemplate === 'field_service_report') {
      return form;
    }
    if (activeTemplate === 'quotation_proposal') {
      return quotationForm;
    }
    if (activeTemplate === 'technical_data_sheet') {
      return tdsForm;
    }
    if (activeTemplate === 'installation_contract') {
      return installationContractForm;
    }
    if (activeTemplate === 'turnover_acceptance') {
      return turnoverForm;
    }
    return null;
  };

  useEffect(() => {
    let isMounted = true;

    const loadTickets = async () => {
      setTicketsLoading(true);
      setTicketsError('');

      try {
        const data = await searchServiceTickets();
        if (!isMounted) return;
        
        let initialTickets = [...data];
        const ticketParam = searchParams.get('ticket') || searchParams.get('ticketId');
        
        if (ticketParam) {
          const found = data.find(t => String(t.id) === String(ticketParam));
          if (!found) {
             const specificData = await searchServiceTickets(ticketParam);
             initialTickets = [...data, ...specificData];
          }
        }
        
        setTickets(initialTickets);
        
        if (ticketParam) {
          handleTicketSelection(ticketParam, initialTickets);
        }
      } catch (error) {
        if (!isMounted) return;
        setTicketsError(error.message || 'Unable to load tickets.');
      } finally {
        if (isMounted) {
          setTicketsLoading(false);
        }
      }
    };

    loadTickets();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTicketId || activeTemplate === 'commissioning_checklist') {
      setDocumentDraftLoading(false);
      setDocumentDraftMessage('');
      return;
    }

    let isMounted = true;

    const loadSavedDraft = async () => {
      setDocumentDraftLoading(true);
      setDocumentDraftMessage('');

      try {
        const existing = await fetchDocumentDraft(selectedTicketId, activeTemplate);
        if (!isMounted) return;

        if (existing?.data_json) {
          applySavedDraft(activeTemplate, existing.data_json);
          setDocumentDraftMessage('Loaded saved draft for this template.');
        }
      } catch (error) {
        if (!isMounted) return;
        setDocumentDraftMessage(error.message || 'Unable to load the saved document draft.');
      } finally {
        if (isMounted) {
          setDocumentDraftLoading(false);
        }
      }
    };

    loadSavedDraft();

    return () => {
      isMounted = false;
    };
  }, [activeTemplate, selectedTicketId]);

  useEffect(() => {
    if (activeTemplate !== 'commissioning_checklist' || !selectedTicketId) {
      return;
    }

    let isMounted = true;

    const loadChecklist = async () => {
      const selectedTicketBase = tickets.find((ticket) => String(ticket.id) === String(selectedTicketId));
      const selectedTicket = buildTicketContextFromPrefill(selectedTicketBase, documentPrefill);
      if (!selectedTicket) {
        return;
      }

      setCommissioningLoading(true);
      setCommissioningMessage('');

      try {
        const existing = await fetchSolarCommissioningChecklist(selectedTicketId);
        if (!isMounted) return;
        const nextForm = buildCommissioningFormFromTicket(selectedTicket, existing);
        setCommissioningForm(nextForm);
        setCommissioningBaseline(nextForm);
      } catch (error) {
        if (!isMounted) return;
        const nextForm = buildCommissioningFormFromTicket(selectedTicket);
        setCommissioningForm(nextForm);
        setCommissioningBaseline(nextForm);
        setCommissioningMessage(error.message || 'Unable to load the commissioning checklist.');
      } finally {
        if (isMounted) {
          setCommissioningLoading(false);
        }
      }
    };

    loadChecklist();

    return () => {
      isMounted = false;
    };
  }, [activeTemplate, selectedTicketId, tickets, documentPrefill]);

  useEffect(() => {
    if (activeTemplate !== 'field_service_report' || !selectedTicketId) {
      return;
    }

    const selectedTicketBase = tickets.find((ticket) => String(ticket.id) === String(selectedTicketId));
    if (!selectedTicketBase) {
      return;
    }

    const selectedTicket = buildTicketContextFromPrefill(selectedTicketBase, documentPrefill);
    const selectedReport = getFieldServiceReportById(
      documentPrefill?.field_service_reports,
      selectedFieldServiceReportId,
    );

    setForm(buildFormFromTicket(selectedTicket, installedEquipmentRecords, selectedReport));
  }, [activeTemplate, selectedFieldServiceReportId, selectedTicketId, tickets, documentPrefill, installedEquipmentRecords]);

  useEffect(() => {
    if (activeTemplate !== 'turnover_acceptance' || !selectedTicketId) {
      return;
    }

    let isMounted = true;

    const loadTurnoverData = async () => {
      const selectedTicketBase = tickets.find((ticket) => String(ticket.id) === String(selectedTicketId));
      const selectedTicket = buildTicketContextFromPrefill(selectedTicketBase, documentPrefill);
      if (!selectedTicket) {
        return;
      }

      try {
        const existingChecklist = await fetchSolarCommissioningChecklist(selectedTicketId);
        if (!isMounted) return;
        setTurnoverForm(buildTurnoverFormFromTicket(selectedTicket, existingChecklist, documentPrefill?.turnover_acceptance || null));
      } catch {
        if (!isMounted) return;
        setTurnoverForm(buildTurnoverFormFromTicket(selectedTicket, null, documentPrefill?.turnover_acceptance || null));
      }
    };

    loadTurnoverData();

    return () => {
      isMounted = false;
    };
  }, [activeTemplate, selectedTicketId, tickets, documentPrefill]);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateRow = (rowId, key, value) => {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    }));
  };

  const addRow = () => {
    setForm((current) => ({
      ...current,
      rows: [...current.rows, createEmptyRow(current.rows.length + 1)]
    }));
  };

  const removeRow = (rowId) => {
    setForm((current) => {
      if (current.rows.length === 1) {
        return current;
      }

      return {
        ...current,
        rows: current.rows.filter((row) => row.id !== rowId)
      };
    });
  };

  const resetForm = () => {
    const selectedTicketBase = tickets.find((ticket) => String(ticket.id) === String(selectedTicketId));
    const selectedTicket = buildTicketContextFromPrefill(selectedTicketBase, documentPrefill);
    if (activeTemplate === 'commissioning_checklist') {
      const nextForm = selectedTicket
        ? buildCommissioningFormFromTicket(
            selectedTicket,
            commissioningBaseline?.id ? commissioningBaseline : documentPrefill?.solar_commissioning || null
          )
        : createInitialCommissioningForm();
      setCommissioningForm(nextForm);
      setCommissioningMessage('');
      return;
    }
    if (activeTemplate === 'quotation_proposal') {
      setQuotationForm(
        selectedTicket ? buildQuotationFormFromTicket(selectedTicket, quotationRecords[0] || null) : createInitialQuotationForm()
      );
      return;
    }
    if (activeTemplate === 'technical_data_sheet') {
      setTdsForm(selectedTicket ? buildTdsFormFromTicket(selectedTicket) : createInitialTdsForm());
      return;
    }
    if (activeTemplate === 'installation_contract') {
      setInstallationContractForm(
        selectedTicket ? buildInstallationContractFormFromTicket(selectedTicket, quotationRecords) : createInitialInstallationContractForm()
      );
      return;
    }
    if (activeTemplate === 'turnover_acceptance') {
      setTurnoverForm(documentPrefill?.turnover_acceptance
          ? buildTurnoverFormFromTicket(selectedTicket, documentPrefill?.solar_commissioning || null, documentPrefill.turnover_acceptance)
          : buildTurnoverFormFromTicket(selectedTicket, documentPrefill?.solar_commissioning || null)
        );
      return;
    }
    setForm(selectedTicket ? buildFormFromTicket(selectedTicket) : createInitialForm());
  };

  const updateCommissioningField = (key, value) => {
    setCommissioningForm((current) => ({ ...current, [key]: value }));
  };

  const updateCommissioningItem = (itemNo, key, value) => {
    setCommissioningForm((current) => ({
      ...current,
      checklist_items_json: current.checklist_items_json.map((item) =>
        item.item_no === itemNo ? { ...item, [key]: value } : item
      )
    }));
  };

  const updateCommissioningReading = (group, key, value) => {
    setCommissioningForm((current) => ({
      ...current,
      readings_json: {
        ...current.readings_json,
        [group]: {
          ...(current.readings_json?.[group] || {}),
          [key]: value
        }
      }
    }));
  };

  const updateQuotationField = (key, value) => {
    setQuotationForm((current) => ({ ...current, [key]: value }));
  };

  const updateTdsField = (key, value) => {
    setTdsForm((current) => ({ ...current, [key]: value }));
  };

  const updateTdsLoadRow = (rowId, key, value) => {
    setTdsForm((current) => ({
      ...current,
      loadRows: current.loadRows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    }));
  };

  const updateTdsPurposeRow = (rowId, key, value) => {
    setTdsForm((current) => ({
      ...current,
      purposeRows: current.purposeRows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    }));
  };

  const updateInstallationContractField = (key, value) => {
    setInstallationContractForm((current) => ({ ...current, [key]: value }));
  };

  const updateQuotationTableRow = (tableKey, rowId, key, value) => {
    setQuotationForm((current) => ({
      ...current,
      [tableKey]: current[tableKey].map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    }));
  };

  const addQuotationRow = (type) => {
    const tableKey = type === 'price' ? 'priceRows' : type === 'bom' ? 'bomRows' : 'warrantyRows';
    setQuotationForm((current) => ({
      ...current,
      [tableKey]: [...current[tableKey], createQuotationRow(type, current[tableKey].length + 1)]
    }));
  };

  const removeQuotationRow = (tableKey, rowId) => {
    setQuotationForm((current) => {
      if (current[tableKey].length === 1) {
        return current;
      }

      return {
        ...current,
        [tableKey]: current[tableKey].filter((row) => row.id !== rowId)
      };
    });
  };

  const updateTurnoverField = (key, value) => {
    setTurnoverForm((current) => ({ ...current, [key]: value }));
  };

  const updateTurnoverTableRow = (tableKey, rowId, key, value) => {
    setTurnoverForm((current) => ({
      ...current,
      [tableKey]: current[tableKey].map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    }));
  };

  const addTurnoverRow = (type) => {
    const tableKey = type === 'components'
      ? 'componentsRows'
      : type === 'performance'
        ? 'performanceRows'
        : type === 'commissioning'
          ? 'commissioningRows'
          : 'documentsRows';

    setTurnoverForm((current) => ({
      ...current,
      [tableKey]: [...current[tableKey], createTurnoverRow(type, current[tableKey].length + 1)]
    }));
  };

  const removeTurnoverRow = (tableKey, rowId) => {
    setTurnoverForm((current) => {
      if (current[tableKey].length === 1) {
        return current;
      }

      return {
        ...current,
        [tableKey]: current[tableKey].filter((row) => row.id !== rowId)
      };
    });
  };

  const saveCommissioningDraft = async () => {
    if (!selectedTicketId) {
      setCommissioningMessage('Choose a ticket first so the commissioning checklist can connect to a real service ticket.');
      return;
    }

    setCommissioningSaving(true);
    setCommissioningMessage('');

    try {
      const payload = {
        ...commissioningForm,
        ticket: Number(selectedTicketId),
      };
      const saved = await saveSolarCommissioningChecklist(payload);
      const selectedTicket = tickets.find((ticket) => String(ticket.id) === String(selectedTicketId));
      const nextForm = selectedTicket
        ? buildCommissioningFormFromTicket(selectedTicket, saved)
        : { ...commissioningForm, id: saved.id };
      setCommissioningForm(nextForm);
      setCommissioningBaseline(nextForm);
      setCommissioningMessage('Solar commissioning checklist saved.');
    } catch (error) {
      setCommissioningMessage(error.message || 'Unable to save the commissioning checklist.');
    } finally {
      setCommissioningSaving(false);
    }
  };

  const saveTurnoverDraft = async (finalize = false) => {
    if (!selectedTicketId) {
      setTurnoverMessage('Choose a ticket first so this form can connect to a real service ticket.');
      return;
    }

    setTurnoverSaving(true);
    setTurnoverMessage('');

    try {
      // 1. Save Document Draft
      const payloadDraft = {
        document_type: 'turnover_acceptance',
        status: finalize ? 'finalized' : 'draft',
        data_json: turnoverForm,
        tables_json: {
          componentsRows: turnoverForm.componentsRows,
          performanceRows: turnoverForm.performanceRows,
          commissioningRows: turnoverForm.commissioningRows,
        }
      };
      const documentDraft = await saveDocumentDraft(selectedTicketId, payloadDraft);

      // 2. Save Turnover Acceptance Model
      const finalTurnoverDate = turnoverForm.dateOfTurnover || null;
      const payloadTurnover = {
        id: turnoverForm.id,
        ticket: Number(selectedTicketId),
        turnover_date: finalTurnoverDate,
        accepted_by_client_name: turnoverForm.clientName || '',
        accepted_by_client_contact: turnoverForm.clientContactNumber || '',
        warranty_start_date: turnoverForm.warrantyStartDate || finalTurnoverDate,
      };

      if (documentDraft && documentDraft.id) {
        payloadTurnover.generated_document = documentDraft.id;
      }

      let saved = await saveTurnoverAcceptance(payloadTurnover);
      const turnoverId = saved?.id || turnoverForm.id;
      if (finalize) {
        if (!turnoverId) {
          throw new Error('The turnover record was saved without an ID and cannot be finalized.');
        }
        const finalized = await finalizeTurnoverAcceptance(turnoverId, payloadTurnover);
        saved = { ...saved, ...finalized, id: turnoverId, status: 'finalized' };
      }

      const selectedTicket = tickets.find((ticket) => String(ticket.id) === String(selectedTicketId));
      const nextForm = selectedTicket
        ? buildTurnoverFormFromTicket(selectedTicket, null, { ...payloadTurnover, id: saved.id || turnoverForm.id, status: finalize ? 'finalized' : 'draft' })
        : { ...turnoverForm, id: saved.id || turnoverForm.id, status: finalize ? 'finalized' : 'draft' };
      setTurnoverForm(nextForm);
      setTurnoverMessage(finalize ? 'Turnover Finalized and Ticket updated!' : 'Turnover draft saved.');
    } catch (error) {
      setTurnoverMessage(error.message || 'Unable to save turnover acceptance.');
    } finally {
      setTurnoverSaving(false);
    }
  };

  const saveActiveDocumentDraft = async () => {
    if (!selectedTicketId) {
      setDocumentDraftMessage('Choose a ticket first so this template can save against a real service ticket.');
      return;
    }

    const data = getActiveDraftPayload();
    if (!data) {
      setDocumentDraftMessage('This template does not use the shared document draft saver.');
      return;
    }

    setDocumentDraftSaving(true);
    setDocumentDraftMessage('');

    try {
      await saveDocumentDraft(selectedTicketId, {
        document_type: activeTemplate,
        title: activeTemplateLabel,
        status: 'draft',
        data_json: data,
        source_snapshot_json: {
          ticket: documentPrefill?.ticket || {},
          client: documentPrefill?.client || {},
          service_request: documentPrefill?.service_request || {},
          service_location: documentPrefill?.service_location || {},
          document_defaults: documentPrefill?.document_defaults || {}
        }
      });
      setDocumentDraftMessage('Document draft saved successfully.');
    } catch (error) {
      setDocumentDraftMessage(error.message || 'Unable to save the document draft.');
    } finally {
      setDocumentDraftSaving(false);
    }
  };

  const [quotationSaving, setQuotationSaving] = useState(false);

  const handleSaveQuotation = async () => {
    if (!selectedTicketId) {
      setDocumentDraftMessage('Choose a ticket first to save the quotation data.');
      return;
    }

    setQuotationSaving(true);
    setDocumentDraftMessage('');

    try {
      const selectedTicket = tickets.find((ticket) => String(ticket.id) === String(selectedTicketId));
      const clientId = selectedTicket?.request?.client || selectedTicket?.client;

      if (!clientId) {
        throw new Error('No client found for this ticket.');
      }

      const totalAmountRow = quotationForm.priceRows?.[0] || {};
      const totalAmount = totalAmountRow.totalPrice || '';
      
      const payload = {
        ticket: selectedTicketId,
        client: clientId,
        total_amount: totalAmount,
        payment_terms: quotationForm.paymentTerms,
        bill_of_materials: quotationForm.bomRows || [],
        status: 'Sent'
      };

      await saveQuotationRecord(payload);
      setDocumentDraftMessage('Quotation data saved successfully!');
    } catch (error) {
      setDocumentDraftMessage(error.message || 'Unable to save quotation data.');
    } finally {
      setQuotationSaving(false);
    }
  };

  const [contractSaving, setContractSaving] = useState(false);

  const handleSaveContract = async () => {
    if (!selectedTicketId) {
      setDocumentDraftMessage('Choose a ticket first to save the contract data.');
      return;
    }

    setContractSaving(true);
    setDocumentDraftMessage('');

    try {
      const payload = {
        ticket: selectedTicketId,
        scope_of_work: installationContractForm.scopeNotes || '',
        start_date: installationContractForm.startDate || null,
        estimated_completion_days: parseInt(installationContractForm.estimatedCompletionTime) || null,
        total_contract_amount: installationContractForm.totalContractAmount || null,
        payment_terms_upfront: installationContractForm.upfrontPayment || null,
        payment_terms_completion: installationContractForm.completionPayment || null,
        payment_terms_final: installationContractForm.finalPayment || null,
        warranty_period: installationContractForm.warrantyPeriod || '',
        status: 'draft'
      };

      const contractId = installationContractForm.contractId;
      await saveInstallationContract(payload, contractId);
      setDocumentDraftMessage('Installation contract data saved successfully!');
    } catch (error) {
      setDocumentDraftMessage(error.message || 'Unable to save contract data.');
    } finally {
      setContractSaving(false);
    }
  };

  const [equipmentRegistering, setEquipmentRegistering] = useState(false);

  const handleRegisterEquipment = async () => {
    if (!selectedTicketId) {
      setDocumentDraftMessage('Choose a ticket first to register equipment.');
      return;
    }

    setEquipmentRegistering(true);
    setDocumentDraftMessage('');

    try {
      const selectedTicket = tickets.find((ticket) => String(ticket.id) === String(selectedTicketId));
      const clientId = selectedTicket?.request?.client || selectedTicket?.client;

      if (!clientId) {
        throw new Error('No client found for this ticket.');
      }

      const panelCountRow = findRowByLabel(turnoverForm.componentsRows, 'Number of Solar Panels');
      const inverterCountRow = findRowByLabel(turnoverForm.componentsRows, 'Number of Inverters');
      
      const payloadPromises = [];
      const alreadyRegistered = (equipmentType) => installedEquipmentRecords.some((item) =>
        String(item?.ticket?.id || item?.ticket) === String(selectedTicketId)
        && String(item?.equipment_type || '').toLowerCase() === equipmentType.toLowerCase()
      );

      // Register Panels
      if (panelCountRow && pickFirstValue(panelCountRow.valueA, panelCountRow.valueB) && !alreadyRegistered('Solar Panel')) {
        payloadPromises.push(registerInstalledEquipment({
          ticket: selectedTicketId,
          client: clientId,
          equipment_type: 'Solar Panel',
          brand_model: 'Panel Details Stored on Ticket',
          capacity: pickFirstValue(panelCountRow.valueA, panelCountRow.valueB)
        }));
      }

      // Register Inverters
      if (inverterCountRow && pickFirstValue(inverterCountRow.valueA, inverterCountRow.valueB) && !alreadyRegistered('Inverter')) {
        payloadPromises.push(registerInstalledEquipment({
          ticket: selectedTicketId,
          client: clientId,
          equipment_type: 'Inverter',
          brand_model: 'Inverter Details Stored on Ticket',
          serial_number: inverterCountRow.valueB,
          capacity: inverterCountRow.valueA
        }));
      }

      if (payloadPromises.length === 0) {
        setDocumentDraftMessage('No new panels or inverters found. Equipment for this ticket may already be registered.');
        return;
      }

      const registered = await Promise.all(payloadPromises);
      setInstalledEquipmentRecords((current) => [...current, ...registered]);
      setDocumentDraftMessage('Equipment registered successfully!');
    } catch (error) {
      setDocumentDraftMessage(error.message || 'Unable to register equipment.');
    } finally {
      setEquipmentRegistering(false);
    }
  };

  const [projectSpecsSaving, setProjectSpecsSaving] = useState(false);

  const saveProjectSpecsToTicket = async () => {
    if (!selectedTicketId) {
      setDocumentDraftMessage('Choose a ticket first to save project specifications.');
      return;
    }

    setProjectSpecsSaving(true);
    setDocumentDraftMessage('');

    try {
      const panelCountRow = findRowByLabel(turnoverForm.componentsRows, 'Number of Solar Panels');
      const inverterCountRow = findRowByLabel(turnoverForm.componentsRows, 'Number of Inverters');
      const mountingRow = findRowByLabel(turnoverForm.componentsRows, 'Mounting Structure');
      const expectedEnergyRow = turnoverForm.performanceRows.find((row) =>
        String(row?.label || '').toLowerCase().includes('expected energy production')
      );
      const inverterCommissioningRow = findRowByLabel(turnoverForm.commissioningRows, 'Inverter Commissioning');
      const performanceTestRow = findRowByLabel(turnoverForm.commissioningRows, 'System Performance Test');
      const voltageMeasurementRow = findRowByLabel(turnoverForm.commissioningRows, 'Voltage and Current Measurements (per string)');
      const totalAmountRow = quotationForm.priceRows.find((row) => hasValue(row?.totalPrice));

      const projectDetails = compactProjectDetails({
        system_capacity_kwp: pickFirstValue(turnoverForm.systemCapacity, form.systemCapacity, installationContractForm.systemCapacity),
        number_of_solar_panels: pickFirstValue(panelCountRow?.valueA, panelCountRow?.valueB),
        number_of_inverters: pickFirstValue(inverterCountRow?.valueA, inverterCountRow?.valueB),
        mounting_structure: pickFirstValue(mountingRow?.valueA, mountingRow?.valueB),
        expected_daily_energy_production: expectedEnergyRow?.daily || '',
        expected_monthly_energy_production: expectedEnergyRow?.monthly || '',
        expected_annual_energy_production: expectedEnergyRow?.annual || '',
        documentation_provided_status: turnoverForm.documentsRows,
        inverter_commissioning: pickFirstValue(inverterCommissioningRow?.results, inverterCommissioningRow?.values),
        system_performance_test: pickFirstValue(performanceTestRow?.results, performanceTestRow?.values),
        voltage_current_measurements: pickFirstValue(voltageMeasurementRow?.results, voltageMeasurementRow?.values),
        total_amount: totalAmountRow?.totalPrice || '',
        bill_of_materials: quotationForm.bomRows,
        quotation_price_rows: quotationForm.priceRows,
        quotation_brand_rows: quotationForm.brandRows,
        estimated_completion_time: installationContractForm.estimatedCompletionTime || '',
        total_contract_amount: installationContractForm.totalContractAmount || '',
        payment_schedule: formatPaymentSchedule(installationContractForm),
        premise_type: tdsForm.sitePremisePlan || '',
        premise_category: tdsForm.sitePremiseCategory || '',
        ownership_type: tdsForm.ownershipStatus || '',
        primary_electric_supply: tdsForm.primaryElectricSupply || '',
        ac_phase_power_supply: tdsForm.acSupplyType || '',
        solar_install_location: tdsForm.solarInstallLocation || '',
        rooftop_type: tdsForm.rooftopType || '',
        average_monthly_electricity_bill: tdsForm.averageMonthlyBill || '',
        battery_preference: tdsForm.batteryPreference || '',
        load_schedule: tdsForm.loadRows,
      });

      if (!Object.keys(projectDetails).length) {
        setDocumentDraftMessage('No project specifications are filled in yet for this ticket.');
        return;
      }

      await updateProjectDetails(selectedTicketId, projectDetails);

      await refreshTicketPrefill(selectedTicketId, tickets);

      setDocumentDraftMessage('Project specifications permanently saved to ticket.');
    } catch (error) {
      setDocumentDraftMessage(error.message || 'Unable to save project specifications.');
    } finally {
      setProjectSpecsSaving(false);
    }
  };

  const printCurrentDocument = () => {
    const printable = document.getElementById('afn-printable-document');
    if (!printable) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const printableClone = printable.cloneNode(true);
    printableClone.querySelectorAll('input, textarea, select').forEach((field) => {
      const guideText = field.dataset?.guidePrint || field.getAttribute('placeholder') || '';
      const text = field.value || guideText;
      const replacement = document.createElement('div');
      replacement.className = 'print-value';
      replacement.textContent = text;
      field.replaceWith(replacement);
    });
    const markup = printableClone.innerHTML;
    const baseHref = `${window.location.origin}/`;
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>AFN Document</title>
          <base href="${baseHref}" />
          <style>${printCss}</style>
        </head>
        <body>${markup}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      window.setTimeout(() => {
        printWindow.print();
      }, 250);
    };
  };

  return (
    <Layout title="Documents" subtitle="Print-ready AFN templates.">
      <style>{printCss}</style>
      <div className="space-y-4">
        {!canManageDocuments && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            You have view-only document access. You can inspect and print records, but saving and finalizing require the Manage project documents capability.
          </div>
        )}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FiFileText size={16} />
            Templates
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {TEMPLATE_OPTIONS.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setActiveTemplate(template.id)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  activeTemplate === template.id
                    ? 'border-brand-500 bg-brand-50 text-brand-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {template.label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Ticket</span>
                  <div className="relative" ref={dropdownRef}>
                    <div 
                      className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 cursor-text"
                      onClick={() => setIsDropdownOpen(true)}
                    >
                      <input
                        type="text"
                        placeholder="Search ticket by ID, client, or service..."
                        value={isDropdownOpen ? ticketSearch : (selectedTicketId ? (() => {
                          const t = tickets.find(t => String(t.id) === String(selectedTicketId));
                          return t ? `TKT-${t.id} | ${t.clientFullname || t.client}` : `TKT-${selectedTicketId}`;
                        })() : '')}
                        onChange={(e) => setTicketSearch(e.target.value)}
                        onFocus={() => setIsDropdownOpen(true)}
                        className="w-full bg-transparent outline-none"
                        disabled={ticketsLoading && !isDropdownOpen}
                      />
                      {selectedTicketId && !isDropdownOpen ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleTicketSelection(''); setTicketSearch(''); }} className="text-slate-400 hover:text-rose-500">
                          <FiX size={16} />
                        </button>
                      ) : (
                        <FiChevronDown className="text-slate-400" size={16} />
                      )}
                    </div>
                    {isDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                        {ticketsLoading ? (
                          <div className="px-3 py-2 text-sm text-slate-500">Searching...</div>
                        ) : tickets.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-500">No tickets found.</div>
                        ) : (
                          tickets.map((ticket) => (
                            <button
                              key={ticket.id}
                              type="button"
                              onClick={() => {
                                handleTicketSelection(ticket.id);
                                setIsDropdownOpen(false);
                                setTicketSearch('');
                              }}
                              className={`w-full text-left px-3 py-2 text-sm transition ${
                                String(ticket.id) === String(selectedTicketId)
                                  ? 'bg-brand-50 text-brand-800 font-medium'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="font-medium text-slate-900">TKT-{ticket.id}</div>
                              <div className="text-xs text-slate-500 truncate">{ticket.clientFullname || ticket.client} | {ticket.service}</div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {ticketsError ? (
                    <p className="mt-1 text-xs text-rose-600">{ticketsError}</p>
                  ) : prefillError ? (
                    <p className="mt-1 text-xs text-rose-600">{prefillError}</p>
                  ) : prefillLoading ? (
                    <p className="mt-1 text-xs text-slate-500">Loading shared document prefill data...</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      Selecting a ticket fills the shared document fields automatically.
                    </p>
                  )}
                </label>
                {currentMissingFields.length ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <p className="font-semibold uppercase tracking-[0.08em]">Missing Fields</p>
                    <p className="mt-1">
                      {currentMissingFields.join(', ')}
                    </p>
                  </div>
                ) : null}
                {selectedTicketId ? (
                  <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    <p className="font-semibold uppercase tracking-[0.08em]">Document data sources</p>
                    <p><strong>Autofilled:</strong> client, request, ticket, location, technician, inspection, equipment, warranty, and completion records.</p>
                    <p><strong>Previously saved:</strong> this ticket&apos;s document draft and structured document records.</p>
                    <p><strong>Template defaults:</strong> business, warranty, legal, brand, and commercial wording must be reviewed before printing.</p>
                    <p><strong>Manual input:</strong> measurements, signatures, pricing, and externally agreed payment terms.</p>
                  </div>
                ) : null}
                {['quotation_proposal', 'installation_contract'].includes(activeTemplate) ? (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900" role="note">
                    Commercial amounts and payment terms are entered manually for document generation. Payments are processed and verified outside this system.
                  </div>
                ) : null}
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Paper Size</span>
                  <select
                    value={paperSize}
                    onChange={(event) => setPaperSize(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    {PAPER_SIZE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {activeTemplate === 'field_service_report' && (documentPrefill?.field_service_reports?.length || 0) > 0 ? (
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Service Report Source</span>
                    <select
                      value={selectedFieldServiceReportId}
                      onChange={(event) => setSelectedFieldServiceReportId(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="latest">Latest saved report</option>
                      {documentPrefill.field_service_reports.map((report, index) => (
                        <option key={report.id || index} value={String(report.id)}>
                          {`Report ${index + 1}${report?.created_at ? ` - ${formatTicketDateForInput(report.created_at)}` : ''}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {activeTemplate === 'commissioning_checklist' ? (
                  <>
                    <TextField label="Site Name" value={commissioningForm.site_name} onChange={(value) => updateCommissioningField('site_name', value)} />
                    <TextField label="System Designation" value={commissioningForm.system_designation} onChange={(value) => updateCommissioningField('system_designation', value)} />
                    <TextField label="Inverter Type" value={commissioningForm.inverter_type} onChange={(value) => updateCommissioningField('inverter_type', value)} />
                    <TextField label="Inverter Serial Number" value={commissioningForm.inverter_serial_number} onChange={(value) => updateCommissioningField('inverter_serial_number', value)} />
                    <TextField label="Commissioned Date" type="date" value={commissioningForm.commissioned_date} onChange={(value) => updateCommissioningField('commissioned_date', value)} />
                    <TextField label="Irradiance" value={commissioningForm.irradiance} onChange={(value) => updateCommissioningField('irradiance', value)} />
                    <TextField label="Ambient Temperature" value={commissioningForm.ambient_temperature} onChange={(value) => updateCommissioningField('ambient_temperature', value)} />
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Checklist Status</span>
                      <select
                        value={commissioningForm.status}
                        onChange={(event) => updateCommissioningField('status', event.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      >
                        <option value="draft">Draft</option>
                        <option value="completed">Completed</option>
                        <option value="finalized">Finalized</option>
                      </select>
                    </label>
                    {commissioningMessage ? (
                      <p className={`text-xs ${commissioningMessage.includes('saved') ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {commissioningMessage}
                      </p>
                    ) : null}
                    {canManageDocuments && <button
                      type="button"
                      onClick={saveCommissioningDraft}
                      disabled={commissioningSaving || commissioningLoading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60"
                    >
                      <FiSave size={15} />
                      {commissioningSaving ? 'Saving...' : commissioningLoading ? 'Loading...' : 'Save Checklist'}
                    </button>}
                  </>
                ) : activeTemplate === 'quotation_proposal' ? (
                  <>
                    <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-3">
                      <p className="text-sm font-semibold text-slate-900">Company-style quotation editing</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        This quotation follows the company document layout, so the main editing surface is the printable preview on
                        the right. Update the header fields, terms, BOM, and warranty rows directly in the document where they appear.
                      </p>
                    </div>
                    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <p><strong>Autofill source:</strong> selected Service Ticket, quotation record, and saved project specifications.</p>
                      <p><strong>Best workflow:</strong> review the company header, then edit the proposal terms and tables inline in the preview.</p>
                      <p><strong>Keep aligned with office format:</strong> use concise text so the quotation continues to look like the company-issued version.</p>
                    </div>
                  </>
                ) : activeTemplate === 'technical_data_sheet' ? (
                  <>
                    <TextField label="Last Name" value={tdsForm.lastName} onChange={(value) => updateTdsField('lastName', value)} />
                    <TextField label="First Name" value={tdsForm.firstName} onChange={(value) => updateTdsField('firstName', value)} />
                    <TextField label="Middle Name" value={tdsForm.middleName} onChange={(value) => updateTdsField('middleName', value)} />
                    <TextField label="Mobile Number" value={tdsForm.mobileNumber} onChange={(value) => updateTdsField('mobileNumber', value)} />
                    <TextField label="Email Address" value={tdsForm.emailAddress} onChange={(value) => updateTdsField('emailAddress', value)} />
                    <TextField label="Complete Address" value={tdsForm.completeAddress} onChange={(value) => updateTdsField('completeAddress', value)} />
                    <TextField label="Primary Electric Supply" value={tdsForm.primaryElectricSupply} onChange={(value) => updateTdsField('primaryElectricSupply', value)} />
                    <TextField label="AC Supply Type" value={tdsForm.acSupplyType} onChange={(value) => updateTdsField('acSupplyType', value)} />
                    <TextField label="Average Monthly Bill" value={tdsForm.averageMonthlyBill} onChange={(value) => updateTdsField('averageMonthlyBill', value)} />
                    <TextField label="Battery Preference" value={tdsForm.batteryPreference} onChange={(value) => updateTdsField('batteryPreference', value)} />
                    <TextField label="Client Confirm Name" value={tdsForm.clientConfirmationName} onChange={(value) => updateTdsField('clientConfirmationName', value)} />
                    <TextField label="Confirmation Date" type="date" value={tdsForm.confirmationDate} onChange={(value) => updateTdsField('confirmationDate', value)} />
                    <p className="text-xs text-slate-500">
                      Client name and confirmation date auto-fill from the selected ticket. The rest of the TDS stays editable on the printable sheet.
                    </p>
                  </>
                ) : activeTemplate === 'installation_contract' ? (
                  <>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                      <p className="text-sm font-semibold text-slate-900">Document-first contract editing</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        This template is meant to read like a real contract, not a left-side form tree. Edit the autofilled values
                        directly inside the contract preview on the right, then save from here when you are done.
                      </p>
                    </div>
                    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <p><strong>Autofill source:</strong> selected Service Ticket, quotation, project specs, and saved contract data.</p>
                      <p><strong>Best workflow:</strong> review the paragraph text on the preview, click inline fields that need adjustment, then save the contract.</p>
                      <p><strong>What stays manual:</strong> signatures and any intentionally case-specific legal wording.</p>
                    </div>
                  </>
                ) : activeTemplate === 'turnover_acceptance' ? (
                  <>
                    <TextField label="Project Installation Of" value={turnoverForm.projectInstallationOf} onChange={(value) => updateTurnoverField('projectInstallationOf', value)} />
                    <TextField label="Location Address" value={turnoverForm.locationAddress} onChange={(value) => updateTurnoverField('locationAddress', value)} />
                    <TextField label="Date of Completion" type="date" value={turnoverForm.dateOfCompletion} onChange={(value) => updateTurnoverField('dateOfCompletion', value)} />
                    <TextField label="Date of Turnover" type="date" value={turnoverForm.dateOfTurnover} onChange={(value) => updateTurnoverField('dateOfTurnover', value)} />
                    <TextField label="Client Name" value={turnoverForm.clientName} onChange={(value) => updateTurnoverField('clientName', value)} />
                    <TextField label="Client Contact Number" value={turnoverForm.clientContactNumber} onChange={(value) => updateTurnoverField('clientContactNumber', value)} />
                    <TextField label="System Capacity" value={turnoverForm.systemCapacity} onChange={(value) => updateTurnoverField('systemCapacity', value)} />
                    <TextField label="Warranty Start Date" type="date" value={turnoverForm.warrantyStartDate} onChange={(value) => updateTurnoverField('warrantyStartDate', value)} />
                    <p className="text-xs text-slate-500">
                      Ticket data autofills this form, and commissioning checklist data is pulled in when available. Warranty Start Date defaults to Turnover Date if left blank.
                    </p>
                  </>
                ) : (
                  <>
                    <TextField label="Client" value={form.clientName} onChange={(value) => updateField('clientName', value)} />
                    <TextField label="Address" value={form.address} onChange={(value) => updateField('address', value)} />
                    <TextField label="Contact Number" value={form.contactNumber} onChange={(value) => updateField('contactNumber', value)} />
                    <TextField label="Technician" value={form.technician} onChange={(value) => updateField('technician', value)} />
                    <TextField label="Date" type="date" value={form.documentDate} onChange={(value) => updateField('documentDate', value)} />
                    <TextField label="Ticket No" value={form.ticketNumber} onChange={(value) => updateField('ticketNumber', value)} />
                    <TextField label="Service Type" value={form.serviceType} onChange={(value) => updateField('serviceType', value)} />
                    <TextField label="Reference" value={form.reference} onChange={(value) => updateField('reference', value)} />
                    <TextField label="System Capacity" value={form.systemCapacity} onChange={(value) => updateField('systemCapacity', value)} />
                  </>
                )}
                {canManageDocuments && activeTemplate !== 'commissioning_checklist' ? (
                  <>
                    {(activeTemplate === 'turnover_acceptance' ? turnoverMessage : documentDraftMessage) ? (
                      <p role="status" aria-live="polite" className={`text-xs ${(activeTemplate === 'turnover_acceptance' ? turnoverMessage : documentDraftMessage).toLowerCase().includes('saved') || (activeTemplate === 'turnover_acceptance' ? turnoverMessage : documentDraftMessage).toLowerCase().includes('loaded') || (activeTemplate === 'turnover_acceptance' ? turnoverMessage : documentDraftMessage).toLowerCase().includes('successfully') || (activeTemplate === 'turnover_acceptance' ? turnoverMessage : documentDraftMessage).toLowerCase().includes('finalized') ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {activeTemplate === 'turnover_acceptance' ? turnoverMessage : documentDraftMessage}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={activeTemplate === 'turnover_acceptance' ? () => saveTurnoverDraft(false) : saveActiveDocumentDraft}
                      disabled={(activeTemplate === 'turnover_acceptance' ? turnoverSaving : documentDraftSaving) || documentDraftLoading || prefillLoading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60"
                    >
                      <FiSave size={15} />
                      {activeTemplate === 'turnover_acceptance' && turnoverSaving ? 'Saving...' : documentDraftSaving ? 'Saving...' : documentDraftLoading ? 'Loading...' : 'Save Draft'}
                    </button>
                    {activeTemplate === 'turnover_acceptance' && (
                      <button
                        type="button"
                        onClick={() => saveTurnoverDraft(true)}
                        disabled={turnoverSaving || prefillLoading}
                        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
                        title="Finalize Turnover to officially hand over project and start warranty period."
                      >
                        <FiSave size={15} />
                        {turnoverSaving ? 'Finalizing...' : 'Finalize Project Handover'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={saveProjectSpecsToTicket}
                      disabled={projectSpecsSaving || prefillLoading}
                      className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-wait disabled:opacity-60"
                      title="Save the current fields (like capacity, panel count, etc.) directly to the ticket so it autofills forever."
                    >
                      <FiSave size={15} />
                      {projectSpecsSaving ? 'Saving to Ticket...' : 'Save Specs to Ticket'}
                    </button>
                    {activeTemplate === 'turnover_acceptance' && (
                      <button
                        type="button"
                        onClick={handleRegisterEquipment}
                        disabled={equipmentRegistering || prefillLoading}
                        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
                        title="Register installed components directly to the client's profile for future Field Service Reports."
                      >
                        <FiSave size={15} />
                        {equipmentRegistering ? 'Registering Equipment...' : 'Register Equipment to Client'}
                      </button>
                    )}
                    {activeTemplate === 'quotation_proposal' && (
                      <button
                        type="button"
                        onClick={handleSaveQuotation}
                        disabled={quotationSaving || prefillLoading}
                        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
                        title="Save the pricing and terms to a Quotation Record so they auto-fill the Installation Contract later."
                      >
                        <FiSave size={15} />
                        {quotationSaving ? 'Saving Quotation...' : 'Save Quotation Data'}
                      </button>
                    )}
                    {activeTemplate === 'installation_contract' && (
                      <button
                        type="button"
                        onClick={handleSaveContract}
                        disabled={contractSaving || prefillLoading}
                        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
                        title="Save contract details to the system."
                      >
                        <FiSave size={15} />
                        {contractSaving ? 'Saving Contract...' : 'Save Contract Data'}
                      </button>
                    )}
                  </>
                ) : null}
              </div>
            </div>

          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Print Preview</h2>
                <p className="mt-1 text-sm text-slate-500">Paper: {paper.label}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <FiRefreshCw size={15} />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={printCurrentDocument}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  <FiPrinter size={15} />
                  Print
                </button>
              </div>
            </div>
            <div className="overflow-x-auto bg-[#eef5fb] p-4 lg:p-6">
              <div
                id="afn-printable-document"
                className="mx-auto w-full"
                style={{ maxWidth: paper.previewWidth }}
              >
                <DocumentPreview
                  activeTemplate={activeTemplate}
                  form={form}
                  onUpdateRow={(id, field, value) => {
                    setForm((prev) => ({
                      ...prev,
                      rows: prev.rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
                    }));
                  }}
                  onAddRow={() => {
                    setForm((prev) => ({
                      ...prev,
                      rows: [...prev.rows, { id: `row-${Date.now()}`, brandModel: '', trHp: '', serialNumber: '', indoorTemp: '', outdoorTemp: '', ampere: '', others: '', recommendation: '' }]
                    }));
                  }}
                  onRemoveRow={(id) => {
                    setForm((prev) => ({
                      ...prev,
                      rows: prev.rows.filter((row) => row.id !== id)
                    }));
                  }}
                  commissioningForm={commissioningForm}
                  onCommissioningFieldChange={updateCommissioningField}
                  onCommissioningItemChange={updateCommissioningItem}
                  onCommissioningReadingChange={updateCommissioningReading}
                  quotationForm={quotationForm}
                  onQuotationFieldChange={updateQuotationField}
                  onQuotationTableRowChange={(tableKey, rowId, key, value) => {
                    setQuotationForm((current) => {
                      let updatedRows = current[tableKey].map((row) => {
                        if (row.id !== rowId) return row;
                        
                        let newRow = { ...row, [key]: value };
                        
                        if (tableKey === 'bomRows') {
                          if (key === 'description') {
                            const matchedItem = inventoryItems.find(i => i.name === value);
                            if (matchedItem) {
                              newRow.unitPrice = matchedItem.unit_price || '';
                              // Keep the user's unit if they already typed one, or leave blank since item doesn't have a strict unit field
                            }
                          }
                          
                          if (['qty', 'unitPrice', 'description'].includes(key)) {
                            const qty = parseFloat(newRow.qty) || 0;
                            const price = parseFloat(newRow.unitPrice) || 0;
                            newRow.amount = (qty * price) > 0 ? (qty * price).toFixed(2) : '';
                          }
                        }
                        return newRow;
                      });

                      const nextForm = { ...current, [tableKey]: updatedRows };

                      if (tableKey === 'bomRows') {
                        const total = nextForm.bomRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
                        if (total > 0 && nextForm.priceRows.length > 0) {
                          nextForm.priceRows = [...nextForm.priceRows];
                          nextForm.priceRows[0] = { 
                            ...nextForm.priceRows[0], 
                            totalPrice: total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                          };
                        }
                      }

                      return nextForm;
                    });
                  }}
                  onQuotationAddRow={addQuotationRow}
                  onQuotationRemoveRow={removeQuotationRow}
                  tdsForm={tdsForm}
                  onTdsFieldChange={updateTdsField}
                  onTdsLoadRowChange={updateTdsLoadRow}
                  onTdsPurposeRowChange={updateTdsPurposeRow}
                  installationContractForm={installationContractForm}
                  onInstallationContractFieldChange={updateInstallationContractField}
                  turnoverForm={turnoverForm}
                  onTurnoverFieldChange={updateTurnoverField}
                  onTurnoverTableRowChange={updateTurnoverTableRow}
                  onTurnoverAddRow={addTurnoverRow}
                  onTurnoverRemoveRow={removeTurnoverRow}
                  inventoryItems={inventoryItems}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
