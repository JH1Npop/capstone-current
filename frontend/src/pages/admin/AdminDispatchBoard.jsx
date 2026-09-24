import { useEffect, useState } from 'react';
import { FiUser, FiAlertCircle, FiArrowRight, FiFilter, FiCheckCircle, FiClipboard, FiRefreshCw, FiX } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/ui/StatusBadge';
import SLABadge, { formatSlaSummary } from '../../components/ui/SLABadge';
import { formatClientId, formatRoleId, formatTechnicianId, formatTicketId } from '../../utils/roleIds';
import { queueActionLabel } from '../../utils/dashboardHelpers';
import {
  assignTechnician,
  autoAssignTechnician,
  fetchAdminTechnicians,
  fetchInventory,
  fetchServiceInventoryRequirements,
  fetchServiceTicketSummary,
  fetchServiceTypes,
  fetchServiceTickets
} from '../../api/api';

const normalizeSkillValue = (value) => String(value || '').toLowerCase().replace(/\s+/g, '_');

const formatAssignedAt = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const technicianMatchesSkill = (technician, filterSkill) => {
  if (filterSkill === 'all') {
    return true;
  }

  const technicianSkills = [
    technician.skill,
    ...(Array.isArray(technician.skills) ? technician.skills : [])
  ]
    .map(normalizeSkillValue)
    .filter(Boolean);

  return technicianSkills.includes(normalizeSkillValue(filterSkill));
};

const technicianMatchesService = (technician, serviceTypeId) => {
  if (!serviceTypeId) {
    return true;
  }

  return Array.isArray(technician.skillDetails) && technician.skillDetails.some((skill) => (
    Number(skill.service_type) === Number(serviceTypeId) ||
    normalizeSkillValue(skill.service_type_name) === 'general_services'
  ));
};

const getDispatchPresence = (technician) => {
  if (!technician.active) {
    return {
      status: 'offline',
      description: 'Account is inactive and cannot receive assignments.'
    };
  }
  if (!technician.isAvailable) {
    return {
      status: 'busy',
      description: 'Currently navigating, on site, or working another job.'
    };
  }
  return {
    status: 'online',
    description: 'Active and available for dispatch.'
  };
};

const DISPATCH_PRESENCE_ORDER = { online: 0, busy: 1, offline: 2 };

const sortByDispatchUrgency = (firstTicket, secondTicket) => {
  if (firstTicket.isMissedDispatch !== secondTicket.isMissedDispatch) {
    return firstTicket.isMissedDispatch ? -1 : 1;
  }
  return new Date(firstTicket.scheduledDate || 0) - new Date(secondTicket.scheduledDate || 0);
};

export default function AdminDispatchBoard() {
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [tickets, setTickets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [materialTemplates, setMaterialTemplates] = useState([]);
  const [filterSkill, setFilterSkill] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedTech, setSelectedTech] = useState(null);
  const [selectedCrewIds, setSelectedCrewIds] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [assignmentInsight, setAssignmentInsight] = useState('');
  const [ticketSummary, setTicketSummary] = useState(null);
  const [equipmentPlan, setEquipmentPlan] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [ticketData, technicianData, requirementData, inventoryData, summaryData] = await Promise.all([
        fetchServiceTickets({ queue: 'active' }),
        fetchAdminTechnicians(),
        fetchServiceInventoryRequirements(),
        fetchInventory(),
        fetchServiceTicketSummary()
      ]);
      const serviceTypeData = await fetchServiceTypes();
      setTickets(ticketData);
      setTechnicians(technicianData);
      setServiceTypes(serviceTypeData);
      setInventoryItems(inventoryData);
      setMaterialTemplates(requirementData);
      setTicketSummary(summaryData);
      setError('');
    } catch (err) {
      setTickets([]);
      setTechnicians([]);
      setServiceTypes([]);
      setInventoryItems([]);
      setMaterialTemplates([]);
      setTicketSummary(null);
      setError(err.message || 'Unable to load dispatch data.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedTicket) {
      setSelectedTech(null);
      setSelectedCrewIds([]);
      setEquipmentPlan([]);
      return;
    }

    const assignedLead = technicians.find((tech) => tech.id === selectedTicket.assignedTechnicianId) || null;
    setSelectedTech(assignedLead);
    setSelectedCrewIds(
      Array.isArray(selectedTicket.crewMembers)
        ? selectedTicket.crewMembers.map((member) => member.id)
        : []
    );
  }, [selectedTicket, technicians]);

  useEffect(() => {
    if (!selectedTicket) {
      setEquipmentPlan([]);
      return;
    }

    const pendingReservations = Array.isArray(selectedTicket.inventoryReservations)
      ? selectedTicket.inventoryReservations.filter((reservation) => reservation.status === 'pending')
      : [];

    if (pendingReservations.length > 0) {
      setEquipmentPlan(pendingReservations.map((reservation) => ({
        item: Number(reservation.item || reservation.item_id),
        quantity: String(reservation.quantity || 1)
      })).filter((reservation) => reservation.item));
      return;
    }

    const serviceMaterials = materialTemplates.filter((requirement) => (
      Number(requirement.service_type) === Number(selectedTicket.serviceTypeId) && requirement.auto_reserve !== false
    ));
    setEquipmentPlan(serviceMaterials.map((requirement) => ({
      item: Number(requirement.item),
      quantity: String(requirement.quantity || 1)
    })).filter((reservation) => reservation.item));
  }, [selectedTicket, materialTemplates]);

  const selectLeadTechnician = (tech) => {
    setSelectedTech(tech);
    setSelectedCrewIds((currentCrewIds) => currentCrewIds.filter((crewId) => crewId !== tech.id));
  };

  const toggleCrewMember = (techId) => {
    if (selectedTech?.id === techId) {
      return;
    }

    setSelectedCrewIds((currentCrewIds) =>
      currentCrewIds.includes(techId)
        ? currentCrewIds.filter((crewId) => crewId !== techId)
        : [...currentCrewIds, techId]
    );
  };

  const assignTicket = async () => {
    if (!selectedTicket || !selectedTech) {
      setMessage('Select both a ticket and technician');
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedCrew = technicians.filter((tech) => selectedCrewIds.includes(tech.id));
      await assignTechnician({
        ticketId: selectedTicket.id,
        technicianId: selectedTech.id,
        crewIds: selectedCrewIds,
        equipmentReservations: equipmentPlan
          .map((entry) => ({
            ...entry,
            quantity: Number(entry.quantity || 0)
          }))
          .filter((entry) => entry.item && entry.quantity > 0)
      });
      await loadData();
      setMessage(
        `${selectedTicket.assignedTechnicianId ? 'Updated assignment for' : 'Assigned'} ${selectedTicket.service} (${formatTicketId(selectedTicket.id)}) to ${selectedTech.name}${
          selectedCrew.length ? ` with crew: ${selectedCrew.map((tech) => tech.name).join(', ')}` : ''
        }.`
      );
      setAssignmentInsight('');
      setSelectedTicket(null);
      setSelectedTech(null);
      setSelectedCrewIds([]);
      setEquipmentPlan([]);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Assignment failed.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const editAssignment = (ticket) => {
    setSelectedTicket(ticket);
    setMessage('');
    setError('');
    window.setTimeout(() => {
      document.getElementById('assignment-control')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const autoAssignTicket = async () => {
    if (!selectedTicket) {
      setMessage('Select a job before auto-assigning.');
      return;
    }

    try {
      const result = await autoAssignTechnician({ ticketId: selectedTicket.id });
      await loadData();
      setMessage(`Auto-assigned ${formatTicketId(selectedTicket.id)} to ${result.technician?.username || 'technician'}.`);
      setAssignmentInsight(result.assignment_summary || '');
      setSelectedTicket(null);
      setSelectedTech(null);
      setSelectedCrewIds([]);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Auto-assignment failed.');
      setTimeout(() => setError(''), 4000);
      setAssignmentInsight('');
    }
  };

  const dispatchableTickets = tickets
    .filter((ticket) => !ticket.assignedTechnicianId && ['not_started', 'for_inspection', 'ready_for_service', 'awaiting_materials', 'on_hold'].includes(ticket.status))
    .sort(sortByDispatchUrgency);
  const missedDispatchTickets = dispatchableTickets.filter((ticket) => ticket.isMissedDispatch);
  const assignedTickets = tickets
    .filter((ticket) => ticket.assignedTechnicianId && !['completed', 'cancelled'].includes(ticket.status))
    .sort((firstTicket, secondTicket) => new Date(secondTicket.assignedAt || 0) - new Date(firstTicket.assignedAt || 0));
  const totalPages = Math.ceil(assignedTickets.length / ITEMS_PER_PAGE);

const paginatedAssignedTickets = assignedTickets.slice(
  (currentPage - 1) * ITEMS_PER_PAGE,
  currentPage * ITEMS_PER_PAGE
);
  const skillOptions = [
    { value: 'all', label: 'All Skills' },
    ...serviceTypes.map((serviceType) => ({
      value: `service:${serviceType.id}`,
      label: serviceType.name
    }))
  ];
  const filterServiceTypeId = String(filterSkill).startsWith('service:')
    ? Number(String(filterSkill).replace('service:', ''))
    : null;
  const filteredTechs = technicians.filter((tech) => (
    filterServiceTypeId
      ? technicianMatchesService(tech, filterServiceTypeId)
      : technicianMatchesSkill(tech, filterSkill)
  ));
  const serviceMatchedTechs = (selectedTicket
    ? filteredTechs.filter((tech) => technicianMatchesService(tech, selectedTicket.serviceTypeId))
    : filteredTechs
  ).sort((firstTech, secondTech) => (
    DISPATCH_PRESENCE_ORDER[getDispatchPresence(firstTech).status]
    - DISPATCH_PRESENCE_ORDER[getDispatchPresence(secondTech).status]
  ));
  const selectedCrew = technicians.filter((tech) => selectedCrewIds.includes(tech.id));
  const selectedServiceMaterials = selectedTicket
    ? materialTemplates.filter((requirement) => Number(requirement.service_type) === Number(selectedTicket.serviceTypeId))
    : [];
  const selectedTicketReservations = Array.isArray(selectedTicket?.inventoryReservations)
    ? selectedTicket.inventoryReservations.filter((reservation) => reservation.status !== 'cancelled')
    : [];
  const pendingTicketReservations = selectedTicketReservations.filter((reservation) => reservation.status === 'pending');
  const selectedEquipmentItems = equipmentPlan
    .map((entry) => ({
      ...entry,
      itemDetails: inventoryItems.find((item) => Number(item.id) === Number(entry.item))
    }))
    .filter((entry) => entry.item);
  const selectedEquipmentIds = new Set(equipmentPlan.map((entry) => Number(entry.item)).filter(Boolean));
  const nextEquipmentItem = inventoryItems.find((item) => (
    !selectedEquipmentIds.has(Number(item.id))
    && Number(item.available_quantity ?? item.availableQuantity ?? item.quantity ?? 0) > 0
  ));
  const equipmentPlanValid = equipmentPlan.every((entry) => (
    Number(entry.item) > 0 && Number.isInteger(Number(entry.quantity)) && Number(entry.quantity) > 0
  ));
  const completedTicketReservations = selectedTicketReservations.filter((reservation) => reservation.status !== 'pending');

  const addEquipmentPlanRow = () => {
    if (!nextEquipmentItem) {
      setMessage(inventoryItems.length
        ? 'Every in-stock inventory item is already in this plan.'
        : 'Add inventory items before building an equipment plan.');
      return;
    }
    setEquipmentPlan((currentPlan) => [...currentPlan, { item: Number(nextEquipmentItem.id), quantity: '1' }]);
  };

  const updateEquipmentPlanRow = (index, updates) => {
    setEquipmentPlan((currentPlan) => currentPlan.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, ...updates } : entry
    )));
  };

  const removeEquipmentPlanRow = (index) => {
    setEquipmentPlan((currentPlan) => currentPlan.filter((_, entryIndex) => entryIndex !== index));
  };
  const activeQueueCount = ticketSummary?.activeQueue ?? tickets.filter((ticket) => !['completed', 'cancelled'].includes(ticket.status)).length;
  const unassignedActiveCount = ticketSummary?.unassignedActive ?? tickets.filter((ticket) => !ticket.assignedTech && !['completed', 'cancelled'].includes(ticket.status)).length;
  const missedDispatchCount = ticketSummary?.missedDispatch ?? missedDispatchTickets.length;
  const dispatchableCount = ticketSummary?.dispatchable ?? dispatchableTickets.length;
  const assignedActiveCount = ticketSummary?.assignedActive ?? assignedTickets.length;
  const canSubmitAssignment = Boolean(selectedTicket && selectedTech && equipmentPlanValid && !isSubmitting);
  const workflowStep = !selectedTicket ? 1 : !selectedTech ? 2 : 3;

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Dispatch workflow</p>
            <p className="mt-0.5 text-xs text-slate-500">Assign eligible active tickets, prepare equipment, and maintain current technician assignments.</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FiRefreshCw className="h-4 w-4" /> Refresh board
          </button>
        </div>
        {assignmentInsight && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            {assignmentInsight}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'All Active Tickets', value: activeQueueCount, tone: 'text-brand-600', helper: `${unassignedActiveCount} unassigned` },
            { label: 'Ready to Assign', value: dispatchableCount, tone: 'text-amber-600', helper: 'Eligible unassigned work' },
            { label: 'Assigned Active', value: assignedActiveCount, tone: 'text-emerald-600', helper: 'Current field assignments' },
            { label: 'Needs Reschedule', value: missedDispatchCount, tone: 'text-rose-600', helper: 'Missed dispatch window' }
          ].map((item) => (
            <div key={item.label} className="stat-card p-4">
              <p className="text-[13px] font-medium text-slate-500">{item.label}</p>
              <p className={`mt-1 text-3xl font-bold ${item.tone}`}>{item.value}</p>
              {item.helper && <p className="mt-1 text-[11px] text-slate-400">{item.helper}</p>}
            </div>
          ))}
        </section>

        <section aria-label="Assignment steps" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <ol className="grid gap-2 sm:grid-cols-3">
            {[
              { number: 1, label: 'Select a ticket', helper: 'Choose eligible work' },
              { number: 2, label: 'Choose the team', helper: 'Set lead and crew' },
              { number: 3, label: 'Review and confirm', helper: 'Check equipment first' },
            ].map((step, index) => {
              const complete = workflowStep > step.number;
              const active = workflowStep === step.number;
              return (
                <li key={step.number} className={`relative flex items-center gap-3 rounded-lg px-3 py-2 ${active ? 'bg-brand-50 text-brand-800' : complete ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-500'}`}>
                  <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-bold ${active ? 'bg-brand-600 text-white' : complete ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                    {complete ? <FiCheckCircle aria-hidden="true" /> : step.number}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">{step.label}</span>
                    <span className="block text-[11px] opacity-70">{step.helper}</span>
                  </span>
                  {index < 2 && <FiArrowRight className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-slate-300 sm:block" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </section>

        <section id="assignment-control" className="grid gap-4 scroll-mt-24 xl:grid-cols-[1fr_1fr_1.15fr]">
          <div className="card order-1 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-surface-200 px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <FiAlertCircle className="text-amber-500" />
                  <span><span className="mr-2 text-xs font-bold uppercase tracking-wider text-amber-600">1</span>Ready to Assign</span>
                </h2>
                <p className="text-xs text-slate-500">{dispatchableTickets.length} of {activeQueueCount} active tickets are eligible and waiting for assignment</p>
              </div>
            </div>
            <div className="max-h-[34rem] space-y-2 overflow-y-auto p-3">
              {dispatchableTickets.length > 0 ? (
                dispatchableTickets.map((ticket) => {
                  const active = selectedTicket?.id === ticket.id;
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedTicket(ticket)}
                      aria-pressed={active}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-brand-300 bg-brand-50 shadow-sm'
                          : ticket.isMissedDispatch
                            ? 'border-rose-200 bg-rose-50 hover:bg-rose-100'
                            : 'border-surface-200 bg-white hover:bg-surface-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-brand-700">{formatTicketId(ticket.id)}</p>
                          <p className="mt-1 truncate font-semibold text-slate-900">{ticket.service}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-600">{ticket.clientFullname || ticket.client}</p>
                        </div>
                        {ticket.isMissedDispatch ? <StatusBadge status="missed" size="sm" /> : <StatusBadge status={ticket.priority || 'low'} size="sm" />}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                          {ticket.requestSourceLabel}
                        </span>
                        <StatusBadge status={ticket.status} size="sm" />
                      </div>
                      <p className={`mt-2 text-xs ${ticket.isMissedDispatch ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
                        {ticket.isMissedDispatch
                          ? 'Missed dispatch window: assign now or reschedule.'
                          : queueActionLabel(ticket)}
                      </p>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-8 text-center text-sm text-slate-500">
                  No tickets are ready to assign right now.
                </div>
              )}
            </div>
          </div>

          <div className="card order-3 overflow-hidden">
            <div className="border-b border-surface-200 px-4 py-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <FiClipboard className="text-brand-500" />
                <span><span className="mr-2 text-xs font-bold uppercase tracking-wider text-brand-600">3</span>Assignment Review</span>
              </h2>
              <p className="text-xs text-slate-500">Review the selected job, equipment, lead technician, and crew before dispatch.</p>
            </div>
            <div className="space-y-4 p-4">
              {selectedTicket ? (
                <>
                  <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Selected Ticket</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-950">{formatTicketId(selectedTicket.id)} {selectedTicket.service}</h3>
                        <p className="mt-1 text-sm text-slate-600">{selectedTicket.clientFullname || selectedTicket.client}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={selectedTicket.status} />
                        <button
                          type="button"
                          onClick={() => setSelectedTicket(null)}
                          aria-label="Clear selected ticket"
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
                        >
                          <FiX aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {selectedTicket.assignedTechnicianId && (
                      <p className="mt-3 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-medium text-brand-700">
                        Editing existing assignment. Choose a new lead or adjust crew, then update.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-surface-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Lead Technician</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{selectedTech?.name || 'No lead selected'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedTech ? `Skill: ${(selectedTech.skill || 'general').replace('_', ' ')}` : 'Select a technician from the right panel.'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-surface-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Crew</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{selectedCrew.length ? selectedCrew.map((tech) => tech.name).join(', ') : 'No extra crew selected'}</p>
                      <p className="mt-1 text-xs text-slate-500">Crew members assist the selected lead.</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Equipment Reservation Plan</h3>
                        <p className="mt-1 text-xs text-slate-500">These quantities will be reserved for this ticket when the assignment is confirmed.</p>
                      </div>
                      <button
                        type="button"
                        onClick={addEquipmentPlanRow}
                        disabled={!nextEquipmentItem}
                        title={!nextEquipmentItem ? 'No additional in-stock inventory items are available.' : undefined}
                        className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        Add item
                      </button>
                    </div>

                    {pendingTicketReservations.length > 0 ? (
                      <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                        Loaded the ticket's current reservation plan. Adjusting it will update pending reservations when you confirm.
                      </p>
                    ) : selectedServiceMaterials.length > 0 && (
                      <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                        Pre-filled from {selectedServiceMaterials.length} service requirement{selectedServiceMaterials.length === 1 ? '' : 's'}. Review the quantities below.
                      </p>
                    )}

                    {completedTicketReservations.length > 0 && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                        <div className="font-semibold">Already issued or completed</div>
                        <div className="mt-1">
                          {completedTicketReservations.map((reservation) => (
                            `${reservation.item_name} x${reservation.quantity} (${reservation.status})`
                          )).join(', ')}
                        </div>
                      </div>
                    )}

                    {selectedEquipmentItems.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {selectedEquipmentItems.map((entry, index) => {
                          const availableQuantity = Number(
                            entry.itemDetails?.available_quantity ??
                            entry.itemDetails?.availableQuantity ??
                            entry.itemDetails?.quantity ??
                            0
                          );
                          const currentReservationQuantity = pendingTicketReservations
                            .filter((reservation) => Number(reservation.item || reservation.item_id) === Number(entry.item))
                            .reduce((total, reservation) => total + Number(reservation.quantity || 0), 0);
                          const availableForPlan = availableQuantity + currentReservationQuantity;
                          const requestedQuantity = Number(entry.quantity || 0);
                          const shortageQuantity = Math.max(requestedQuantity - availableForPlan, 0);
                          return (
                            <div key={`${entry.item}-${index}`} className={`rounded-lg border bg-white p-3 ${shortageQuantity ? 'border-amber-300' : 'border-surface-200'}`}>
                              <div className="flex items-center justify-between gap-3">
                                <label htmlFor={`equipment-item-${index}`} className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Inventory item</label>
                                <button
                                  type="button"
                                  onClick={() => removeEquipmentPlanRow(index)}
                                  className="text-xs font-semibold text-slate-500 transition hover:text-rose-600"
                                >
                                  Remove
                                </button>
                              </div>
                              <select
                                id={`equipment-item-${index}`}
                                value={entry.item}
                                onChange={(event) => updateEquipmentPlanRow(index, { item: Number(event.target.value) })}
                                className="mt-1.5 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                              >
                                {inventoryItems.map((item) => {
                                  const itemAvailable = Number(item.available_quantity ?? item.availableQuantity ?? item.quantity ?? 0);
                                  const usedElsewhere = selectedEquipmentIds.has(Number(item.id)) && Number(item.id) !== Number(entry.item);
                                  return (
                                    <option key={item.id} value={item.id} disabled={usedElsewhere || (itemAvailable <= 0 && Number(item.id) !== Number(entry.item))}>
                                      {item.name} {item.sku ? `(${item.sku})` : ''} · {itemAvailable} available
                                    </option>
                                  );
                                })}
                              </select>

                              <div className="mt-3 grid gap-3 sm:grid-cols-[112px_1fr] sm:items-end">
                                <div>
                                  <label htmlFor={`equipment-quantity-${index}`} className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Quantity</label>
                                  <input
                                    id={`equipment-quantity-${index}`}
                                    aria-describedby={`equipment-stock-${index}`}
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={entry.quantity}
                                    onChange={(event) => updateEquipmentPlanRow(index, { quantity: event.target.value.replace(/[^\d]/g, '') })}
                                    className="mt-1.5 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                                  />
                                </div>
                                <div id={`equipment-stock-${index}`} className={`rounded-lg px-3 py-2 text-xs ${shortageQuantity ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                                  <p className="font-semibold">{availableForPlan} available for this plan</p>
                                  <p className="mt-0.5">
                                    {shortageQuantity
                                      ? `Short by ${shortageQuantity}; only available stock will be reserved.`
                                      : currentReservationQuantity
                                        ? `${currentReservationQuantity} already reserved for this ticket.`
                                        : 'Stock is sufficient for this quantity.'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-dashed border-surface-200 bg-white px-3 py-3 text-xs text-slate-500">
                        No equipment in this plan. You can confirm without a reservation or add an in-stock item.
                      </div>
                    )}
                    {!equipmentPlanValid && (
                      <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                        Every equipment row needs an inventory item and a quantity of at least 1.
                      </p>
                    )}
                  </div>

                  <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col gap-2 border-t border-surface-200 bg-white/95 p-4 backdrop-blur sm:flex-row">
                    <button
                      type="button"
                      onClick={assignTicket}
                      disabled={!canSubmitAssignment}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                    >
                      {isSubmitting ? 'Assigning...' : selectedTicket?.assignedTechnicianId ? 'Update Assignment' : 'Confirm Assignment'}
                    </button>
                    <button
                      type="button"
                      onClick={autoAssignTicket}
                      disabled={!selectedTicket}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-surface-200 disabled:bg-surface-100 disabled:text-slate-400"
                    >
                      Find Best Match
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Manual action. It checks skill, schedule conflicts, daily capacity, availability, and location score even when automatic dispatch is turned off.
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-8 text-center text-sm text-slate-500">
                  Select a ticket from the ready-to-assign queue to start an assignment.
                </div>
              )}
            </div>
          </div>

          <div className="card order-2 overflow-hidden">
            <div className="border-b border-surface-200 px-4 py-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <FiUser className="text-emerald-500" />
                <span><span className="mr-2 text-xs font-bold uppercase tracking-wider text-emerald-600">2</span>{selectedTicket ? `Team for ${selectedTicket.service}` : 'Choose a Team'}</span>
              </h2>
              <p className="text-xs text-slate-500">{selectedTicket ? `${serviceMatchedTechs.length} technicians match this service` : 'Select a ticket before choosing technicians'}</p>
              <p className="mt-1 text-[11px] text-slate-400">Online means active and dispatch-ready, not live device connectivity.</p>
            </div>
            <div className="border-b border-surface-200 p-3">
              <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600">
                <FiFilter size={14} /> Filter by skill
              </label>
              <select
                value={filterSkill}
                onChange={(e) => setFilterSkill(e.target.value)}
                className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {skillOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="max-h-[34rem] space-y-2 overflow-y-auto p-3">
              {serviceMatchedTechs.length > 0 ? (
                serviceMatchedTechs.map((tech) => {
                  const isLead = selectedTech?.id === tech.id;
                  const isCrew = selectedCrewIds.includes(tech.id);
                  const dispatchPresence = getDispatchPresence(tech);
                  const canSelectTechnician = Boolean(
                    selectedTicket
                    && ((tech.active && tech.isAvailable) || selectedTicket.assignedTechnicianId === tech.id)
                  );
                  return (
                    <div
                      key={tech.id}
                      className={`rounded-xl border p-3 transition ${
                        isLead
                          ? 'border-brand-300 bg-brand-50'
                          : isCrew
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-surface-200 bg-white hover:bg-surface-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{tech.name}</p>
                          <div className="mt-1">
                            <StatusBadge status={dispatchPresence.status} size="sm" />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">Skill: {(tech.skill || 'general').replace('_', ' ')}</p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => selectLeadTechnician(tech)}
                            disabled={!canSelectTechnician}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              isLead
                                ? 'bg-brand-600 text-white'
                                : 'bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400'
                            }`}
                          >
                            {isLead ? 'Lead' : 'Set Lead'}
                          </button>
                          {!isLead && (
                            <button
                              type="button"
                              onClick={() => toggleCrewMember(tech.id)}
                              disabled={!canSelectTechnician}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                isCrew
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:ring-slate-200'
                              }`}
                            >
                              {isCrew ? 'Crew' : 'Add Crew'}
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {dispatchPresence.description}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-8 text-center text-sm text-slate-500">
                  {selectedTicket ? 'No technicians match this service.' : 'No matching technicians.'}
                </div>
              )}
            </div>
          </div>
        </section>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <FiCheckCircle className="text-emerald-500" />
            Current Assignments ({assignedTickets.length})
          </h3>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Ticket
                </th>

                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Service / Client
                </th>

                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Assigned To
                </th>

                <th className="hidden xl:table-cell px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Assigned By
                </th>

                <th className="hidden lg:table-cell px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Assigned Time
                </th>

                <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </th>

                <th className="hidden lg:table-cell px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Crew
                </th>

                <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {assignedTickets.length > 0 ? (
                paginatedAssignedTickets.map((ticket, index) => (
                  <tr
                    key={ticket.id}
                    className={`
                      border-b border-slate-100 transition-colors
                      hover:bg-sky-50/60
                      ${
                        selectedTicket?.id === ticket.id
                          ? 'bg-blue-50'
                          : index % 2 === 1
                          ? 'bg-slate-50/40'
                          : ''
                      }
                    `}
                  >
                    {/* Ticket */}
                    <td className="px-3 py-3">
                      <span className="font-semibold text-blue-700">
                        {formatTicketId(ticket.id)}
                      </span>
                    </td>

                    {/* Service / Client */}
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <div className="font-medium text-slate-900">
                          {ticket.service}
                        </div>

                        <div className="text-xs text-slate-500">
                          Client {formatClientId(ticket.clientId)}
                        </div>

                        <div className="truncate text-xs text-slate-500">
                          {ticket.clientFullname || ticket.client}
                        </div>

                        <span className="inline-flex rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                          {ticket.requestSourceLabel}
                        </span>
                      </div>
                    </td>

                    {/* Assigned To */}
                    <td className="px-3 py-3">
                      <div>
                        <div className="font-medium text-slate-900">
                          {ticket.technicianFullname || ticket.assignedTech}
                        </div>

                        <div className="text-xs text-slate-500">
                          {formatTechnicianId(ticket.assignedTechnicianId)}
                        </div>
                      </div>
                    </td>

                    {/* Assigned By */}
                    <td className="hidden xl:table-cell px-3 py-3">
                      <div>
                        <div className="font-medium text-slate-900">
                          {ticket.assignedByName || 'System'}
                        </div>

                        <div className="text-xs text-slate-500">
                          {ticket.assignedById
                            ? `${ticket.assignedByRole || 'admin'} ${formatRoleId(
                                ticket.assignedByRole || 'admin',
                                ticket.assignedById
                              )}`
                            : 'Auto Assignment'}
                        </div>
                      </div>
                    </td>

                    {/* Assigned Time */}
                    <td className="hidden lg:table-cell px-3 py-3 text-slate-600 whitespace-nowrap">
                      {formatAssignedAt(ticket.assignedAt)}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 text-center">
                      <StatusBadge status={ticket.status} size="sm" />
                    </td>

                    {/* Crew */}
                    <td className="hidden lg:table-cell px-3 py-3">
                      {ticket.crewMembers?.length ? (
                        <span className="text-xs text-slate-700">
                          {ticket.crewSummary}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          No crew
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => editAssignment(ticket)}
                        aria-label="Edit assignment"
                        className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
                      >
                          Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="rounded-full bg-slate-100 p-3">
                        <FiClipboard className="h-5 w-5 text-slate-400" />
                      </div>

                      <h3 className="text-sm font-medium text-slate-700">
                        No Assigned Tickets
                      </h3>

                      <p className="text-sm text-slate-500">
                        Confirm a dispatch assignment to move a ticket into this table.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-500">
              Showing {assignedTickets.length ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}
              -
              {Math.min(currentPage * ITEMS_PER_PAGE, assignedTickets.length)}
              of {assignedTickets.length}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
              >
                Previous
              </button>

              <span className="flex items-center px-2 text-sm font-medium">
                Page {currentPage} of {totalPages || 1}
              </span>

              <button
                type="button"
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    
      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
        {message && (
          <div className="pointer-events-auto rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-xl flex items-start gap-3 text-emerald-800 animate-in slide-in-from-bottom-5 duration-300">
            <FiCheckCircle className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="text-sm font-medium">{message}</div>
          </div>
        )}
        {error && (
          <div className="pointer-events-auto rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-xl flex items-start gap-3 text-rose-800 animate-in slide-in-from-bottom-5 duration-300">
            <FiAlertCircle className="mt-0.5 shrink-0 text-rose-600" />
            <div className="text-sm font-medium">{error}</div>
          </div>
        )}
      </div>
      </div>

    </Layout>
  );
}
