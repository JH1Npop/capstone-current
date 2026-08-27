import { api, fetchAllPages, getApiErrorMessage } from './core';
import { clientTechnicianDisplayString } from '../utils/clientTechnicianDisplay';

const extractList = (data) => (Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []));

const normalizeStatus = (value) => String(value || '').toLowerCase().replace(/\s+/g, '_');

const toNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const buildProgress = (status) => {
  switch (status) {
    case 'completed':
      return 100;
    case 'in_progress':
      return 60;
    case 'approved':
    case 'not_started':
      return 25;
    case 'pending':
      return 10;
    default:
      return 0;
  }
};

const deriveClientStatus = (requestStatus, ticketStatus) => {
  switch (ticketStatus) {
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'in_progress':
    case 'on_hold':
      return 'in_progress';
    case 'not_started':
      return requestStatus === 'pending' ? 'pending' : 'approved';
    default:
      return requestStatus;
  }
};

const formatWorkflowLabel = (hasTicket) => (hasTicket ? 'Ticket Active' : 'Request Review');

const normalizeServiceRequest = (request) => {
  const requestStatus = normalizeStatus(request.status);
  const serviceItems = Array.isArray(request.service_items) ? request.service_items : [];
  const serviceNames = serviceItems.map((item) => item?.service_type_name).filter(Boolean);
  const serviceName = request.service_summary || serviceNames.join(', ') || request.service_type_name;

  return {
    id: request.id,
    request_id: request.id,
    ticket_id: null,
    has_ticket: false,
    workflow_stage: 'request',
    workflow_label: formatWorkflowLabel(false),
    request_source: request.request_source || 'client_portal',
    request_source_label: request.request_source_label || 'Client Portal',
    status: requestStatus,
    request_status: requestStatus,
    ticket_status: null,
    operational_status: requestStatus,
    service_type: request.service_type,
    service_type_name: serviceName,
    service_items: serviceItems,
    description: request.description,
    priority: request.priority,
    address: request.location?.address || '',
    city: request.location?.city || '',
    province: request.location?.province || '',
    latitude: request.location?.latitude == null ? null : Number(request.location.latitude),
    longitude: request.location?.longitude == null ? null : Number(request.location.longitude),
    request_date: request.request_date,
    preferred_date: request.preferred_date,
    preferred_time_slot: request.preferred_time_slot,
    scheduling_notes: request.scheduling_notes,
    updated_at: request.updated_at,
    scheduled_date: null,
    scheduled_time: null,
    scheduled_time_slot: null,
    start_time: null,
    end_time: null,
    completed_date: null,
    technician_name: '',
    technician_contact: '',
    client_rating: null,
    client_feedback: '',
    reschedule_requested: false,
    reschedule_reason: '',
    warranty_status: 'not_applicable',
    warranty_period_days: null,
    warranty_start_date: null,
    warranty_end_date: null,
    warranty_notes: '',
    proof_media: [],
    completion_proof_images: [],
    completion_notes: '',
    installed_equipment: [],
    field_service_reports: [],
    inspection: null,
    maintenance_schedule: null,
    after_sales_cases: [],
    progress: buildProgress(requestStatus),
  };
};

const mergeRequestWithTicket = (serviceRequest, ticket) => {
  const requestStatus = normalizeStatus(serviceRequest.request_status || serviceRequest.status);
  const ticketStatus = normalizeStatus(ticket.status);
  const clientStatus = deriveClientStatus(requestStatus, ticketStatus);

  return {
    ...serviceRequest,
    ticket_id: ticket.id,
    has_ticket: true,
    workflow_stage: 'ticket',
    workflow_label: formatWorkflowLabel(true),
    request_source: ticket.request_source || serviceRequest.request_source,
    request_source_label: ticket.request_source_label || serviceRequest.request_source_label,
    status: clientStatus,
    ticket_status: ticketStatus,
    operational_status: ticketStatus,
    priority: ticket.priority || serviceRequest.priority,
    scheduled_date: ticket.scheduled_date,
    scheduled_time: ticket.scheduled_time,
    scheduled_time_slot: ticket.scheduled_time_slot,
    start_time: ticket.start_time,
    end_time: ticket.end_time,
    completed_date: ticket.completed_date,
    technician_name: clientTechnicianDisplayString(ticket),
    technician_contact: ticket.technician_contact || '',
    client_rating: ticket.client_rating,
    client_feedback: ticket.client_feedback,
    reschedule_requested: Boolean(ticket.reschedule_requested),
    reschedule_reason: ticket.reschedule_reason,
    warranty_status: ticket.warranty_status || 'not_applicable',
    warranty_period_days: ticket.warranty_period_days,
    warranty_start_date: ticket.warranty_start_date,
    warranty_end_date: ticket.warranty_end_date,
    warranty_notes: ticket.warranty_notes,
    proof_media: Array.isArray(ticket.inspection?.proof_media) ? ticket.inspection.proof_media : [],
    completion_proof_images: Array.isArray(ticket.completion_proof_images) ? ticket.completion_proof_images : [],
    completion_notes: ticket.completion_notes || '',
    installed_equipment: Array.isArray(ticket.installed_equipment) ? ticket.installed_equipment : [],
    field_service_reports: Array.isArray(ticket.field_service_reports) ? ticket.field_service_reports : [],
    inspection: ticket.inspection || null,
    maintenance_schedule: ticket.maintenance_schedule || null,
    after_sales_cases: Array.isArray(ticket.after_sales_cases) ? ticket.after_sales_cases : [],
    updated_at: ticket.updated_at || serviceRequest.updated_at,
    progress: buildProgress(clientStatus),
  };
};

export const fetchClientRequests = async () => {
  try {
    const [requestArray, ticketArray] = await Promise.all([
      fetchAllPages('/services/service-requests/'),
      fetchAllPages('/services/service-tickets/'),
    ]);

    const requestMap = new Map(
      requestArray.map((request) => [String(request.id), normalizeServiceRequest(request)])
    );

    ticketArray.forEach((ticket) => {
      const ticketRequest = ticket.request_details || {};
      const requestId = ticketRequest.id ?? ticket.request;
      const requestKey = String(requestId);
      const existingRequest = requestMap.get(requestKey);
      const normalizedRequest = existingRequest || normalizeServiceRequest({
        ...ticketRequest,
        id: requestId,
      });

      requestMap.set(requestKey, mergeRequestWithTicket(normalizedRequest, ticket));
    });

    return [...requestMap.values()].sort((left, right) => {
      const rightTimestamp = new Date(right.updated_at || right.completed_date || right.request_date || 0).getTime();
      const leftTimestamp = new Date(left.updated_at || left.completed_date || left.request_date || 0).getTime();
      return rightTimestamp - leftTimestamp;
    });
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load client requests.'));
  }
};

export const updateUserProfile = async (profileData) => {
  try {
    const hasFile = profileData?.profile_image instanceof File;
    const payload = hasFile ? new FormData() : profileData;

    if (hasFile) {
      Object.entries(profileData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          payload.append(key, value);
        }
      });
    }

    const { data } = await api.patch('/users/me/', payload, hasFile ? {
      headers: { 'Content-Type': 'multipart/form-data' }
    } : undefined);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update user profile.'));
  }
};

export const changePassword = async (passwordData) => {
  try {
    const { data } = await api.post('/users/change_password/', {
      current_password: passwordData.currentPassword,
      new_password: passwordData.newPassword
    });
    return data;
  } catch (error) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error('Failed to change password');
  }
};

export const fetchRequestDetail = async (requestId, options = {}) => {
  try {
    const entityType = options.entityType || 'request';
    const requests = await fetchClientRequests();

    const matchers = {
      request: (item) => String(item.request_id) === String(requestId) || String(item.id) === String(requestId),
      ticket: (item) => String(item.ticket_id) === String(requestId),
      auto: (item) =>
        String(item.request_id) === String(requestId) ||
        String(item.ticket_id) === String(requestId) ||
        String(item.id) === String(requestId),
    };

    const matcher = matchers[entityType] || matchers.auto;
    const matchedRequest = requests.find(matcher);

    if (!matchedRequest) {
      throw new Error('Request not found.');
    }

    return matchedRequest;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load request details.'));
  }
};

export const submitRequestRating = async (requestId, ratingData) => {
  try {
    const { data } = await api.post(`/services/service-tickets/${requestId}/submit_feedback/`, {
      rating: ratingData.rating,
      feedback: ratingData.feedback
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to submit request rating.'));
  }
};

export const requestTicketReschedule = async (requestId, schedulingData) => {
  try {
    const { data } = await api.post(`/services/service-tickets/${requestId}/request_reschedule/`, schedulingData);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to request a schedule change.'));
  }
};
