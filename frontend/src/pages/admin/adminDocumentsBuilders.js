import {
  COMMISSIONING_TEMPLATE_ITEMS,
  createInitialForm,
  createInitialTdsForm,
  createRows,
  createTdsLoadRows,
  createTdsPurposeRows,
  formatTicketDateForInput,
  getProjectDetail,
  getTicketAddress,
  getTicketClientName,
  getTicketContactNumber,
  mapStoredRows,
  normalizePurposeOfGoingSolar,
  pickNumericId,
  splitClientName
} from './adminDocumentsSupport';

export const buildTicketContextFromPrefill = (ticket, prefill = null) => {
  if (!ticket || !prefill) {
    return ticket;
  }

  const client = prefill.client || {};
  const serviceRequest = prefill.service_request || {};
  const serviceLocation = prefill.service_location || {};
  const technician = prefill.technician || {};
  const warranty = prefill.warranty || {};
  const completion = prefill.completion || {};
  const requestDetails = ticket?.request_details || {};
  const clientId = pickNumericId(
    client.id,
    requestDetails.client_id,
    requestDetails.client,
    ticket?.clientId,
    ticket?.client_id,
    ticket?.request?.client
  );

  return {
    ...ticket,
    client: client.full_name || ticket?.client || '',
    clientId: clientId || ticket?.clientId || ticket?.client_id || '',
    clientFullname: client.full_name || ticket?.clientFullname || '',
    service:
      serviceRequest.service_summary ||
      serviceRequest.service_type_name ||
      ticket?.service ||
      '',
    locationDesc: serviceLocation.address || ticket?.locationDesc || '',
    scheduledDate: prefill.ticket?.scheduled_date || ticket?.scheduledDate || '',
    completedDate: completion.completed_date || ticket?.completedDate || '',
    technicianFullname: technician.name || ticket?.technicianFullname || '',
    assignedTech: technician.name || ticket?.assignedTech || '',
    project_details: prefill.ticket?.project_details || ticket?.project_details || ticket?.projectDetails || {},
    technical_data_sheet: prefill.technical_data_sheet || ticket?.technical_data_sheet || null,
    installation_contract: prefill.installation_contract || ticket?.installation_contract || null,
    turnover_acceptance: prefill.turnover_acceptance || ticket?.turnover_acceptance || null,
    field_service_reports: prefill.field_service_reports || ticket?.field_service_reports || [],
    request_details: {
      ...requestDetails,
      id: serviceRequest.id ?? requestDetails.id,
      description: serviceRequest.description || requestDetails.description || '',
      service_type: serviceRequest.service_type_id ?? requestDetails.service_type,
      service_type_name: serviceRequest.service_type_name || requestDetails.service_type_name || '',
      service_summary: serviceRequest.service_summary || requestDetails.service_summary || ticket?.service || '',
      preferred_date: serviceRequest.preferred_date || requestDetails.preferred_date || ticket?.preferredDate || '',
      preferred_time_slot: serviceRequest.preferred_time_slot || requestDetails.preferred_time_slot || ticket?.preferredTimeSlot || '',
      scheduling_notes: serviceRequest.scheduling_notes || requestDetails.scheduling_notes || '',
      client_name: client.full_name || requestDetails.client_name || '',
      client_fullname: client.full_name || requestDetails.client_fullname || '',
      client_id: clientId || requestDetails.client_id || '',
      client: clientId || requestDetails.client || '',
      client_first_name: client.first_name || '',
      client_middle_name: client.middle_name || '',
      client_last_name: client.last_name || '',
      client_company: client.company_name || '',
      client_phone: client.phone || requestDetails.client_phone || requestDetails.contact_number || '',
      client_landline: client.landline || '',
      client_email: client.email || requestDetails.client_email || '',
      client_address: client.address || requestDetails.client_address || serviceLocation.address || '',
      contact_number: client.phone || requestDetails.contact_number || '',
      warranty_period:
        warranty.period_days != null
          ? `${warranty.period_days} days`
          : requestDetails.warranty_period || '',
      location: {
        ...(requestDetails.location || {}),
        ...serviceLocation,
      }
    }
  };
};

export const buildFormFromTicket = (ticket, equipmentData = [], fsrRecord = null) => {
  const defaultRows = createRows();
  const rows = defaultRows.map((row, index) => {
    const eq = equipmentData[index];
    if (eq) {
      return {
        ...row,
        brandModel: (index === 0 && fsrRecord?.brand_model) ? fsrRecord.brand_model : (eq.brand_model || ''),
        trHp: eq.capacity || '',
        serialNumber: (index === 0 && fsrRecord?.serial_number) ? fsrRecord.serial_number : (eq.serial_number || ''),
        indoorTemp: (index === 0 && fsrRecord?.indoor_temp) ? fsrRecord.indoor_temp : row.indoorTemp,
        outdoorTemp: (index === 0 && fsrRecord?.outdoor_temp) ? fsrRecord.outdoor_temp : row.outdoorTemp,
        ampere: (index === 0 && fsrRecord?.ampere_reading) ? fsrRecord.ampere_reading : row.ampere,
        others: (index === 0 && fsrRecord?.voltage_reading) ? fsrRecord.voltage_reading : row.others,
        recommendation: (index === 0 && fsrRecord?.recommendation) ? fsrRecord.recommendation : row.recommendation
      };
    }
    return row;
  });

  return {
    clientName: getTicketClientName(ticket),
    address: getTicketAddress(ticket),
    contactNumber: getTicketContactNumber(ticket),
    technician: ticket?.technicianFullname || ticket?.assignedTech || '',
    documentDate: formatTicketDateForInput(ticket?.scheduledDate || ticket?.preferredDate),
    systemCapacity: getProjectDetail(ticket, 'system_capacity_kwp', 'system_capacity') || '',
    ticketNumber: ticket?.ticket_code || '',
    serviceType: ticket?.service || ticket?.request_details?.service_type_name || '',
    reference: ticket?.maintenance ? `Maintenance #${ticket.maintenance.id}` : (ticket?.after_sales && ticket.after_sales.length > 0 ? `After-Sales #${ticket.after_sales[0].case_number}` : (ticket?.warranty?.status === 'Active' ? 'Under Warranty' : '')),
    rows: rows
  };
};

export const buildTdsFormFromTicket = (ticket) => {
  const clientName = getTicketClientName(ticket);
  const nameParts = splitClientName(clientName);
  const storedLoadRows = mapStoredRows(
    getProjectDetail(ticket, 'load_schedule'),
    (row, index) => ({
      id: row?.id || `tds-load-${index + 1}`,
      appliance: row?.appliance || '',
      quantity: row?.quantity || '',
      inverterType: row?.inverterType || row?.inverter_type || '',
      wattage: row?.wattage || '',
      usageDay: row?.usageDay || row?.usage_day || '',
      usageNight: row?.usageNight || row?.usage_night || '',
      remarks: row?.remarks || ''
    })
  );

  const firstName = ticket?.request_details?.client_first_name || nameParts.firstName;
  const middleName = ticket?.request_details?.client_middle_name || nameParts.middleName;
  const lastName = ticket?.request_details?.client_last_name || nameParts.lastName;

  const rawPurposeOfGoingSolar = ticket?.technical_data_sheet?.purpose_of_going_solar;
  const tds = {
    ...(ticket?.technical_data_sheet || {}),
    purpose_of_going_solar: typeof rawPurposeOfGoingSolar === 'string' ? rawPurposeOfGoingSolar : ''
  };
  const normalizedPurpose = normalizePurposeOfGoingSolar(rawPurposeOfGoingSolar);

  return {
    ...createInitialTdsForm(),
    firstName,
    middleName,
    lastName,
    companyName: ticket?.request_details?.client_company || '',
    contactLandline: ticket?.request_details?.client_landline || '',
    mobileNumber: getTicketContactNumber(ticket),
    emailAddress: ticket?.request_details?.client_email || '',
    completeAddress: getTicketAddress(ticket),
    sitePremisePlan: tds?.premise_type || getProjectDetail(ticket, 'premise_type') || '',
    sitePremiseCategory: tds?.premise_category || getProjectDetail(ticket, 'premise_category') || '',
    ownershipStatus: tds?.ownership_type || getProjectDetail(ticket, 'ownership_type', 'ownership_status') || '',
    primaryElectricSupply: tds?.primary_electric_supply || getProjectDetail(ticket, 'primary_electric_supply') || '',
    acSupplyType: tds?.ac_phase_power_supply || getProjectDetail(ticket, 'ac_phase_power_supply', 'ac_supply_type') || '',
    solarInstallLocation: tds?.solar_panel_installation_location || getProjectDetail(ticket, 'solar_install_location') || '',
    rooftopType: tds?.rooftop_type || getProjectDetail(ticket, 'rooftop_type') || '',
    averageMonthlyBill: tds?.average_monthly_electric_bill || getProjectDetail(ticket, 'average_monthly_electricity_bill') || '',
    batteryPreference: tds?.battery_preference || getProjectDetail(ticket, 'battery_preference') || '',
    loadRows: (tds?.load_schedule_json && tds.load_schedule_json.length ? tds.load_schedule_json : storedLoadRows) || createTdsLoadRows(),
    clientConfirmationName: tds?.client_confirmed_name || clientName,
    confirmationDate: formatTicketDateForInput(tds?.client_confirmation_date || ticket?.scheduledDate || ticket?.preferredDate) || formatTicketDateForInput(new Date().toISOString()),
    purposeRows: createTdsPurposeRows().map((row) => {
      const rowLabel = String(row.label || '').trim().toLowerCase();
      const isMatched = Array.from(normalizedPurpose.matchedLabels).some(
        (label) => label.includes(rowLabel) || rowLabel.includes(label)
      );
      return {
        ...row,
        mark: isMatched ? 'X' : ''
      };
    }),
    purposeOther: normalizedPurpose.otherText
  };
};

export const createCommissioningItems = () =>
  COMMISSIONING_TEMPLATE_ITEMS.map((item) => ({
    ...item,
    check_status: '',
    remarks: ''
  }));

export const createInitialCommissioningForm = () => ({
  id: null,
  ticket: null,
  site_name: '',
  inverter_type: '',
  system_designation: '',
  inverter_serial_number: '',
  commissioned_date: '',
  irradiance: '',
  ambient_temperature: '',
  status: 'draft',
  checklist_items_json: createCommissioningItems(),
  readings_json: {
    inverter_display: {
      phase_a_voltage: '',
      phase_b_voltage: '',
      phase_c_voltage: '',
      phase_a_current: '',
      phase_b_current: '',
      phase_c_current: ''
    },
    field_measured: {
      phase_a_voltage: '',
      phase_b_voltage: '',
      phase_c_voltage: '',
      phase_a_current: '',
      phase_b_current: '',
      phase_c_current: ''
    }
  }
});

export const createQuotationPriceRows = () => ([
  {
    id: 'quote-price-1',
    description: 'SUPPLY, INSTALLATION AND COMMISSIONING OF SOLAR PV SYSTEM',
    unit: '1 lot',
    totalPrice: ''
  }
]);

export const createQuotationBrandRows = () => ([
  { id: 'quote-brand-1', label: 'PV Modules', value: 'JA Solar / Aiko Solar' },
  { id: 'quote-brand-2', label: 'PV Inverter', value: 'Ningbo Deye Technology' },
  { id: 'quote-brand-3', label: 'Battery', value: 'Alltopelec Power Wall / NPP' }
]);

export const createQuotationBomRows = () => ([
  { id: 'quote-bom-1', itemNo: '1', description: 'Solar panels', unit: 'pcs', qty: '', unitPrice: '', amount: '' },
  { id: 'quote-bom-2', itemNo: '2', description: 'Hybrid inverter', unit: 'unit', qty: '', unitPrice: '', amount: '' },
  { id: 'quote-bom-3', itemNo: '3', description: 'Battery bank / power wall', unit: 'unit', qty: '', unitPrice: '', amount: '' },
  { id: 'quote-bom-4', itemNo: '4', description: 'Mounting kit and rails', unit: 'lot', qty: '1', unitPrice: '', amount: '' },
  { id: 'quote-bom-5', itemNo: '5', description: 'DC/AC wirings, protections, and accessories', unit: 'lot', qty: '1', unitPrice: '', amount: '' },
  { id: 'quote-bom-6', itemNo: '6', description: 'Design, engineering, and manpower', unit: 'lot', qty: '1', unitPrice: '', amount: '' }
]);

export const createQuotationWarrantyRows = () => ([
  { id: 'quote-warranty-1', item: 'Solar Panels', brand: 'JA Solar / Aiko Solar', period: '12 Years enhanced manufacturer\'s product warranty\n30 Years linear power output warranty' },
  { id: 'quote-warranty-2', item: 'Inverter', brand: 'Ningbo Deye Technology', period: '5 Years product warranty from material defect' },
  { id: 'quote-warranty-3', item: 'Battery', brand: 'ATE / NPP / Alltopelec Power Wall', period: '5 Years product warranty from material defect' },
  { id: 'quote-warranty-4', item: 'PV System Workmanship', brand: 'AFN Solar Power Engineering Services', period: '1 Year semi-annual O&M after project acceptance' }
]);

export const createTurnoverComponentsRows = () => ([
  { id: 'turnover-component-1', label: 'Number of Solar Panels', valueA: '', valueB: '' },
  { id: 'turnover-component-2', label: 'Number of Inverters', valueA: '', valueB: '' },
  { id: 'turnover-component-3', label: 'Mounting Structure', valueA: '', valueB: '' },
  { id: 'turnover-component-4', label: 'Other Components', valueA: '', valueB: '' },
  { id: 'turnover-component-5', label: 'Location of Panels', valueA: '', valueB: '' },
  { id: 'turnover-component-6', label: 'Inverter Location', valueA: '', valueB: '' }
]);

export const createTurnoverPerformanceRows = () => ([
  { id: 'turnover-performance-1', label: 'Expected Energy Production (Estimated Daily/Monthly/Annual energy harvest)', daily: '', monthly: '', annual: '' },
  { id: 'turnover-performance-2', label: 'Inverter Output Power (rated power)', daily: '', monthly: '', annual: '' },
  { id: 'turnover-performance-3', label: 'System Voltage (Single Phase/Three Phase)', daily: '', monthly: '', annual: '' },
  { id: 'turnover-performance-4', label: 'Performance Monitoring System (software or app used if applicable)', daily: '', monthly: '', annual: '' },
  { id: 'turnover-performance-5', label: 'Net Metering Status (if applicable)', daily: '', monthly: '', annual: '' }
]);

export const createTurnoverCommissioningRows = () => ([
  { id: 'turnover-commissioning-1', label: 'Inverter Commissioning', dateConducted: '', values: '', results: '' },
  { id: 'turnover-commissioning-2', label: 'System Performance Test', dateConducted: '', values: '', results: '' },
  { id: 'turnover-commissioning-3', label: 'Voltage and Current Measurements (per string)', dateConducted: '', values: 'Ioc / Voc / Imp / Vmp', results: '' },
  { id: 'turnover-commissioning-4', label: 'Insulation Resistance Test (if applicable)', dateConducted: '', values: '', results: '' },
  { id: 'turnover-commissioning-5', label: 'Safety and Grounding Check', dateConducted: '', values: '', results: '' },
  { id: 'turnover-commissioning-6', label: 'System Energization', dateConducted: '', values: '', results: '' }
]);

export const createTurnoverDocumentsRows = () => ([
  { id: 'turnover-document-1', label: 'As-built Electrical Plans (if applicable)', status: '', date: '' },
  { id: 'turnover-document-2', label: 'Installation Diagram (if applicable)', status: '', date: '' },
  { id: 'turnover-document-3', label: 'Equipment Manuals (Inverters, Panels, etc.)', status: '', date: '' },
  { id: 'turnover-document-4', label: 'Maintenance Guidelines', status: '', date: '' },
  { id: 'turnover-document-5', label: 'Warranty Certificates', status: '', date: '' },
  { id: 'turnover-document-6', label: 'Net Metering Application (if applicable)', status: '', date: '' }
]);

export const createInitialQuotationForm = () => ({
  quotationNumber: '',
  quotationDate: '',
  attention: '',
  subject: '',
  location: '',
  projectDescription: '',
  validity: 'Within Thirty (30) days from the date of issue, thereafter subject for price and delivery confirmation.',
  deliveryTimeline: 'Three (3) to seven days (7) upon confirmation of orders.',
  paymentOrder: 'Purchase Order: To be addressed to AFN Solar Power Engineering Services.',
  paymentTerms: 'Terms of Payment: 50% down payment\n50% after commissioning (payable in 3 mos. with PDC)',
  forceMajeure: 'This offer is subject to reservation for force majeure namely, earthquake, typhoon, lightning surge, power surge, use of excessive force, burnt circuitry or other circumstances beyond our control which may prevent or injure its performance. In this case, warranty will be void.',
  cancellationTerms: '30% of PO value if cancellation is made 3 days after receipt of PO.\n80% of PO value if cancellation is made between 7 days to 4 days before mobilization.\n100% of PO value if cancellation is made between 3 days to 1 day before mobilization.',
  inclusions: '• Management & Supervision\n• Plant, equipment and tools\n• Mobilization\n• Site Operating Expenses\n• One (1) year semi-annual O&M (Cleaning of solar panels)',
  exclusions: '• Replacement and repair of any electrical devices and other materials to be found defective during installation (breakers, cables, fuse, roofs)\n• Structural reinforcement\n• Civil works such as construction of Solar Panels concrete foundation, clearing, backfilling and other\n• LGU permits or any government permits\n• Net Metering application\n• Any items not mentioned in this proposal are excluded.',
  warrantyNotes: 'All materials and works are guaranteed to be free from defects and/or faulty workmanship, however faults caused by any of the following are not covered by this warranty:\n\n1. Unauthorized operation, revision or tampering.\n2. Unauthorized servicing, cleaning and other repair or maintenance works.\n3. Improper operation, negligence and abuse.\n4. Force majeure.',
  preparedBy: 'C/ENGR. ARVIN F. NAPENAS',
  preparedTitle: 'General Manager',
  brandRows: createQuotationBrandRows(),
  priceRows: createQuotationPriceRows(),
  bomRows: createQuotationBomRows(),
  warrantyRows: createQuotationWarrantyRows()
});

export const createInitialTurnoverForm = () => ({
  projectInstallationOf: '',
  locationAddress: '',
  dateOfCompletion: '',
  dateOfTurnover: '',
  clientName: '',
  clientContactPerson: '',
  clientContactNumber: '',
  systemCapacity: '',
  warrantyStartDate: '',
  installerPartner: 'AFN Solar Power Engineering Services',
  installerContactPerson: '',
  installerContactNumber: '',
  installerSignature: '',
  installerDate: '',
  clientSignature: '',
  clientSignatureDate: '',
  confirmationSystemName: '',
  warrantyOnInverters: '',
  systemWarranty: '',
  componentsRows: createTurnoverComponentsRows(),
  performanceRows: createTurnoverPerformanceRows(),
  commissioningRows: createTurnoverCommissioningRows(),
  documentsRows: createTurnoverDocumentsRows()
});

export const createInitialInstallationContractForm = () => ({
  contractDate: formatTicketDateForInput(new Date().toISOString()),
  clientName: '',
  clientAddress: '',
  propertyAddress: '',
  serviceType: '',
  projectLocation: '',
  startDate: '',
  estimatedCompletionTime: '',
  totalContractAmount: '',
  currency: 'Philippine Peso',
  paymentMethod: 'bank transfer',
  upfrontPayment: '',
  completionPayment: '',
  finalPayment: '',
  finalInspectionDays: '',
  systemCapacity: '',
  systemDescription: 'solar photovoltaic system',
  warrantyPeriod: '',
  terminationNoticePeriod: '30',
  governingLawJurisdiction: 'Republic of the Philippines',
  mediationOrganization: '',
  companyName: 'AFN Solar Power Engineering Services',
  companyAddress: 'Lot2a9, Brgy. Bigo, Pagbilao, Quezon',
  companyContact: '09171460224 / (042)9111107 | afnsunenergyserv@gmail.com',
  authorizedPerson: 'C/ENGR. ARVIN F. NAPENAS',
  authorizedTitle: 'General Manager',
  clientRepresentative: '',
  clientRepresentativeTitle: '',
  quotationReference: '',
  appendices: 'Appendix A',
  scopeNotes: '',
  contractStatus: 'draft'
});

export const createQuotationRow = (type, index = 0) => {
  const suffix = `${Date.now()}-${index}`;
  if (type === 'brand') {
    return { id: `quote-brand-${suffix}`, label: '', value: '' };
  }
  if (type === 'price') {
    return { id: `quote-price-${suffix}`, description: '', unit: '', totalPrice: '' };
  }
  if (type === 'bom') {
    return { id: `quote-bom-${suffix}`, itemNo: '', description: '', unit: '', qty: '', unitPrice: '', amount: '' };
  }
  return { id: `quote-warranty-${suffix}`, item: '', brand: '', period: '' };
};

export const createTurnoverRow = (type, index = 0) => {
  const suffix = `${Date.now()}-${index}`;
  if (type === 'components') {
    return { id: `turnover-component-${suffix}`, label: '', valueA: '', valueB: '' };
  }
  if (type === 'performance') {
    return { id: `turnover-performance-${suffix}`, label: '', daily: '', monthly: '', annual: '' };
  }
  if (type === 'commissioning') {
    return { id: `turnover-commissioning-${suffix}`, label: '', dateConducted: '', values: '', results: '' };
  }
  return { id: `turnover-document-${suffix}`, label: '', status: '', date: '' };
};

export const buildCommissioningFormFromTicket = (ticket, existing = null) => {
  const base = createInitialCommissioningForm();
  const siteName = ticket?.locationDesc || ticket?.request_details?.location?.address || '';
  const commissionedDate = formatTicketDateForInput(ticket?.scheduledDate || ticket?.preferredDate);

  if (!existing) {
    return {
      ...base,
      ticket: ticket?.id || null,
      site_name: siteName,
      commissioned_date: commissionedDate
    };
  }

  const existingItems = Array.isArray(existing.checklist_items_json) ? existing.checklist_items_json : [];
  const mergedItems = COMMISSIONING_TEMPLATE_ITEMS.map((item) => {
    const matched = existingItems.find((row) => Number(row.item_no) === item.item_no);
    return {
      ...item,
      check_status: matched?.check_status || '',
      remarks: matched?.remarks || ''
    };
  });

  return {
    ...base,
    ...existing,
    id: existing.id || null,
    ticket: ticket?.id || existing.ticket || null,
    site_name: existing.site_name || siteName,
    commissioned_date: formatTicketDateForInput(existing.commissioned_date || commissionedDate),
    checklist_items_json: mergedItems,
    readings_json: {
      ...base.readings_json,
      ...(existing.readings_json || {}),
      inverter_display: {
        ...base.readings_json.inverter_display,
        ...(existing.readings_json?.inverter_display || {})
      },
      field_measured: {
        ...base.readings_json.field_measured,
        ...(existing.readings_json?.field_measured || {})
      }
    }
  };
};

export const buildQuotationFormFromTicket = (ticket, quotationRecord) => {
  const base = createInitialQuotationForm();
  const clientName = getTicketClientName(ticket);
  const serviceName = ticket?.service || ticket?.request_details?.service_type || 'Solar PV System';
  const location = getTicketAddress(ticket);
  const date = formatTicketDateForInput(ticket?.scheduledDate || ticket?.preferredDate);
  const quotationNumber = quotationRecord?.quotation_number || `QUO-${String(ticket?.id || 1).padStart(4, '0')}`;
  const totalAmount = quotationRecord?.total_amount || getProjectDetail(ticket, 'total_amount');
  const paymentTerms = quotationRecord?.payment_terms || '';
  const warrantyTerms = quotationRecord?.warranty_terms || '';
  const storedBomRows = mapStoredRows(
    getProjectDetail(ticket, 'bill_of_materials'),
    (row, index) => ({
      id: row?.id || `quote-bom-${index + 1}`,
      itemNo: row?.itemNo || row?.item_no || String(index + 1),
      description: row?.description || '',
      unit: row?.unit || '',
      qty: row?.qty || row?.quantity || ''
    })
  );

  return {
    ...base,
    quotationNumber,
    quotationDate: date,
    attention: clientName,
    subject: serviceName ? `${serviceName} Proposal` : '',
    location,
    projectDescription: `SUPPLY, INSTALLATION AND COMMISSIONING OF ${serviceName || 'SOLAR PV SYSTEM'}`.toUpperCase(),
    priceRows: base.priceRows.map((row, index) => (
      index === 0
        ? { ...row, totalPrice: totalAmount || row.totalPrice }
        : row
    )),
    bomRows: storedBomRows || base.bomRows,
    paymentTerms: paymentTerms || base.paymentTerms,
    warrantyTerms: warrantyTerms || base.warrantyTerms
  };
};

export const buildTurnoverFormFromTicket = (ticket, commissioningChecklist = null, turnoverAcceptance = null) => {
  const base = createInitialTurnoverForm();
  let clientName = getTicketClientName(ticket);
  const locationAddress = getTicketAddress(ticket);
  const serviceName = ticket?.service || ticket?.request_details?.service_type || 'Solar PV System';
  let contactNumber = getTicketContactNumber(ticket);
  let dateOfTurnover = formatTicketDateForInput(ticket?.scheduledDate || ticket?.preferredDate);
  const completionDate = formatTicketDateForInput(ticket?.scheduledDate || ticket?.preferredDate);
  const commissioningDate = formatTicketDateForInput(
    commissioningChecklist?.commissioned_date || ticket?.scheduledDate || ticket?.preferredDate
  );
  const inverterType = commissioningChecklist?.inverter_type || '';
  const systemDesignation = commissioningChecklist?.system_designation || '';
  const inverterSerial = commissioningChecklist?.inverter_serial_number || '';
  const readings = commissioningChecklist?.readings_json || {};
  const panelCount = getProjectDetail(ticket, 'number_of_solar_panels');
  const inverterCount = getProjectDetail(ticket, 'number_of_inverters');
  const mountingStructure = getProjectDetail(ticket, 'mounting_structure');
  const expectedDaily = getProjectDetail(ticket, 'expected_daily_energy_production');
  const expectedMonthly = getProjectDetail(ticket, 'expected_monthly_energy_production');
  const expectedAnnual = getProjectDetail(ticket, 'expected_annual_energy_production');
  const netMeteringStatus = getProjectDetail(ticket, 'net_metering_status');

  return {
    ...base,
    id: turnoverAcceptance?.id,
    status: turnoverAcceptance?.status,
    projectInstallationOf: serviceName,
    locationAddress,
    dateOfCompletion: completionDate,
    dateOfTurnover: turnoverAcceptance?.turnover_date || dateOfTurnover,
    clientName: turnoverAcceptance?.accepted_by_client_name || clientName,
    clientContactPerson: turnoverAcceptance?.accepted_by_client_name || clientName,
    clientContactNumber: turnoverAcceptance?.accepted_by_client_contact || contactNumber,
    warrantyStartDate: turnoverAcceptance?.warranty_start_date || '',
    installerContactPerson: ticket?.technicianFullname || ticket?.assignedTech || '',
    installerContactNumber: '',
    installerDate: completionDate,
    clientSignatureDate: completionDate,
    confirmationSystemName: serviceName,
    warrantyOnInverters: inverterType ? `${inverterType} - 5 Years product warranty from material defect` : '',
    systemWarranty: '1 Year workmanship / O&M after project acceptance',
    systemCapacity: getProjectDetail(ticket, 'system_capacity_kwp', 'system_capacity') || '',
    componentsRows: base.componentsRows.map((row) => {
      if (row.label === 'Number of Solar Panels') {
        return { ...row, valueA: panelCount || '', valueB: '' };
      }
      if (row.label === 'Number of Inverters') {
        return { ...row, valueA: inverterCount || '1', valueB: inverterSerial };
      }
      if (row.label === 'Mounting Structure') {
        return { ...row, valueA: mountingStructure || '', valueB: '' };
      }
      if (row.label === 'Other Components') {
        return { ...row, valueA: systemDesignation, valueB: inverterType };
      }
      if (row.label === 'Inverter Location') {
        return { ...row, valueA: locationAddress, valueB: '' };
      }
      if (row.label === 'Location of Panels') {
        return { ...row, valueA: locationAddress, valueB: '' };
      }
      return row;
    }),
    performanceRows: base.performanceRows.map((row) => {
      if (row.label.startsWith('Expected Energy Production')) {
        return { ...row, daily: expectedDaily || '', monthly: expectedMonthly || '', annual: expectedAnnual || '' };
      }
      if (row.label.startsWith('Net Metering Status')) {
        return { ...row, daily: netMeteringStatus || '', monthly: '', annual: '' };
      }
      return row;
    }),
    commissioningRows: base.commissioningRows.map((row) => {
      if (row.label === 'Inverter Commissioning') {
        return { ...row, dateConducted: commissioningDate, values: inverterType, results: 'Completed' };
      }
      if (row.label === 'System Performance Test') {
        return { ...row, dateConducted: commissioningDate, values: systemDesignation, results: 'Passed' };
      }
      if (row.label === 'Voltage and Current Measurements (per string)') {
        const display = readings.inverter_display || {};
        const voltageValues = [display.phase_a_voltage, display.phase_b_voltage, display.phase_c_voltage].filter(Boolean).join(' / ');
        return { ...row, dateConducted: commissioningDate, values: voltageValues || row.values, results: 'Recorded' };
      }
      if (row.label === 'Safety and Grounding Check') {
        return { ...row, dateConducted: commissioningDate, values: '', results: 'Passed' };
      }
      if (row.label === 'System Energization') {
        return { ...row, dateConducted: commissioningDate, values: '', results: 'Completed' };
      }
      return row;
    })
  };
};

export const buildInstallationContractFormFromTicket = (ticket, quotationData = []) => {
  const base = createInitialInstallationContractForm();
  const contract = ticket?.installation_contract;
  const clientName = getTicketClientName(ticket);
  const serviceType = ticket?.service || ticket?.request_details?.service_type || 'Solar PV System Installation';
  const location = getTicketAddress(ticket);
  const contractDate = contract?.start_date ? formatTicketDateForInput(contract.start_date) : (formatTicketDateForInput(ticket?.scheduledDate || ticket?.preferredDate) || base.contractDate);
  const ticketId = String(ticket?.id || '').padStart(3, '0');
  const quotation = quotationData?.[0] || null;

  return {
    ...base,
    contractDate,
    clientName,
    clientAddress: ticket?.request_details?.client_address || location,
    propertyAddress: location,
    serviceType,
    projectLocation: location,
    startDate: contractDate,
    estimatedCompletionTime: contract?.estimated_completion_days || getProjectDetail(ticket, 'estimated_completion_time') || '',
    totalContractAmount: contract?.total_contract_amount || quotation?.total_amount || getProjectDetail(ticket, 'total_contract_amount', 'total_amount') || '',
    paymentSchedule: quotation?.payment_terms || base.paymentSchedule || '',
    upfrontPayment: contract?.payment_terms_upfront || quotation?.downpayment_amount || base.upfrontPayment || '',
    completionPayment: contract?.payment_terms_completion || base.completionPayment || '',
    finalPayment: contract?.payment_terms_final || quotation?.balance_amount || base.finalPayment || '',
    systemCapacity: getProjectDetail(ticket, 'system_capacity_kwp', 'system_capacity') || ticket?.request_details?.system_capacity || '',
    systemDescription: serviceType || base.systemDescription,
    warrantyPeriod: contract?.warranty_period || ticket?.request_details?.warranty_period || '',
    scopeNotes: contract?.scope_of_work || (getProjectDetail(ticket, 'mounting_structure') ? `Mounting structure: ${getProjectDetail(ticket, 'mounting_structure')}` : ''),
    quotationReference: ticketId ? `Appendix A / Quotation #QUO-${String(ticketId).padStart(4, '0')}` : '',
    clientRepresentative: clientName,
    contractId: contract?.id || null
  };
};

export const hydrateFieldServiceReportForm = (data) => ({
  ...createInitialForm(),
  ...(data || {}),
  rows: Array.isArray(data?.rows) && data.rows.length ? data.rows : createRows()
});

export const hydrateQuotationForm = (data) => ({
  ...createInitialQuotationForm(),
  ...(data || {}),
  brandRows: Array.isArray(data?.brandRows) && data.brandRows.length ? data.brandRows : createQuotationBrandRows(),
  priceRows: Array.isArray(data?.priceRows) && data.priceRows.length ? data.priceRows : createQuotationPriceRows(),
  bomRows: Array.isArray(data?.bomRows) && data.bomRows.length ? data.bomRows : createQuotationBomRows(),
  warrantyRows: Array.isArray(data?.warrantyRows) && data.warrantyRows.length ? data.warrantyRows : createQuotationWarrantyRows()
});

export const hydrateTdsForm = (data) => ({
  ...createInitialTdsForm(),
  ...(data || {}),
  loadRows: Array.isArray(data?.loadRows) && data.loadRows.length ? data.loadRows : createTdsLoadRows(),
  purposeRows: Array.isArray(data?.purposeRows) && data.purposeRows.length ? data.purposeRows : createTdsPurposeRows()
});

export const hydrateInstallationContractForm = (data) => ({
  ...createInitialInstallationContractForm(),
  ...(data || {})
});

export const hydrateTurnoverForm = (data) => ({
  ...createInitialTurnoverForm(),
  ...(data || {}),
  componentsRows: Array.isArray(data?.componentsRows) && data.componentsRows.length ? data.componentsRows : createTurnoverComponentsRows(),
  performanceRows: Array.isArray(data?.performanceRows) && data.performanceRows.length ? data.performanceRows : createTurnoverPerformanceRows(),
  commissioningRows: Array.isArray(data?.commissioningRows) && data.commissioningRows.length ? data.commissioningRows : createTurnoverCommissioningRows(),
  documentsRows: Array.isArray(data?.documentsRows) && data.documentsRows.length ? data.documentsRows : createTurnoverDocumentsRows()
});
