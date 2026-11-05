import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiCheck, FiDownload, FiFileText, FiRefreshCw, FiUploadCloud, FiX } from 'react-icons/fi';
import {
  activateDocumentTemplateVersion,
  addDocumentFieldsFromDesign,
  downloadDocumentTemplateVersion,
  fetchDocumentDefinitions,
  fetchDocumentTemplates,
  fetchDocumentTemplateFields,
  fetchDocumentTemplateVersions,
  rollbackDocumentTemplateVersion,
  testRenderDocumentTemplateVersion,
  uploadDocumentTemplateVersion,
} from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import DesignChecklist from './DesignChecklist';
import {
  DOCUMENT_TEMPLATES_PUBLISH_CAPABILITIES,
  DOCUMENT_TEMPLATES_ROLLBACK_CAPABILITIES,
  DOCUMENT_TEMPLATES_UPLOAD_CAPABILITIES,
  hasAnyCapability,
} from '../../rbac';
import {
  REPLACEMENT_STEPS,
  canActivateReplacement,
  canTestReplacement,
  describeTemplateValidation,
  getActivationMissingComponents,
  getTemplatePlaceholders,
  isTemplateConfigured,
} from '../../documents/templateReplacementWizard';
import { getMissingRequiredMappings, humanizeFieldKey } from '../../documents/documentFieldSuggestions';

const PdfTemplateFieldEditor = lazy(() => import('./PdfTemplateFieldEditor'));
const supportedFile = (file) => /\.(docx|pdf)$/i.test(file?.name || '');

const noticeStyles = {
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
};

export default function DocumentReplacementWizard({ open, onClose, ticketId, initialDefinitionCode, onOpenAdvanced }) {
  const { user } = useAuth();
  const closeRef = useRef(null);
  const [step, setStep] = useState(0);
  const [definitions, setDefinitions] = useState([]);
  const [definitionId, setDefinitionId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [versions, setVersions] = useState([]);
  const [candidate, setCandidate] = useState(null);
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [testedVersionId, setTestedVersionId] = useState(null);
  const [activatedVersionId, setActivatedVersionId] = useState(null);
  const [fieldEditorVersion, setFieldEditorVersion] = useState(null);
  const [mappedFields, setMappedFields] = useState([]);
  const [fieldReviewConfirmed, setFieldReviewConfirmed] = useState(false);

  const canUpload = hasAnyCapability(user, DOCUMENT_TEMPLATES_UPLOAD_CAPABILITIES);
  const canPublish = hasAnyCapability(user, DOCUMENT_TEMPLATES_PUBLISH_CAPABILITIES);
  const canRollback = hasAnyCapability(user, DOCUMENT_TEMPLATES_ROLLBACK_CAPABILITIES);
  const selectedDefinition = definitions.find((item) => String(item.id) === String(definitionId));
  const selectedTemplate = templates.find((item) => String(item.id) === String(templateId));
  const activeVersionId = selectedTemplate?.active_version?.id;
  const validation = describeTemplateValidation(candidate);
  const placeholders = getTemplatePlaceholders(candidate);
  const approvedByKey = useMemo(() => new Map(
    (selectedDefinition?.placeholder_details || []).map((item) => [item.key, item]),
  ), [selectedDefinition]);
  const mappedKeys = candidate?.file_format === 'pdf'
    ? mappedFields.filter((item) => item.fill_method === 'system').map((item) => item.source_key)
    : placeholders;
  const missingRequired = getMissingRequiredMappings(selectedDefinition?.code, mappedKeys);
  const missingActivation = getActivationMissingComponents(candidate);
  const docxParts = Array.isArray(candidate?.placeholder_manifest?.parts) ? candidate.placeholder_manifest.parts : [];
  const repeatingPlaceholders = placeholders.filter((key) => {
    const root = key.split('.')[0];
    return approvedByKey.get(root)?.is_collection || approvedByKey.get(key)?.is_collection;
  });

  const resetJourney = () => {
    setStep(0);
    setCandidate(null);
    setFile(null);
    setNotes('');
    setProgress(null);
    setError('');
    setMessage('');
    setTestedVersionId(null);
    setActivatedVersionId(null);
    setFieldEditorVersion(null);
    setMappedFields([]);
    setFieldReviewConfirmed(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    resetJourney();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy('definitions');
    fetchDocumentDefinitions({ category: 'core' })
      .then((items) => {
        if (!active) return;
        setDefinitions(items);
        const preferred = items.find((item) => item.code === initialDefinitionCode) || items[0];
        setDefinitionId(preferred?.id || '');
      })
      .catch((caught) => active && setError(caught.message))
      .finally(() => active && setBusy(''));
    return () => { active = false; };
  }, [initialDefinitionCode, open]);

  useEffect(() => {
    if (!open || !definitionId) return;
    let active = true;
    setBusy('templates');
    fetchDocumentTemplates(definitionId)
      .then((items) => {
        if (!active) return;
        setTemplates(items);
        const preferred = items.find((item) => item.is_default) || items[0];
        setTemplateId(preferred?.id || '');
      })
      .catch((caught) => active && setError(caught.message))
      .finally(() => active && setBusy(''));
    return () => { active = false; };
  }, [definitionId, open]);

  const loadVersions = async (preferredId = candidate?.id) => {
    if (!templateId) return [];
    const items = await fetchDocumentTemplateVersions(templateId);
    setVersions(items);
    if (preferredId) {
      const refreshed = items.find((item) => Number(item.id) === Number(preferredId));
      if (refreshed) setCandidate(refreshed);
    }
    return items;
  };

  useEffect(() => {
    if (!open || !templateId) return;
    loadVersions().catch((caught) => setError(caught.message));
  // Candidate refresh is intentionally controlled by actions, not by candidate identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId]);

  if (!open) return null;

  const chooseFile = (nextFile) => {
    if (!nextFile) return;
    if (!supportedFile(nextFile)) {
      setFile(null);
      setError('Choose a Word DOCX or PDF file.');
      return;
    }
    setFile(nextFile);
    setError('');
  };

  const upload = async () => {
    if (!file || !templateId) return;
    setBusy('upload');
    setError('');
    setMessage('');
    try {
      const uploaded = await uploadDocumentTemplateVersion({
        templateId,
        file,
        changeNotes: notes.trim() || 'Replacement uploaded through the guided wizard',
        onProgress: setProgress,
      });
      setCandidate(uploaded);
      setMappedFields([]);
      setFieldReviewConfirmed(false);
      setTestedVersionId(null);
      setActivatedVersionId(null);
      await loadVersions(uploaded.id);
      setStep(2);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy('');
      setProgress(null);
    }
  };

  const testDocument = async () => {
    setBusy('test');
    setError('');
    setMessage('');
    try {
      await testRenderDocumentTemplateVersion(candidate.id, ticketId);
      setTestedVersionId(candidate.id);
      setMessage(`The completed test ${String(candidate.file_format).toUpperCase()} was downloaded. Review it before continuing.`);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy('');
    }
  };

  const activate = async () => {
    setBusy('activate');
    setError('');
    try {
      await activateDocumentTemplateVersion(candidate.id);
      setActivatedVersionId(candidate.id);
      const [nextTemplates] = await Promise.all([
        fetchDocumentTemplates(definitionId),
        loadVersions(candidate.id),
      ]);
      setTemplates(nextTemplates);
      setMessage(`Your new ${selectedDefinition?.name || 'document'} design is ready. Future files will use this version.`);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy('');
    }
  };

  const rollback = async (version) => {
    setBusy(`rollback-${version.id}`);
    setError('');
    try {
      await rollbackDocumentTemplateVersion(version.id);
      const [nextTemplates] = await Promise.all([
        fetchDocumentTemplates(definitionId),
        loadVersions(candidate.id),
      ]);
      setTemplates(nextTemplates);
      setMessage(`The design was rolled back to version ${version.version_number}. Previously generated files were not changed.`);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy('');
    }
  };

  const nextDisabled = (
    (step === 0 && (!definitionId || !templateId))
    || (step === 1 && !candidate)
    || (step === 2 && candidate?.validation_status !== 'valid')
    || (step === 3 && (!isTemplateConfigured(candidate) || !fieldReviewConfirmed))
    || (step === 4 && Number(testedVersionId) !== Number(candidate?.id))
  );

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="replacement-wizard-title" className="flex h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[90vh] sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Replace design</p>
            <h2 id="replacement-wizard-title" className="mt-1 text-lg font-semibold text-slate-900">Use a new Word or PDF design</h2>
            <p className="mt-1 text-sm text-slate-500">Your document workflow and existing generated files will not change.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close replacement wizard" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><FiX /></button>
        </header>

        <ol aria-label="Replacement progress" className="grid grid-cols-3 gap-1 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:grid-cols-6 sm:px-6">
          {REPLACEMENT_STEPS.map((item, index) => (
            <li key={item.key} className={`rounded-lg px-2 py-2 text-center text-xs font-semibold ${index === step ? 'bg-brand-600 text-white' : index < step ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500'}`}>
              <span className="block">{index < step ? <FiCheck className="mx-auto" /> : index + 1}</span>
              <span className="mt-1 block">{item.label}</span>
            </li>
          ))}
        </ol>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {error ? <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
          {message ? <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}

          {step === 0 ? (
            <div className="mx-auto max-w-2xl space-y-5">
              <div><h3 className="text-xl font-semibold text-slate-900">Which document design are you replacing?</h3><p className="mt-1 text-sm text-slate-500">Choose the AFN document and the design that should receive a new version.</p></div>
              <label className="block text-sm font-semibold text-slate-700">Document type<select value={definitionId} onChange={(event) => { setDefinitionId(event.target.value); setCandidate(null); setTestedVersionId(null); }} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="">Choose a document</option>{definitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="block text-sm font-semibold text-slate-700">Current design<select value={templateId} onChange={(event) => { setTemplateId(event.target.value); setCandidate(null); setTestedVersionId(null); }} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="">Choose a design</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_default ? ' (Default)' : ''}</option>)}</select></label>
              {!busy && definitionId && templates.length === 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">This document has no design yet. Create its first design in Advanced Template Library.</p> : null}
              {selectedTemplate?.active_version ? <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Version {selectedTemplate.active_version.version_number} is active now. It stays active until you test and approve the replacement.</p> : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="mx-auto max-w-2xl space-y-5">
              <div><h3 className="text-xl font-semibold text-slate-900">Upload the design your company wants to use</h3><p className="mt-1 text-sm text-slate-500">The original Word or PDF file is preserved as a new inactive version.</p></div>
              <label className={`block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-400'}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}>
                <FiUploadCloud className="mx-auto text-brand-600" size={34} />
                <span className="mt-3 block font-semibold text-slate-800">{file?.name || 'Drop a DOCX or PDF here'}</span>
                <span className="mt-1 block text-sm text-slate-500">or click to browse · maximum 10 MB</span>
                <input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => chooseFile(event.target.files?.[0])} className="sr-only" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">What changed? <span className="font-normal text-slate-400">(optional)</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Example: Updated company header and quotation table" className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
              {progress !== null ? <div aria-label={`Upload ${progress}%`} className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-600" style={{ width: `${progress}%` }} /></div> : null}
              <button type="button" onClick={upload} disabled={!canUpload || !file || busy === 'upload'} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-50"><FiUploadCloud /> {busy === 'upload' ? 'Checking file…' : 'Upload and check file'}</button>
              {!canUpload ? <p className="text-sm text-rose-700">Your account cannot upload document templates.</p> : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mx-auto max-w-2xl space-y-5">
              <div><h3 className="text-xl font-semibold text-slate-900">File check</h3><p className="mt-1 text-sm text-slate-500">The previous active design has not been changed.</p></div>
              <section className={`rounded-xl border p-5 ${noticeStyles[validation.tone]}`}><h4 className="font-semibold">{validation.title}</h4>{validation.messages.map((item) => <p key={item} className="mt-2 text-sm">{item}</p>)}</section>
              <dl className="grid gap-3 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">File</dt><dd className="font-semibold text-slate-800">{candidate?.original_filename}</dd></div><div><dt className="text-slate-500">Format</dt><dd className="font-semibold text-slate-800">{String(candidate?.file_format || '').toUpperCase()}</dd></div><div><dt className="text-slate-500">Version</dt><dd className="font-semibold text-slate-800">{candidate?.version_number}</dd></div><div><dt className="text-slate-500">Fields found</dt><dd className="font-semibold text-slate-800">{placeholders.length}</dd></div></dl>
              <button type="button" onClick={() => downloadDocumentTemplateVersion(candidate.id, candidate.original_filename)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"><FiDownload /> Download original</button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <div><h3 className="text-xl font-semibold text-slate-900">Confirm how the design is filled</h3><p className="mt-1 text-sm text-slate-500">The template controls appearance. AFN still controls official calculations and workflow status.</p></div>
              <DesignChecklist
                items={candidate?.checklist}
                busy={!!busy}
                onAddFields={selectedDefinition?.category === 'custom'
                  ? async (names) => {
                    setBusy('fields');
                    setError('');
                    try {
                      await addDocumentFieldsFromDesign(candidate.id, names);
                      await loadVersions(candidate.id);
                    } catch (caught) {
                      setError(caught.message);
                    } finally {
                      setBusy('');
                    }
                  }
                  : null}
              />
              {missingRequired.length ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><h4 className="font-semibold">Important content needs confirmation</h4><p className="mt-1">The system did not find: {missingRequired.map((key) => humanizeFieldKey(key, selectedDefinition?.placeholder_details)).join(', ')}.</p><p className="mt-1 text-xs">This checklist does not reject the file automatically. Confirm the intended wording or fixed-layout section in the generated test before activation.</p></section> : <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">The known required content connections were found. Review them before continuing.</p>}
              {candidate?.file_format === 'pdf' ? (
                <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-900"><h4 className="font-semibold">Place fields on the PDF</h4><p className="mt-2 text-sm">Click near a printed label. AFN will offer explainable matches, but you must accept or change each connection before saving it.</p><button type="button" onClick={() => setFieldEditorVersion(candidate)} className="mt-4 h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white">Set up PDF fields</button><button type="button" onClick={async () => { await loadVersions(candidate.id); setMappedFields(await fetchDocumentTemplateFields(candidate.id)); setFieldReviewConfirmed(false); }} className="ml-2 inline-flex h-10 items-center gap-2 rounded-lg border border-blue-300 bg-white px-4 text-sm font-semibold text-blue-800"><FiRefreshCw /> Refresh setup</button><p className="mt-3 text-xs">Status: {isTemplateConfigured(candidate) ? 'Ready for review' : 'Add at least one supported field before continuing.'}</p></section>
              ) : (
                <>
                  <section className="rounded-xl border border-slate-200 p-5"><h4 className="font-semibold text-slate-900">Fields detected in the Word file</h4>{placeholders.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{placeholders.map((key) => { const detail = approvedByKey.get(key.split('.')[0]) || approvedByKey.get(key); return <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><p className="font-semibold text-slate-800">{detail?.label || key.replaceAll('_', ' ')}</p><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">Exact</span></div><p className="mt-1 text-xs text-slate-500">{detail?.is_collection ? 'Exact approved repeating table or list marker' : 'Exact approved placeholder filled from AFN data'}</p></div>; })}</div> : <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No automatic fields were found. The design can be preserved, but the test file may contain only its original wording.</p>}</section>
                  <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><h4 className="text-sm font-semibold text-slate-900">Word areas checked</h4><p className="mt-1 text-xs text-slate-600">{docxParts.length ? docxParts.map((part) => part.replace('word/', '').replace('.xml', '')).join(', ') : 'Main document body'}</p></div><div className="rounded-xl border border-slate-200 p-4"><h4 className="text-sm font-semibold text-slate-900">Repeating sections</h4><p className="mt-1 text-xs text-slate-600">{repeatingPlaceholders.length ? repeatingPlaceholders.map((key) => humanizeFieldKey(key, selectedDefinition?.placeholder_details)).join(', ') : 'None detected. Add balanced opening and closing markers in Word if this document needs expandable rows.'}</p></div></section>
                  <details className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><summary className="cursor-pointer font-semibold">What can I configure in Word?</summary><div className="mt-2 space-y-2 text-xs"><p>Keep the uploaded DOCX as the visual source for fonts, logos, margins, headers, footers, tables, and page flow.</p><p>Use approved placeholders for single values and balanced markers around rows that must repeat. AFN validates those connections but does not rewrite the Word layout in this browser.</p><p>The on-screen editor is not an exact Word preview. Download the generated test DOCX and inspect it in a compatible word processor before activation.</p></div></details>
                </>
              )}
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700"><input type="checkbox" checked={fieldReviewConfirmed} onChange={(event) => setFieldReviewConfirmed(event.target.checked)} className="mt-0.5" /><span><strong className="block text-slate-900">I reviewed these field connections.</strong>I understand suggestions are not saved automatically and any missing or repeating content must be checked in the generated test.</span></label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="mx-auto max-w-2xl space-y-5">
              <div><h3 className="text-xl font-semibold text-slate-900">Generate a completed example</h3><p className="mt-1 text-sm text-slate-500">Review the actual generated file before making this design active.</p></div>
              {!ticketId ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Close this wizard, select a service ticket on the Documents page, then return to Replace design.</p> : <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">The test uses ticket {ticketId}. It downloads a sample and does not create an official document or change the active design.</p>}
              <button type="button" onClick={testDocument} disabled={!canTestReplacement({ version: candidate, ticketId }) || busy === 'test'} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-50"><FiFileText /> {busy === 'test' ? 'Generating test…' : `Download test ${String(candidate?.file_format || 'file').toUpperCase()}`}</button>
              {Number(testedVersionId) === Number(candidate?.id) ? <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><FiCheck /> Test generation completed. Continue only after reviewing the downloaded file.</p> : null}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <div><h3 className="text-xl font-semibold text-slate-900">Save and use the new design</h3><p className="mt-1 text-sm text-slate-500">Activation affects future generated files only. Historical files keep their original source version.</p></div>
              <section className="rounded-xl border border-slate-200 p-5"><p className="font-semibold text-slate-900">{selectedDefinition?.name} · {selectedTemplate?.name}</p><p className="mt-1 text-sm text-slate-500">Replacement version {candidate?.version_number} · {String(candidate?.file_format || '').toUpperCase()}</p>{missingActivation.length ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">Activation is blocked until these required connections are configured: {missingActivation.map((key) => humanizeFieldKey(key, selectedDefinition?.placeholder_details)).join(', ')}.</p> : null}<button type="button" onClick={activate} disabled={!canPublish || missingActivation.length > 0 || !canActivateReplacement({ version: candidate, testedVersionId }) || busy === 'activate' || Number(activeVersionId) === Number(candidate?.id)} className="mt-4 h-11 rounded-lg bg-brand-600 px-5 font-semibold text-white disabled:opacity-50">{busy === 'activate' ? 'Activating…' : Number(activeVersionId) === Number(candidate?.id) || Number(activatedVersionId) === Number(candidate?.id) ? 'Design is active' : 'Activate new design'}</button>{!canPublish ? <p className="mt-2 text-sm text-rose-700">Your account cannot publish document templates.</p> : null}</section>
              <section><h4 className="font-semibold text-slate-900">Rollback choices</h4><div className="mt-3 space-y-2">{versions.filter((version) => version.validation_status === 'valid' && Number(version.id) !== Number(activeVersionId) && version.version_number < candidate.version_number).map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div><p className="font-semibold text-slate-800">Version {version.version_number}</p><p className="text-xs text-slate-500">{version.original_filename}</p></div>{canRollback ? <button type="button" onClick={() => rollback(version)} disabled={!!busy} className="h-9 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800">Roll back</button> : null}</div>)}</div></section>
            </div>
          ) : null}
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
          <button type="button" onClick={() => { onClose(); onOpenAdvanced?.(); }} className="text-sm font-semibold text-slate-600 hover:text-brand-700">Advanced Template Library</button>
          <div className="flex gap-2"><button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || !!busy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiArrowLeft /> Back</button>{step < REPLACEMENT_STEPS.length - 1 ? <button type="button" onClick={() => setStep((value) => value + 1)} disabled={nextDisabled || !!busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Continue <FiArrowRight /></button> : <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">Done</button>}</div>
        </footer>
      </section>
      {fieldEditorVersion ? <Suspense fallback={<div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/70 text-sm font-semibold text-white">Opening PDF field setup…</div>}><PdfTemplateFieldEditor version={fieldEditorVersion} definition={selectedDefinition} onClose={() => setFieldEditorVersion(null)} onChanged={async () => { await loadVersions(fieldEditorVersion.id); setMappedFields(await fetchDocumentTemplateFields(fieldEditorVersion.id)); setFieldReviewConfirmed(false); }} /></Suspense> : null}
    </div>
  );
}
