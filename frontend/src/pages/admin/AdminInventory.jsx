import { useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import { api, fetchAllPages, fetchInventorySummary } from '../../api/api';
import { FiAlertCircle, FiCheckCircle, FiEye, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useSearchParams } from 'react-router-dom';
import { hasAnyCapability, INVENTORY_MANAGE_CAPABILITIES } from '../../rbac';
import { formatReservationId, formatTicketId, formatTransactionId } from '../../utils/roleIds';
import SearchFilterBar from '../../components/shared/SearchFilterBar';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'in_use', label: 'In Use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'retired', label: 'Retired' }
];

const ITEM_TYPE_OPTIONS = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'part', label: 'Spare Part' },
  { value: 'tool', label: 'Tool' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'other', label: 'Other' }
];

const UNIT_SUGGESTIONS = ['piece', 'unit', 'set', 'box', 'pack', 'roll', 'meter', 'kilogram', 'liter'];

const STOCK_ACTION_OPTIONS = [
  { value: 'purchase', label: 'Receive stock' },
  { value: 'return', label: 'Record non-ticket return' },
  { value: 'adjustment', label: 'Correct physical count' },
  { value: 'issue', label: 'Manual deduction' }
];

const STOCK_CONDITION_OPTIONS = [
  { value: 'all', label: 'All stock conditions' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'reserved', label: 'Has reservations' }
];

const buildDefaultItem = (categoryId = '') => ({
  name: '',
  sku: '',
  category: categoryId,
  item_type: 'equipment',
  description: '',
  brand: '',
  model: '',
  size: '',
  unit_of_measurement: 'piece',
  capacity: '',
  quantity: 0,
  minimum_stock: 10,
  low_stock_threshold: 40,
  unit_price: 0,
  warehouse_location: '',
  supplier: '',
  supplier_contact: '',
  purchase_date: '',
  warranty_expiry: '',
  notes: '',
  status: 'available'
});

const extractList = (data) =>
  Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
const ITEMS_PER_PAGE = 10;

const normalizeCategory = (category) => ({
  ...category,
  id: Number(category.id),
  parent: category.parent ? Number(category.parent) : '',
  item_count: Number(category.item_count || 0),
  subcategory_count: Number(category.subcategory_count || 0)
});

const normalizeInventoryItem = (item) => ({
  ...item,
  category: Number(item?.category || 0) || '',
  category_name: item?.category_name || 'Uncategorized',
  quantity: Number(item?.quantity || 0),
  minimum_stock: Number(item?.minimum_stock || 0),
  available_quantity: Number(item?.available_quantity ?? item?.quantity ?? 0),
  is_low_stock: Boolean(item?.is_low_stock)
});

const normalizeTransaction = (transaction) => ({
  ...transaction,
  quantity: Number(transaction?.quantity || 0)
});

const normalizeReservation = (reservation) => ({
  ...reservation,
  id: Number(reservation?.id || 0),
  item: Number(reservation?.item || 0),
  service_ticket: Number(reservation?.service_ticket || 0) || null,
  quantity: Number(reservation?.quantity || 0),
  item_available_quantity: Number(reservation?.item_available_quantity || 0),
  item_physical_quantity: Number(reservation?.item_physical_quantity || 0)
});

const parseIntegerInput = (value, fallback = 0) => {
  if (value === '') {
    return '';
  }

  const parsedValue = parseInt(value, 10);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
};


const formatStatusLabel = (value) => String(value || '').replace(/_/g, ' ').toUpperCase();

const formatDateTime = (value) => {
  if (!value) return '-';

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const buildDefaultStockAdjustment = () => ({
  transaction_type: 'purchase',
  quantity: 1,
  reference_number: '',
  notes: ''
});

const getApiErrorMessage = (error, fallback) => {
  const data = error?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (data && typeof data === 'object') {
    const firstError = Object.values(data).flat().find(Boolean);
    if (firstError) {
      return Array.isArray(firstError) ? firstError[0] : String(firstError);
    }
  }

  return fallback;
};

export default function AdminInventory() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManageInventory = hasAnyCapability(user, INVENTORY_MANAGE_CAPABILITIES);
  const [inventory, setInventory] = useState([]);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ id: null, name: '', description: '', parent: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState(buildDefaultItem());
  const [editingId, setEditingId] = useState(null);
  const [editingItem, setEditingItem] = useState(buildDefaultItem());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemTransactions, setItemTransactions] = useState([]);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [itemReservations, setItemReservations] = useState([]);
  const [reservationLoading, setReservationLoading] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustForm, setAdjustForm] = useState(buildDefaultStockAdjustment());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stockConditionFilter, setStockConditionFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [inventorySummary, setInventorySummary] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [pendingReservations, setPendingReservations] = useState([]);
  const [pendingReservationsLoading, setPendingReservationsLoading] = useState(false);
  const [reviewingReservationGroup, setReviewingReservationGroup] = useState(null);
  const [reservationLineDecisions, setReservationLineDecisions] = useState({});
  const [reservationDecisionReason, setReservationDecisionReason] = useState('');
  const [reservationDecisionLoading, setReservationDecisionLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const getDefaultCategoryId = (categoryList = categories) => categoryList[0]?.id || '';

  const resetEditor = (categoryId = getDefaultCategoryId()) => {
    setAdding(false);
    setEditingId(null);
    setNewItem(buildDefaultItem(categoryId));
    setEditingItem(buildDefaultItem(categoryId));
  };

  const openAddItem = () => {
    setEditingId(null);
    setEditingItem(buildDefaultItem(getDefaultCategoryId()));
    setNewItem(buildDefaultItem(getDefaultCategoryId()));
    setAdding(true);
  };

  const openEditItem = (item) => {
    setAdding(false);
    setEditingId(item.id);
    setEditingItem(item);
    setAdjustForm(buildDefaultStockAdjustment());
  };

  const openStockMovement = (item, transactionType = 'purchase') => {
    setAdjustTarget(item);
    setAdjustForm({
      ...buildDefaultStockAdjustment(),
      transaction_type: transactionType
    });
    setError('');
  };

  const loadItemTransactions = async (itemId) => {
    setTransactionLoading(true);

    try {
      const { data } = await api.get('/inventory/transactions/by_item/', {
        params: { item_id: itemId }
      });
      setItemTransactions(extractList(data).map(normalizeTransaction));
    } catch (transactionError) {
      setItemTransactions([]);
      setError(getApiErrorMessage(transactionError, 'Failed to load stock movement history.'));
    } finally {
      setTransactionLoading(false);
    }
  };

  const loadItemReservations = async (itemId) => {
    setReservationLoading(true);
    try {
      const reservations = await fetchAllPages(`/inventory/reservations/?item_id=${itemId}`);
      setItemReservations(reservations.map(normalizeReservation));
    } catch (reservationError) {
      setItemReservations([]);
      setError(getApiErrorMessage(reservationError, 'Failed to load reservation details.'));
    } finally {
      setReservationLoading(false);
    }
  };

  const openItemDetails = async (item) => {
    setSelectedItem(item);
    await Promise.all([
      loadItemTransactions(item.id),
      loadItemReservations(item.id)
    ]);
  };

  const loadCategories = async () => {
    const categoryList = (await fetchAllPages('/inventory/categories/')).map(normalizeCategory);
    setCategories(categoryList);
    return categoryList;
  };

  const loadInventory = async () => {
    return (await fetchAllPages('/inventory/items/')).map(normalizeInventoryItem);
  };

  const loadLowStockItems = async () => {
    const { data } = await api.get('/inventory/items/low_stock/');
    return extractList(data).map(normalizeInventoryItem);
  };

  const loadPendingReservations = async () => {
    setPendingReservationsLoading(true);
    try {
      const reservations = await fetchAllPages('/inventory/reservations/pending/');
      setPendingReservations(reservations.map(normalizeReservation));
      return reservations;
    } finally {
      setPendingReservationsLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [categoryList, items, summary, lowStock] = await Promise.all([
        loadCategories(),
        loadInventory(),
        fetchInventorySummary(),
        loadLowStockItems(),
        loadPendingReservations()
      ]);
      const defaultCategoryId = getDefaultCategoryId(categoryList);

      setInventory(items);
      setInventorySummary(summary);
      setLowStockItems(lowStock);
      setSelectedItem((current) => {
        if (!current) return current;
        return items.find((item) => item.id === current.id) || null;
      });
      setNewItem((current) => (current.category ? current : buildDefaultItem(defaultCategoryId)));
      setEditingItem((current) => {
        if (editingId) {
          return items.find((item) => item.id === editingId) || current;
        }
        return current.category ? current : buildDefaultItem(defaultCategoryId);
      });
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Failed to load inventory. Please try again.'));
      setInventory([]);
      setCategories([]);
      setInventorySummary(null);
      setLowStockItems([]);
      setPendingReservations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, statusFilter]);

  const buildCreatePayload = (item) => ({
    name: item.name.trim(),
    sku: item.sku.trim().toUpperCase(),
    category: Number(item.category),
    item_type: item.item_type || 'equipment',
    description: item.description || '',
    brand: item.brand || '',
    model: item.model || '',
    size: item.size || '',
    unit_of_measurement: item.unit_of_measurement || 'piece',
    capacity: item.capacity || '',
    quantity: Number(item.quantity || 0),
    minimum_stock: Number(item.minimum_stock === '' ? 0 : item.minimum_stock),
    low_stock_threshold: Number(item.low_stock_threshold === '' ? 40 : item.low_stock_threshold),
    unit_price: Number(item.unit_price || 0),
    warehouse_location: item.warehouse_location || '',
    supplier: item.supplier || '',
    supplier_contact: item.supplier_contact || '',
    purchase_date: item.purchase_date || null,
    warranty_expiry: item.warranty_expiry || null,
    notes: item.notes || '',
    status: item.status
  });

  const buildUpdatePayload = (item) => ({
    name: item.name.trim(),
    sku: item.sku.trim().toUpperCase(),
    category: Number(item.category),
    item_type: item.item_type || 'equipment',
    description: item.description || '',
    brand: item.brand || '',
    model: item.model || '',
    size: item.size || '',
    unit_of_measurement: item.unit_of_measurement || 'piece',
    capacity: item.capacity || '',
    minimum_stock: Number(item.minimum_stock === '' ? 0 : item.minimum_stock),
    low_stock_threshold: Number(item.low_stock_threshold === '' ? 40 : item.low_stock_threshold),
    unit_price: Number(item.unit_price || 0),
    warehouse_location: item.warehouse_location || '',
    supplier: item.supplier || '',
    supplier_contact: item.supplier_contact || '',
    purchase_date: item.purchase_date || null,
    warranty_expiry: item.warranty_expiry || null,
    notes: item.notes || '',
    status: item.status
  });

  const addItem = async () => {
    if (!newItem.sku.trim()) {
      setError('SKU is required and must be unique.');
      return;
    }
    try {
      const { data } = await api.post('/inventory/items/', buildCreatePayload(newItem));
      const defaultCategoryId = getDefaultCategoryId();
      setInventory((current) => [...current, normalizeInventoryItem(data)]);
      setNewItem(buildDefaultItem(defaultCategoryId));
      setAdding(false);
      setError('');
      await loadData();
    } catch (addError) {
      setError(getApiErrorMessage(addError, 'Failed to add item. Please try again.'));
    }
  };

  const updateItem = async (id) => {
    if (!editingItem.sku.trim()) {
      setError('SKU is required and must be unique.');
      return;
    }
    try {
      const { data } = await api.patch(`/inventory/items/${id}/`, buildUpdatePayload(editingItem));
      setInventory((current) =>
        current.map((item) => (item.id === id ? normalizeInventoryItem({ ...item, ...data }) : item))
      );
      resetEditor();
      setError('');
      await loadData();
    } catch (updateError) {
      setError(getApiErrorMessage(updateError, 'Failed to update item. Please try again.'));
    }
  };

  const deleteItem = async (id) => {
    try {
      await api.delete(`/inventory/items/${id}/`);
      setInventory((current) => current.filter((item) => item.id !== id));
      setError('');
      await loadData();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Failed to delete item. Please try again.'));
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm({ id: null, name: '', description: '', parent: '' });
  };

  const saveCategory = async () => {
    const name = categoryForm.name.trim();
    if (!name) {
      setError('Category name is required.');
      return;
    }
    const payload = {
      name,
      description: categoryForm.description || '',
      parent: categoryForm.parent ? Number(categoryForm.parent) : null
    };
    try {
      if (categoryForm.id) {
        await api.patch(`/inventory/categories/${categoryForm.id}/`, payload);
      } else {
        await api.post('/inventory/categories/', payload);
      }
      resetCategoryForm();
      setError('');
      await loadData();
    } catch (categoryError) {
      setError(getApiErrorMessage(categoryError, 'Failed to save category.'));
    }
  };

  const editCategory = (category) => {
    setCategoryForm({
      id: category.id,
      name: category.name || '',
      description: category.description || '',
      parent: category.parent || ''
    });
  };

  const deleteCategory = (category) => {
    setCategoryPendingDelete(category);
  };

  const confirmDeleteCategory = async () => {
    const category = categoryPendingDelete;
    setCategoryPendingDelete(null);
    if (!category) return;
    try {
      await api.delete(`/inventory/categories/${category.id}/`);
      if (categoryForm.id === category.id) resetCategoryForm();
      setError('');
      await loadData();
    } catch (categoryError) {
      setError(getApiErrorMessage(categoryError, 'Move this category\'s items and subcategories before deleting it.'));
    }
  };

  const adjustStock = async () => {
    if (!editingId && !adjustTarget) return;

    const stockTarget = adjustTarget || editingItem;
    const quantity = Number(adjustForm.quantity || 0);
    if (quantity < 0 || (adjustForm.transaction_type !== 'adjustment' && quantity <= 0)) {
      setError('Stock quantity must be greater than zero.');
      return;
    }
    if (adjustForm.transaction_type === 'issue' && quantity > stockTarget.available_quantity) {
      setError(`Only ${stockTarget.available_quantity} unit(s) are available to deduct.`);
      return;
    }
    if (!adjustForm.notes.trim()) {
      setError('A reason is required for every manual stock movement.');
      return;
    }

    try {
      await api.post('/inventory/transactions/', {
        item: stockTarget.id,
        transaction_type: adjustForm.transaction_type,
        quantity,
        reference_number: adjustForm.reference_number.trim() || null,
        notes: adjustForm.notes || ''
      });
      setAdjustForm(buildDefaultStockAdjustment());
      setAdjustTarget(null);
      setError('');
      await loadData();
      if (selectedItem?.id === stockTarget.id) {
        await Promise.all([
          loadItemTransactions(stockTarget.id),
          loadItemReservations(stockTarget.id)
        ]);
      }
    } catch (adjustError) {
      setError(getApiErrorMessage(adjustError, 'Failed to adjust stock.'));
    }
  };

  const openReservationReview = (group) => {
    setError('');
    setReservationDecisionReason('');
    setReservationLineDecisions(Object.fromEntries(
      group.reservations.map((reservation) => [
        reservation.id,
        reservation.item_physical_quantity >= reservation.quantity ? 'approve' : 'reject',
      ])
    ));
    setReviewingReservationGroup(group);
  };

  const closeReservationReview = () => {
    if (reservationDecisionLoading) return;
    setReviewingReservationGroup(null);
    setReservationLineDecisions({});
    setReservationDecisionReason('');
  };

  const submitReservationDecision = async () => {
    if (!reviewingReservationGroup) return;
    const reason = reservationDecisionReason.trim();
    const decisions = reviewingReservationGroup.reservations.map((reservation) => ({
      reservation_id: reservation.id,
      decision: reservationLineDecisions[reservation.id],
      reason: reservationLineDecisions[reservation.id] === 'reject' ? reason : '',
    }));
    const hasRejectedLines = decisions.some((decision) => decision.decision === 'reject');
    if (decisions.some((decision) => !['approve', 'reject'].includes(decision.decision))) {
      setError('Choose Approve or Reject for every item.');
      return;
    }
    if (hasRejectedLines && reason.length < 8) {
      setError('Enter a clear rejection reason of at least 8 characters.');
      return;
    }

    setReservationDecisionLoading(true);
    setError('');
    setNotice('');
    try {
      const group = reviewingReservationGroup;
      if (group.service_ticket) {
        await api.post('/inventory/reservations/decide-ticket/', {
          ticket_id: group.service_ticket,
          decisions,
        });
      } else {
        const reservation = group.reservations[0];
        const lineDecision = decisions[0];
        const action = lineDecision.decision === 'approve' ? 'fulfill' : 'cancel';
        await api.post(`/inventory/reservations/${reservation.id}/${action}/`, { reason: lineDecision.reason });
      }
      const label = group.ticket_code || group.reservations[0]?.reservation_code
        || formatReservationId(group.reservations[0]?.id);
      const approvedCount = decisions.filter((decision) => decision.decision === 'approve').length;
      const rejectedCount = decisions.length - approvedCount;
      setNotice(`${label}: ${approvedCount} item line(s) issued, ${rejectedCount} rejected.`);
      setReviewingReservationGroup(null);
      setReservationLineDecisions({});
      setReservationDecisionReason('');
      await loadData();
    } catch (decisionError) {
      setError(getApiErrorMessage(decisionError, 'The equipment request could not be updated.'));
    } finally {
      setReservationDecisionLoading(false);
    }
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredInventory = inventory.filter((item) => {
    if (categoryFilter !== 'all' && String(item.category) !== categoryFilter) {
      return false;
    }
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }
    if (stockConditionFilter === 'low' && (item.status === 'retired' || !item.is_low_stock)) return false;
    if (stockConditionFilter === 'out' && (item.status === 'retired' || Number(item.available_quantity || 0) > 0)) return false;
    if (stockConditionFilter === 'reserved' && Number(item.reserved_quantity || 0) <= 0) return false;
    if (!normalizedSearchTerm) {
      return true;
    }

    return [
    item.name,
    item.sku,
    item.category_name,
    item.brand,
    item.model,
    item.size,
    item.unit_of_measurement,
    item.capacity,
    item.status,
  ].some((value) => String(value || '').toLowerCase().includes(normalizedSearchTerm));
  });
  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedInventory = filteredInventory.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);
  const categoryMissing = categories.length === 0;
  const activeInventory = inventory.filter((item) => item.status !== 'retired');
  const totalInventoryCount = inventorySummary?.totalItems ?? activeInventory.length;
  const totalCatalogCount = inventory.length;
  const lowStockCount = inventorySummary?.lowStockCount ?? lowStockItems.length;
  const totalPhysicalStock = activeInventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalReservedStock = activeInventory.reduce((sum, item) => sum + Number(item.reserved_quantity || 0), 0);
  const totalAvailableStock = activeInventory.reduce((sum, item) => sum + Number(item.available_quantity || 0), 0);
  const outOfStockCount = inventorySummary?.outOfStock ?? activeInventory.filter((item) => Number(item.available_quantity || 0) <= 0).length;
  const focusedTicketId = Number(searchParams.get('ticketId') || 0);
  const visiblePendingReservations = focusedTicketId
    ? pendingReservations.filter((reservation) => reservation.service_ticket === focusedTicketId)
    : pendingReservations;
  const pendingRequestGroups = Object.values(visiblePendingReservations.reduce((groups, reservation) => {
    const groupKey = reservation.service_ticket
      ? `ticket-${reservation.service_ticket}`
      : `reservation-${reservation.id}`;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        key: groupKey,
        service_ticket: reservation.service_ticket,
        ticket_code: reservation.ticket_code || (reservation.service_ticket ? formatTicketId(reservation.service_ticket) : null),
        service_name: reservation.service_name,
        ticket_status: reservation.ticket_status,
        technician_names: [],
        required_date: reservation.required_date,
        created_at: reservation.created_at,
        reservations: [],
      };
    }
    groups[groupKey].reservations.push(reservation);
    if (reservation.technician_name && !groups[groupKey].technician_names.includes(reservation.technician_name)) {
      groups[groupKey].technician_names.push(reservation.technician_name);
    }
    return groups;
  }, {}));
  const itemModalOpen = adding || Boolean(editingId);
  const activeItem = adding ? newItem : editingItem;
  const updateActiveItem = (updates) => {
    if (adding) {
      setNewItem((current) => ({ ...current, ...updates }));
    } else {
      setEditingItem((current) => ({ ...current, ...updates }));
    }
  };

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  useEffect(() => {
    if (!focusedTicketId && location.hash !== '#pending-equipment-requests') return;
    window.requestAnimationFrame(() => {
      document.getElementById('pending-equipment-requests')?.scrollIntoView({ block: 'start' });
    });
  }, [focusedTicketId, location.hash, pendingReservationsLoading]);

  return (
    <Layout>
      <section className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex gap-2">
          {canManageInventory ? <button
            type="button"
            onClick={() => setCategoryModalOpen(true)}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Manage Categories
          </button> : null}
          {canManageInventory ? <button
            onClick={openAddItem}
            disabled={categoryMissing}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FiPlus size={16} /> Add Item
          </button> : null}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5" aria-label="Inventory summary">
        {[
          { label: 'Active items', value: totalInventoryCount, tone: 'text-slate-950' },
          { label: 'Physical units', value: totalPhysicalStock, tone: 'text-slate-950' },
          { label: 'Reserved units', value: totalReservedStock, tone: 'text-blue-700', filter: 'reserved' },
          { label: 'Available units', value: totalAvailableStock, tone: 'text-emerald-700' },
          { label: 'Needs attention', value: lowStockCount, detail: `${outOfStockCount} out`, tone: lowStockCount ? 'text-amber-700' : 'text-emerald-700', filter: 'low' }
        ].map((summary) => (
          <button
            key={summary.label}
            type="button"
            onClick={() => summary.filter && setStockConditionFilter(summary.filter)}
            disabled={!summary.filter}
            className={`rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm ${summary.filter ? 'transition hover:border-brand-300 hover:bg-brand-50/40' : 'cursor-default'}`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{summary.label}</span>
            <span className={`mt-2 block text-2xl font-bold ${summary.tone}`}>{Number(summary.value || 0).toLocaleString()}</span>
            {summary.detail ? <span className="mt-1 block text-xs text-slate-500">{summary.detail}</span> : null}
          </button>
        ))}
      </section>

      <SearchFilterBar
        className="mt-6"
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchLabel="Find an inventory item"
        searchPlaceholder="Search item name or SKU"
        filters={[
          {
            key: 'category',
            label: 'Category',
            value: categoryFilter,
            defaultValue: 'all',
            onChange: setCategoryFilter,
            options: [
              { value: 'all', label: 'Any category' },
              ...categories.map((category) => ({ value: String(category.id), label: category.name })),
            ],
          },
          {
            key: 'item-state',
            label: 'Item usage state',
            value: statusFilter,
            defaultValue: 'all',
            onChange: setStatusFilter,
            options: [{ value: 'all', label: 'Any usage state' }, ...STATUS_OPTIONS],
            helpText: 'Whether the item itself is available, in use, under maintenance, or retired.',
          },
          {
            key: 'stock-level',
            label: 'Stock level',
            value: stockConditionFilter,
            defaultValue: 'all',
            onChange: setStockConditionFilter,
            options: STOCK_CONDITION_OPTIONS.map((option) => ({
              ...option,
              label: option.value === 'all' ? 'Any stock level' : option.label,
            })),
            helpText: 'Based on available quantity after ticket reservations.',
          },
        ]}
        onClear={() => {
          setSearchTerm('');
          setCategoryFilter('all');
          setStatusFilter('all');
          setStockConditionFilter('all');
        }}
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <FiAlertCircle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto font-bold">
            &times;
          </button>
        </div>
      )}

      {categoryMissing && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Inventory categories are required before items can be created. Use Manage Categories to create the first one.
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-900">
            Stock Overview ({filteredInventory.length}
            {filteredInventory.length !== totalCatalogCount ? ` of ${totalCatalogCount}` : ''} items)
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {normalizedSearchTerm
              ? `Showing matches for "${searchTerm.trim()}".`
              : `${lowStockCount} low-stock item${lowStockCount === 1 ? '' : 's'} need attention.`}
          </p>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[960px] table-fixed text-sm admin-inventory-table">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-[18%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Item
                </th>
                <th className="w-[11%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  SKU
                </th>
                <th className="w-[11%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Category
                </th>
                <th className="w-[8%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  On hand
                </th>
                <th className="w-[9%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reserved
                </th>
                <th className="w-[9%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Available
                </th>
                <th className="w-[8%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Minimum
                </th>
                <th className="w-[8%] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="w-[18%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-0 py-0">
                    <TableSkeleton rows={8} columns={9} compact />
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-8 py-10 text-center text-slate-600">
                    <p className="font-semibold text-slate-900">{inventory.length === 0 ? 'Set up your service inventory' : 'No matching inventory items'}</p>
                    <p className="mt-1 text-sm">{inventory.length === 0 ? 'Create a category, then add the parts and equipment your technicians use.' : 'Try clearing or changing the current filters.'}</p>
                  </td>
                </tr>
              ) : (
                paginatedInventory.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="truncate font-semibold text-slate-900" title={item.name}>{item.name}</div>
                      {[item.brand, item.model].filter(Boolean).length > 0 ? (
                        <div className="truncate text-xs text-slate-400">{[item.brand, item.model].filter(Boolean).join(' / ')}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600"><div className="truncate" title={item.sku || '-'}>{item.sku || '-'}</div></td>
                    <td className="px-3 py-2 text-sm text-slate-600"><div className="truncate" title={item.category_name}>{item.category_name}</div></td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`font-mono text-sm font-bold ${
                          item.quantity === 0
                            ? 'text-red-600'
                            : item.is_low_stock
                              ? 'text-orange-600'
                              : 'text-emerald-600'
                        }`}
                      >
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-blue-700">{item.reserved_quantity || 0}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{item.available_quantity}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{item.minimum_stock}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        Number(item.available_quantity || 0) <= 0
                          ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                          : item.is_low_stock
                            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                            : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      }`}>
                        {Number(item.available_quantity || 0) <= 0 ? 'Out' : item.is_low_stock ? 'Low' : 'OK'}
                      </span>
                      {item.status !== 'available' ? <div className="mt-1 text-xs text-slate-500">{formatStatusLabel(item.status)}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openItemDetails(item)}
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                        title="Details"
                      >
                        <FiEye size={15} />
                      </button>
                      {canManageInventory ? <button
                        onClick={() => openStockMovement(item, 'purchase')}
                        className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                        title="Receive stock"
                      >
                        Receive
                      </button> : null}
                      {canManageInventory ? <button
                        onClick={() => openEditItem(item)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        title="Manage item"
                      >
                        Manage
                      </button> : null}
                      {canManageInventory ? <button
                        onClick={() => setDeleteTarget(item)}
                        className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-700"
                        title="Delete"
                      >
                        <FiTrash2 size={18} />
                      </button> : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-200 md:hidden">
          {loading ? (
            <div className="p-4"><TableSkeleton rows={5} columns={2} compact /></div>
          ) : filteredInventory.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-semibold text-slate-900">{inventory.length === 0 ? 'Set up your service inventory' : 'No matching inventory items'}</p>
              <p className="mt-1 text-sm text-slate-500">{inventory.length === 0 ? 'Create a category, then add parts and equipment.' : 'Try changing the current filters.'}</p>
            </div>
          ) : paginatedInventory.map((item) => (
            <article key={item.id} className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate font-semibold text-slate-950">{item.name}</h4>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.sku || 'No SKU'} · {item.category_name}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${Number(item.available_quantity || 0) <= 0 ? 'bg-red-50 text-red-700' : item.is_low_stock ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {Number(item.available_quantity || 0) <= 0 ? 'Out' : item.is_low_stock ? 'Low' : 'OK'}
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                <div><dt className="text-xs uppercase tracking-wide text-slate-400">On hand</dt><dd className="mt-1 font-semibold text-slate-950">{item.quantity}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-slate-400">Reserved</dt><dd className="mt-1 font-semibold text-blue-700">{item.reserved_quantity || 0}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-slate-400">Available</dt><dd className="mt-1 font-semibold text-emerald-700">{item.available_quantity}</dd></div>
              </dl>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => openItemDetails(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Details</button>
                {canManageInventory ? <button type="button" onClick={() => openStockMovement(item, 'purchase')} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700">Receive</button> : null}
                {canManageInventory ? <button type="button" onClick={() => openEditItem(item)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Manage</button> : null}
              </div>
            </article>
          ))}
        </div>
        {filteredInventory.length > ITEMS_PER_PAGE && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm">
            <span className="text-slate-500">
              Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + ITEMS_PER_PAGE, filteredInventory.length)} of {filteredInventory.length} items
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage === 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-slate-500">Page {safeCurrentPage} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage === totalPages}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {notice && (
        <div role="status" className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="font-semibold">Dismiss</button>
        </div>
      )}

      <section id="pending-equipment-requests" className="mt-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Pending equipment requests">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950">Pending Equipment Requests</h2>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{pendingRequestGroups.length}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">Each service ticket appears once, with all of its reserved item lines reviewed together.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {focusedTicketId ? (
              <button type="button" onClick={() => setSearchParams({})} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Show all requests
              </button>
            ) : null}
            <button type="button" onClick={() => loadPendingReservations().catch((loadError) => setError(getApiErrorMessage(loadError, 'Failed to refresh pending equipment requests.')))} disabled={pendingReservationsLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <FiRefreshCw className={pendingReservationsLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {Boolean(focusedTicketId) && (
          <div className="border-b border-brand-100 bg-brand-50 px-5 py-3 text-sm text-brand-800">
            Showing pending requests for {formatTicketId(focusedTicketId)} from the selected notification.
          </div>
        )}

        {pendingReservationsLoading && pendingReservations.length === 0 ? (
          <div className="p-5"><TableSkeleton rows={3} columns={4} compact /></div>
        ) : pendingRequestGroups.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <FiCheckCircle className="mx-auto h-7 w-7 text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">No pending equipment requests</p>
            <p className="mt-1 text-sm text-slate-500">{focusedTicketId ? 'This ticket has no request awaiting a decision.' : 'All reserved equipment decisions are up to date.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingRequestGroups.map((group) => {
              const itemCount = group.reservations.length;
              const unavailableCount = group.reservations.filter(
                (reservation) => reservation.item_physical_quantity < reservation.quantity
              ).length;
              return (
                <article key={group.key} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-semibold text-slate-950">{group.ticket_code || 'Manual reservation'}</span>
                    <span className="whitespace-nowrap rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{group.service_name || 'Service ticket'}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{group.technician_names.join(', ') || 'Unassigned technician'}</span>
                      <span>Needed {group.required_date ? new Date(`${group.required_date}T00:00:00`).toLocaleDateString() : '-'}</span>
                      {unavailableCount ? <span className="font-semibold text-rose-700">{unavailableCount} item{unavailableCount === 1 ? '' : 's'} needs review</span> : null}
                    </div>
                  </div>
                  {canManageInventory ? (
                    <button type="button" onClick={() => openReservationReview(group)} className="justify-self-start rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 lg:justify-self-end">
                      Review
                    </button>
                  ) : (
                    <p className="text-xs text-slate-500 lg:text-right">View only</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selectedItem.status} />
                  {selectedItem.is_low_stock && (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                      Low stock
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-6 text-slate-950">{selectedItem.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedItem.sku || 'No SKU'} · {selectedItem.category_name}</p>
              </div>
              <div className="flex gap-2">
                {canManageInventory ? <button
                  type="button"
                  onClick={() => {
                    const item = selectedItem;
                    setSelectedItem(null);
                    openStockMovement(item, 'purchase');
                  }}
                  className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  Receive Stock
                </button> : null}
                {canManageInventory ? <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    openEditItem(selectedItem);
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Manage
                </button> : null}
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-5">
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stock Position</h4>
                <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total quantity</dt>
                    <dd className="mt-1 text-xl font-semibold text-slate-950">{selectedItem.quantity}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Available</dt>
                    <dd className="mt-1 text-xl font-semibold text-emerald-700">{selectedItem.available_quantity}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reserved</dt>
                    <dd className="mt-1 text-xl font-semibold text-blue-700">{selectedItem.reserved_quantity || 0}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Minimum stock</dt>
                    <dd className="mt-1 text-xl font-semibold text-slate-950">{selectedItem.minimum_stock}</dd>
                  </div>
                </dl>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ticket Reservations</h4>
                    <p className="mt-1 text-sm text-slate-500">See which service jobs are holding this stock.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadItemReservations(selectedItem.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  {reservationLoading ? (
                    <TableSkeleton rows={3} columns={3} compact />
                  ) : itemReservations.length === 0 ? (
                    <div className="px-4 py-5 text-sm text-slate-500">No ticket reservations for this item.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {itemReservations.map((reservation) => (
                        <div key={reservation.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_120px_120px] sm:items-center">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900">{reservation.ticket_code || formatTicketId(reservation.service_ticket)}</div>
                            <div className="text-xs font-medium text-brand-700">{reservation.reservation_code || formatReservationId(reservation.id)}</div>
                            <div className="truncate text-xs text-slate-500">{reservation.technician_name || 'Unassigned technician'}</div>
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">Qty {reservation.quantity}</div>
                            <div className="text-xs text-slate-500">Needed {reservation.required_date ? new Date(`${reservation.required_date}T00:00:00`).toLocaleDateString() : '-'}</div>
                          </div>
                          <div className="sm:text-right"><StatusBadge status={reservation.status} size="sm" /></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Item Details</h4>
                <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Category</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{selectedItem.category_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">SKU</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedItem.sku || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Brand / Model</dt>
                    <dd className="mt-1 text-sm text-slate-700">{[selectedItem.brand, selectedItem.model].filter(Boolean).join(' / ') || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Size</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedItem.size || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">UOM</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedItem.unit_of_measurement || 'piece'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Capacity</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedItem.capacity || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Item type</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatStatusLabel(selectedItem.item_type)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stock state</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatStatusLabel(selectedItem.stock_status)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Warehouse</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedItem.warehouse_location || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Supplier</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedItem.supplier || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Unit Price</dt>
                    <dd className="mt-1 text-sm text-slate-700">₱{Number(selectedItem.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Value</dt>
                    <dd className="mt-1 text-sm font-medium text-emerald-700">₱{Number(selectedItem.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Last updated</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatDateTime(selectedItem.updated_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatStatusLabel(selectedItem.status)}</dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Description / notes</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{[selectedItem.description, selectedItem.notes].filter(Boolean).join('\n') || '-'}</dd>
                  </div>
                </dl>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stock Movement History</h4>
                  <button
                    type="button"
                    onClick={() => loadItemTransactions(selectedItem.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Refresh History
                  </button>
                </div>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  {transactionLoading ? (
                    <TableSkeleton rows={4} columns={4} compact />
                  ) : itemTransactions.length === 0 ? (
                    <div className="px-4 py-5 text-sm text-slate-500">No stock movements recorded yet.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {itemTransactions.map((transaction) => (
                        <div key={transaction.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[150px_90px_1fr_150px] sm:items-center">
                          <div>
                             <div className="font-semibold text-slate-900">{formatStatusLabel(transaction.transaction_type)}</div>
                             <div className="text-xs font-medium text-brand-700">{transaction.transaction_code || formatTransactionId(transaction.id)}</div>
                            <div className="text-xs text-slate-500">{formatDateTime(transaction.transaction_date)}</div>
                          </div>
                          <div className="font-semibold text-slate-900">Qty {transaction.quantity}</div>
                          <div className="text-slate-600">
                            <div>{transaction.notes || '-'}</div>
                            {transaction.reference_number ? (
                              <div className="mt-1 text-xs text-slate-500">Reference: {transaction.reference_number}</div>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-500 sm:text-right">
                            {transaction.performed_by_name ? `By ${transaction.performed_by_name}` : 'System'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {adjustTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          onClick={() => setAdjustTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Stock movement for ${adjustTarget.name}`}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Stock Movement</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{adjustTarget.name}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Available {adjustTarget.available_quantity} · Reserved {adjustTarget.reserved_quantity || 0} · Total {adjustTarget.quantity}
              </p>
            </div>

            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Action</label>
                <select
                  value={adjustForm.transaction_type}
                  onChange={(event) => setAdjustForm({ ...adjustForm, transaction_type: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {STOCK_ACTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {adjustForm.transaction_type === 'adjustment' ? 'New total quantity' : 'Quantity'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={adjustForm.quantity}
                  onChange={(event) => setAdjustForm({ ...adjustForm, quantity: parseIntegerInput(event.target.value, 0) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="stock-movement-reference" className="mb-1 block text-sm font-medium text-slate-700">
                  Reference number <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="stock-movement-reference"
                  type="text"
                  maxLength="50"
                  value={adjustForm.reference_number}
                  onChange={(event) => setAdjustForm({ ...adjustForm, reference_number: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Delivery receipt, invoice, ticket, or return reference"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="stock-movement-notes" className="mb-1 block text-sm font-medium text-slate-700">Reason / notes <span className="text-red-600">*</span></label>
                <textarea
                  id="stock-movement-notes"
                  required
                  value={adjustForm.notes}
                  onChange={(event) => setAdjustForm({ ...adjustForm, notes: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  rows="3"
                  placeholder="Example: Restocked from supplier, damaged item, manual count correction"
                />
              </div>
              {adjustForm.transaction_type === 'issue' ? (
                <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Normal job usage is deducted through ticket completion. Use manual deduction only for exceptional loss, damage, or an authorized correction.
                </div>
              ) : null}
              {adjustForm.transaction_type === 'return' ? (
                <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Completed-job equipment must use the technician submission and receiving verification flow. Use this action only for returns outside a service ticket.
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={adjustStock}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Save Movement
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewingReservationGroup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && closeReservationReview()}>
          <div role="dialog" aria-modal="true" aria-label={`Equipment request for ${reviewingReservationGroup.ticket_code || 'manual reservation'}`} className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Equipment Request</p>
                <h2 className="mt-0.5 text-base font-semibold text-slate-950">{reviewingReservationGroup.ticket_code || 'Manual reservation'} · {reviewingReservationGroup.service_name || 'Service ticket'}</h2>
              </div>
              <button type="button" onClick={closeReservationReview} disabled={reservationDecisionLoading} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Close</button>
            </div>

            <div className="px-4 py-3">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="grid grid-cols-[minmax(0,1fr)_55px_65px_110px] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>Item</span><span className="text-right">Qty</span><span className="text-right">Stock</span><span>Decision</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {reviewingReservationGroup.reservations.map((reservation) => {
                    const enoughStock = reservation.item_physical_quantity >= reservation.quantity;
                    return (
                      <div key={reservation.id} className="grid grid-cols-[minmax(0,1fr)_55px_65px_110px] items-center gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{reservation.item_name}</p>
                          <p className="truncate text-xs text-slate-500">{reservation.item_sku || reservation.reservation_code || formatReservationId(reservation.id)}</p>
                        </div>
                        <span className="text-right font-semibold text-slate-900">{reservation.quantity}</span>
                        <span className={`text-right font-semibold ${enoughStock ? 'text-emerald-700' : 'text-rose-700'}`}>{reservation.item_physical_quantity}</span>
                        <select
                          aria-label={`Decision for ${reservation.item_name}`}
                          value={reservationLineDecisions[reservation.id] || ''}
                          onChange={(event) => setReservationLineDecisions((current) => ({ ...current, [reservation.id]: event.target.value }))}
                          className={`rounded-md border px-2 py-1.5 text-xs font-semibold outline-none ${reservationLineDecisions[reservation.id] === 'reject' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
                        >
                          <option value="approve">Approve</option>
                          <option value="reject">Reject</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Approved lines are issued from physical stock. Rejected lines release their reserved quantity.</p>

              <div className="mt-3">
                <label htmlFor="equipment-decision-reason" className="text-xs font-semibold text-slate-700">
                  Rejection reason {Object.values(reservationLineDecisions).includes('reject') ? '(required)' : '(not needed)'}
                </label>
                {Object.values(reservationLineDecisions).includes('reject') ? (
                  <textarea
                    id="equipment-decision-reason"
                    value={reservationDecisionReason}
                    onChange={(event) => setReservationDecisionReason(event.target.value)}
                    rows={2}
                    maxLength={2000}
                    placeholder="Explain why the rejected item cannot be issued."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                ) : null}
                {error ? <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{error}</p> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-500">One result notification will be sent to the technician.</p>
              <button
                type="button"
                disabled={reservationDecisionLoading || (Object.values(reservationLineDecisions).includes('reject') && reservationDecisionReason.trim().length < 8)}
                onClick={submitReservationDecision}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiCheckCircle /> {reservationDecisionLoading ? 'Applying...' : 'Apply Decisions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          onClick={() => { setCategoryModalOpen(false); resetCategoryForm(); }}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Inventory Catalog</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">Manage Categories</h3>
                <p className="mt-1 text-sm text-slate-500">Create categories before assigning products to them.</p>
              </div>
              <button
                type="button"
                onClick={() => { setCategoryModalOpen(false); resetCategoryForm(); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-5 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                {categories.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500">No categories yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {categories.map((category) => (
                      <div key={category.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{category.name}</p>
                          <p className="text-xs text-slate-500">
                            {category.item_count} item{category.item_count === 1 ? '' : 's'}
                            {category.parent ? ` · Child of ${categories.find((entry) => entry.id === category.parent)?.name || 'category'}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => editCategory(category)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                          <button type="button" onClick={() => deleteCategory(category)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" title="Delete category"><FiTrash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-slate-900">{categoryForm.id ? 'Edit category' : 'New category'}</h4>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                  <input aria-label="Category name" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Parent category</label>
                  <select aria-label="Parent category" value={categoryForm.parent} onChange={(event) => setCategoryForm({ ...categoryForm, parent: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">None</option>
                    {categories.filter((category) => category.id !== categoryForm.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                  <textarea aria-label="Category description" rows="3" value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                <div className="flex justify-end gap-2">
                  {categoryForm.id ? <button type="button" onClick={resetCategoryForm} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Cancel edit</button> : null}
                  <button type="button" onClick={saveCategory} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600">{categoryForm.id ? 'Save' : 'Add Category'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {itemModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          onClick={() => resetEditor()}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Inventory</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">{adding ? 'Add Item' : 'Manage Item'}</h3>
              </div>
              <button
                type="button"
                onClick={() => resetEditor()}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Item name</label>
                <input
                  aria-label="Item name"
                  value={activeItem.name || ''}
                  onChange={(event) => updateActiveItem({ name: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Example: Cleaning kit"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">SKU</label>
                <input
                  aria-label="SKU"
                  value={activeItem.sku || ''}
                  onChange={(event) => updateActiveItem({ sku: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Required, e.g. SOLAR-PANEL-550W"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Brand</label>
                <input
                  value={activeItem.brand || ''}
                  onChange={(event) => updateActiveItem({ brand: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Model</label>
                <input
                  value={activeItem.model || ''}
                  onChange={(event) => updateActiveItem({ model: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Size</label>
                <input
                  value={activeItem.size || ''}
                  onChange={(event) => updateActiveItem({ size: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g. 6mm, 2.5hp, 10m"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Unit of Measurement</label>
                <input
                  aria-label="Unit of measurement"
                  list="inventory-unit-suggestions"
                  value={activeItem.unit_of_measurement || 'piece'}
                  onChange={(event) => updateActiveItem({ unit_of_measurement: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Type any unit"
                />
                <datalist id="inventory-unit-suggestions">
                  {UNIT_SUGGESTIONS.map((unit) => <option key={unit} value={unit} />)}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Capacity</label>
                <input
                  value={activeItem.capacity || ''}
                  onChange={(event) => updateActiveItem({ capacity: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g. 5kW, 1.5HP, 550W"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                <select
                  aria-label="Inventory category"
                  value={activeItem.category || ''}
                  onChange={(event) => updateActiveItem({ category: Number(event.target.value) || '' })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Item Type</label>
                <select
                  aria-label="Item type"
                  value={activeItem.item_type || 'equipment'}
                  onChange={(event) => updateActiveItem({ item_type: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {ITEM_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={activeItem.status || 'available'}
                  onChange={(event) => updateActiveItem({ status: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {adding ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Opening quantity</label>
                  <input
                    aria-label="Opening quantity"
                    type="number"
                    min="0"
                    value={activeItem.quantity}
                    onChange={(event) => updateActiveItem({ quantity: parseIntegerInput(event.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current quantity</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{activeItem.quantity}</p>
                  <p className="mt-1 text-xs text-slate-500">Use the Receive action or item details to record count changes with history.</p>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Minimum stock</label>
                <input
                  type="number"
                  min="0"
                  value={activeItem.minimum_stock}
                  onChange={(event) => updateActiveItem({ minimum_stock: parseIntegerInput(event.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Unit Price (₱)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={activeItem.unit_price}
                  onChange={(event) => updateActiveItem({ unit_price: event.target.value === '' ? '' : Number(event.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Low-stock threshold (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={activeItem.low_stock_threshold ?? 40}
                  onChange={(event) => updateActiveItem({ low_stock_threshold: parseIntegerInput(event.target.value, 40) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Warehouse location</label>
                <input value={activeItem.warehouse_location || ''} onChange={(event) => updateActiveItem({ warehouse_location: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Rack, room, or warehouse" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Supplier</label>
                <input value={activeItem.supplier || ''} onChange={(event) => updateActiveItem({ supplier: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Supplier contact</label>
                <input value={activeItem.supplier_contact || ''} onChange={(event) => updateActiveItem({ supplier_contact: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Purchase date</label>
                <input type="date" value={activeItem.purchase_date || ''} onChange={(event) => updateActiveItem({ purchase_date: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Warranty expiry</label>
                <input type="date" value={activeItem.warranty_expiry || ''} onChange={(event) => updateActiveItem({ warranty_expiry: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <textarea rows="3" value={activeItem.description || ''} onChange={(event) => updateActiveItem({ description: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Internal notes</label>
                <textarea rows="3" value={activeItem.notes || ''} onChange={(event) => updateActiveItem({ notes: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>

            {error ? <div className="mx-6 mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => resetEditor()}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={adding ? addItem : () => updateItem(editingId)}
                disabled={!activeItem.name?.trim() || !activeItem.sku?.trim() || !activeItem.category || !activeItem.unit_of_measurement?.trim()}
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {adding ? 'Add Item' : 'Save Details'}
              </button>
            </div>
          </div>
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
            <h3 className="text-lg font-semibold text-slate-950">Delete inventory item?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will remove <span className="font-semibold text-slate-900">{deleteTarget.name}</span> from the inventory list.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = deleteTarget.id;
                  setDeleteTarget(null);
                  await deleteItem(targetId);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {categoryPendingDelete ? (
        <ConfirmationDialog
          title={`Delete category "${categoryPendingDelete.name}"?`}
          message="Empty categories can be deleted. Categories that still contain items or subcategories must be reorganized first."
          tone="danger"
          icon="danger"
          confirmLabel="Delete category"
          onCancel={() => setCategoryPendingDelete(null)}
          onConfirm={confirmDeleteCategory}
        />
      ) : null}
    </Layout>
  );
}
