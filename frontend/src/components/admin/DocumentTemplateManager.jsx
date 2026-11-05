import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiCheck, FiDownload, FiFileText, FiPlus, FiRefreshCw, FiTrash2, FiUploadCloud, FiX } from 'react-icons/fi';
import {
  addDocumentFieldsFromDesign,
  adoptDocumentTemplateVersion,
  createDocumentDefinition,
  createDocumentFieldDefinition,
  createDocumentTemplate,
  deleteDocumentDefinition,
  deleteDocumentTemplate,
  downloadDocumentOutput,
  downloadBuiltInDesign,
  downloadDocumentStarter,
  downloadDocumentTemplateVersion,
  fillDesignBlanks,
  placePdfFields,
  fetchDocumentDefinitions,
  fetchDocumentFieldDefinitions,
  fetchDocumentOutputs,
  fetchDocumentTemplates,
  fetchDocumentTemplateVersions,
  revalidateDocumentTemplateVersion,
  rollbackDocumentTemplateVersion,
  testRenderDocumentTemplateVersion,
  updateDocumentTemplate,
  updateDocumentDefinition,
  updateDocumentFieldDefinition,
  uploadDocumentTemplateVersion,
} from '../../api/services';
import ConfirmationDialog from '../shared/ConfirmationDialog';
import DesignChecklist from './DesignChecklist';
import { useAuth } from '../../context/AuthContext';
import {
  DOCUMENT_TEMPLATES_MANAGE_CAPABILITIES,
  DOCUMENT_TEMPLATES_PUBLISH_CAPABILITIES,
  DOCUMENT_TEMPLATES_ROLLBACK_CAPABILITIES,
  DOCUMENT_TEMPLATES_UPLOAD_CAPABILITIES,
  DOCUMENT_DEFINITIONS_MANAGE_CAPABILITIES,
  hasAnyCapability,
} from '../../rbac';
import { humanizeFieldKey } from '../../documents/documentFieldSuggestions';
import {
  canPublishTemplateVersion,
  canRollbackTemplateVersion,
  getActivationMissingComponents,
  isTemplateConfigured,
} from '../../documents/templateReplacementWizard';

const tone = {
  valid: 'bg-emerald-100 text-emerald-800',
  invalid: 'bg-rose-100 text-rose-800',
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-blue-100 text-blue-800',
  draft: 'bg-slate-100 text-slate-700',
  retired: 'bg-slate-100 text-slate-500',
  saved: 'bg-sky-100 text-sky-800',
  ready_fill: 'bg-emerald-100 text-emerald-800',
  ready_auto: 'bg-indigo-100 text-indigo-800',
  attention: 'bg-rose-100 text-rose-800',
};

const Badge = ({ children, value }) => (
  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone[value] || 'bg-slate-100 text-slate-700'}`}>
    {children}
  </span>
);

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

const validationSummary = (version) => {
  const report = version?.validation_report || {};
  const errors = Array.isArray(report.errors) ? report.errors : [];
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  const text = (item) => typeof item === 'string' ? item : item?.message;
  if (errors.length) return errors.map(text).filter(Boolean).join(' ');
  if (warnings.length) return warnings.map(text).filter(Boolean).join(' ');
  return version?.validation_status === 'valid' ? `${String(version.file_format || 'docx').toUpperCase()} structure passed validation.` : 'Validation details are unavailable.';
};

const readinessLabel = {
  saved: 'Saved',
  ready_fill: 'Ready to fill',
  ready_auto: 'Ready for automatic fill',
  attention: 'Needs attention',
};

const PdfTemplateFieldEditor = lazy(() => import('./PdfTemplateFieldEditor'));

const isSupportedTemplateFile = (file) => /\.(docx|pdf)$/i.test(file?.name || '');

export default function DocumentTemplateManager({ open, onClose, ticketId, initialDefinitionCode }) {
  const { user } = useAuth();
  const closeRef = useRef(null);
  const [definitions, setDefinitions] = useState([]);
  const [definitionId, setDefinitionId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [versions, setVersions] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [newDesignName, setNewDesignName] = useState('');
  const [newDesignDescription, setNewDesignDescription] = useState('');
  const [newDesignFile, setNewDesignFile] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [dragTarget, setDragTarget] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [changeNotes, setChangeNotes] = useState('');
  const [fields, setFields] = useState([]);
  const [panelMode, setPanelMode] = useState('design');
  const [registration, setRegistration] = useState({ name: '', description: '', data_source: 'ticket' });
  const [newField, setNewField] = useState({ field_key: '', label: '', field_type: 'text', is_required: false, options: '' });
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [fieldEditorVersion, setFieldEditorVersion] = useState(null);
  const deleteCandidateRef = useRef(null);
  deleteCandidateRef.current = deleteCandidate;

  const canManage = hasAnyCapability(user, DOCUMENT_TEMPLATES_MANAGE_CAPABILITIES);
  const canUpload = hasAnyCapability(user, DOCUMENT_TEMPLATES_UPLOAD_CAPABILITIES);
  const canPublish = hasAnyCapability(user, DOCUMENT_TEMPLATES_PUBLISH_CAPABILITIES);
  const canRollback = hasAnyCapability(user, DOCUMENT_TEMPLATES_ROLLBACK_CAPABILITIES);
  const canManageDefinitions = hasAnyCapability(user, DOCUMENT_DEFINITIONS_MANAGE_CAPABILITIES);
  const selectedDefinition = definitions.find((item) => String(item.id) === String(definitionId));
  const selectedTemplate = templates.find((item) => String(item.id) === String(templateId));
  const activeVersionId = selectedTemplate?.active_version?.id;

  const reportError = (caught) => {
    setMessage('');
    setError(caught?.message || 'Something went wrong.');
  };

  const loadDefinitions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const items = await fetchDocumentDefinitions();
      setDefinitions(items);
      const preferred = items.find((item) => item.code === initialDefinitionCode) || items[0];
      setDefinitionId((current) => current && items.some((item) => String(item.id) === String(current)) ? current : (preferred?.id || ''));
      if (ticketId) setOutputs(await fetchDocumentOutputs(ticketId));
      else setOutputs([]);
    } catch (caught) {
      reportError(caught);
    } finally {
      setLoading(false);
    }
  }, [initialDefinitionCode, ticketId]);

  const loadTemplates = useCallback(async () => {
    if (!definitionId) {
      setTemplates([]);
      setTemplateId('');
      return;
    }
    try {
      const items = await fetchDocumentTemplates(definitionId);
      setTemplates(items);
      const preferred = items.find((item) => item.is_default) || items[0];
      setTemplateId((current) => current && items.some((item) => String(item.id) === String(current)) ? current : (preferred?.id || ''));
    } catch (caught) {
      reportError(caught);
    }
  }, [definitionId]);

  const loadVersions = useCallback(async () => {
    if (!templateId) {
      setVersions([]);
      return;
    }
    try {
      setVersions(await fetchDocumentTemplateVersions(templateId));
    } catch (caught) {
      reportError(caught);
    }
  }, [templateId]);

  const loadFields = useCallback(async () => {
    if (!definitionId) return setFields([]);
    try {
      setFields(await fetchDocumentFieldDefinitions(definitionId));
    } catch (caught) {
      reportError(caught);
    }
  }, [definitionId]);

  useEffect(() => {
    if (!open) return undefined;
    loadDefinitions();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event) => event.key === 'Escape' && !deleteCandidateRef.current && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [loadDefinitions, onClose, open]);

  useEffect(() => {
    if (open) loadTemplates();
  }, [loadTemplates, open]);

  useEffect(() => {
    if (open) loadVersions();
  }, [loadVersions, open]);

  useEffect(() => {
    if (open) loadFields();
  }, [loadFields, open]);

  useEffect(() => {
    if (!message) return undefined;
    const dismissTimer = window.setTimeout(() => setMessage(''), 4000);
    return () => window.clearTimeout(dismissTimer);
  }, [message]);

  useEffect(() => {
    if (!open) {
      setMessage('');
      setError('');
    }
  }, [open]);

  const outputsForDefinition = useMemo(
    () => outputs.filter((item) => !selectedDefinition || item.definition_code === selectedDefinition.code),
    [outputs, selectedDefinition]
  );

  // After a design is saved, bring its checklist (what was found and what to do next) into view.
  const [revealVersionId, setRevealVersionId] = useState(null);
  useEffect(() => {
    if (!revealVersionId) return;
    const element = document.getElementById(`template-version-${revealVersionId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setRevealVersionId(null);
  }, [revealVersionId, versions]);

  const run = async (key, operation, successMessage, refresh = loadVersions) => {
    setBusy(key);
    setError('');
    try {
      await operation();
      setMessage(successMessage);
      if (refresh) await refresh();
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy('');
    }
  };

  const createDesign = async (event) => {
    event.preventDefault();
    if (!newDesignName.trim() || !definitionId || !newDesignFile) return;
    await run('create', async () => {
      const created = await createDocumentTemplate({
        definition: definitionId,
        name: newDesignName.trim(),
        description: newDesignDescription.trim(),
      });
      setTemplateId(created.id);
      const uploaded = await uploadDocumentTemplateVersion({
        templateId: created.id,
        file: newDesignFile,
        changeNotes: 'Initial imported source',
        onProgress: setUploadProgress,
      });
      setNewDesignName('');
      setNewDesignDescription('');
      setNewDesignFile(null);
      setUploadProgress(null);
      const items = await fetchDocumentTemplates(definitionId);
      setTemplates(items);
      setTemplateId(created.id);
      setVersions(await fetchDocumentTemplateVersions(created.id));
      setPanelMode('design');
      setRevealVersionId(uploaded?.id || null);
    }, 'Template saved. Read its checklist below, then choose "Use this design".', null);
  };

  const registerCustomDocument = async (event) => {
    event.preventDefault();
    if (!registration.name.trim()) return;
    await run('register', async () => {
      const created = await createDocumentDefinition({
        name: registration.name.trim(),
        description: registration.description.trim(),
        data_source: registration.data_source,
      });
      setRegistration({ name: '', description: '', data_source: 'ticket' });
      const items = await fetchDocumentDefinitions();
      setDefinitions(items);
      setDefinitionId(created.id);
      setTemplateId('');
      setPanelMode('new-design');
    }, 'Custom document registered as inactive. Upload its Word or PDF design next; "Use this design" switches it on.', null);
  };

  const addCustomField = async (event) => {
    event.preventDefault();
    if (!newField.label.trim()) return;
    const validationConfig = newField.field_type === 'dropdown'
      ? { options: newField.options.split(',').map((item) => item.trim()).filter(Boolean) }
      : {};
    await run('field', async () => {
      await createDocumentFieldDefinition({
        definition: definitionId,
        // Blank key: made from the label, the same way a plain name such as [Certificate Note] is read.
        field_key: (newField.field_key.trim() || newField.label.trim()).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''),
        label: newField.label.trim(),
        field_type: newField.field_type,
        is_required: newField.is_required,
        validation_config: validationConfig,
        display_order: fields.length * 10 + 10,
      });
      setNewField({ field_key: '', label: '', field_type: 'text', is_required: false, options: '' });
    }, 'Custom field added.', async () => {
      await Promise.all([loadFields(), loadDefinitions()]);
    });
  };

  const toggleDefinition = () => run('definition-status', async () => {
    await updateDocumentDefinition(definitionId, { is_active: !selectedDefinition.is_active });
    await loadDefinitions();
  }, selectedDefinition?.is_active ? 'Custom document disabled.' : 'Custom document enabled.', null);

  const toggleField = (field) => run(`field-${field.id}`, async () => {
    await updateDocumentFieldDefinition(field.id, { is_active: !field.is_active });
  }, field.is_active ? 'Field disabled.' : 'Field enabled.', async () => {
    await Promise.all([loadFields(), loadDefinitions()]);
  });

  const uploadVersion = async (event) => {
    event.preventDefault();
    if (!uploadFile || !templateId) return;
    const formElement = event.currentTarget;
    await run('upload', async () => {
      const uploaded = await uploadDocumentTemplateVersion({ templateId, file: uploadFile, changeNotes, onProgress: setUploadProgress });
      setRevealVersionId(uploaded?.id || null);
      setUploadFile(null);
      setChangeNotes('');
      setUploadProgress(null);
      formElement.reset();
    }, 'New version saved. Read its checklist below, then choose "Use this design".');
  };

  const acceptDroppedFile = (event, setter) => {
    event.preventDefault();
    setDragTarget('');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!isSupportedTemplateFile(file)) {
      setError('Upload a DOCX or PDF template.');
      return;
    }
    setError('');
    setter(file);
  };

  const setDefault = () => run('default', async () => {
    await updateDocumentTemplate(templateId, { is_default: true });
  }, 'Default design updated.', loadTemplates);

  const toggleEnabled = () => run('enabled', async () => {
    await updateDocumentTemplate(templateId, { is_enabled: !selectedTemplate.is_enabled });
  }, selectedTemplate?.is_enabled ? 'Design retired.' : 'Design enabled.', loadTemplates);

  const deleteDesign = () => {
    if (deleteCandidate?.kind === 'type') {
      return run('delete', async () => {
        await deleteDocumentDefinition(deleteCandidate.id);
        setDeleteCandidate(null);
        setTemplateId('');
        setDefinitionId('');
        await loadDefinitions();
      }, 'Document type deleted.', null);
    }
    return run('delete', async () => {
      await deleteDocumentTemplate(deleteCandidate.id);
      setDeleteCandidate(null);
      setTemplateId('');
    }, 'Document design deleted.', loadTemplates);
  };

  // A custom document can only be switched on once one of its designs is the enabled default with a version in use.
  const hasDesignInUse = templates.some((item) => item.is_default && item.is_enabled && item.active_version);

  const customDefinitionPanel = selectedDefinition?.category === 'custom' ? (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h3 className="font-semibold text-slate-900">Custom document setup</h3><Badge value={selectedDefinition.is_active ? 'valid' : 'draft'}>{selectedDefinition.is_active ? 'enabled' : 'inactive'}</Badge></div>
          <p className="mt-1 text-xs text-slate-600">Source: {selectedDefinition.data_source}. Custom forms add presentation fields only; they do not create workflow authority.</p>
        </div>
        {canManageDefinitions ? <button type="button" onClick={toggleDefinition} disabled={!!busy || (!selectedDefinition.is_active && !hasDesignInUse)} title={!selectedDefinition.is_active && !hasDesignInUse ? 'Choose "Use this design" on a version first; that switches the document on.' : undefined} className="h-9 rounded-lg border border-indigo-300 bg-white px-3 text-sm font-semibold text-indigo-800 disabled:opacity-50">{selectedDefinition.is_active ? 'Disable document' : 'Enable document'}</button> : null}
        {canManageDefinitions ? <button type="button" onClick={() => setDeleteCandidate({ ...selectedDefinition, kind: 'type' })} disabled={!!busy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><FiTrash2 /> Delete document type</button> : null}
      </div>
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-slate-800">Fields staff fill in</h4>
        <p className="mt-1 text-xs text-slate-500">Usually added from the design with <strong>Add as fields</strong>. Type them in Word as shown.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {fields.map((field) => <span key={field.id} className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${field.is_active ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}><span className="font-semibold" title={`Technical key: ${field.field_key}`}>{`[${field.field_key.split('_').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}]`}</span>{field.label ? <span className="text-slate-500">{field.label}</span> : null}{field.is_required ? 'Required' : 'Optional'}{canManageDefinitions ? <button type="button" onClick={() => toggleField(field)} className="font-semibold text-brand-700">{field.is_active ? 'Disable' : 'Enable'}</button> : null}</span>)}
          {fields.length === 0 ? <span className="text-xs text-slate-500">No fields of its own yet.</span> : null}
        </div>
        {canManageDefinitions ? (
          <details className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">Add a field by hand (advanced)</summary>
          <form onSubmit={addCustomField} className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[1fr_1fr_10rem_auto] lg:items-end">
            <label className="text-xs font-semibold text-slate-600">Label<input value={newField.label} onChange={(event) => setNewField((value) => ({ ...value, label: event.target.value }))} placeholder="Certificate note" className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-600">Field key (optional)<input value={newField.field_key} onChange={(event) => setNewField((value) => ({ ...value, field_key: event.target.value }))} placeholder="made from the label" className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-600">Type<select value={newField.field_type} onChange={(event) => setNewField((value) => ({ ...value, field_type: event.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal"><option value="text">Text</option><option value="multiline">Multiline</option><option value="number">Number</option><option value="date">Date</option><option value="boolean">Yes / No</option><option value="dropdown">Dropdown</option></select></label>
            <button disabled={!newField.label.trim() || !!busy} className="h-9 rounded-lg border border-indigo-300 bg-white px-3 text-sm font-semibold text-indigo-800 disabled:opacity-50">Add field</button>
            {newField.field_type === 'dropdown' ? <label className="text-xs font-semibold text-slate-600 md:col-span-2 lg:col-span-4">Options, separated by commas<input value={newField.options} onChange={(event) => setNewField((value) => ({ ...value, options: event.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal" /></label> : null}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={newField.is_required} onChange={(event) => setNewField((value) => ({ ...value, is_required: event.target.checked }))} /> Required</label>
          </form>
          </details>
        ) : null}
      </div>
    </section>
  ) : null;

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`Copied ${text}`);
    } catch {
      setError(`Could not copy automatically. Type it exactly like this: ${text}`);
    }
  };

  const fieldsYouCanUsePanel = selectedDefinition ? (() => {
    const details = selectedDefinition.placeholder_details || [];
    const plainFields = details.filter((item) => !item.is_collection);
    const tables = details.filter((item) => item.is_collection);
    const inUse = selectedTemplate?.active_version;
    // While nothing is "in use", offer the original: AFN's own Word design for the six built-in documents (works even
    // before any version was imported), or the first uploaded version of a custom document.
    const isCore = selectedDefinition.category !== 'custom';
    const firstVersion = !inUse && !isCore && versions.length
      ? versions.reduce((first, item) => (Number(item.version_number) < Number(first.version_number) ? item : first), versions[0])
      : null;
    const downloadOriginal = isCore
      ? () => downloadBuiltInDesign(selectedDefinition.id, `${selectedDefinition.code}.docx`)
      : firstVersion ? () => downloadDocumentTemplateVersion(firstVersion.id, firstVersion.original_filename || 'original-design.docx') : null;
    return (
      <section aria-label="Fields you can use" className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
        <h4 className="font-semibold text-slate-900">Fields you can use</h4>
        <p className="mt-1 text-xs text-slate-600">In your Word file, type the name in square brackets exactly as shown, for example <strong>[Client Name]</strong>. AFN fills it in. Click Copy to avoid typos.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {inUse ? <button type="button" disabled={!!busy} onClick={() => run(`current-${inUse.id}`, () => downloadDocumentTemplateVersion(inUse.id, inUse.original_filename || 'current-design.docx'), 'The design in use was downloaded. Edit it in Word and upload it as a new version.', null)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiDownload /> Download the design in use</button> : null}
          {!inUse && downloadOriginal ? <button type="button" disabled={!!busy} onClick={() => run('original-design', downloadOriginal, 'The original design was downloaded. Edit it in Word and upload it as a new version.', null)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiDownload /> Download the original design</button> : null}
          {selectedDefinition.category === 'custom' ? <button type="button" disabled={!!busy} onClick={() => run(`starter-${selectedDefinition.id}`, () => downloadDocumentStarter(selectedDefinition.id, `${selectedDefinition.code}-starter.docx`), 'Starter file downloaded. Restyle it in Word and upload it as a design.', null)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiDownload /> Download a blank starter file</button> : null}
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plainFields.map((item) => {
            const marker = `[${item.key.split('_').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}]`;
            return (
              <li key={item.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{marker}</span><span className="block truncate text-slate-500">{item.label}</span></span>
                <button type="button" aria-label={`Copy ${marker}`} onClick={() => copyText(marker)} className="h-7 shrink-0 rounded-md border border-slate-300 px-2 font-semibold text-slate-700">Copy</button>
              </li>
            );
          })}
        </ul>
        {tables.length ? (
          <div className="mt-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Repeating tables</p>
            <p className="mt-1">{selectedDefinition.category === 'custom' ? 'Not available for this document type.' : "Keep these tables from AFN's design and only change how they look. Rebuilding one from scratch also needs its column field names, so leave that to your system administrator."}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {tables.map((item) => {
                const marker = `{{#${item.key}}} ... {{/${item.key}}}`;
                return (
                  <li key={item.key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                    <span>{item.label}</span>
                    <button type="button" aria-label={`Copy table markers for ${item.label}`} onClick={() => copyText(marker)} className="h-7 rounded-md border border-slate-300 px-2 font-semibold text-slate-700">Copy</button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>
    );
  })() : null;

  const placeholderCatalogPanel = selectedDefinition ? (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">
        Approved placeholders ({selectedDefinition.placeholder_details?.length || 0})
      </summary>
      <p className="mt-2 text-xs text-slate-500">Use only these fields in uploaded DOCX files. Repeating fields require matching opening and closing section markers.</p>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {(selectedDefinition.placeholder_details || []).map((item) => (
          <div key={item.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-semibold text-indigo-800">{`{{${item.key}}}`}</code>
              <Badge value={item.is_collection ? 'pending' : 'draft'}>{item.value_type}</Badge>
              {item.is_required ? <Badge value="invalid">required</Badge> : null}
            </div>
            <p className="mt-2 font-medium text-slate-700">{item.label}</p>
            <p className="mt-1 text-slate-500">{item.description}</p>
            <p className="mt-1 break-all text-slate-500">Source: <code>{item.source_field}</code></p>
            <p className="mt-1 text-slate-500">{item.formatting_rules}</p>
          </div>
        ))}
      </div>
    </details>
  ) : null;

  const newDesignPanel = (
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">New design</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">Import a template for {selectedDefinition?.name}</h3>
      <p className="mt-1 text-sm text-slate-500">This creates a separate reusable design. Saving the original and configuring fields are separate steps.</p>
      <form onSubmit={createDesign} className="mt-6 space-y-4">
        <label htmlFor="new-design-name" className="block text-sm font-semibold text-slate-700">Design name<input id="new-design-name" value={newDesignName} onChange={(event) => setNewDesignName(event.target.value)} maxLength={150} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" placeholder="Example: AFN official quotation" /></label>
        <label className="block text-sm font-semibold text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span><input value={newDesignDescription} onChange={(event) => setNewDesignDescription(event.target.value)} maxLength={500} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" placeholder="When should staff use this design?" /></label>
        <label className={`block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${dragTarget === 'new' ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-400'}`} onDragEnter={(event) => { event.preventDefault(); setDragTarget('new'); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragTarget('')} onDrop={(event) => acceptDroppedFile(event, setNewDesignFile)}>
          <FiUploadCloud className="mx-auto text-brand-600" size={28} />
          <span className="mt-3 block text-sm font-semibold text-slate-800">{newDesignFile?.name || 'Drop a DOCX or PDF here'}</span>
          <span className="mt-1 block text-xs text-slate-500">or browse files · maximum 10 MB</span>
          <input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setNewDesignFile(event.target.files?.[0] || null)} className="sr-only" />
        </label>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPanelMode('design')} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">Cancel</button><button disabled={!newDesignName.trim() || !newDesignFile || busy === 'create'} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><FiPlus /> Save new design</button></div>
        {busy === 'create' && uploadProgress !== null ? <div aria-label={`Upload ${uploadProgress}%`} className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-600 transition-all" style={{ width: `${uploadProgress}%` }} /></div> : null}
      </form>
    </section>
  );

  const registrationPanel = (
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">New document type</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">Register a custom document</h3>
      <p className="mt-1 text-sm text-slate-500">Use this only when the document is not already listed. You will add its first design afterward.</p>
      <form onSubmit={registerCustomDocument} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold text-slate-700">Document name<input value={registration.name} onChange={(event) => setRegistration((value) => ({ ...value, name: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" required /></label>
        <label className="block text-sm font-semibold text-slate-700">Description<textarea value={registration.description} onChange={(event) => setRegistration((value) => ({ ...value, description: event.target.value }))} className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm font-normal" /></label>
        <label className="block text-sm font-semibold text-slate-700">AFN record used to fill it<select value={registration.data_source} onChange={(event) => setRegistration((value) => ({ ...value, data_source: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"><option value="ticket">Service ticket</option><option value="client">Client</option><option value="project">Solar project</option></select></label>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPanelMode('design')} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">Cancel</button><button disabled={!registration.name.trim() || busy === 'register'} className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Create document type</button></div>
      </form>
    </section>
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="template-manager-title" className="flex h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[90vh] sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h2 id="template-manager-title" className="text-lg font-semibold text-slate-900">Document templates</h2>
            <p className="mt-1 text-sm text-slate-500">Save existing Word or PDF documents as reusable templates without changing their business workflow.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close template manager"><FiX /></button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="document-definition">Document type</label>
            <select id="document-definition" value={definitionId} onChange={(event) => { setDefinitionId(event.target.value); setTemplateId(''); setPanelMode('design'); }} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              {definitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <p className="mt-2 text-xs text-slate-500">{selectedDefinition?.description || 'Choose the document workflow to configure.'}</p>

            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Designs</h3>
              <button type="button" onClick={loadTemplates} className="text-slate-500 hover:text-brand-700" aria-label="Refresh designs"><FiRefreshCw size={15} /></button>
            </div>
            <div className="mt-2 space-y-2">
              {templates.map((item) => (
                <button key={item.id} type="button" onClick={() => { setTemplateId(item.id); setPanelMode('design'); }} className={`w-full rounded-lg border p-3 text-left ${panelMode === 'design' && String(item.id) === String(templateId) ? 'border-brand-500 bg-white shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}>
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-800"><span className="truncate">{item.name}</span>{item.is_default ? <FiCheck className="text-emerald-600" aria-label="Default" /> : null}</span>
                  <span className="mt-1 block text-xs text-slate-500">{item.active_version ? `Active v${item.active_version.version_number}` : 'No active version'}{!item.is_enabled ? ' · Retired' : ''}</span>
                </button>
              ))}
              {!loading && templates.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">No designs yet.</p> : null}
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
              {canManage && canUpload ? <button type="button" onClick={() => setPanelMode('new-design')} className={`inline-flex h-10 w-full items-center justify-start gap-2 rounded-lg border px-3 text-sm font-semibold ${panelMode === 'new-design' ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-300'}`}><FiPlus /> Add new design</button> : null}
              {canManageDefinitions ? <button type="button" onClick={() => setPanelMode('register-document')} className={`inline-flex h-10 w-full items-center justify-start gap-2 rounded-lg border px-3 text-sm font-semibold ${panelMode === 'register-document' ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-300'}`}><FiFileText /> New document type</button> : null}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-4 sm:p-6">
            {error ? <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
            {message ? <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
            {panelMode === 'new-design' ? <div className="space-y-6">{customDefinitionPanel ? <div>{customDefinitionPanel}</div> : null}{newDesignPanel}</div> : panelMode === 'register-document' ? registrationPanel : !selectedTemplate ? (
              <div className="space-y-6">
                {customDefinitionPanel ? <div>{customDefinitionPanel}</div> : null}
                <div className="grid min-h-[16rem] place-items-center text-center text-sm text-slate-500">Choose or create a design to manage its versions.</div>
              </div>
            ) : (
              <div className="space-y-6">
                {customDefinitionPanel ? <div>{customDefinitionPanel}</div> : null}
                <section className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{selectedTemplate.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{selectedTemplate.active_version ? `Version ${selectedTemplate.active_version.version_number} is active.` : (selectedDefinition?.category === 'custom' ? 'No version is active; this custom document cannot generate yet.' : 'No version is active; generation uses the safe legacy fallback.')}</p>
                  </div>
                  {canManage ? <div className="flex flex-wrap gap-2"><button type="button" onClick={setDefault} disabled={selectedTemplate.is_default || !!busy} className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">{selectedTemplate.is_default ? 'Default' : 'Set default'}</button><button type="button" onClick={toggleEnabled} disabled={!!busy} className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700">{selectedTemplate.is_enabled ? 'Retire' : 'Enable'}</button><button type="button" onClick={() => setDeleteCandidate(selectedTemplate)} disabled={!!busy || !!selectedTemplate.active_version} title={selectedTemplate.active_version ? 'Activate another design before deleting this active design.' : 'Delete this unreferenced design'} className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"><FiTrash2 /> Delete</button></div> : null}
                </section>

                {fieldsYouCanUsePanel}

                {placeholderCatalogPanel}

                {canUpload ? (
                  <form onSubmit={uploadVersion} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="font-semibold text-slate-900">Replace source document</h4>
                    <p className="mt-1 text-xs text-slate-500">The preserved original becomes a new version. It remains inactive until it is supported, validated, and deliberately activated.</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                      <label
                        className={`cursor-pointer rounded-xl border-2 border-dashed p-3 text-center text-xs transition ${dragTarget === 'version' ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-400'}`}
                        onDragEnter={(event) => { event.preventDefault(); setDragTarget('version'); }}
                        onDragOver={(event) => event.preventDefault()}
                        onDragLeave={() => setDragTarget('')}
                        onDrop={(event) => acceptDroppedFile(event, setUploadFile)}
                      >
                        <FiUploadCloud className="mx-auto text-brand-600" size={20} />
                        <span className="mt-1 block font-semibold text-slate-700">{uploadFile?.name || 'Drop DOCX or PDF'}</span>
                        <input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} className="sr-only" />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">Change notes<input value={changeNotes} onChange={(event) => setChangeNotes(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal" placeholder="What changed?" /></label>
                      <button disabled={!uploadFile || busy === 'upload'} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><FiUploadCloud /> Save version</button>
                    </div>
                    {busy === 'upload' && uploadProgress !== null ? <div aria-label={`Upload ${uploadProgress}%`} className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-600 transition-all" style={{ width: `${uploadProgress}%` }} /></div> : null}
                  </form>
                ) : null}

                <section>
                  <h4 className="font-semibold text-slate-900">Version history</h4>
                  <div className="mt-3 space-y-3">
                    {versions.map((version) => {
                      const isActive = Number(activeVersionId) === Number(version.id);
                      const isDocx = version.file_format === 'docx';
                      const isConfigured = isTemplateConfigured(version);
                      const missingActivation = getActivationMissingComponents(version);
                      const canActivate = canPublishTemplateVersion(version);
                      const canRollBackToVersion = canRollback && canRollbackTemplateVersion({ version, versions, activeVersionId });
                      return (
                        <article key={version.id} id={`template-version-${version.id}`} className="scroll-mt-4 rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">Version {version.version_number}</span><Badge value={version.validation_status}>{String(version.file_format || 'docx').toUpperCase()}</Badge><Badge value={version.readiness_status}>{readinessLabel[version.readiness_status] || 'Saved'}</Badge><Badge value={version.publication_status}>{version.publication_status}</Badge></div>
                              <p className="mt-1 text-xs text-slate-500">{version.original_filename} · {formatDate(version.uploaded_at)}</p>
                              {Array.isArray(version.checklist) && version.checklist.length ? (
                                <DesignChecklist
                                  items={version.checklist}
                                  busy={!!busy}
                                  onAddFields={version.publication_status === 'draft' && canManageDefinitions
                                    ? (names) => run(`fields-${version.id}`, () => addDocumentFieldsFromDesign(version.id, names), 'Fields added and the design was checked again.', async () => { await loadVersions(); await loadFields(); })
                                    : null}
                                  onPlaceFields={version.publication_status === 'draft' && canManage
                                    ? (names) => run(`place-${version.id}`, () => placePdfFields(version.id, names), 'Fields placed. Open Set up fields to check each position.', loadVersions)
                                    : null}
                                  onFillBlanks={version.publication_status === 'draft' && canManage
                                    ? (names) => run(`blanks-${version.id}`, () => fillDesignBlanks(version.id, names), 'Blanks filled. The result is saved as a new version; your original is kept.', loadVersions)
                                    : null}
                                />
                              ) : <p className="mt-2 text-sm text-slate-600">{validationSummary(version)}</p>}
                              {version.change_notes ? <p className="mt-1 text-xs text-slate-500">Notes: {version.change_notes}</p> : null}
                              {!(Array.isArray(version.checklist) && version.checklist.length) && missingActivation.length && !version.activated_at ? <p className="mt-2 text-xs font-medium text-rose-700">Activation needs: {missingActivation.map((key) => humanizeFieldKey(key, selectedDefinition?.placeholder_details)).join(', ')}.</p> : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" disabled={!!busy} onClick={() => run(`source-${version.id}`, () => downloadDocumentTemplateVersion(version.id, version.original_filename), 'Original template downloaded.', null)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiDownload /> Original</button>
                              {!isDocx && version.publication_status === 'draft' && canManage ? <button type="button" disabled={!!busy} onClick={() => setFieldEditorVersion(version)} className="h-9 rounded-lg border border-brand-300 bg-brand-50 px-3 text-sm font-semibold text-brand-800">Set up fields</button> : null}
                              {isConfigured ? <button type="button" disabled={!ticketId || version.validation_status !== 'valid' || !!busy} onClick={() => run(`test-${version.id}`, () => testRenderDocumentTemplateVersion(version.id, ticketId), `Test ${String(version.file_format).toUpperCase()} downloaded.`, null)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiFileText /> Test {String(version.file_format).toUpperCase()}</button> : null}
                              {isDocx && version.publication_status === 'draft' && canManage ? <button type="button" disabled={!!busy} onClick={() => run(`recheck-${version.id}`, () => revalidateDocumentTemplateVersion(version.id), 'The design was checked again.')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiRefreshCw /> Check again</button> : null}
                              {canPublish && !isActive && version.publication_status === 'draft' ? <button type="button" disabled={!!busy || (!isDocx && !canActivate)} title={!isDocx && !isConfigured ? 'Finish this design setup before using it.' : undefined} onClick={() => run(`use-${version.id}`, () => adoptDocumentTemplateVersion(version.id), `Version ${version.version_number} is now the design in use.`, async () => { await loadVersions(); await loadTemplates(); await loadDefinitions(); })} className="h-9 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white disabled:opacity-50">Use this design</button> : null}
                              {canRollBackToVersion ? <button type="button" disabled={!!busy} onClick={() => run(`rollback-${version.id}`, () => rollbackDocumentTemplateVersion(version.id), `Rolled back to version ${version.version_number}.`, async () => { await loadVersions(); await loadTemplates(); })} className="h-9 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800">Roll back</button> : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {versions.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No uploaded versions.</p> : null}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Test preview downloads the actual rendered DOCX or configured PDF using the selected ticket. A PDF remains Saved—not ready to fill—until at least one supported field is configured.</p>
                </section>

                <section>
                  <h4 className="font-semibold text-slate-900">Generated files {ticketId ? `for ticket ${ticketId}` : ''}</h4>
                  {!ticketId ? <p className="mt-2 text-sm text-slate-500">Select a ticket on the Documents page to view its archived output history.</p> : (
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                      {outputsForDefinition.map((output) => <div key={output.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0"><div><p className="text-sm font-semibold text-slate-800">{output.original_filename}</p><p className="text-xs text-slate-500">{formatDate(output.generated_at)} · {output.renderer_source === 'dynamic' ? `Template v${output.template_version_number}` : 'Legacy fallback'}</p></div><button type="button" onClick={() => run(`output-${output.id}`, () => downloadDocumentOutput(output.id, output.original_filename), 'Archived document downloaded.', null)} disabled={output.status !== 'ready' || !!busy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiDownload /> Download</button></div>)}
                      {outputsForDefinition.length === 0 ? <p className="p-4 text-sm text-slate-500">No generated files for this document type yet.</p> : null}
                    </div>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      </section>
      {deleteCandidate ? (
        <ConfirmationDialog
          title={deleteCandidate.kind === 'type' ? 'Delete this document type?' : 'Delete this design?'}
          message={deleteCandidate.kind === 'type'
            ? `This permanently deletes “${deleteCandidate.name}”, its fields and all of its designs. It only works if no document was ever made with it; otherwise disable it instead. This cannot be undone.`
            : `This permanently deletes “${deleteCandidate.name}” and its unreferenced draft or retired versions. If it is the default, another design becomes the default automatically. This cannot be undone.`}
          tone="danger"
          icon="danger"
          confirmLabel={deleteCandidate.kind === 'type' ? 'Delete document type' : 'Delete design'}
          loading={busy === 'delete'}
          onConfirm={deleteDesign}
          onCancel={() => setDeleteCandidate(null)}
        />
      ) : null}
      {fieldEditorVersion ? <Suspense fallback={<div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/70 text-sm font-semibold text-white">Opening PDF field setup…</div>}><PdfTemplateFieldEditor version={fieldEditorVersion} definition={selectedDefinition} onClose={() => setFieldEditorVersion(null)} onChanged={loadVersions} /></Suspense> : null}
    </div>
  );
}
