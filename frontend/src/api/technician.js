import { api, fetchAllPages, getApiErrorMessage } from './core';

const toNumericId = (value, fallback = null) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const toNumber = (value, fallback = null) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const normalizeInventoryReservation = (reservation) => ({
  ...reservation,
  itemName: reservation?.item_name || reservation?.itemName || 'Equipment',
  itemSku: reservation?.item_sku || reservation?.itemSku || '',
  quantity: toNumericId(reservation?.quantity, 0),
  status: reservation?.status || 'pending',
  requiredDate: reservation?.required_date || reservation?.requiredDate || null,
  technicianName: reservation?.technician_name || reservation?.technicianName || ''
});

const normalizeInventoryItem = (item) => ({
  ...item,
  id: toNumericId(item?.id),
  name: item?.name || 'Equipment',
  sku: item?.sku || '',
  availableQuantity: toNumericId(item?.available_quantity ?? item?.availableQuantity, 0),
  quantity: toNumericId(item?.quantity, 0),
  reservedQuantity: toNumericId(item?.reserved_quantity ?? item?.reservedQuantity, 0),
  status: item?.status || 'available'
});

const normalizeTechnicianJob = (job) => ({
  ...job,
  crewMembers: Array.isArray(job?.crew_members)
    ? job.crew_members.map((member) => ({
        ...member,
        name: member?.name || member?.username || 'Technician'
      }))
    : [],
  service: job.service || job.service_type || job.serviceType || 'Service',
  serviceType: job.service_type || job.serviceType || job.service || 'Service',
  ticketId: toNumericId(job.id, toNumericId(job.ticketId, toNumericId(job.ticket_id))),
  ticketType: job.ticket_type || job.ticketType || 'installation',
  ticketCode: job.ticket_id || (job.id != null ? `TKT-${job.id}` : ''),
  scheduledDate: job.scheduledDate || job.scheduled_date,
  completedDate: job.completed_date || job.completedDate || null,
  address: job.address || job.location || '',
  location: job.location || job.address || '',
  latitude: toNumber(job.latitude),
  longitude: toNumber(job.longitude),
  status: String(job.status || '').toLowerCase().replace(/\s+/g, '_'),
  requestSource: job.request_source || job.requestSource || 'client_portal',
  requestSourceLabel: job.request_source_label || job.requestSourceLabel || 'Client Portal',
  assignmentRole: job.assignment_role || job.assignmentRole || 'lead',
  leadTechnician: job.lead_technician || job.technician || '',
  inventoryReservations: Array.isArray(job?.inventory_reservations)
    ? job.inventory_reservations.map(normalizeInventoryReservation)
    : [],
  checklistCompleted: Boolean(job?.checklist_completed ?? job?.checklistCompleted),
  checklistCompletedAt: job?.checklist_completed_at || job?.checklistCompletedAt || null,
  completionProofImages: Array.isArray(job?.completion_proof_images)
    ? job.completion_proof_images
    : (Array.isArray(job?.completionProofImages) ? job.completionProofImages : []),
  completionNotes: job?.completion_notes || job?.completionNotes || '',
  inspection: job?.inspection || null,
  maintenanceSchedule: job?.maintenance_schedule || job?.maintenanceSchedule || null,
  afterSalesCases: Array.isArray(job?.after_sales_cases)
    ? job.after_sales_cases
    : (Array.isArray(job?.afterSalesCases) ? job.afterSalesCases : []),
  warrantyStatus: job?.warranty_status || job?.warrantyStatus || 'not_applicable',
  warrantyStartDate: job?.warranty_start_date || job?.warrantyStartDate || null,
  warrantyEndDate: job?.warranty_end_date || job?.warrantyEndDate || null,
  warrantyNotes: job?.warranty_notes || job?.warrantyNotes || '',
  clientRating: job?.client_rating ?? job?.clientRating ?? null,
  clientFeedback: job?.client_feedback || job?.clientFeedback || '',
  crewSummary: Array.isArray(job?.crew_members)
    ? job.crew_members.map((member) => member?.name || member?.username || 'Technician').join(', ')
    : ''
});

export const fetchTechnicianJobs = async (techName) => {
  try {
    const { data } = await api.get('/technician/jobs/', { params: { techName } });
    const jobArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(jobArray) ? jobArray.map(normalizeTechnicianJob) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician jobs.'));
  }
};

export const fetchTechnicianJob = async (ticketId) => {
  try {
    const { data } = await api.get(`/technician/jobs/${ticketId}/`);
    return normalizeTechnicianJob(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician job details.'));
  }
};

export const startJobNavigation = async (ticketId) => {
  try {
    const { data } = await api.post(`/technician/jobs/${ticketId}/start-navigation/`, {});
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to record navigation start.'));
  }
};

export const markTechnicianArrival = async (ticketId, { latitude = null, longitude = null } = {}) => {
  try {
    const payload = {};
    if (latitude !== null && latitude !== undefined) payload.latitude = latitude;
    if (longitude !== null && longitude !== undefined) payload.longitude = longitude;
    const { data } = await api.post(`/technician/jobs/${ticketId}/arrive/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to mark arrival.'));
  }
};

export const fetchTechnicianInventoryItems = async () => {
  try {
    const itemArray = await fetchAllPages('/inventory/items/');
    return itemArray.map(normalizeInventoryItem);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load inventory equipment.'));
  }
};

export const requestAdditionalEquipment = async (jobId, { itemId, quantity, items, notes = '' }) => {
  try {
    const payload = { notes };
    if (Array.isArray(items)) {
      payload.items = items.map((item) => ({
        item_id: item.itemId ?? item.item_id ?? item.id,
        quantity: item.quantity
      }));
    } else {
      payload.item_id = itemId;
      payload.quantity = quantity;
    }

    const { data } = await api.post(`/services/service-tickets/${jobId}/request_parts/`, {
      ...payload
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to request additional equipment.'));
  }
};

export const fetchTechnicianSchedule = async (techName, options = {}) => {
  try {
    const params = { techName };
    if (options.start) params.start = options.start;
    if (options.end) params.end = options.end;
    if (options.showCompleted) params.show_completed = '1';
    const { data } = await api.get('/technician/schedule/', { params });
    const scheduleArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(scheduleArray) ? scheduleArray.map(normalizeTechnicianJob) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician schedule.'));
  }
};

export const fetchTechnicianDashboard = async (techName) => {
  try {
    const { data } = await api.get('/technician/dashboard/', { params: { techName } });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician dashboard.'));
  }
};

export const fetchTechnicianProfile = async (techName) => {
  try {
    const { data } = await api.get('/technician/profile/', { params: { techName } });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician profile.'));
  }
};

export const updateTechnicianProfile = async (techNameOrPayload, updates) => {
  try {
    const resolvedUpdates = typeof techNameOrPayload === 'object' ? techNameOrPayload.updates : updates;
    const { data } = await api.put('/technician/profile/', resolvedUpdates);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update technician profile.'));
  }
};

export const fetchTechnicianHistory = async (techName) => {
  try {
    const { data } = await api.get('/technician/history/', { params: { techName } });
    const historyArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(historyArray) ? historyArray.map(normalizeTechnicianJob) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician history.'));
  }
};

export const updateJobStatus = async (jobId, status, notes = '', images = [], inventoryUsage = null) => {
  try {
    const payload = { status };

    if (status === 'completed') {
      payload.completion_notes = notes;
      payload.completion_proof_images = images;
      if (inventoryUsage) {
        payload.inventory_usage = inventoryUsage;
      }
    }

    const { data } = await api.post(`/technician/jobs/${jobId}/status/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update job status.'));
  }
};

export const submitChecklist = async (checklist) => {
  try {
    const formData = new FormData();
    const {
      photos = [],
      videos = [],
      proof_media,
      ...rest
    } = checklist;

    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (typeof value === 'object') {
        formData.append(key, JSON.stringify(value));
      } else if (typeof value === 'boolean') {
        formData.append(key, value ? 'true' : 'false');
      } else {
        formData.append(key, String(value));
      }
    }

    if (proof_media !== undefined && proof_media !== null) {
      formData.append('proof_media', JSON.stringify(proof_media));
    }

    for (const photo of photos) {
      if (photo instanceof File) {
        formData.append('photo_files', photo);
      } else if (photo !== undefined && photo !== null && photo !== '') {
        formData.append('photos', String(photo));
      }
    }

    for (const video of videos) {
      if (video instanceof File) {
        formData.append('video_files', video);
      } else if (video !== undefined && video !== null && video !== '') {
        formData.append('videos', String(video));
      }
    }

    const { data } = await api.post('/checklist/', formData);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to submit checklist.'));
  }
};

export const submitInspectionChecklist = async (ticketId, checklistData) => {
  try {
    const payload = {
      ticket: ticketId,
      checklist_items: [],
    };
    
    // General Assessment fields
    if (checklistData.siteAccessible !== undefined) payload.site_accessible = checklistData.siteAccessible;
    if (checklistData.siteAccessibleNotes) payload.site_accessible_notes = checklistData.siteAccessibleNotes;
    if (checklistData.electricalAdequate !== undefined) payload.electrical_adequate = checklistData.electricalAdequate;
    if (checklistData.electricalNotes) payload.electrical_notes = checklistData.electricalNotes;
    if (checklistData.safetyEquipmentPresent !== undefined) payload.safety_equipment_present = checklistData.safetyEquipmentPresent;
    if (checklistData.safetyHazards) payload.safety_hazards = checklistData.safetyHazards;
    if (checklistData.recommendation) payload.recommendation = checklistData.recommendation;
    
    if (checklistData.notes) payload.additional_notes = checklistData.notes;
    
    const { data } = await api.post('/services/inspections/', payload);
    
    if (checklistData.photos && checklistData.photos.length > 0) {
      const photoFormData = new FormData();
      for (const photo of checklistData.photos) {
        photoFormData.append('photo_files', photo);
      }
      await api.post(`/services/service-tickets/${ticketId}/upload_photos/`, photoFormData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    
    if (data && data.id) {
      await api.post(`/services/inspections/${data.id}/complete/`);
    }
    
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to submit inspection checklist.'));
  }
};
