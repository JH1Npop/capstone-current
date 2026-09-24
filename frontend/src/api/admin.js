import {
  api,
  buildUserCreatePayload,
  buildUserUpdatePayload,
  fetchAllPages,
  getApiErrorMessage,
  normalizeTechnicianStatus,
  normalizeUser
} from './core';

const normalizeTechnicianRecord = (tech) => {
  const skillDetails = Array.isArray(tech?.skill_details)
    ? tech.skill_details.map((skill) => ({
        ...skill,
        service_type: Number(skill?.service_type),
        skill_level: skill?.skill_level || 'intermediate',
      }))
    : [];
  const skillNames = Array.isArray(tech?.skills)
    ? tech.skills
    : skillDetails.map((skill) => skill.service_type_name).filter(Boolean);

  return {
    ...normalizeUser(tech),
    status: normalizeTechnicianStatus(tech),
    skills: skillNames,
    skill: tech?.skill
      ? String(tech.skill).toLowerCase().replace(/\s+/g, '_')
      : (skillNames[0]
          ? String(skillNames[0]).toLowerCase().replace(/\s+/g, '_')
          : ''),
    skillDetails,
  };
};

export const fetchAdminUsers = async () => {
  try {
    const userArray = await fetchAllPages('/users/');
    return Array.isArray(userArray) ? userArray.map(normalizeUser) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load users.'));
  }
};

export const createAdminUser = async (userData) => {
  try {
    const payload = buildUserCreatePayload(userData);
    const { data } = await api.post('/admin/users/', payload);
    return normalizeUser(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create user.'));
  }
};

export const updateAdminUser = async (userId, updates) => {
  try {
    const payload = buildUserUpdatePayload(updates);
    const { data } = await api.put(`/admin/users/${userId}/`, payload);
    return normalizeUser(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update user.'));
  }
};

export const deactivateAdminUser = async (userId) => {
  try {
    const { data } = await api.delete(`/admin/users/${userId}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to deactivate user.'));
  }
};

export const fetchAssignableCapabilities = async () => {
  try {
    const { data } = await api.get('/users/available_capabilities/');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load capabilities.'));
  }
};

export const fetchUserCapabilities = async (userId) => {
  try {
    const { data } = await api.get(`/users/${userId}/capabilities/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load user access.'));
  }
};

export const updateUserCapabilities = async (userId, capabilities) => {
  try {
    const payload = {
      capabilities: Array.isArray(capabilities) ? capabilities : []
    };
    const { data } = await api.put(`/users/${userId}/capabilities/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update user access.'));
  }
};

export const fetchAdminClients = async () => {
  try {
    const { data } = await api.get('/admin/clients/');
    const clientArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(clientArray) ? clientArray.map(normalizeUser) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load admin clients.'));
  }
};

export const createAdminClient = async (client) => {
  try {
    const payload = {
      ...buildUserCreatePayload(client),
      role: 'client'
    };
    const { data } = await api.post('/admin/clients/', payload);
    return normalizeUser(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create client.'));
  }
};

export const updateAdminClient = async (id, updates) => {
  try {
    const payload = buildUserUpdatePayload(updates);
    const { data } = await api.put(`/admin/clients/${id}/`, payload);
    return normalizeUser(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update client.'));
  }
};

export const deleteAdminClient = async (id) => {
  try {
    const { data } = await api.delete(`/admin/clients/${id}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete client.'));
  }
};

export const fetchAdminTechnicians = async () => {
  try {
    const { data } = await api.get('/admin/technicians/');
    const techArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(techArray) ? techArray.map(normalizeTechnicianRecord) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technicians.'));
  }
};

export const fetchAdminTechnician = async (id) => {
  try {
    const { data } = await api.get(`/admin/technicians/${id}/`);
    return normalizeTechnicianRecord(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician details.'));
  }
};

export const createAdminTechnician = async (tech) => {
  try {
    const payload = {
      ...buildUserCreatePayload(tech),
      role: 'technician',
      status: tech.status === 'offline' ? 'inactive' : 'active',
      is_available: tech.status === 'available'
    };
    const { data } = await api.post('/admin/technicians/', payload);
    return normalizeTechnicianRecord(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create technician.'));
  }
};

export const updateAdminTechnician = async (id, updates) => {
  try {
    const payload = buildUserUpdatePayload({
      ...updates,
      technicianStatus: updates.status
    });
    const { data } = await api.put(`/admin/technicians/${id}/`, payload);
    return normalizeTechnicianRecord(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update technician.'));
  }
};

export const deleteAdminTechnician = async (id) => {
  try {
    const { data } = await api.delete(`/admin/technicians/${id}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete technician.'));
  }
};

export const fetchAdminCalendarEvents = async ({ start, end, showCompleted = false } = {}) => {
  try {
    const params = {};
    if (start) params.start = start;
    if (end) params.end = end;
    if (showCompleted) params.show_completed = '1';
    const { data } = await api.get('/admin/calendar/', { params });
    return Array.isArray(data?.events) ? data.events : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load admin calendar.'));
  }
};

export const assignTechnician = async ({ ticketId, technicianId, technicianName, crewIds = [], equipmentReservations = null, dispatchStage = 'service' }) => {
  try {
    let resolvedTechnicianId = technicianId;
    if (!resolvedTechnicianId && technicianName) {
      const technicians = await fetchAdminTechnicians();
      resolvedTechnicianId = technicians.find((tech) => tech.name === technicianName)?.id;
    }
    if (!resolvedTechnicianId) {
      throw new Error('Please select a valid technician.');
    }
    const payload = {
      technician_id: resolvedTechnicianId,
      crew_ids: Array.isArray(crewIds) ? crewIds : [],
      dispatch_stage: dispatchStage
    };
    if (Array.isArray(equipmentReservations)) {
      payload.equipment_reservations = equipmentReservations
        .map((reservation) => ({
          item: Number(reservation.item || reservation.item_id),
          quantity: Number(reservation.quantity || 0)
        }))
        .filter((reservation) => reservation.item && reservation.quantity > 0);
    }
    const { data } = await api.post(`/services/service-tickets/${ticketId}/assign/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to assign technician.'));
  }
};

export const fetchTicketEquipmentReconciliation = async (ticketId) => {
  try {
    const { data } = await api.get(`/services/service-tickets/${ticketId}/equipment-reconciliation/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load issued equipment for this ticket.'));
  }
};

export const returnTicketEquipment = async (ticketId, payload) => {
  try {
    const { data } = await api.post(
      `/services/service-tickets/${ticketId}/equipment-reconciliation/`,
      payload,
    );
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to record the equipment return.'));
  }
};

export const reviewInspectionDecision = async (ticketId, { decision, notes = '', scheduledDate = null }) => {
  try {
    const payload = { decision, notes };
    if (scheduledDate) {
      payload.scheduled_date = scheduledDate;
    }
    const { data } = await api.post(`/services/service-tickets/${ticketId}/inspection_decision/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to save inspection decision.'));
  }
};

export const fetchInspectionDetails = async (ticketId) => {
  try {
    const { data } = await api.get(`/services/inspections/?ticket=${ticketId}`);
    // Handle DRF pagination response format
    const results = data.results || data;
    return results && results.length > 0 ? results[0] : null;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Failed to load inspection details.'));
  }
};

export const rescheduleServiceTicket = async (ticketId, schedulingData) => {
  try {
    const payload = {
      scheduled_date: schedulingData.scheduledDate,
      scheduled_time_slot: schedulingData.scheduledTimeSlot || null,
      scheduled_time: schedulingData.scheduledTime || null,
      notes: schedulingData.notes || ''
    };
    const { data } = await api.post(`/services/service-tickets/${ticketId}/reschedule/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to reschedule service ticket.'));
  }
};

export const autoAssignTechnician = async ({ ticketId }) => {
  try {
    const { data } = await api.post(`/services/service-tickets/${ticketId}/auto_assign/`, {});
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to auto-assign technician.'));
  }
};

export const fetchAdminSettings = async () => {
  try {
    const { data } = await api.get('/admin/settings/');
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load admin settings.'));
  }
};

export const updateAdminSettings = async (settings) => {
  try {
    const { data } = await api.put('/admin/settings/', settings);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update admin settings.'));
  }
};

export const uploadLandingPageImage = async (imageFile) => {
  try {
    const payload = new FormData();
    payload.append('image', imageFile);
    const { data } = await api.post('/admin/settings/landing-images/', payload, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to upload landing-page image.'));
  }
};

export const deleteLandingPageImage = async (assetId) => {
  try {
    await api.delete(`/admin/settings/landing-images/${assetId}/`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete landing-page image.'));
  }
};

export const fetchSlaRules = async () => {
  try {
    const { data } = await api.get('/services/sla-rules/');
    return Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load SLA rules.'));
  }
};

export const updateSlaRule = async (ruleId, updates) => {
  try {
    const { data } = await api.patch(`/services/sla-rules/${ruleId}/`, updates);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update SLA rule.'));
  }
};

const activityLogParams = (filters = {}, { includePagination = true } = {}) => {
    const params = {};
    if (filters.search) params.search = filters.search;
    if (filters.category) params.category = filters.category;
    if (filters.action) params.action = filters.action;
    if (filters.model) params.model = filters.model;
    if (filters.changedBy) params.changed_by = filters.changedBy;
    if (filters.dateFrom) params.date_from = filters.dateFrom;
    if (filters.dateTo) params.date_to = filters.dateTo;
    if (includePagination && filters.page) params.page = filters.page;
    if (includePagination && filters.pageSize) params.page_size = filters.pageSize;
    return params;
};

export const fetchActivityLogs = async (filters = {}) => {
  try {
    const params = activityLogParams(filters);

    const { data } = await api.get('/admin/activity-logs/', { params });
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    const normalizeServiceContext = (context = {}) => ({
      dateTime: context.date_time || context.dateTime || '',
      eventDescription: context.event_description || context.eventDescription || '',
      serviceProvider: context.service_provider || context.serviceProvider || '',
      serviceType: context.service_type || context.serviceType || '',
      outcome: context.outcome || '',
      actionTaken: context.action_taken || context.actionTaken || '',
      resolution: context.resolution || '',
      feedback: context.feedback || ''
    });
    const normalizedRows = rows.map((log) => ({
      id: log.id,
      category: log.category || 'system',
      message: log.message || log.summary || '',
      metadata: log.metadata || {},
      ipAddress: log.ip_address || '',
      userAgent: log.user_agent || '',
      appLabel: log.app_label,
      model: log.model,
      objectId: log.object_id,
      objectLabel: log.object_label,
      action: log.action,
      fieldName: log.field_name,
      oldValue: log.old_value,
      newValue: log.new_value,
      changedBy: log.changed_by,
      changedByName: log.changed_by_name || 'System',
      changedByRole: log.changed_by_role,
      changedAt: log.changed_at,
      summary: log.summary,
      serviceContext: normalizeServiceContext(log.service_context || log.serviceContext || {})
    }));
    return {
      rows: normalizedRows,
      count: Number(data?.count ?? normalizedRows.length)
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load activity logs.'));
  }
};

export const fetchActivityLogSummary = async (filters = {}) => {
  try {
    const { data } = await api.get('/admin/activity-logs/summary/', {
      params: activityLogParams(filters, { includePagination: false }),
    });
    return {
      total: Number(data?.total || 0),
      today: Number(data?.today || 0),
      attention: Number(data?.attention || 0),
      userActions: Number(data?.user_actions || 0),
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load activity summary.'));
  }
};

export const downloadActivityLogs = async (filters = {}) => {
  try {
    const response = await api.get('/admin/activity-logs/export/', {
      params: activityLogParams(filters, { includePagination: false }),
      responseType: 'blob',
    });
    const contentDisposition = response.headers?.['content-disposition'] || '';
    const serverFilename = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
    const filename = serverFilename || `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    const url = window.URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    return filename;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to export activity logs.'));
  }
};

export const fetchServices = async () => {
  try {
    const { data } = await api.get('/admin/services/');
    const serviceArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(serviceArray)
      ? serviceArray.map((service) => ({
          ...service,
          estimated_duration: Number(service?.estimated_duration || 0),
          is_active: service?.is_active !== false,
          usage_count: Number(service?.usage_count || 0),
          request_count: Number(service?.request_count || 0),
          ticket_count: Number(service?.ticket_count || 0)
        }))
      : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load services.'));
  }
};

export const createService = async (service) => {
  try {
    const payload = {
      name: String(service.name || '').trim(),
      description: String(service.description || '').trim(),
      estimated_duration: Number(service.estimated_duration || 0),
      estimated_cost: Number(service.estimated_cost || 0),
      max_daily_assignments: Number(service.max_daily_assignments || 1),
      is_active: service.is_active !== false,
      procedures: Array.isArray(service.procedures)
        ? service.procedures
            .map((procedure, index) => ({
              step: index + 1,
              title: String(procedure?.title || '').trim(),
              description: String(procedure?.description || '').trim(),
              requires_photo: Boolean(procedure?.requires_photo)
            }))
            .filter((procedure) => procedure.title)
        : [],
      required_equipment: Array.isArray(service.required_equipment)
        ? service.required_equipment
            .map((item) => ({
              name: String(item?.name || '').trim(),
              quantity: Number(item?.quantity || 1)
            }))
            .filter((item) => item.name)
        : []
    };
    const { data } = await api.post('/admin/services/', payload);
    return {
      ...data,
      estimated_duration: Number(data?.estimated_duration || 0),
      is_active: data?.is_active !== false,
      usage_count: Number(data?.usage_count || 0),
      request_count: Number(data?.request_count || 0),
      ticket_count: Number(data?.ticket_count || 0)
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create service.'));
  }
};

export const updateService = async (id, updates) => {
  try {
    const payload = {
      name: String(updates.name || '').trim(),
      description: String(updates.description || '').trim(),
      estimated_duration: Number(updates.estimated_duration || 0),
      estimated_cost: Number(updates.estimated_cost || 0),
      max_daily_assignments: Number(updates.max_daily_assignments || 1),
      is_active: updates.is_active !== false,
      procedures: Array.isArray(updates.procedures)
        ? updates.procedures
            .map((procedure, index) => ({
              step: index + 1,
              title: String(procedure?.title || '').trim(),
              description: String(procedure?.description || '').trim(),
              requires_photo: Boolean(procedure?.requires_photo)
            }))
            .filter((procedure) => procedure.title)
        : [],
      required_equipment: Array.isArray(updates.required_equipment)
        ? updates.required_equipment
            .map((item) => ({
              name: String(item?.name || '').trim(),
              quantity: Number(item?.quantity || 1)
            }))
            .filter((item) => item.name)
        : []
    };
    const { data } = await api.put(`/admin/services/${id}/`, payload);
    return {
      ...data,
      estimated_duration: Number(data?.estimated_duration || 0),
      is_active: data?.is_active !== false,
      usage_count: Number(data?.usage_count || 0),
      request_count: Number(data?.request_count || 0),
      ticket_count: Number(data?.ticket_count || 0)
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update service.'));
  }
};

export const deleteService = async (id) => {
  try {
    const { data } = await api.delete(`/admin/services/${id}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete service.'));
  }
};

export const fetchAdminAnalytics = async (period = 30, requestOptions = {}) => {
  try {
    const params = typeof period === 'object' && period !== null
      ? {
          days: period.days ? Math.max(1, Math.min(1095, Number(period.days) || 30)) : undefined,
          start_date: period.startDate || period.start_date,
          end_date: period.endDate || period.end_date,
          group_by: period.groupBy || period.group_by,
          service_type_id: period.serviceTypeId || period.service_type_id,
          technician_id: period.technicianId || period.technician_id,
          status: period.status,
          priority: period.priority,
          city: period.city,
          province: period.province,
          assignment_state: period.assignmentState || period.assignment_state,
          workspace: period.workspace,
          comparison: period.comparison,
          comparison_start_date: period.customComparisonStart || period.comparison_start_date,
          comparison_end_date: period.customComparisonEnd || period.comparison_end_date,
          sales_status: period.salesStatus || period.sales_status,
          client_type: period.clientType || period.client_type,
          currency: period.currency,
          category_id: period.categoryId || period.category_id,
          transaction_type: period.transactionType || period.transaction_type,
          item_id: period.itemId || period.item_id,
          stock_status: period.stockStatus || period.stock_status,
          case_type: period.caseType || period.case_type,
          case_status: period.caseStatus || period.case_status,
          case_priority: period.casePriority || period.case_priority,
          creation_source: period.creationSource || period.creation_source,
          requires_revisit: period.requiresRevisit ?? period.requires_revisit,
          maintenance_status: period.maintenanceStatus || period.maintenance_status,
          risk_level: period.riskLevel || period.risk_level,
          maintenance_service_type_id: period.maintenanceServiceTypeId || period.maintenance_service_type_id,
        }
      : { days: Math.max(1, Math.min(1095, Number(period) || 30)) };

    const { data } = await api.get('/admin/analytics/', {
      params,
      signal: requestOptions.signal,
    });
    return data;
  } catch (error) {
    if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') throw error;
    throw new Error(getApiErrorMessage(error, 'Unable to load admin analytics.'));
  }
};

export const fetchAdminAnalyticsAiSummary = async (period = 30, question = '') => {
  try {
    const params = typeof period === 'object' && period !== null
      ? {
          days: Math.max(1, Math.min(1095, Number(period.days) || 30)),
          start_date: period.startDate,
          end_date: period.endDate,
          question,
        }
      : { days: Math.max(1, Math.min(1095, Number(period) || 30)), question };

    const { data } = await api.get('/admin/analytics/ai-summary/', {
      params
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to generate analytics explanation.'));
  }
};

export const fetchInventory = async () => {
  try {
    const inventoryArray = await fetchAllPages('/inventory/items/');
    return Array.isArray(inventoryArray) ? inventoryArray : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load inventory.'));
  }
};

export const fetchInventorySummary = async () => {
  try {
    const { data } = await api.get('/inventory/items/statistics/');
    return {
      totalItems: Number(data?.total_items || 0),
      totalValue: Number(data?.total_value || 0),
      lowStockCount: Number(data?.low_stock_count || 0),
      outOfStock: Number(data?.out_of_stock || 0),
      statusCounts: data?.status_counts || {},
      categoryCounts: Array.isArray(data?.category_counts) ? data.category_counts : []
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load inventory summary.'));
  }
};

export const fetchServiceInventoryRequirements = async () => {
  try {
    const requirementArray = await fetchAllPages('/inventory/service-type-requirements/');
    return Array.isArray(requirementArray) ? requirementArray : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load service inventory requirements.'));
  }
};

export const createServiceInventoryRequirement = async (requirement) => {
  try {
    const payload = {
      service_type: Number(requirement.service_type),
      item: Number(requirement.item),
      quantity: Number(requirement.quantity || 0),
      auto_reserve: requirement.auto_reserve !== false,
      notes: requirement.notes || ''
    };
    const { data } = await api.post('/inventory/service-type-requirements/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create inventory requirement.'));
  }
};

export const updateServiceInventoryRequirement = async (id, requirement) => {
  try {
    const payload = {
      service_type: Number(requirement.service_type),
      item: Number(requirement.item),
      quantity: Number(requirement.quantity || 0),
      auto_reserve: requirement.auto_reserve !== false,
      notes: requirement.notes || ''
    };
    const { data } = await api.put(`/inventory/service-type-requirements/${id}/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update inventory requirement.'));
  }
};

export const deleteServiceInventoryRequirement = async (id) => {
  try {
    await api.delete(`/inventory/service-type-requirements/${id}/`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete inventory requirement.'));
  }
};
