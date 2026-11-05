import { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiPlus, FiSave, FiTrash2, FiX } from 'react-icons/fi';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  createDocumentTemplateField,
  deleteDocumentTemplateField,
  fetchDocumentTemplateFields,
  fetchDocumentTemplateSource,
  updateDocumentTemplateField,
} from '../../api/services';
import {
  findNearbyPdfLabel,
  getMissingRequiredMappings,
  humanizeFieldKey,
  suggestFieldMappings,
} from '../../documents/documentFieldSuggestions';
import { clampPdfZoom, movePdfField, resizePdfField } from '../../documents/pdfFieldPlacement';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const blankField = (versionId, pageNumber, placement = { x: 0.1, y: 0.1, width: 0.25, height: 0.05 }) => ({
  template_version: versionId,
  field_key: '',
  label: '',
  field_type: 'text',
  fill_method: 'manual',
  source_key: '',
  is_required: false,
  default_value: '',
  options: [],
  page_number: pageNumber,
  placement,
  is_active: true,
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const inputClass = 'mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

export default function PdfTemplateFieldEditor({ version, definition, onClose, onChanged }) {
  const canvasRef = useRef(null);
  const pageWrapRef = useRef(null);
  const viewerRef = useRef(null);
  const pdfRef = useRef(null);
  const dragRef = useRef(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pdfReady, setPdfReady] = useState(false);
  const [fields, setFields] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('load');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pageTextItems, setPageTextItems] = useState([]);
  const [suggestionContext, setSuggestionContext] = useState(null);
  const [zoom, setZoom] = useState(1);
  const sourceOptions = useMemo(() => definition?.placeholder_details || [], [definition]);
  const pageFields = fields.filter((field) => field.page_number === pageNumber);
  const missingRequired = getMissingRequiredMappings(
    definition?.code,
    fields.filter((field) => field.fill_method === 'system').map((field) => field.source_key),
  );
  const requestClose = () => {
    if (dirty && !window.confirm('Discard the unsaved field changes?')) return;
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (event) => event.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask;
    setPdfReady(false);
    setPageNumber(1);
    (async () => {
      try {
        const [blob, loadedFields] = await Promise.all([
          fetchDocumentTemplateSource(version.id),
          fetchDocumentTemplateFields(version.id),
        ]);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        loadingTask = getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setFields(loadedFields);
        setPdfReady(true);
        setBusy('');
      } catch (caught) {
        if (!cancelled) {
          setError(caught?.message || 'Unable to open this PDF.');
          setBusy('');
        }
      }
    })();
    return () => {
      cancelled = true;
      loadingTask?.destroy();
      pdfRef.current = null;
      setPdfReady(false);
    };
  }, [version.id]);

  useEffect(() => {
    if (!pdfReady || !pdfRef.current || !canvasRef.current) return undefined;
    let cancelled = false;
    let renderTask;
    (async () => {
      const page = await pdfRef.current.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      if (!cancelled) {
        setPageTextItems(textContent.items.map((item) => {
          const height = Math.max(Math.abs(item.transform?.[3] || 0), Number(item.height) || 0, 1);
          return {
            text: String(item.str || '').trim(),
            x: clamp((item.transform?.[4] || 0) / base.width, 0, 1),
            y: clamp(1 - ((item.transform?.[5] || 0) + height) / base.height, 0, 1),
            width: clamp((Number(item.width) || 0) / base.width, 0, 1),
            height: clamp(height / base.height, 0, 1),
          };
        }).filter((item) => item.text));
        setSuggestionContext(null);
      }
      const availableWidth = Math.max(280, (viewerRef.current?.clientWidth || 868) - 48);
      const maximumWidth = Math.min(820, availableWidth);
      const viewport = page.getViewport({ scale: (maximumWidth / base.width) * zoom });
      const canvas = canvasRef.current;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d');
      renderTask = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (!cancelled) setBusy('');
    })().catch((caught) => !cancelled && setError(caught?.message || 'Unable to render this PDF page.'));
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pageCount, pdfReady, zoom]);

  useEffect(() => {
    const move = (event) => {
      if (!dragRef.current || !pageWrapRef.current) return;
      const { field, startX, startY, original } = dragRef.current;
      const rect = pageWrapRef.current.getBoundingClientRect();
      const x = clamp(original.x + (event.clientX - startX) / rect.width, 0, 1 - original.width);
      const y = clamp(original.y + (event.clientY - startY) / rect.height, 0, 1 - original.height);
      setFields((current) => current.map((item) => item.id === field.id ? { ...item, placement: { ...item.placement, x, y } } : item));
      setDraft((current) => current?.id === field.id ? { ...current, placement: { ...current.placement, x, y } } : current);
      setDirty(true);
    };
    const stop = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, []);

  const addAt = (event) => {
    if (event.target !== canvasRef.current || version.publication_status !== 'draft') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const point = {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 0.75),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 0.95),
    };
    const nearby = findNearbyPdfLabel(pageTextItems, point);
    const suggestions = nearby
      ? suggestFieldMappings(nearby.text, sourceOptions, definition?.code)
      : [];
    setDraft({
      ...blankField(version.id, pageNumber, {
        ...point,
      width: 0.25,
      height: 0.05,
      }),
      label: nearby?.text || '',
    });
    setSuggestionContext(nearby ? { detectedLabel: nearby.text, suggestions } : null);
    setDirty(true);
  };

  const acceptSuggestion = (suggestion) => {
    setDraft((current) => ({
      ...current,
      label: suggestion.label,
      field_type: ['date', 'number', 'currency'].includes(suggestion.value_type) ? suggestion.value_type : 'text',
      fill_method: 'system',
      source_key: suggestion.key,
    }));
    setSuggestionContext((current) => ({ ...current, acceptedKey: suggestion.key }));
    setDirty(true);
  };

  const save = async () => {
    if (!draft?.label.trim()) return;
    setBusy('save');
    setError('');
    const payload = {
      ...draft,
      field_key: (draft.field_key || draft.label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64),
      label: draft.label.trim(),
      options: draft.field_type === 'dropdown' ? draft.options : [],
    };
    try {
      const saved = draft.id
        ? await updateDocumentTemplateField(draft.id, payload)
        : await createDocumentTemplateField(payload);
      setFields((current) => draft.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setDraft(saved);
      setDirty(false);
      await onChanged?.();
    } catch (caught) {
      setError(caught?.message || 'Unable to save this field.');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!draft?.id) return setDraft(null);
    setBusy('delete');
    try {
      await deleteDocumentTemplateField(draft.id);
      setFields((current) => current.filter((item) => item.id !== draft.id));
      setDraft(null);
      setDirty(false);
      await onChanged?.();
    } catch (caught) {
      setError(caught?.message || 'Unable to remove this field.');
    } finally {
      setBusy('');
    }
  };

  const updateDraft = (key, value) => { setDraft((current) => ({ ...current, [key]: value })); setDirty(true); };
  const setDraftPlacement = (placement) => {
    setDraft((current) => ({ ...current, placement }));
    if (draft?.id) setFields((current) => current.map((item) => item.id === draft.id ? { ...item, placement } : item));
    setDirty(true);
  };
  const updatePlacement = (key, value) => setDraftPlacement({ ...draft.placement, [key]: Number(value) });
  const moveDraft = (x, y) => setDraftPlacement(movePdfField(draft.placement, x, y));
  const resizeDraft = (width, height) => setDraftPlacement(resizePdfField(draft.placement, width, height));

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-slate-950/70 p-2 sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="pdf-field-editor-title" className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div><h2 id="pdf-field-editor-title" className="font-semibold text-slate-900">Set up fields · {version.original_filename}</h2><p className="mt-1 text-xs text-slate-500">Click a blank area to add a field. Drag saved fields to move them. The original PDF is never changed.</p></div>
          <button type="button" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close field setup"><FiX /></button>
        </header>
        {error ? <p role="alert" className="m-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div ref={viewerRef} className="min-h-0 overflow-auto bg-slate-100 p-3 sm:p-6">
            <div className="mx-auto mb-3 flex max-w-[820px] flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 shadow-sm">
              <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)} className="grid h-8 w-8 place-items-center rounded border border-slate-300 disabled:opacity-40" aria-label="Previous page"><FiChevronLeft /></button>
              <div className="flex flex-wrap items-center justify-center gap-2"><span className="text-sm font-semibold text-slate-700">Page {pageNumber} of {pageCount}</span><label className="sr-only" htmlFor="pdf-page-field">Fields on this page</label><select id="pdf-page-field" value={draft?.id || ''} onChange={(event) => { const selected = fields.find((item) => String(item.id) === event.target.value); if (selected) { setPageNumber(selected.page_number); setDraft(selected); setSuggestionContext(null); } }} className="h-8 max-w-44 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">{pageFields.length} field{pageFields.length === 1 ? '' : 's'} on page</option>{pageFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select><div className="inline-flex rounded border border-slate-300"><button type="button" onClick={() => setZoom((value) => clampPdfZoom(value - 0.25))} className="h-8 px-2 text-sm" aria-label="Zoom out">−</button><button type="button" onClick={() => setZoom(1)} className="h-8 border-x border-slate-300 px-2 text-xs font-semibold" aria-label="Fit page">{Math.round(zoom * 100)}%</button><button type="button" onClick={() => setZoom((value) => clampPdfZoom(value + 0.25))} className="h-8 px-2 text-sm" aria-label="Zoom in">+</button></div></div>
              <button type="button" disabled={pageNumber >= pageCount} onClick={() => setPageNumber((value) => value + 1)} className="grid h-8 w-8 place-items-center rounded border border-slate-300 disabled:opacity-40" aria-label="Next page"><FiChevronRight /></button>
            </div>
            <div ref={pageWrapRef} className="relative mx-auto w-fit overflow-hidden bg-white shadow-xl">
              <canvas ref={canvasRef} onClick={addAt} className="block cursor-crosshair" />
              {pageFields.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  onPointerDown={(event) => { event.preventDefault(); dragRef.current = { field, startX: event.clientX, startY: event.clientY, original: field.placement }; setDraft(field); setSuggestionContext(null); }}
                  onClick={(event) => { event.stopPropagation(); setDraft(field); setSuggestionContext(null); }}
                  className={`absolute overflow-hidden border-2 bg-sky-100/60 px-1 text-left text-[10px] font-semibold text-sky-950 ${draft?.id === field.id ? 'border-brand-600 ring-2 ring-brand-200' : 'border-sky-500'}`}
                  style={{ left: `${field.placement.x * 100}%`, top: `${field.placement.y * 100}%`, width: `${field.placement.width * 100}%`, height: `${field.placement.height * 100}%` }}
                >{field.label}</button>
              ))}
              {draft && !draft.id && draft.page_number === pageNumber ? <div className="pointer-events-none absolute border-2 border-dashed border-brand-600 bg-brand-100/50" style={{ left: `${draft.placement.x * 100}%`, top: `${draft.placement.y * 100}%`, width: `${draft.placement.width * 100}%`, height: `${draft.placement.height * 100}%` }} /> : null}
            </div>
          </div>
          <aside className="min-h-0 overflow-y-auto border-t border-slate-200 p-4 lg:border-l lg:border-t-0">
            {missingRequired.length ? (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">Important content still needs review</p>
                <p className="mt-1">Not connected: {missingRequired.map((key) => humanizeFieldKey(key, sourceOptions)).join(', ')}.</p>
                <p className="mt-1">Fixed PDFs cannot expand repeating tables; confirm those sections in the generated test.</p>
              </div>
            ) : null}
            {!draft ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center"><FiPlus className="mx-auto text-slate-400" /><p className="mt-2 text-sm text-slate-600">Click the document where a value should appear.</p></div> : (
              <div className="space-y-3">
                {suggestionContext ? (
                  <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                    <p className="font-semibold">Nearby text: “{suggestionContext.detectedLabel}”</p>
                    {suggestionContext.suggestions.length ? (
                      <div className="mt-2 space-y-2">
                        {suggestionContext.suggestions.map((suggestion) => (
                          <div key={suggestion.key} className="rounded-lg border border-blue-200 bg-white p-2">
                            <div className="flex items-start justify-between gap-2"><p className="font-semibold">Is this {suggestion.label}?</p><span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase">{suggestion.confidence}</span></div>
                            <p className="mt-1 text-xs text-slate-600">{suggestion.explanation}</p>
                            <button type="button" onClick={() => acceptSuggestion(suggestion)} className="mt-2 h-8 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white">{suggestionContext.acceptedKey === suggestion.key ? 'Accepted' : 'Yes, use this field'}</button>
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-1 text-xs">No safe match was found. Choose the fill method and source yourself.</p>}
                    <button type="button" onClick={() => setSuggestionContext(null)} className="mt-2 text-xs font-semibold text-blue-800 underline">Do not use a suggestion</button>
                  </section>
                ) : null}
                <label className="block text-xs font-semibold text-slate-600">Field name<input value={draft.label} onChange={(event) => updateDraft('label', event.target.value)} className={inputClass} placeholder="Client Name" /></label>
                <label className="block text-xs font-semibold text-slate-600">Type<select value={draft.field_type} onChange={(event) => updateDraft('field_type', event.target.value)} className={inputClass}><option value="text">Short text</option><option value="multiline">Multiline text</option><option value="date">Date</option><option value="number">Number</option><option value="currency">Currency</option><option value="checkbox">Checkbox</option><option value="dropdown">Dropdown</option><option value="signature">Signature placeholder</option></select></label>
                <label className="block text-xs font-semibold text-slate-600">Fill method<select value={draft.fill_method} onChange={(event) => updateDraft('fill_method', event.target.value)} className={inputClass}><option value="manual">Manual entry</option><option value="system">AFN data</option></select></label>
                {draft.fill_method === 'system' ? <label className="block text-xs font-semibold text-slate-600">AFN source<select value={draft.source_key} onChange={(event) => updateDraft('source_key', event.target.value)} className={inputClass}><option value="">Choose source</option>{sourceOptions.filter((item) => !item.is_collection).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label> : null}
                {draft.field_type === 'dropdown' ? <label className="block text-xs font-semibold text-slate-600">Options<input value={(draft.options || []).join(', ')} onChange={(event) => updateDraft('options', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} className={inputClass} placeholder="Option one, Option two" /></label> : null}
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={draft.is_required} onChange={(event) => updateDraft('is_required', event.target.checked)} /> Required</label>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-600">Width<input type="range" min="0.03" max={1 - draft.placement.x} step="0.01" value={draft.placement.width} onChange={(event) => updatePlacement('width', event.target.value)} className="mt-2 w-full" /></label>
                  <label className="text-xs font-semibold text-slate-600">Height<input type="range" min="0.02" max={1 - draft.placement.y} step="0.01" value={draft.placement.height} onChange={(event) => updatePlacement('height', event.target.value)} className="mt-2 w-full" /></label>
                </div>
                <fieldset className="rounded-lg border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold text-slate-600">Fine position</legend><div className="grid grid-cols-4 gap-1"><button type="button" onClick={() => moveDraft(-0.005, 0)} className="h-8 rounded border border-slate-300 text-xs" aria-label="Move field left">←</button><button type="button" onClick={() => moveDraft(0, -0.005)} className="h-8 rounded border border-slate-300 text-xs" aria-label="Move field up">↑</button><button type="button" onClick={() => moveDraft(0, 0.005)} className="h-8 rounded border border-slate-300 text-xs" aria-label="Move field down">↓</button><button type="button" onClick={() => moveDraft(0.005, 0)} className="h-8 rounded border border-slate-300 text-xs" aria-label="Move field right">→</button></div><div className="mt-2 grid grid-cols-2 gap-1"><button type="button" onClick={() => resizeDraft(-0.01, 0)} className="h-8 rounded border border-slate-300 text-xs">Narrower</button><button type="button" onClick={() => resizeDraft(0.01, 0)} className="h-8 rounded border border-slate-300 text-xs">Wider</button><button type="button" onClick={() => resizeDraft(0, -0.005)} className="h-8 rounded border border-slate-300 text-xs">Shorter</button><button type="button" onClick={() => resizeDraft(0, 0.005)} className="h-8 rounded border border-slate-300 text-xs">Taller</button></div></fieldset>
                <div className="flex gap-2"><button type="button" disabled={!draft.label.trim() || busy === 'save'} onClick={save} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white disabled:opacity-50"><FiSave /> Save field</button><button type="button" disabled={busy === 'delete'} onClick={remove} className="grid h-10 w-10 place-items-center rounded-lg border border-rose-200 text-rose-700" aria-label="Remove field"><FiTrash2 /></button></div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
