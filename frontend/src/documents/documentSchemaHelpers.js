export const schemaField = (key, label, type, source, options = {}) => Object.freeze({
  key,
  label,
  type,
  source,
  required: false,
  manualEdit: true,
  ...options,
});

export const schemaAction = (key, label, authority) => Object.freeze({ key, label, authority });

export const stampDocumentDraft = (schema, draft) => ({
  ...draft,
  _documentSchema: { code: schema.code, version: schema.version },
});

export const updateDocumentField = (draft, key, value) => ({ ...draft, [key]: value });

export const updateDocumentRow = (draft, collectionKey, rowId, key, value) => ({
  ...draft,
  [collectionKey]: (draft[collectionKey] || []).map((row) => (
    row.id === rowId ? { ...row, [key]: value } : row
  )),
});

export const addDocumentRow = (draft, collectionKey, row) => ({
  ...draft,
  [collectionKey]: [...(draft[collectionKey] || []), row],
});

export const removeDocumentRow = (draft, collectionKey, rowId, minimumRows = 1) => {
  const rows = draft[collectionKey] || [];
  if (rows.length <= minimumRows) return draft;
  return { ...draft, [collectionKey]: rows.filter((row) => row.id !== rowId) };
};

