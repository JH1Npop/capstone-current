import { api, fetchAllPages, getApiErrorMessage, normalizeSla, normalizeTicket } from './core';

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
        duration: step.duration || 0,
        type: step.type || 0,
        modifier: step.modifier || ''
      }));
    }

    const distanceKm = primarySegment.distance
      ? Number((primarySegment.distance / 1000).toFixed(1))
      : 0;
    const estimatedTimeMin = primarySegment.duration
      ? Math.round(primarySegment.duration / 60)
      : 0;

    return {
      distanceKm,
      estimatedTimeMin,
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

export const downloadTicketDocument = async (ticketId, documentType = 'field_service_report', options = {}) => {
  try {
    const payload = { document_type: documentType };
    if (options?.reportId !== undefined && options?.reportId !== null && options?.reportId !== '') {
      payload.report_id = options.reportId;
    }

    const response = await api.post(
      `/services/service-tickets/${ticketId}/generate-document/`,
      payload,
      { responseType: 'blob' }
    );
    const contentDisposition = response.headers?.['content-disposition'] || '';
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    const filename = filenameMatch?.[1] || `${documentType}_${ticketId}.docx`;
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to generate the document.'));
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

export const createServiceRequest = async (requestData) => {
  try {
    const payload = normalizeCoordinatePayload(requestData);
    const { data } = await api.post('/services/service-requests/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create service request.'));
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

    const { data } = await api.get('/services/follow-up-cases/', { params });
    const caseArray = Array.isArray(data) ? data : (data.results || []);
    return Array.isArray(caseArray) ? caseArray : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load follow-up cases.'));
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
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load quotation record.'));
  }
};

export const saveQuotationRecord = async (payload) => {
  try {
    const { data } = await api.post(`/services/quotations/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save quotation record.'));
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
