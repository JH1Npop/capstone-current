import { api, fetchAllPages, getApiErrorMessage, normalizeSla, normalizeTicket } from './core';

const NAVIGATION_TRAVEL_SPEED_KPH = 35;

const estimateTravelSeconds = (distanceMeters) => {
  const numericDistance = Number(distanceMeters);
  if (!Number.isFinite(numericDistance) || numericDistance <= 0) return 0;
  return (numericDistance / 1000 / NAVIGATION_TRAVEL_SPEED_KPH) * 60 * 60;
};

const normalizeCoordinateValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return numericValue.toFixed(6);
};

const normalizeCoordinatePayload = (payload) => ({
  ...payload,
  latitude: normalizeCoordinateValue(payload.latitude),
  longitude: normalizeCoordinateValue(payload.longitude),
  lat: normalizeCoordinateValue(payload.lat),
  lng: normalizeCoordinateValue(payload.lng),
});

export const fetchNavigationRoute = async (techLat, techLng, jobLat, jobLng) => {
  try {
    const start = `${techLng},${techLat}`;
    const end = `${jobLng},${jobLat}`;
    const { data } = await api.get('/services/ors/route/', { params: { start, end } });

    if (!data?.features || data.features.length === 0) {
      throw new Error('No route found');
    }

    const feature = data.features[0];
    const geometry = feature?.geometry;
    const properties = feature?.properties;
    const coords = geometry?.coordinates || [];
    const routeCoords = coords.map(([lng, lat]) => [lat, lng]);

    const segments = properties?.segments || [{}];
    const primarySegment = segments[0];

    let directions = [];
    if (primarySegment.steps) {
      directions = primarySegment.steps.map((step) => ({
        instruction: step.instruction || 'Continue',
        distance: step.distance || 0,
        duration: estimateTravelSeconds(step.distance),
        type: step.type || 0,
        modifier: step.modifier || ''
      }));
    }

    const distanceKm = primarySegment.distance
      ? Number((primarySegment.distance / 1000).toFixed(1))
      : 0;
    const estimatedTimeMin = primarySegment.distance
      ? Math.max(1, Math.round(estimateTravelSeconds(primarySegment.distance) / 60))
      : 0;

    return {
      distanceKm,
      estimatedTimeMin,
      travelSpeedKph: NAVIGATION_TRAVEL_SPEED_KPH,
      routeCoords,
      directions
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load navigation route.'));
  }
};

export const fetchDashboardStats = async (role) => {
  try {
    const { data } = await api.get('/dashboard/stats/', { params: { role } });
    const slaQueue = Array.isArray(data?.sla_queue)
      ? data.sla_queue.map((item) => ({
          ...item,
          sla: normalizeSla(item?.sla)
        }))
      : [];

    return {
      ...data,
      sla_queue: slaQueue
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load dashboard statistics.'));
  }
};

// Opaque token that changes whenever dashboard data may have changed (and once a minute).
export const fetchDashboardChanges = async (role) => {
  const { data } = await api.get('/dashboard/changes/', { params: { role } });
  return data?.token || '';
};

export const updateTechnicianLocation = async ({ techName, lat, lng, accuracy }) => {
  try {
    const { data } = await api.post('/services/technician/location/', {
      latitude: lat,
      longitude: lng,
      accuracy
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update technician location.'));
  }
};

export const fetchServiceTickets = async (filters = {}) => {
  try {
    const params = {};
    if (filters.workspace) {
      params.workspace = filters.workspace;
    }
    if (filters.queue) {
      params.queue = filters.queue;
    }

    const ticketArray = await fetchAllPages('/services/service-tickets/', { params });
    return ticketArray.map(normalizeTicket);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load service tickets.'));
  }
};

export const fetchServiceTicket = async (ticketId) => {
  try {
    const { data } = await api.get(`/services/service-tickets/${ticketId}/`);
    return normalizeTicket(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load service ticket details.'));
  }
};

export const searchServiceTickets = async (query = '') => {
  try {
    const { data } = await api.get('/services/service-tickets/', {
      params: { search: query, limit: 100 }
    });
    const results = Array.isArray(data) ? data : (data.results || []);
    return results.map(normalizeTicket);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to search service tickets.'));
  }
};

export const fetchServiceTicketSummary = async (filters = {}) => {
  try {
    const params = {};
    if (filters.workspace) {
      params.workspace = filters.workspace;
    }

    const { data } = await api.get('/services/service-tickets/summary/', { params });
    return {
      totalTickets: Number(data?.total_tickets || 0),
      activeQueue: Number(data?.active_queue || 0),
      completed: Number(data?.completed || 0),
      cancelled: Number(data?.cancelled || 0),
      unassignedActive: Number(data?.unassigned_active || 0),
      dispatchable: Number(data?.dispatchable || 0),
      assignedActive: Number(data?.assigned_active || 0),
      missedDispatch: Number(data?.missed_dispatch || 0),
      slaWarning: Number(data?.sla_warning || 0),
      slaOverdue: Number(data?.sla_overdue || 0),
      slaRisk: Number(data?.sla_risk || 0)
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load service ticket summary.'));
  }
};

export const terminateServiceTicketForClientWithdrawal = async (ticketId, details) => {
  const normalizedDetails = String(details || '').trim();
  if (normalizedDetails.length < 5) {
    throw new Error('Add a short explanation confirming why the client backed out.');
  }
  try {
    const { data } = await api.post(`/services/service-tickets/${ticketId}/update_status/`, {
      status: 'Cancelled',
      reason: `Client backed out: ${normalizedDetails}`,
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to dismiss the service ticket.'));
  }
};

export const fetchDocumentPrefill = async (ticketId) => {
  try {
    const { data } = await api.get(`/services/service-tickets/${ticketId}/document-prefill/`);
    return {
      ticket: data?.ticket || {},
      client: data?.client || {},
      service_request: data?.service_request || {},
      service_location: data?.service_location || {},
      technician: data?.technician || {},
      inspection: data?.inspection || null,
      solar_commissioning: data?.solar_commissioning || null,
      solar_project_profile: data?.solar_project_profile || null,
      quotation_record: data?.quotation_record || null,
      completion: data?.completion || {},
      inventory: Array.isArray(data?.inventory) ? data.inventory : [],
      warranty: data?.warranty || {},
      after_sales: Array.isArray(data?.after_sales) ? data.after_sales : [],
      maintenance: data?.maintenance || null,
      turnover_acceptance: data?.turnover_acceptance || null,
      technical_data_sheet: data?.technical_data_sheet || null,
      installation_contract: data?.installation_contract || null,
      field_service_reports: Array.isArray(data?.field_service_reports) ? data.field_service_reports : [],
      latest_field_service_report: data?.latest_field_service_report || null,
      document_defaults: data?.document_defaults || {},
      missing_fields: data?.missing_fields || {}
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load document prefill data.'));
  }
};

export const fetchDocumentDraft = async (ticketId, documentType) => {
  try {
    const { data } = await api.get(`/services/service-tickets/${ticketId}/document-draft/`, {
      params: { document_type: documentType }
    });
    return data?.document || null;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load the saved document draft.'));
  }
};

export const saveDocumentDraft = async (ticketId, payload) => {
  try {
    const { data } = await api.post(`/services/service-tickets/${ticketId}/document-draft/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save the document draft.'));
  }
};

export const updateProjectDetails = async (ticketId, projectDetails) => {
  try {
    const { data } = await api.post(`/services/service-tickets/${ticketId}/update-project-details/`, { project_details: projectDetails });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update project details.'));
  }
};

export const fetchTicketTimeline = async (ticketId) => {
  try {
    const { data } = await api.get('/services/status-history/', { params: { ticket: ticketId } });
    const events = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return events
      .map((event) => ({
        id: event.id,
        ticketId: event.ticket,
        status: event.status,
        actor: event.changed_by_name || 'System',
        actorId: event.changed_by || null,
        notes: event.notes || '',
        timestamp: event.timestamp
      }))
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0));
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load ticket timeline.'));
  }
};

const downloadBlobResponse = (response, fallbackFilename) => {
  const contentDisposition = response.headers?.['content-disposition'] || '';
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const filename = filenameMatch?.[1] || fallbackFilename;
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const downloadTicketDocument = async (ticketId, documentType = 'field_service_report', options = {}) => {
  try {
    const payload = { document_type: documentType };
    if (options?.reportId !== undefined && options?.reportId !== null && options?.reportId !== '') {
      payload.report_id = options.reportId;
    }
    if (options?.templateId !== undefined && options?.templateId !== null && options?.templateId !== '') {
      payload.template_id = options.templateId;
    }

    const response = await api.post(
      `/services/service-tickets/${ticketId}/generate-document/`,
      payload,
      { responseType: 'blob' }
    );
    downloadBlobResponse(response, `${documentType}_${ticketId}.docx`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to generate the document.'));
  }
};

export const fetchDocumentDefinitions = async (params = undefined) => {
  try {
    const { data } = await api.get('/services/document-definitions/', { params });
    return Array.isArray(data) ? data : (data?.results || []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load document definitions.'));
  }
};

export const createDocumentDefinition = async (payload) => {
  try {
    const { data } = await api.post('/services/document-definitions/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to register the custom document.'));
  }
};

export const updateDocumentDefinition = async (definitionId, payload) => {
  try {
    const { data } = await api.patch(`/services/document-definitions/${definitionId}/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update the custom document.'));
  }
};

export const fetchDocumentFieldDefinitions = async (definitionId) => {
  try {
    const { data } = await api.get('/services/document-field-definitions/', { params: { definition: definitionId } });
    return Array.isArray(data) ? data : (data?.results || []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load custom document fields.'));
  }
};

export const createDocumentFieldDefinition = async (payload) => {
  try {
    const { data } = await api.post('/services/document-field-definitions/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to add the custom field.'));
  }
};

export const updateDocumentFieldDefinition = async (fieldId, payload) => {
  try {
    const { data } = await api.patch(`/services/document-field-definitions/${fieldId}/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update the custom field.'));
  }
};

export const fetchDocumentTemplates = async (definitionId) => {
  try {
    const { data } = await api.get('/services/document-templates/', {
      params: definitionId ? { definition: definitionId } : undefined
    });
    return Array.isArray(data) ? data : (data?.results || []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load document designs.'));
  }
};

export const createDocumentTemplate = async (payload) => {
  try {
    const { data } = await api.post('/services/document-templates/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create the document design.'));
  }
};

export const updateDocumentTemplate = async (templateId, payload) => {
  try {
    const { data } = await api.patch(`/services/document-templates/${templateId}/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update the document design.'));
  }
};

export const deleteDocumentDefinition = async (definitionId) => {
  try {
    await api.delete(`/services/document-definitions/${definitionId}/`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete the document type.'));
  }
};

export const deleteDocumentTemplate = async (templateId) => {
  try {
    await api.delete(`/services/document-templates/${templateId}/`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete the document design.'));
  }
};

export const fetchDocumentTemplateVersions = async (templateId) => {
  try {
    const { data } = await api.get('/services/document-template-versions/', {
      params: templateId ? { template: templateId } : undefined
    });
    return Array.isArray(data) ? data : (data?.results || []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load template versions.'));
  }
};

export const uploadDocumentTemplateVersion = async ({ templateId, file, changeNotes = '', onProgress = null }) => {
  const formData = new FormData();
  formData.append('template', templateId);
  formData.append('file', file);
  formData.append('change_notes', changeNotes);
  try {
    const { data } = await api.post('/services/document-template-versions/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress ? (event) => onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : null) : undefined,
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save the document template.'));
  }
};

export const downloadDocumentTemplateVersion = async (versionId, fallbackFilename = 'document-template') => {
  try {
    const response = await api.get(
      `/services/document-template-versions/${versionId}/download/`,
      { responseType: 'blob' }
    );
    downloadBlobResponse(response, fallbackFilename);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to download the original template.'));
  }
};

export const downloadBuiltInDesign = async (definitionId, fallbackFilename = 'afn-design.docx') => {
  try {
    const response = await api.get(`/services/document-definitions/${definitionId}/built-in-design/`, { responseType: 'blob' });
    downloadBlobResponse(response, fallbackFilename);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to download the original design.'));
  }
};

export const downloadDocumentStarter = async (definitionId, fallbackFilename = 'document-starter.docx') => {
  try {
    const response = await api.get(`/services/document-definitions/${definitionId}/starter/`, { responseType: 'blob' });
    downloadBlobResponse(response, fallbackFilename);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to download the starter file.'));
  }
};

export const fetchDocumentTemplateSource = async (versionId) => {
  try {
    const response = await api.get(
      `/services/document-template-versions/${versionId}/download/`,
      { responseType: 'blob' }
    );
    return response.data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to open the original template.'));
  }
};

export const fetchDocumentTemplateFields = async (versionId) => {
  try {
    const { data } = await api.get('/services/document-template-fields/', { params: { template_version: versionId } });
    return Array.isArray(data) ? data : (data?.results || []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load template fields.'));
  }
};

export const createDocumentTemplateField = async (payload) => {
  try {
    const { data } = await api.post('/services/document-template-fields/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save the template field.'));
  }
};

export const updateDocumentTemplateField = async (fieldId, payload) => {
  try {
    const { data } = await api.patch(`/services/document-template-fields/${fieldId}/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update the template field.'));
  }
};

export const deleteDocumentTemplateField = async (fieldId) => {
  try {
    await api.delete(`/services/document-template-fields/${fieldId}/`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to remove the template field.'));
  }
};

const runTemplateVersionAction = async (versionId, action, fallbackMessage) => {
  try {
    const { data } = await api.post(`/services/document-template-versions/${versionId}/${action}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, fallbackMessage));
  }
};

export const activateDocumentTemplateVersion = (versionId) => runTemplateVersionAction(
  versionId,
  'activate',
  'Unable to activate this template version.'
);

// One step: check the design again, make it the active design, make it the default, and switch its document on.
export const adoptDocumentTemplateVersion = (versionId) => runTemplateVersionAction(
  versionId,
  'use-design',
  'Unable to use this design.'
);

// Check a draft design again, for example after its custom fields were registered.
export const revalidateDocumentTemplateVersion = (versionId) => runTemplateVersionAction(
  versionId,
  'revalidate',
  'Unable to check this design again.'
);

// Turn plain names found in a custom design (for example "[Site Name]") into fill-in fields.
export const addDocumentFieldsFromDesign = async (versionId, names) => {
  try {
    const { data } = await api.post(`/services/document-template-versions/${versionId}/accept-fields/`, { names });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to add these fields.'));
  }
};

export const placePdfFields = async (versionId, names) => {
  try {
    const response = await api.post(`/services/document-template-versions/${versionId}/place-fields/`, { names });
    return response.data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to place the fields on this PDF.'));
  }
};

export const fillDesignBlanks = async (versionId, names) => {
  try {
    const response = await api.post(`/services/document-template-versions/${versionId}/fill-blanks/`, { names });
    return response.data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to fill the blanks in this design.'));
  }
};

export const rollbackDocumentTemplateVersion = (versionId) => runTemplateVersionAction(
  versionId,
  'rollback',
  'Unable to roll back to this template version.'
);

export const testRenderDocumentTemplateVersion = async (versionId, ticketId, reportId = null) => {
  try {
    const payload = { ticket_id: ticketId };
    if (reportId) payload.report_id = reportId;
    const response = await api.post(
      `/services/document-template-versions/${versionId}/test-render/`,
      payload,
      { responseType: 'blob' }
    );
    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    const extension = contentType.includes('pdf') ? 'pdf' : 'docx';
    downloadBlobResponse(response, `template-test-v${versionId}.${extension}`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to render this template version.'));
  }
};

export const fetchDocumentOutputs = async (ticketId, instanceId = null) => {
  try {
    const { data } = await api.get('/services/document-outputs/', {
      params: ticketId ? { ticket: ticketId } : (instanceId ? { instance: instanceId } : undefined)
    });
    return Array.isArray(data) ? data : (data?.results || []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load generated document history.'));
  }
};

export const fetchDocumentInstances = async (params = {}) => {
  try {
    const { data } = await api.get('/services/document-instances/', { params });
    return Array.isArray(data) ? data : (data?.results || []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load document drafts.'));
  }
};

export const createDocumentInstance = async (payload) => {
  try {
    const { data } = await api.post('/services/document-instances/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save the document draft.'));
  }
};

export const updateDocumentInstance = async (instanceId, payload) => {
  try {
    const { data } = await api.patch(`/services/document-instances/${instanceId}/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update the document draft.'));
  }
};

export const generateCustomDocument = async (instanceId, templateId = null) => {
  try {
    const response = await api.post(
      `/services/document-instances/${instanceId}/generate/`,
      templateId ? { template_id: templateId } : {},
      { responseType: 'blob' }
    );
    downloadBlobResponse(response, `custom-document-${instanceId}.docx`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to generate the document.'));
  }
};

export const previewDocumentInstance = async (instanceId, templateId = null) => {
  try {
    const response = await api.post(
      `/services/document-instances/${instanceId}/preview/`,
      templateId ? { template_id: templateId } : {},
      { responseType: 'blob' }
    );
    return { blob: response.data, contentType: response.headers?.['content-type'] || response.data?.type || '' };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to preview the document.'));
  }
};

export const fetchDocumentAttachments = async (instanceId) => {
  try {
    const { data } = await api.get('/services/document-attachments/', { params: { instance: instanceId } });
    return Array.isArray(data) ? data : (data?.results || []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load document attachments.'));
  }
};

export const uploadDocumentAttachment = async ({ instanceId, file, description = '' }) => {
  const formData = new FormData();
  formData.append('instance', instanceId);
  formData.append('file', file);
  formData.append('description', description);
  try {
    const { data } = await api.post('/services/document-attachments/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to upload the attachment.'));
  }
};

export const downloadDocumentAttachment = async (attachmentId, fallbackFilename) => {
  try {
    const response = await api.get(`/services/document-attachments/${attachmentId}/download/`, { responseType: 'blob' });
    downloadBlobResponse(response, fallbackFilename || `attachment-${attachmentId}`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to download the attachment.'));
  }
};

export const downloadDocumentOutput = async (outputId, fallbackFilename = `document-output-${outputId}.docx`) => {
  try {
    const response = await api.get(`/services/document-outputs/${outputId}/download/`, { responseType: 'blob' });
    downloadBlobResponse(response, fallbackFilename);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to download this archived document.'));
  }
};

export const fetchSolarCommissioningChecklist = async (ticketId) => {
  try {
    const { data } = await api.get('/services/solar-commissioning-checklists/', {
      params: { ticket: ticketId }
    });
    const items = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return items[0] || null;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load the solar commissioning checklist.'));
  }
};

export const saveSolarCommissioningChecklist = async (payload) => {
  try {
    if (payload?.id) {
      const { data } = await api.patch(`/services/solar-commissioning-checklists/${payload.id}/`, payload);
      return data;
    }

    const { data } = await api.post('/services/solar-commissioning-checklists/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save the solar commissioning checklist.'));
  }
};

export const saveTurnoverAcceptance = async (payload) => {
  try {
    if (payload?.id) {
      const { data } = await api.patch(`/services/turnover-acceptances/${payload.id}/`, payload);
      return data;
    }
    const { data } = await api.post('/services/turnover-acceptances/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save turnover acceptance.'));
  }
};

export const finalizeTurnoverAcceptance = async (id, payload = {}) => {
  try {
    const { data } = await api.post(`/services/turnover-acceptances/${id}/finalize/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to finalize turnover acceptance.'));
  }
};

export const fetchServiceTypes = async () => {
  try {
    const serviceTypes = await fetchAllPages('/services/service-types/');
    return Array.isArray(serviceTypes) ? serviceTypes : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load service types.'));
  }
};

export const createServiceRequest = async (requestData, idempotencyKey = globalThis.crypto?.randomUUID?.()) => {
  try {
    const payload = normalizeCoordinatePayload(requestData);
    const config = idempotencyKey
      ? { headers: { 'Idempotency-Key': idempotencyKey } }
      : undefined;
    const { data } = await api.post('/services/service-requests/', payload, config);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create service request.'));
  }
};

export const fetchAppointmentAvailability = async ({ start, end }) => {
  try {
    const { data } = await api.get('/services/service-requests/appointment-availability/', {
      params: { start, end },
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load appointment availability.'));
  }
};

export const createSolarEstimate = async (estimateData) => {
  try {
    const { data } = await api.post('/services/solar-estimates/', estimateData);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save solar estimate.'));
  }
};

export const fetchSolarEstimates = async () => {
  try {
    return await fetchAllPages('/services/solar-estimates/');
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load solar estimates.'));
  }
};

export const fetchSolarEstimate = async (estimateId) => {
  try {
    const { data } = await api.get(`/services/solar-estimates/${estimateId}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load solar estimate.'));
  }
};

export const deleteSolarEstimate = async (estimateId) => {
  try {
    await api.delete(`/services/solar-estimates/${estimateId}/`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete solar estimate.'));
  }
};

export const convertSolarEstimate = async (estimateId, requestData) => {
  try {
    const payload = normalizeCoordinatePayload(requestData);
    const { data } = await api.post(`/services/solar-estimates/${estimateId}/convert/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create a request from this estimate.'));
  }
};

export const searchLocations = async ({ query, viewbox, bounded = true, limit = 5 }) => {
  try {
    const params = {
      q: query,
      limit
    };
    if (viewbox) params.viewbox = viewbox;
    if (bounded) params.bounded = '1';
    const { data } = await api.get('/geocode/search/', { params });
    return Array.isArray(data?.results) ? data.results : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to search locations.'));
  }
};

export const reverseGeocodeLocation = async ({ lat, lng }) => {
  try {
    const { data } = await api.get('/geocode/reverse/', { params: { lat, lon: lng } });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to read the selected location.'));
  }
};

export const fetchCoverageHeatmap = async (filters = {}) => {
  try {
    const params = {};
    if (filters.client) params.client = filters.client;
    if (filters.technician) params.technician = filters.technician;
    if (filters.serviceType) params.service_type = filters.serviceType;
    const { data } = await api.get('/services/coverage-heatmap/service_density/', { params });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load coverage heatmap.'));
  }
};

export const fetchFollowUpCases = async (filters = {}) => {
  try {
    const params = {};

    if (filters.status) {
      params.status = filters.status;
    }
    if (filters.caseType) {
      params.case_type = filters.caseType;
    }
    if (filters.assignedOnly) {
      params.assigned_only = 'true';
    }
    if (filters.priority) {
      params.priority = filters.priority;
    }
    if (filters.creationSource) {
      params.creation_source = filters.creationSource;
    }
    if (filters.search) {
      params.search = filters.search;
    }
    if (filters.ordering) {
      params.ordering = filters.ordering;
    }
    if (filters.page) {
      params.page = filters.page;
    }

    const { data } = await api.get('/services/follow-up-cases/', { params });
    const caseArray = Array.isArray(data) ? data : (data.results || []);
    return {
      results: Array.isArray(caseArray) ? caseArray : [],
      count: Array.isArray(data) ? data.length : Number(data?.count || 0),
      next: Array.isArray(data) ? null : (data?.next || null),
      previous: Array.isArray(data) ? null : (data?.previous || null)
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load follow-up cases.'));
  }
};

export const fetchMaintenanceSchedules = async (filters = {}) => {
  try {
    const params = {};
    if (filters.status && filters.status !== 'all') params.status = filters.status;
    if (filters.search) params.search = filters.search;
    if (filters.ordering) params.ordering = filters.ordering;
    if (filters.page) params.page = filters.page;
    const results = await fetchAllPages('/services/maintenance-schedules/', { params });
    return {
      results,
      count: results.length,
      next: null,
      previous: null,
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load maintenance schedules.'));
  }
};

export const fetchMaintenanceSummary = async () => {
  try {
    const { data } = await api.get('/services/maintenance-schedules/summary/');
    return data || {};
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load maintenance summary.'));
  }
};

const runMaintenanceAction = async (scheduleId, action, payload = {}) => {
  try {
    const { data } = await api.post(`/services/maintenance-schedules/${scheduleId}/${action}/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, `Unable to ${action} maintenance.`));
  }
};

export const dismissMaintenanceSchedule = (scheduleId, reason) => (
  runMaintenanceAction(scheduleId, 'dismiss', { reason })
);

export const resumeMaintenanceSchedule = (scheduleId, reason) => (
  runMaintenanceAction(scheduleId, 'resume', { reason })
);

export const rescheduleMaintenanceSchedule = (scheduleId, { nextDueDate, reason }) => (
  runMaintenanceAction(scheduleId, 'reschedule', { next_due_date: nextDueDate, reason })
);

export const completeMaintenanceSchedule = (scheduleId, reason) => (
  runMaintenanceAction(scheduleId, 'complete', { reason })
);

export const fetchFollowUpCaseSummary = async (filters = {}) => {
  try {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.caseType) params.case_type = filters.caseType;
    if (filters.priority) params.priority = filters.priority;
    if (filters.creationSource) params.creation_source = filters.creationSource;
    if (filters.search) params.search = filters.search;
    if (filters.page) params.page = filters.page;
    if (filters.pageSize) params.page_size = filters.pageSize;
    if (filters.ordering) params.ordering = filters.ordering;
    if (filters.direction) params.direction = filters.direction;
    const { data } = await api.get('/services/follow-up-cases/summary/', { params });
    return data || {};
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load follow-up summary.'));
  }
};

export const fetchFollowUpAssignees = async () => {
  try {
    const { data } = await api.get('/services/follow-up-cases/assignees/');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load after-sales case owners.'));
  }
};

export const approveServiceRequest = async (requestId, requireInspection = false) => {
  try {
    const { data } = await api.post(`/services/service-requests/${requestId}/approve/`, {
      require_inspection: requireInspection,
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to approve service request.'));
  }
};

export const rejectServiceRequest = async (requestId, reason = '') => {
  try {
    const { data } = await api.post(`/services/service-requests/${requestId}/reject/`, { reason });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to reject service request.'));
  }
};

export const cancelServiceRequest = async (requestId, reason = '') => {
  try {
    const { data } = await api.post(`/services/service-requests/${requestId}/cancel/`, { reason });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to cancel service request.'));
  }
};

export const createFollowUpCase = async (caseData) => {
  try {
    const { data } = await api.post('/services/follow-up-cases/', caseData);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create follow-up case.'));
  }
};

export const updateFollowUpCase = async (caseId, updates) => {
  try {
    const { data } = await api.patch(`/services/follow-up-cases/${caseId}/`, updates);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update follow-up case.'));
  }
};

export const fetchTechnicianCoverage = async (filters = {}) => {
  try {
    const params = {};
    if (filters.technician) params.technician = filters.technician;
    const { data } = await api.get('/services/coverage-heatmap/technician_coverage/', { params });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician coverage.'));
  }
};

export const fetchCompletedJobsHistory = async (filters = {}) => {
  try {
    const params = {};
    if (filters.days) params.days = filters.days;
    if (filters.serviceType) params.service_type = filters.serviceType;
    if (filters.client) params.client = filters.client;
    if (filters.technician) params.technician = filters.technician;
    if (filters.search) params.search = filters.search;

    const { data } = await api.get('/services/coverage-heatmap/completed_jobs/', { params });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load completed job history.'));
  }
};

export const fetchTrackingData = async () => {
  try {
    const { data } = await api.get('/tracking/');
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load tracking data.'));
  }
};

export const fetchTechnicianTrackingPolicy = async () => {
  try {
    const { data } = await api.get('/services/technician-locations/policy/');
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load the location-sharing policy.'));
  }
};

export const fetchTechnicianLocationHistory = async (technicianId, { minutes = 60 } = {}) => {
  try {
    const { data } = await api.get('/services/technician-locations/', {
      params: { technician: technicianId, minutes, page_size: 250 },
    });
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return rows
      .map((row) => ({
        id: row.id,
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        accuracy: Number(row.accuracy || 0),
        timestamp: row.timestamp,
      }))
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician location history.'));
  }
};

export const getGoogleMapsUrl = ({ lat, lng, zoom = 14 }) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&zoom=${zoom}`;

export const fetchServiceRequest = async (requestId) => {
  try {
    const { data } = await api.get(`/services/service-requests/${requestId}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to fetch service request details.'));
  }
};

export const fetchInstalledEquipment = async (clientId) => {
  try {
    const { data } = await api.get(`/services/installed-equipment/`, { params: { client_id: clientId } });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load installed equipment.'));
  }
};

export const registerInstalledEquipment = async (payload) => {
  try {
    const { data } = await api.post(`/services/installed-equipment/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to register installed equipment.'));
  }
};

export const fetchQuotationRecord = async (ticketId) => {
  try {
    const { data } = await api.get(`/services/quotations/`, { params: { ticket_id: ticketId } });
    const rows = Array.isArray(data) ? data : (data?.results || []);
    return rows[0] || null;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load quotation record.'));
  }
};

export const saveQuotationRecord = async (payload) => {
  try {
    const { id, ...requestPayload } = payload;
    const { data } = id
      ? await api.patch(`/services/quotations/${id}/`, requestPayload)
      : await api.post(`/services/quotations/`, requestPayload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save quotation record.'));
  }
};

export const recordQuotationDeposit = async (quotationId, payment) => {
  try {
    const { data } = await api.post(`/services/quotations/${quotationId}/deposit-payments/`, payment);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to record the deposit payment.'));
  }
};

export const voidQuotationDepositPayment = async (quotationId, paymentId, reason) => {
  try {
    const { data } = await api.post(`/services/quotations/${quotationId}/void-deposit-payment/`, {
      payment_id: paymentId,
      reason,
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to void the deposit payment.'));
  }
};

export const fetchSalesRecords = async (filters = {}) => {
  try {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.search) params.search = filters.search;
    return await fetchAllPages('/services/sales-records/', { params });
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load sales records.'));
  }
};

export const fetchSalesRecord = async (recordId) => {
  try {
    const { data } = await api.get(`/services/sales-records/${recordId}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load the sales record.'));
  }
};

export const prepareSalesRecord = async (ticketId) => {
  try {
    const { data } = await api.post('/services/sales-records/prepare/', { ticket_id: ticketId });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to prepare the sales record.'));
  }
};

export const updateSalesRecord = async (recordId, updates) => {
  try {
    const { data } = await api.patch(`/services/sales-records/${recordId}/`, updates);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update the sales record.'));
  }
};

export const confirmSalesRecord = async (recordId) => {
  try {
    const { data } = await api.post(`/services/sales-records/${recordId}/confirm/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to confirm the sales record.'));
  }
};

export const recordSalesPayment = async (recordId, payment) => {
  try {
    const { data } = await api.post(`/services/sales-records/${recordId}/payments/`, payment);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to record the payment.'));
  }
};

export const voidSalesPayment = async (recordId, paymentId, reason) => {
  try {
    const { data } = await api.post(`/services/sales-records/${recordId}/void-payment/`, { payment_id: paymentId, reason });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to void the payment.'));
  }
};

const firstRow = (data) => (Array.isArray(data) ? data[0] : data?.results?.[0]) || null;

export const fetchTicketQuotation = async (ticketId) => {
  try {
    const { data } = await api.get('/services/quotations/', { params: { ticket_id: ticketId } });
    return firstRow(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load the quotation.'));
  }
};

export const recordQuotationAcceptance = async (quotationId) => {
  try {
    const { data } = await api.patch(`/services/quotations/${quotationId}/`, { status: 'Accepted' });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to record the acceptance.'));
  }
};

export const respondToQuotation = async (quotationId, decision, note = '') => {
  try {
    const { data } = await api.post(`/services/quotations/${quotationId}/respond/`, { decision, note });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to send your response.'));
  }
};

export const fetchTicketTurnover = async (ticketId) => {
  try {
    const { data } = await api.get('/services/turnover-acceptances/', { params: { ticket: ticketId } });
    return firstRow(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load the handover.'));
  }
};

export const confirmTurnover = async (turnoverId, note = '') => {
  try {
    const { data } = await api.post(`/services/turnover-acceptances/${turnoverId}/client-confirm/`, { note });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to confirm the handover.'));
  }
};

export const voidSalesRecord = async (recordId, reason) => {
  try {
    const { data } = await api.post(`/services/sales-records/${recordId}/void/`, { reason });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to void the sales record.'));
  }
};

export const fetchTechnicalDataSheet = async (ticketId) => {
  try {
    const { data } = await api.get(`/services/technical-data-sheets/`, { params: { ticket: ticketId } });
    return data.results ? data.results[0] : null;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to fetch technical data sheet.'));
  }
};

export const saveTechnicalDataSheet = async (payload, id = null) => {
  try {
    if (id) {
      const { data } = await api.patch(`/services/technical-data-sheets/${id}/`, payload);
      return data;
    } else {
      const { data } = await api.post(`/services/technical-data-sheets/`, payload);
      return data;
    }
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save technical data sheet.'));
  }
};

export const submitTechnicalDataSheet = async (id) => {
  try {
    const { data } = await api.post(`/services/technical-data-sheets/${id}/submit/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to submit technical data sheet.'));
  }
};

export const reviewTechnicalDataSheet = async (id) => {
  try {
    const { data } = await api.post(`/services/technical-data-sheets/${id}/review/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to review technical data sheet.'));
  }
};

export const fetchInstallationContract = async (ticketId) => {
  try {
    const { data } = await api.get(`/services/installation-contracts/`, { params: { ticket: ticketId } });
    return data.results && data.results.length > 0 ? data.results[0] : null;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to fetch installation contract.'));
  }
};

export const saveInstallationContract = async (payload, id = null) => {
  try {
    if (id) {
      const { data } = await api.patch(`/services/installation-contracts/${id}/`, payload);
      return data;
    } else {
      const { data } = await api.post(`/services/installation-contracts/`, payload);
      return data;
    }
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save installation contract.'));
  }
};

// New APIs for Auto-Fill Document Architecture
export const fetchSolarProjectProfile = async (locationId) => { const response = await api.get(`/services/solar-project-profiles/?location=${locationId}`); return response.data.length ? response.data[0] : null; };
export const saveSolarProjectProfile = async (payload) => { if (payload.id) { const response = await api.put(`/services/solar-project-profiles/${payload.id}/`, payload); return response.data; } const response = await api.post(`/services/solar-project-profiles/`, payload); return response.data; };
export const promoteEstimateToProjectProfile = async (payload) => { const response = await api.post(`/services/solar-project-profiles/promote-estimate/`, payload); return response.data; };
export const promoteTicketToProjectProfile = async (ticketId) => { const response = await api.post(`/services/service-tickets/${ticketId}/promote-to-project-profile/`); return response.data; };
export const fetchFieldServiceReport = async (ticketId) => { const response = await api.get(`/services/field-service-reports/?ticket=${ticketId}`); return response.data.length ? response.data[0] : null; };
export const saveFieldServiceReport = async (payload) => { if (payload.id) { const response = await api.put(`/services/field-service-reports/${payload.id}/`, payload); return response.data; } const response = await api.post(`/services/field-service-reports/`, payload); return response.data; };
