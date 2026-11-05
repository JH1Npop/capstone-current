import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiDownload, FiEye, FiFile, FiPaperclip, FiRotateCcw, FiSave, FiX } from 'react-icons/fi';
import {
  createDocumentInstance,
  downloadDocumentAttachment,
  downloadDocumentOutput,
  fetchDocumentAttachments,
  fetchDocumentDefinitions,
  fetchDocumentFieldDefinitions,
  fetchDocumentInstances,
  fetchDocumentOutputs,
  fetchDocumentTemplateFields,
  fetchDocumentTemplates,
  generateCustomDocument,
  previewDocumentInstance,
  updateDocumentInstance,
  uploadDocumentAttachment,
} from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { DOCUMENT_ATTACHMENTS_MANAGE_CAPABILITIES, hasAnyCapability } from '../../rbac';
import { isCoreDocumentCode, summarizeCoreDocumentSchema } from '../../documents/coreDocumentWorkspace';

const inputClass = 'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const list = (value) => Array.isArray(value) ? value : [];

export default function CustomDocumentWorkspace({ open, onClose, ticketId, initialDefinitionCode = '', onOpenCoreDocument }) {
  const { user } = useAuth();
  const closeRef = useRef(null);
  const [definitions, setDefinitions] = useState([]);
  const [definitionId, setDefinitionId] = useState('');
  const [fields, setFields] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [instance, setInstance] = useState(null);
  const [values, setValues] = useState({});
  const [outputs, setOutputs] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentDescription, setAttachmentDescription] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [dirty, setDirty] = useState(false);
  const canManageAttachments = hasAnyCapability(user, DOCUMENT_ATTACHMENTS_MANAGE_CAPABILITIES);
  const selectedDefinition = definitions.find((item) => String(item.id) === String(definitionId));
  const selectedIsCore = isCoreDocumentCode(selectedDefinition?.code);
  const coreSummary = summarizeCoreDocumentSchema(selectedDefinition?.code);
  const activeTemplates = useMemo(() => templates.filter((item) => item.is_enabled && item.active_version), [templates]);
  const selectedTemplate = activeTemplates.find((item) => String(item.id) === String(templateId));

  const reportError = (caught) => {
    setMessage('');
    setError(caught?.message || 'Something went wrong.');
  };

  const requestClose = () => {
    if (dirty && !window.confirm('Discard the unsaved document changes?')) return;
    onClose();
  };

  const loadDefinitions = useCallback(async () => {
    try {
      const items = await fetchDocumentDefinitions({ is_active: true });
      setDefinitions(items);
      setDefinitionId((current) => {
        const requested = items.find((item) => item.code === initialDefinitionCode);
        if (requested) return requested.id;
        if (current && items.some((item) => String(item.id) === String(current))) return current;
        return items[0]?.id || '';
      });
    } catch (caught) {
      reportError(caught);
    }
  }, [initialDefinitionCode]);

  const loadDefinitionData = useCallback(async () => {
    if (!definitionId || !ticketId) {
      setFields([]);
      setTemplates([]);
      setInstance(null);
      return;
    }
    setBusy('load');
    setError('');
    try {
      const [definitionFields, templateItems, instanceItems] = await Promise.all([
        fetchDocumentFieldDefinitions(definitionId),
        fetchDocumentTemplates(definitionId),
        fetchDocumentInstances({ definition: definitionId, context_ticket: ticketId }),
      ]);
      setTemplates(templateItems);
      const preferredTemplate = templateItems.find((item) => item.is_default && item.is_enabled && item.active_version)
        || templateItems.find((item) => item.is_enabled && item.active_version);
      setTemplateId(preferredTemplate?.id || '');
      const configuredFields = preferredTemplate?.active_version
        ? await fetchDocumentTemplateFields(preferredTemplate.active_version.id)
        : [];
      const fieldItems = [
        ...definitionFields.filter((item) => item.is_active),
        ...configuredFields.filter((item) => item.is_active),
      ].filter((item, index, all) => all.findIndex((candidate) => candidate.field_key === item.field_key) === index);
      setFields(fieldItems);
      const current = instanceItems[0] || null;
      setInstance(current);
      setValues(current?.custom_field_values || Object.fromEntries(fieldItems.filter((item) => item.fill_method !== 'system').map((field) => [field.field_key, field.default_value ?? (['boolean', 'checkbox'].includes(field.field_type) ? false : '')])));
      if (current) {
        const [outputItems, attachmentItems] = await Promise.all([
          fetchDocumentOutputs(null, current.id),
          fetchDocumentAttachments(current.id),
        ]);
        setOutputs(outputItems);
        setAttachments(attachmentItems);
      } else {
        setOutputs([]);
        setAttachments([]);
      }
      setDirty(false);
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy('');
    }
  }, [definitionId, ticketId]);

  useEffect(() => {
    if (!open) return undefined;
    loadDefinitions();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event) => event.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dirty, loadDefinitions, open]);

  useEffect(() => () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (open) loadDefinitionData();
  }, [loadDefinitionData, open]);

  useEffect(() => {
    const versionId = selectedTemplate?.active_version?.id;
    if (!open || !definitionId || !versionId) return;
    let cancelled = false;
    Promise.all([
      fetchDocumentFieldDefinitions(definitionId),
      fetchDocumentTemplateFields(versionId),
    ]).then(([definitionFields, configuredFields]) => {
      if (cancelled) return;
      const merged = [
        ...definitionFields.filter((item) => item.is_active),
        ...configuredFields.filter((item) => item.is_active),
      ].filter((item, index, all) => all.findIndex((candidate) => candidate.field_key === item.field_key) === index);
      setFields(merged);
      setValues((current) => ({
        ...Object.fromEntries(merged.filter((item) => item.fill_method !== 'system').map((field) => [field.field_key, field.default_value ?? (['boolean', 'checkbox'].includes(field.field_type) ? false : '')])),
        ...current,
      }));
    }).catch(reportError);
    return () => { cancelled = true; };
  }, [definitionId, open, selectedTemplate?.active_version?.id]);

  const save = async () => {
    if (!ticketId || !definitionId) return null;
    setBusy('save');
    setError('');
    try {
      const payload = {
        definition: definitionId,
        ticket: ticketId,
        selected_template_version: selectedTemplate?.active_version?.id || null,
        custom_field_values: values,
      };
      const saved = instance
        ? await updateDocumentInstance(instance.id, payload)
        : await createDocumentInstance(payload);
      setInstance(saved);
      setDirty(false);
      setMessage('Document draft saved.');
      return saved;
    } catch (caught) {
      reportError(caught);
      return null;
    } finally {
      setBusy('');
    }
  };

  const generate = async () => {
    const saved = await save();
    if (!saved) return;
    setBusy('generate');
    try {
      await generateCustomDocument(saved.id, selectedTemplate?.id || null);
      setMessage(`${String(selectedTemplate?.active_version?.file_format || 'docx').toUpperCase()} generated, archived, and downloaded.`);
      setOutputs(await fetchDocumentOutputs(null, saved.id));
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy('');
    }
  };

  const preview = async () => {
    const saved = await save();
    if (!saved) return;
    setBusy('preview');
    try {
      const result = await previewDocumentInstance(saved.id, selectedTemplate?.id || null);
      if (previewUrl) window.URL.revokeObjectURL(previewUrl);
      const url = window.URL.createObjectURL(result.blob);
      if (result.contentType.includes('pdf')) {
        setPreviewUrl(url);
        setMessage('Preview updated from the actual PDF renderer.');
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `preview-${selectedDefinition?.code || 'document'}.docx`;
        link.click();
        window.URL.revokeObjectURL(url);
        setMessage('DOCX preview downloaded because inline Word preview is not available.');
      }
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy('');
    }
  };

  const resetFields = () => {
    setValues(Object.fromEntries(fields
      .filter((field) => field.fill_method !== 'system')
      .map((field) => [field.field_key, field.default_value ?? (['boolean', 'checkbox'].includes(field.field_type) ? false : '')])));
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    setMessage('Fields reset to their template defaults. Save to keep this change.');
    setError('');
    setDirty(true);
  };

  const openCoreEditor = () => {
    if (!selectedDefinition?.code || !onOpenCoreDocument) return;
    setDirty(false);
    onOpenCoreDocument(selectedDefinition.code);
  };

  const uploadAttachment = async (event) => {
    event.preventDefault();
    if (!attachmentFile) return;
    const formElement = event.currentTarget;
    let current = instance;
    if (!current) current = await save();
    if (!current) return;
    setBusy('attachment');
    try {
      await uploadDocumentAttachment({ instanceId: current.id, file: attachmentFile, description: attachmentDescription });
      setAttachmentFile(null);
      setAttachmentDescription('');
      formElement.reset();
      setAttachments(await fetchDocumentAttachments(current.id));
      setMessage('Attachment uploaded.');
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy('');
    }
  };

  const renderField = (field) => {
    const value = values[field.field_key] ?? '';
    const update = (next) => { setValues((current) => ({ ...current, [field.field_key]: next })); setDirty(true); };
    if (field.fill_method === 'system') return <div className="mt-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-normal text-sky-800">Filled from AFN: {field.source_key?.replaceAll('_', ' ')}</div>;
    if (field.field_type === 'multiline') return <textarea value={value} onChange={(event) => update(event.target.value)} className={`${inputClass} min-h-24 py-2`} />;
    if (['boolean', 'checkbox'].includes(field.field_type)) return <select value={String(Boolean(value))} onChange={(event) => update(event.target.value === 'true')} className={inputClass}><option value="false">No</option><option value="true">Yes</option></select>;
    if (field.field_type === 'dropdown') return <select value={value} onChange={(event) => update(event.target.value)} className={inputClass}><option value="">Select</option>{list(field.options || field.validation_config?.options).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    return <input type={field.field_type === 'date' ? 'date' : field.field_type === 'number' ? 'number' : 'text'} value={value} onChange={(event) => update(event.target.value)} className={inputClass} />;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="custom-documents-title" className="flex h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[88vh] sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div><h2 id="custom-documents-title" className="text-lg font-semibold text-slate-900">Fill a document</h2><p className="mt-1 text-sm text-slate-500">Use a published company template with the selected ticket. Entered values do not change ticket, quotation, or payment records.</p></div>
          <button ref={closeRef} type="button" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close document filling"><FiX /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {error ? <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {message ? <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
          {!ticketId ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Select a ticket on the Documents page first.</div> : definitions.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No published templates are ready to fill. Save a template, configure fields if needed, and activate it first.</div> : (
            <div className="space-y-6">
              <section className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Document<select value={definitionId} onChange={(event) => setDefinitionId(event.target.value)} className={inputClass}>{definitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Design<select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className={inputClass}>{activeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.active_version.version_number}</option>)}</select></label>
                <p className="text-sm text-slate-600 md:col-span-2">{selectedDefinition?.description || 'Company document'} · Source: {selectedDefinition?.data_source}</p>
              </section>

              {selectedIsCore ? (
                <section className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Edit document data</p>
                      <h3 className="mt-1 text-base font-semibold text-slate-900">Use the protected {coreSummary?.name} editor</h3>
                      <p className="mt-2 max-w-2xl text-sm text-slate-600">
                        This document has business rules and actions that an ordinary fillable form cannot replace. Open its editor to change the data, save the correct record, and keep its workflow protections.
                      </p>
                    </div>
                    <button type="button" onClick={openCoreEditor} className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
                      Open interactive editor
                    </button>
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-white bg-white/80 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Editable fields</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{coreSummary?.fieldCount || 0} schema fields</dd></div>
                    <div className="rounded-lg border border-white bg-white/80 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeating sections</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{coreSummary?.collectionCount ? coreSummary.collectionLabels.join(', ') : 'None'}</dd></div>
                    <div className="rounded-lg border border-white bg-white/80 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow actions</dt><dd className="mt-1 text-sm font-semibold text-slate-900">Preserved in editor</dd></div>
                  </dl>
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Final generated layout</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {selectedTemplate ? `${selectedTemplate.name}, version ${selectedTemplate.active_version.version_number} (${String(selectedTemplate.active_version.file_format).toUpperCase()}) is the active design.` : 'No active design is available. The safe legacy layout remains the fallback.'}
                      {' '}Saving business data and choosing the final layout are separate operations.
                    </p>
                  </div>
                </section>
              ) : <section>
                <h3 className="font-semibold text-slate-900">Document fields</h3>
                <div className="mt-3 grid gap-4 md:grid-cols-2">{fields.map((field) => <label key={field.id} className={`text-sm font-semibold text-slate-700 ${field.field_type === 'multiline' ? 'md:col-span-2' : ''}`}>{field.label}{field.is_required ? <span className="text-rose-600"> *</span> : null}{renderField(field)}</label>)}</div>
                {fields.length === 0 ? <p className="mt-2 text-sm text-slate-500">This template has no configured fillable fields.</p> : null}
                <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={save} disabled={!!busy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiSave /> Save draft</button><button type="button" onClick={resetFields} disabled={!!busy || fields.length === 0} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiRotateCcw /> Reset fields</button><button type="button" onClick={preview} disabled={!!busy || !selectedTemplate} className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-4 text-sm font-semibold text-brand-800 disabled:opacity-50"><FiEye /> Preview</button><button type="button" onClick={generate} disabled={!!busy || !selectedTemplate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><FiDownload /> Generate {String(selectedTemplate?.active_version?.file_format || 'docx').toUpperCase()}</button></div>
              </section>}

              {!selectedIsCore && previewUrl ? <section><div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900">Document preview</h3><button type="button" onClick={() => { window.URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }} className="text-sm font-semibold text-slate-600">Close preview</button></div><iframe title="Generated PDF preview" src={previewUrl} className="mt-3 h-[36rem] w-full rounded-xl border border-slate-300 bg-slate-100" /></section> : null}

              {!selectedIsCore ? <section className="grid gap-6 lg:grid-cols-2">
                <div><h3 className="font-semibold text-slate-900">Generated files</h3><div className="mt-3 overflow-hidden rounded-xl border border-slate-200">{outputs.map((output) => <div key={output.id} className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{output.original_filename}</p><p className="text-xs text-slate-500">Template v{output.template_version_number} · {new Date(output.generated_at).toLocaleString()}</p></div><button type="button" onClick={() => downloadDocumentOutput(output.id, output.original_filename)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300" aria-label={`Download ${output.original_filename}`}><FiDownload /></button></div>)}{outputs.length === 0 ? <p className="p-4 text-sm text-slate-500">No generated files yet.</p> : null}</div></div>
                <div><h3 className="font-semibold text-slate-900">Attachments</h3><div className="mt-3 overflow-hidden rounded-xl border border-slate-200">{attachments.map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{attachment.original_filename}</p><p className="text-xs text-slate-500">{attachment.description || 'Supporting file'}</p></div><button type="button" onClick={() => downloadDocumentAttachment(attachment.id, attachment.original_filename)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300" aria-label={`Download ${attachment.original_filename}`}><FiFile /></button></div>)}{attachments.length === 0 ? <p className="p-4 text-sm text-slate-500">No supporting files.</p> : null}</div>{canManageAttachments ? <form onSubmit={uploadAttachment} className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3"><input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.txt" onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)} className="block w-full text-sm" /><input value={attachmentDescription} onChange={(event) => setAttachmentDescription(event.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="Description" /><button disabled={!attachmentFile || !!busy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiPaperclip /> Upload attachment</button></form> : null}</div>
              </section> : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
