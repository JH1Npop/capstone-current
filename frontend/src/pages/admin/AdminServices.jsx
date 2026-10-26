import { useEffect, useState } from 'react';
import { FiPlus, FiTrash2, FiEdit2, FiChevronDown, FiChevronUp, FiTool, FiClock, FiList, FiPackage, FiPower } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import {
  createService,
  createServiceInventoryRequirement,
  deleteService,
  deleteServiceInventoryRequirement,
  fetchInventory,
  fetchServiceInventoryRequirements,
  fetchServices,
  updateService
} from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import {
  hasAnyCapability,
  INVENTORY_MANAGE_CAPABILITIES,
  INVENTORY_VIEW_CAPABILITIES,
  SERVICE_CATALOG_MANAGE_CAPABILITIES,
} from '../../rbac';

const DEFAULT_SERVICE_FORM = {
  name: '',
  description: '',
  category: '',
  color: '#2563eb',
  icon: '',
  display_order: 0,
  estimated_duration: 60,
  estimated_cost: 0,
  max_daily_assignments: 5,
  is_active: true,
  requires_site_inspection: false,
  deposit_policy: 'none',
  deposit_value: 0,
  procedures: [],
  required_equipment: [],
  inspection_procedures: [],
};

const normalizeInspectionChecks = (checks) => (
  Array.isArray(checks)
    ? checks.map((check) => (
        typeof check === 'string'
          ? { title: check, description: '' }
          : { title: check?.title || '', description: check?.description || '' }
      ))
    : []
);

const normalizeProcedures = (procedures) => (
  Array.isArray(procedures)
    ? procedures.map((procedure, index) => {
        if (typeof procedure === 'string') {
          return { step: index + 1, title: procedure, description: '' };
        }
        return {
          step: Number(procedure?.step || index + 1),
          title: procedure?.title || procedure?.label || '',
          description: procedure?.description || '',
          requires_photo: Boolean(
            procedure?.requires_photo ||
            procedure?.requiresPhoto ||
            procedure?.requires_image ||
            procedure?.photo_required
          )
        };
      })
    : []
);

const normalizeEquipment = (equipment) => (
  Array.isArray(equipment)
    ? equipment.map((item) => {
        if (typeof item === 'string') {
          return { name: item, quantity: 1 };
        }
        return {
          name: item?.name || item?.label || '',
          quantity: Number(item?.quantity || 1)
        };
      })
    : []
);

const toServiceFormState = (service) => ({
  name: service?.name || '',
  description: service?.description || '',
  category: service?.category || '',
  color: service?.color || '#2563eb',
  icon: service?.icon || '',
  display_order: Number(service?.display_order || 0),
  estimated_duration: Number(service?.estimated_duration || 60),
  estimated_cost: Number(service?.estimated_cost || 0),
  max_daily_assignments: Number(service?.max_daily_assignments || 5),
  is_active: service?.is_active !== false,
  requires_site_inspection: Boolean(service?.requires_site_inspection),
  deposit_policy: service?.deposit_policy || 'none',
  deposit_value: Number(service?.deposit_value || 0),
  procedures: normalizeProcedures(service?.procedures),
  required_equipment: normalizeEquipment(service?.required_equipment),
  inspection_procedures: normalizeInspectionChecks(service?.inspection_procedures),
});

const formatDuration = (minutes) => {
  const safeMinutes = Number(minutes || 0);
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${safeMinutes}m`;
};

const formatCost = (cost) => {
  const num = Number(cost || 0);
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
};

const canPermanentlyDeleteService = (service) => (
  service?.can_delete === true
  || (service?.can_delete == null && Number(service?.usage_count || 0) === 0)
);

const getDurationParts = (minutes) => {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  return {
    hours: Math.floor(safeMinutes / 60),
    minutes: safeMinutes % 60
  };
};

const mergeDurationPart = (currentMinutes, part, value) => {
  const current = getDurationParts(currentMinutes);
  const numericValue = Math.max(0, Number(value || 0));
  const next = {
    ...current,
    [part]: part === 'minutes' ? Math.min(numericValue, 59) : numericValue
  };
  return (next.hours * 60) + next.minutes;
};

const normalizeRequirement = (requirement) => ({
  ...requirement,
  service_type: Number(requirement?.service_type || 0) || '',
  item: Number(requirement?.item || 0) || '',
  quantity: Number(requirement?.quantity || 0),
  available_quantity: Number(requirement?.available_quantity || 0)
});

/* Procedure Step Editor */
function ProcedureEditor({ procedures, onChange }) {
  const addStep = () => {
    onChange([...procedures, { step: procedures.length + 1, title: '', description: '', requires_photo: false }]);
  };
  const removeStep = (index) => {
    onChange(procedures.filter((_, i) => i !== index).map((p, i) => ({ ...p, step: i + 1 })));
  };
  const updateStep = (index, field, value) => {
    const updated = [...procedures];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Technician Checklist Steps</label>
        <button
          type="button"
          onClick={addStep}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100"
        >
          <FiPlus size={12} /> Add Step
        </button>
      </div>
      {procedures.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
          No checklist steps defined. Add steps that technicians will follow.
        </p>
      ) : (
        <div className="space-y-2">
          {procedures.map((proc, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                {i + 1}
              </span>
              <div className="flex-1 space-y-1">
                <input
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Step title"
                  value={proc.title}
                  onChange={(e) => updateStep(i, 'title', e.target.value)}
                />
                <input
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Description (optional)"
                  value={proc.description || ''}
                  onChange={(e) => updateStep(i, 'description', e.target.value)}
                />
                <label className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  <input
                    type="checkbox"
                    checked={Boolean(proc.requires_photo)}
                    onChange={(e) => updateStep(i, 'requires_photo', e.target.checked)}
                  />
                  Photo required before next step
                </label>
              </div>
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="mt-1.5 rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Service-specific inspection checks, asked after the general site checks */
function InspectionCheckEditor({ checks, onChange }) {
  const addCheck = () => onChange([...checks, { title: '', description: '' }]);
  const removeCheck = (index) => onChange(checks.filter((_, i) => i !== index));
  const updateCheck = (index, field, value) => {
    const updated = [...checks];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Site Inspection Checks</label>
        <button
          type="button"
          onClick={addCheck}
          className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100"
        >
          <FiPlus size={12} /> Add Check
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Every inspection already asks the general checks (site access, electrical supply, safety equipment).
        Add Yes/No checks specific to this service; a No answer needs a note from the technician.
      </p>
      {checks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
          No service-specific checks. Only the general checks will be asked.
        </p>
      ) : (
        <div className="space-y-2">
          {checks.map((check, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white">
                {i + 1}
              </span>
              <div className="flex-1 space-y-1">
                <input
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Check, e.g. Roof can carry the panel array"
                  aria-label={`Inspection check ${i + 1}`}
                  value={check.title}
                  onChange={(e) => updateCheck(i, 'title', e.target.value)}
                />
                <input
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="What to look for (optional)"
                  aria-label={`Inspection check ${i + 1} guidance`}
                  value={check.description || ''}
                  onChange={(e) => updateCheck(i, 'description', e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => removeCheck(i)}
                aria-label={`Remove inspection check ${i + 1}`}
                className="mt-1.5 rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Equipment Editor */
function EquipmentEditor({ equipment, onChange }) {
  const addItem = () => {
    onChange([...equipment, { name: '', quantity: 1 }]);
  };
  const removeItem = (index) => {
    onChange(equipment.filter((_, i) => i !== index));
  };
  const updateItem = (index, field, value) => {
    const updated = [...equipment];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Checklist Equipment / Tools</label>
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
        >
          <FiPlus size={12} /> Add Tool
        </button>
      </div>
      {equipment.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
          No required equipment defined.
        </p>
      ) : (
        <div className="space-y-2">
          {equipment.map((item, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <FiTool size={14} className="shrink-0 text-slate-400" />
              <input
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="Tool name"
                value={item.name}
                onChange={(e) => updateItem(i, 'name', e.target.value)}
              />
              <input
                type="number"
                min="1"
                className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => updateItem(i, 'quantity', Number(e.target.value) || 1)}
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Expandable Service Card */
function ServiceCard({ service, requirements, inventoryItems, canManage, canManageInventory, onEdit, onCatalogAction, onSaveRequirement, onDeleteRequirement }) {
  const [expanded, setExpanded] = useState(false);
  const [reqForm, setReqForm] = useState(null);
  const selectableInventoryItems = inventoryItems.filter((item) => item.status !== 'retired');

  const startAddRequirement = () => {
    setReqForm({
      service_type: service.id,
      item: selectableInventoryItems[0]?.id || '',
      quantity: 1,
      auto_reserve: true,
      notes: '',
    });
  };

  const handleSaveReq = async () => {
    if (!reqForm) return;
    await onSaveRequirement(reqForm);
    setReqForm(null);
  };

  const procedures = normalizeProcedures(service.procedures);
  const equipment = normalizeEquipment(service.required_equipment);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex flex-col items-stretch gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
              style={{ backgroundColor: service.color || '#2563eb' }}
              title={service.color || '#2563eb'}
            />
            <h4 className="min-w-0 basis-[calc(100%-1.5rem)] break-words text-base font-semibold text-slate-900 sm:basis-auto">{service.name}</h4>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              service.is_active === false
                ? 'bg-slate-100 text-slate-600'
                : 'bg-emerald-50 text-emerald-700'
            }`}>
              {service.is_active === false ? 'Inactive' : 'Active'}
            </span>
            {service.requires_site_inspection ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                Site inspection first
              </span>
            ) : null}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${service.deposit_policy && service.deposit_policy !== 'none' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
              {service.deposit_policy === 'percentage'
                ? `${Number(service.deposit_value || 0).toLocaleString('en-PH')}% deposit`
                : service.deposit_policy === 'fixed'
                  ? `${formatCost(service.deposit_value)} deposit`
                  : 'No deposit'}
            </span>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600">
              {formatDuration(service.estimated_duration)}
            </span>
            {service.category && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                {service.category}
              </span>
            )}
          </div>
          <p className="mt-2 break-words text-sm text-slate-500">{service.description || 'No description'}</p>

          {/* Quick stats row */}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
              {formatCost(service.estimated_cost)}
            </span>
            <span className="inline-flex items-center gap-1">
              <FiClock size={12} className="text-amber-500" />
              Max {service.max_daily_assignments}/day per tech
            </span>
            <span className="inline-flex items-center gap-1">
              <FiList size={12} className="text-brand-500" />
              {procedures.length} step{procedures.length !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <FiTool size={12} className="text-violet-500" />
              {equipment.length} tool{equipment.length !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <FiPackage size={12} className="text-sky-500" />
              {requirements.length} inventory template{requirements.length !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              {Number(service.usage_count || 0)} use{Number(service.usage_count || 0) !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
          {canManage ? <button
            type="button"
            onClick={() => onEdit(service)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            title="Edit"
          >
            <FiEdit2 size={15} />
            Edit
          </button> : null}
          {canManage && (canPermanentlyDeleteService(service) || service.is_active !== false) ? <button
            type="button"
            onClick={() => onCatalogAction(service)}
            className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold ${
              canPermanentlyDeleteService(service)
                ? 'border-red-100 text-red-600 hover:bg-red-50'
                : 'border-amber-200 text-amber-700 hover:bg-amber-50'
            }`}
            title={canPermanentlyDeleteService(service) ? 'Delete unused service' : 'Deactivate used service'}
          >
            {canPermanentlyDeleteService(service) ? <FiTrash2 size={15} /> : <FiPower size={15} />}
            {canPermanentlyDeleteService(service) ? 'Delete' : 'Deactivate'}
          </button> : null}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
          >
            {expanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
            {expanded ? 'Hide' : 'Details'}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Procedures */}
          {procedures.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-slate-700">Procedures</h5>
              <div className="space-y-1.5">
                {procedures.map((proc, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600">
                      {proc.step || i + 1}
                    </span>
                    <div>
                      <span className="font-medium text-slate-800">{proc.title || `Step ${i + 1}`}</span>
                      {proc.description && <p className="text-slate-500">{proc.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Required Equipment */}
          {equipment.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-slate-700">Required Equipment</h5>
              <div className="flex flex-wrap gap-2">
                {equipment.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
                    <FiTool size={12} className="text-slate-400" />
                    {item.name} <span className="text-slate-400">x{item.quantity}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Inventory Templates */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-sm font-semibold text-slate-700">Inventory Templates</h5>
              {canManageInventory && selectableInventoryItems.length > 0 && (
                <button
                  type="button"
                  onClick={startAddRequirement}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
                >
                  <FiPlus size={12} /> Add
                </button>
              )}
            </div>

            {requirements.length === 0 && !reqForm ? (
              <p className="text-sm text-slate-400">No inventory templates configured.</p>
            ) : (
              <div className="space-y-1.5">
                {requirements.map((req) => (
                  <div key={req.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-800">{req.item_name}</span>
                      <span className="ml-2 text-slate-400">x{req.quantity}</span>
                      <span className="ml-2 text-slate-400">({req.auto_reserve ? 'Auto' : 'Manual'})</span>
                    </div>
                    {canManageInventory ? <button
                      type="button"
                      onClick={() => onDeleteRequirement(req.id)}
                      className="rounded p-1 text-red-400 hover:text-red-600"
                    >
                      <FiTrash2 size={13} />
                    </button> : null}
                  </div>
                ))}
              </div>
            )}

            {/* Inline add requirement form */}
            {reqForm && (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <select
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  value={reqForm.item}
                  onChange={(e) => setReqForm({ ...reqForm, item: Number(e.target.value) })}
                >
                  {selectableInventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.available_quantity ?? item.quantity ?? 0} available)
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  value={reqForm.quantity}
                  onChange={(e) => setReqForm({ ...reqForm, quantity: Number(e.target.value) || 1 })}
                />
                <button
                  type="button"
                  onClick={handleSaveReq}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setReqForm(null)}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Main Page */
export default function AdminServices() {
  const { user } = useAuth();
  const canManageServices = hasAnyCapability(user, SERVICE_CATALOG_MANAGE_CAPABILITIES);
  const canViewInventory = hasAnyCapability(user, INVENTORY_VIEW_CAPABILITIES);
  const canManageInventory = hasAnyCapability(user, INVENTORY_MANAGE_CAPABILITIES);
  const [services, setServices] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingService, setEditingService] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [serviceActionBusy, setServiceActionBusy] = useState(false);
  const [requirementDeleteTarget, setRequirementDeleteTarget] = useState(null);
  const [serviceFormData, setServiceFormData] = useState(DEFAULT_SERVICE_FORM);
  const [feedback, setFeedback] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [serviceList, inventoryList, requirementList] = await Promise.all([
        fetchServices(),
        canViewInventory ? fetchInventory() : Promise.resolve([]),
        canViewInventory ? fetchServiceInventoryRequirements() : Promise.resolve([])
      ]);
      setServices(serviceList);
      setInventoryItems(inventoryList);
      setRequirements(requirementList.map(normalizeRequirement));
    } catch (error) {
      setServices([]);
      setInventoryItems([]);
      setRequirements([]);
      setFeedback(error.message || 'Unable to load services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [canViewInventory]);

  const onSaveService = async () => {
    try {
      const serviceName = serviceFormData.name.trim();
      if (!serviceName) {
        setFeedback('Service name is required.');
        return;
      }
      if (services.some((service) => service.name.toLowerCase() === serviceName.toLowerCase() && service.id !== editingService?.id)) {
        setFeedback('A service with this name already exists.');
        return;
      }
      if (Number(serviceFormData.estimated_duration || 0) <= 0) {
        setFeedback('Duration must be greater than zero.');
        return;
      }
      if (Number(serviceFormData.estimated_cost || 0) < 0) {
        setFeedback('Estimated cost cannot be negative.');
        return;
      }
      if (Number(serviceFormData.max_daily_assignments || 0) <= 0) {
        setFeedback('Max daily assignments must be at least 1.');
        return;
      }
      if (serviceFormData.deposit_policy === 'percentage' && (Number(serviceFormData.deposit_value) <= 0 || Number(serviceFormData.deposit_value) > 100)) {
        setFeedback('Deposit percentage must be greater than 0 and no more than 100.');
        return;
      }
      if (serviceFormData.deposit_policy === 'fixed' && Number(serviceFormData.deposit_value) <= 0) {
        setFeedback('Fixed deposit amount must be greater than zero.');
        return;
      }

      const payload = {
        ...serviceFormData,
        name: serviceName,
        description: serviceFormData.description.trim(),
        category: serviceFormData.category.trim(),
        icon: serviceFormData.icon.trim(),
        display_order: Number(serviceFormData.display_order || 0),
        deposit_value: serviceFormData.deposit_policy === 'none' ? 0 : Number(serviceFormData.deposit_value || 0),
      };

      if (editingService) {
        await updateService(editingService.id, payload);
        setFeedback('Service updated.');
      } else {
        await createService(payload);
        setFeedback('Service created.');
      }
      setEditingService(null);
      setServiceFormData(DEFAULT_SERVICE_FORM);
      setShowForm(false);
      await load();
    } catch (error) {
      setFeedback(error.message || 'Error saving service.');
    }
  };

  const onConfirmCatalogAction = async () => {
    if (!deleteTarget || serviceActionBusy) return;
    const { service, mode } = deleteTarget;
    setServiceActionBusy(true);
    try {
      if (mode === 'deactivate') {
        await updateService(service.id, { ...service, is_active: false });
        setFeedback(`${service.name} is now inactive and hidden from new requests. Historical records were preserved.`);
      } else {
        await deleteService(service.id);
        setFeedback('Unused service deleted.');
      }
      setDeleteTarget(null);
      await load();
    } catch (error) {
      setFeedback(error.message || `Unable to ${mode} service.`);
    } finally {
      setServiceActionBusy(false);
    }
  };

  const onEditService = (service) => {
    setEditingService(service);
    setServiceFormData(toServiceFormState(service));
    setShowForm(true);
    setFeedback('');
  };

  const onSaveRequirement = async (formData) => {
    try {
      await createServiceInventoryRequirement(formData);
      setFeedback('Inventory template added.');
      await load();
    } catch (error) {
      setFeedback(error.message || 'Error saving template.');
    }
  };

  const onDeleteRequirement = async (id) => {
    try {
      await deleteServiceInventoryRequirement(id);
      setFeedback('Template removed.');
      setRequirementDeleteTarget(null);
      await load();
    } catch (error) {
      setFeedback(error.message || 'Error deleting template.');
    }
  };

  const durationParts = getDurationParts(serviceFormData.estimated_duration);

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Manage service types, checklist procedures, tools, and inventory templates.</p>
        </div>
        <div className="flex items-center gap-3">
          {canManageServices ? <button
            type="button"
            onClick={() => {
              setEditingService(null);
              setServiceFormData(DEFAULT_SERVICE_FORM);
              setShowForm(true);
              setFeedback('');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
          >
            <FiPlus size={15} />
            Add Service
          </button> : null}
        </div>
      </div>

      {feedback && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          feedback.toLowerCase().includes('error') || feedback.toLowerCase().includes('unable') || feedback.toLowerCase().includes('required') || feedback.toLowerCase().includes('cannot')
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {feedback}
        </div>
      )}

      {/* Service Form */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          onClick={() => {
            setServiceFormData(DEFAULT_SERVICE_FORM);
            setEditingService(null);
            setShowForm(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Services</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">
                  {editingService ? 'Manage Service' : 'Create Service'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setServiceFormData(DEFAULT_SERVICE_FORM);
                  setEditingService(null);
                  setShowForm(false);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

          <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Service Name</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="e.g. Aircon Installation"
                value={serviceFormData.name}
                onChange={(e) => setServiceFormData({ ...serviceFormData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="e.g. Solar, Air Conditioning, FDAS"
                value={serviceFormData.category}
                onChange={(e) => setServiceFormData({ ...serviceFormData, category: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Service Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-10 w-12 rounded-lg border border-slate-200 bg-white p-1"
                  value={serviceFormData.color || '#2563eb'}
                  onChange={(e) => setServiceFormData({ ...serviceFormData, color: e.target.value })}
                />
                <input
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={serviceFormData.color}
                  onChange={(e) => setServiceFormData({ ...serviceFormData, color: e.target.value })}
                  placeholder="#2563eb"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Display Order</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={serviceFormData.display_order}
                onChange={(e) => setServiceFormData({ ...serviceFormData, display_order: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Icon Key</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Optional, e.g. solar, aircon, fire"
                value={serviceFormData.icon}
                onChange={(e) => setServiceFormData({ ...serviceFormData, icon: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Service Duration</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-12 text-sm"
                    value={durationParts.hours}
                    onChange={(e) => setServiceFormData({
                      ...serviceFormData,
                      estimated_duration: mergeDurationPart(serviceFormData.estimated_duration, 'hours', e.target.value)
                    })}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">hr</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-12 text-sm"
                    value={durationParts.minutes}
                    onChange={(e) => setServiceFormData({
                      ...serviceFormData,
                      estimated_duration: mergeDurationPart(serviceFormData.estimated_duration, 'minutes', e.target.value)
                    })}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">min</span>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {formatDuration(serviceFormData.estimated_duration)} total, used for the 8-hour technician capacity.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Estimated Cost (Philippine Peso)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 pl-12 text-sm"
                  value={serviceFormData.estimated_cost}
                  onChange={(e) => setServiceFormData({ ...serviceFormData, estimated_cost: Number(e.target.value) || 0 })}
                />
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">PHP</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Max Daily Assignments (per tech)</label>
              <input
                type="number"
                min="1"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={serviceFormData.max_daily_assignments}
                onChange={(e) => setServiceFormData({ ...serviceFormData, max_daily_assignments: Number(e.target.value) || 1 })}
              />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <span>
                <span className="block text-sm font-medium text-slate-700">Available for new requests</span>
                <span className="block text-xs text-slate-500">Inactive services stay in history but are hidden from new client requests.</span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={serviceFormData.is_active}
                onChange={(e) => setServiceFormData({ ...serviceFormData, is_active: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <span>
                <span className="block text-sm font-medium text-slate-700">Requires site inspection first</span>
                <span className="block text-xs text-slate-500">Jobs for this service are dispatched as an inspection visit, and service work is scheduled only after the inspection is reviewed. Leave off for routine work such as cleaning or maintenance.</span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={Boolean(serviceFormData.requires_site_inspection)}
                onChange={(e) => setServiceFormData({ ...serviceFormData, requires_site_inspection: e.target.checked })}
              />
            </label>
            <div className="rounded-xl border border-slate-200 p-3 md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="service-deposit-policy">Pre-service deposit</label>
              <select
                id="service-deposit-policy"
                value={serviceFormData.deposit_policy}
                onChange={(event) => setServiceFormData({
                  ...serviceFormData,
                  deposit_policy: event.target.value,
                  deposit_value: event.target.value === 'none' ? 0 : serviceFormData.deposit_value,
                })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="none">No deposit required</option>
                <option value="percentage">Percentage of accepted quotation</option>
                <option value="fixed">Fixed PHP amount</option>
              </select>
              {serviceFormData.deposit_policy !== 'none' ? (
                <div className="relative mt-3">
                  <input
                    aria-label={serviceFormData.deposit_policy === 'percentage' ? 'Deposit percentage' : 'Fixed deposit amount'}
                    type="number"
                    min="0.01"
                    max={serviceFormData.deposit_policy === 'percentage' ? 100 : undefined}
                    step="0.01"
                    value={serviceFormData.deposit_value}
                    onChange={(event) => setServiceFormData({ ...serviceFormData, deposit_value: Number(event.target.value) || 0 })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-16 text-sm"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                    {serviceFormData.deposit_policy === 'percentage' ? '%' : 'PHP'}
                  </span>
                </div>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                This rule is copied into each new quotation. If required, the client must accept the quotation and the office must record the full deposit before service dispatch. Site inspection can still happen first.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                placeholder="Describe the service"
                value={serviceFormData.description}
                onChange={(e) => setServiceFormData({ ...serviceFormData, description: e.target.value })}
              />
            </div>
          </div>

          {/* Procedures */}
          <div className="px-6 pb-5">
            <ProcedureEditor
              procedures={serviceFormData.procedures}
              onChange={(procedures) => setServiceFormData({ ...serviceFormData, procedures })}
            />
          </div>

          {/* Inspection checks only matter when the service is dispatched as an inspection first */}
          {serviceFormData.requires_site_inspection && (
            <div className="px-6 pb-5">
              <InspectionCheckEditor
                checks={serviceFormData.inspection_procedures}
                onChange={(inspection_procedures) => setServiceFormData({ ...serviceFormData, inspection_procedures })}
              />
            </div>
          )}

          {/* Equipment */}
          <div className="px-6 pb-5">
            <EquipmentEditor
              equipment={serviceFormData.required_equipment}
              onChange={(required_equipment) => setServiceFormData({ ...serviceFormData, required_equipment })}
            />
          </div>

          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
            <button
              type="button"
              onClick={() => {
                setServiceFormData(DEFAULT_SERVICE_FORM);
                setEditingService(null);
                setShowForm(false);
                setFeedback('');
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
              onClick={onSaveService}
            >
              {editingService ? 'Save Changes' : 'Create Service'}
            </button>
          </div>
          </div>
        </div>
      )}

      {/* Services List */}
      {loading ? (
        <ListSkeleton rows={5} />
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16">
          <FiTool size={32} className="text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">No services yet. Create your first service above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              requirements={requirements.filter((r) => Number(r.service_type) === Number(service.id))}
              inventoryItems={inventoryItems}
              canManage={canManageServices}
              canManageInventory={canManageServices && canManageInventory}
              onEdit={onEditService}
              onCatalogAction={(target) => setDeleteTarget({
                service: target,
                mode: canPermanentlyDeleteService(target) ? 'delete' : 'deactivate',
              })}
              onSaveRequirement={onSaveRequirement}
              onDeleteRequirement={(id) => {
                const target = requirements.find((requirement) => requirement.id === id);
                setRequirementDeleteTarget(target || { id });
              }}
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-950">
              {deleteTarget.mode === 'deactivate' ? 'Deactivate service?' : 'Delete unused service?'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {deleteTarget.mode === 'deactivate' ? (
                <>
                  <span className="font-semibold text-slate-900">{deleteTarget.service.name}</span> has {Number(deleteTarget.service.usage_count || 0)} historical reference{Number(deleteTarget.service.usage_count || 0) === 1 ? '' : 's'}. It will be hidden from new requests while all existing records remain available.
                </>
              ) : (
                <>
                  This permanently removes <span className="font-semibold text-slate-900">{deleteTarget.service.name}</span>. It has no request, ticket, or maintenance history.
                </>
              )}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={serviceActionBusy}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmCatalogAction}
                disabled={serviceActionBusy}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  deleteTarget.mode === 'deactivate'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {serviceActionBusy
                  ? (deleteTarget.mode === 'deactivate' ? 'Deactivating...' : 'Deleting...')
                  : (deleteTarget.mode === 'deactivate' ? 'Deactivate service' : 'Delete permanently')}
              </button>
            </div>
          </div>
        </div>
      )}

      {requirementDeleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          onClick={() => setRequirementDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-950">Remove inventory template?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This removes the template from this service. It does not delete the inventory item itself.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRequirementDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onDeleteRequirement(requirementDeleteTarget.id)}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
