import { useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import { api, fetchAllPages, fetchInventorySummary } from '../../api/api';
import { FiAlertCircle, FiEye, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { hasAnyCapability, INVENTORY_MANAGE_CAPABILITIES } from '../../rbac';

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'in_use', label: 'In Use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'retired', label: 'Retired' }
];

const STOCK_ACTION_OPTIONS = [
  { value: 'purchase', label: 'Add stock' },
  { value: 'issue', label: 'Deduct stock' },
  { value: 'return', label: 'Return stock' },
  { value: 'adjustment', label: 'Set exact quantity' }
];

const buildDefaultItem = (categoryId = '') => ({
  name: '',
  sku: '',
  category: categoryId,
  brand: '',
  model: '',
  size: '',
  unit_of_measurement: 'piece',
  capacity: '',
  quantity: 0,
  minimum_stock: 10,
  status: 'available'
});

const extractList = (data) =>
  Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
const ITEMS_PER_PAGE = 15;

const normalizeCategory = (category) => ({
  id: category.id,
  name: category.name
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
  const canManageInventory = hasAnyCapability(user, INVENTORY_MANAGE_CAPABILITIES);
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
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
  const [adjustForm, setAdjustForm] = useState(buildDefaultStockAdjustment());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [inventorySummary, setInventorySummary] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]);

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

  const openItemDetails = async (item) => {
    setSelectedItem(item);
    await loadItemTransactions(item.id);
  };

  const loadCategories = async () => {
    let categoryList = (await fetchAllPages('/inventory/categories/')).map(normalizeCategory);

    if (categoryList.length === 0) {
      const created = await api.post('/inventory/categories/', {
        name: 'General',
        description: 'Default inventory category'
      });
      categoryList = [normalizeCategory(created.data)];
    }

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

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [categoryList, items, summary, lowStock] = await Promise.all([
        loadCategories(),
        loadInventory(),
        fetchInventorySummary(),
        loadLowStockItems()
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
    name: item.name,
    sku: item.sku,
    category: Number(item.category),
    brand: item.brand || '',
    model: item.model || '',
    size: item.size || '',
    unit_of_measurement: item.unit_of_measurement || 'piece',
    capacity: item.capacity || '',
    quantity: Number(item.quantity || 0),
    minimum_stock: Number(item.minimum_stock === '' ? 0 : item.minimum_stock),
    unit_price: Number(item.unit_price || 0),
    status: item.status
  });

  const buildUpdatePayload = (item) => ({
    name: item.name,
    sku: item.sku,
    category: Number(item.category),
    brand: item.brand || '',
    model: item.model || '',
    size: item.size || '',
    unit_of_measurement: item.unit_of_measurement || 'piece',
    capacity: item.capacity || '',
    minimum_stock: Number(item.minimum_stock === '' ? 0 : item.minimum_stock),
    unit_price: Number(item.unit_price || 0),
    status: item.status
  });

  const addItem = async () => {
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

  const adjustStock = async () => {
    if (!editingId) return;

    const stockTarget = editingItem;
    const quantity = Number(adjustForm.quantity || 0);
    if (quantity < 0 || (adjustForm.transaction_type !== 'adjustment' && quantity <= 0)) {
      setError('Stock quantity must be greater than zero.');
      return;
    }
    if (adjustForm.transaction_type === 'issue' && quantity > stockTarget.available_quantity) {
      setError(`Only ${stockTarget.available_quantity} unit(s) are available to deduct.`);
      return;
    }

    try {
      await api.post('/inventory/transactions/', {
        item: stockTarget.id,
        transaction_type: adjustForm.transaction_type,
        quantity,
        notes: adjustForm.notes || ''
      });
      setAdjustForm(buildDefaultStockAdjustment());
      setError('');
      await loadData();
      if (selectedItem?.id === stockTarget.id) {
        await loadItemTransactions(stockTarget.id);
      }
    } catch (adjustError) {
      setError(getApiErrorMessage(adjustError, 'Failed to adjust stock.'));
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
  const totalInventoryCount = inventorySummary?.totalItems ?? inventory.length;
  const lowStockCount = inventorySummary?.lowStockCount ?? lowStockItems.length;
  const hasInventoryFilters = Boolean(normalizedSearchTerm) || categoryFilter !== 'all' || statusFilter !== 'all';
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

  return (
    <Layout>
      <section className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex gap-2">
          {canManageInventory ? <button
            onClick={openAddItem}
            disabled={categoryMissing}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FiPlus size={16} /> Add Item
          </button> : null}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(150px,190px)_minmax(150px,190px)_auto] xl:items-end">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search Inventory</label>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Item name, SKU, category, or status"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Category</label>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {hasInventoryFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('all');
                setStatusFilter('all');
              }}
              className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 md:col-span-2 xl:col-span-1"
            >
              Clear
            </button>
          )}
        </div>
      </section>

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
          Inventory categories are required before items can be created.
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-900">
            Stock Overview ({filteredInventory.length}
            {filteredInventory.length !== totalInventoryCount ? ` of ${totalInventoryCount}` : ''} items)
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {normalizedSearchTerm
              ? `Showing matches for "${searchTerm.trim()}".`
              : `${lowStockCount} low-stock item${lowStockCount === 1 ? '' : 's'} need attention.`}
          </p>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1180px] table-fixed text-sm admin-inventory-table">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-[16%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Item
                </th>
                <th className="w-[11%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Category
                </th>
                <th className="w-[9%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  SKU
                </th>
                <th className="w-[12%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Specs
                </th>
                <th className="w-[7%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Qty
                </th>
                <th className="w-[7%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Available
                </th>
                <th className="w-[9%] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Low Stock
                </th>
                <th className="w-[9%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Price (PHP)
                </th>
                <th className="w-[7%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Min
                </th>
                <th className="w-[8%] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="w-[7%] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Updated
                </th>
                <th className="w-[8%] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-0 py-0">
                    <TableSkeleton rows={8} columns={12} compact />
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-8 py-6 text-slate-600">
                    {inventory.length === 0 ? 'No inventory items found.' : 'No inventory items match your search.'}
                  </td>
                </tr>
              ) : (
                paginatedInventory.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="truncate font-semibold text-slate-900" title={item.name}>{item.name}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600"><div className="truncate" title={item.category_name}>{item.category_name}</div></td>
                    <td className="px-3 py-2 text-sm text-slate-600"><div className="truncate" title={item.sku || '-'}>{item.sku || '-'}</div></td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      <div className="truncate" title={[item.brand, item.model, item.size, item.capacity].filter(Boolean).join(' / ') || '-'}>
                        {[item.brand, item.model, item.size, item.capacity].filter(Boolean).join(' / ') || '-'}
                      </div>
                      <div className="truncate text-slate-400">{item.unit_of_measurement || 'piece'}</div>
                    </td>
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
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{item.available_quantity}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        Number(item.available_quantity || 0) <= 0
                          ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                          : item.is_low_stock
                            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                            : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      }`}>
                        {Number(item.available_quantity || 0) <= 0 ? 'Out' : item.is_low_stock ? 'Low' : 'OK'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-600">
                      ₱{Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{item.minimum_stock}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={item.status} size="sm" />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-slate-500">
                      {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => openItemDetails(item)}
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                        title="Details"
                      >
                        <FiEye size={15} />
                      </button>
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

      {lowStockItems.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <h4 className="font-semibold">Low Stock Alert</h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {lowStockItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-sm">
                <div className="font-semibold text-amber-950">{item.name}</div>
                <div className="mt-1 text-xs text-amber-800">
                  Available: <span className="font-semibold">{item.available_quantity}</span>
                  <span className="mx-1.5 text-amber-400">/</span>
                  Min: <span className="font-semibold">{item.minimum_stock}</span>
                  {item.sku ? <span className="ml-2 text-amber-600">SKU {item.sku}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    openEditItem(selectedItem);
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Manage
                </button>
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
                            <div className="text-xs text-slate-500">{formatDateTime(transaction.transaction_date)}</div>
                          </div>
                          <div className="font-semibold text-slate-900">Qty {transaction.quantity}</div>
                          <div className="text-slate-600">{transaction.notes || '-'}</div>
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

      {false && (
        <div>
          <div>
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
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  value={adjustForm.notes}
                  onChange={(event) => setAdjustForm({ ...adjustForm, notes: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  rows="3"
                  placeholder="Example: Restocked from supplier, damaged item, manual count correction"
                />
              </div>
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
                  value={activeItem.name || ''}
                  onChange={(event) => updateActiveItem({ name: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Example: Cleaning kit"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">SKU</label>
                <input
                  value={activeItem.sku || ''}
                  onChange={(event) => updateActiveItem({ sku: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Optional"
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
                <select
                  value={activeItem.unit_of_measurement || 'piece'}
                  onChange={(event) => updateActiveItem({ unit_of_measurement: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="piece">Piece</option>
                  <option value="meter">Meter</option>
                  <option value="set">Set</option>
                  <option value="roll">Roll</option>
                  <option value="box">Box</option>
                  <option value="unit">Unit</option>
                </select>
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
                  <p className="mt-1 text-xs text-slate-500">Use Stock Movement below to change counts and keep history.</p>
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
            </div>

            {!adding && (
              <div className="border-t border-slate-100 px-6 py-5">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Stock Movement</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Available {activeItem.available_quantity} / Reserved {activeItem.reserved_quantity || 0} / Total {activeItem.quantity}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
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
                    <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                    <textarea
                      value={adjustForm.notes}
                      onChange={(event) => setAdjustForm({ ...adjustForm, notes: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      rows="3"
                      placeholder="Example: Restocked from supplier, damaged item, manual count correction"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={adjustStock}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Save Stock Movement
                  </button>
                </div>
              </div>
            )}

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
                disabled={!activeItem.name || !activeItem.category}
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
    </Layout>
  );
}
