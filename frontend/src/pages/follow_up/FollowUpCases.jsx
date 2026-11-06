import { useEffect, useMemo, useState } from 'react';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import { useSearchParams } from 'react-router-dom';
import { FiAlertCircle, FiCheckCircle, FiClock, FiUser } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import {
  createFollowUpCase,
  fetchFollowUpAssignees,
  fetchFollowUpCaseSummary,
  fetchFollowUpCases,
  fetchServiceTickets,
  updateFollowUpCase
} from '../../api/api';
import { formatTicketId, formatCaseId } from '../../utils/roleIds';
import { getLocalDateInputValue } from '../../utils/date';
import SearchFilterBar from '../../components/shared/SearchFilterBar';

const CASE_TYPE_OPTIONS = [
  { value: 'follow_up', label: 'Customer follow-up' },
  { value: 'maintenance', label: 'Maintenance reminder' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'warranty', label: 'Warranty concern' },
  { value: 'revisit', label: 'Revisit needed' },
  { value: 'feedback', label: 'Feedback' }
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open_work', label: 'Needs attention' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'open', label: 'New handoff' },
  { value: 'in_progress', label: 'Being handled' },
  { value: 'resolved', label: 'Done' },
  { value: 'closed', label: 'Closed' }
];

const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'completion_flow', label: 'From checklist' },
  { value: 'maintenance_alert', label: 'Maintenance reminder' },
  { value: 'manual', label: 'Manual entry' }
];

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const CASE_TYPE_VALUES = CASE_TYPE_OPTIONS.map((option) => option.value);
const PRIORITY_VALUES = PRIORITY_OPTIONS.map((option) => option.value);
const SOURCE_VALUES = SOURCE_FILTER_OPTIONS.map((option) => option.value).filter((value) => value !== 'all');
const PAGE_SIZE = 10;

const SOURCE_LABELS = {
  manual: 'Manual entry',
  completion_flow: 'From checklist',
  maintenance_alert: 'Maintenance reminder'
};

const emptyForm = {
  service_ticket: '',
  case_type: 'follow_up',
  priority: 'normal',
  summary: '',
  details: '',
  due_date: '',
  requires_revisit: false,
  assigned_to: ''
};

const formatDate = (value) => {
  if (!value) return 'No date';

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const formatCaseType = (value) => CASE_TYPE_LABELS[value] || String(value || '').replace('_', ' ');

const formatReadableValue = (value, fallback = '-') => {
  if (!value) return fallback;
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const TYPE_CHIP_CLASSES = {
  follow_up: 'bg-sky-50 text-sky-700 ring-sky-200',
  maintenance: 'bg-violet-50 text-violet-700 ring-violet-200',
  complaint: 'bg-rose-50 text-rose-700 ring-rose-200',
  warranty: 'bg-amber-50 text-amber-700 ring-amber-200',
  revisit: 'bg-orange-50 text-orange-700 ring-orange-200',
  feedback: 'bg-emerald-50 text-emerald-700 ring-emerald-200'
};

const SOURCE_CHIP_CLASSES = {
  completion_flow: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  maintenance_alert: 'bg-violet-50 text-violet-700 ring-violet-200',
  manual: 'bg-slate-100 text-slate-700 ring-slate-200'
};

const getCaseTitle = (caseItem) => {
  const summary = String(caseItem.summary || '').trim();
  const weakSummary = !summary || summary.length < 8 || /^[a-z]{1,4}$/i.test(summary);

  if (!weakSummary && /^scheduled maintenance is approaching/i.test(summary)) {
    return `Scheduled maintenance for ${caseItem.client_full_name || caseItem.client_name || 'client'}`;
  }

  if (!weakSummary) return summary;

  const typeLabel = formatCaseType(caseItem.case_type);
  const serviceName = caseItem.service_type_name || 'service';
  return `${typeLabel} case for ${serviceName}`;
};

const getContactLine = (caseItem) => (
  [caseItem.client_phone, caseItem.client_email].filter(Boolean).join(' / ') || 'No contact'
);

const getSourceLabel = (caseItem) => (
  caseItem.creation_source_label || SOURCE_LABELS[caseItem.creation_source] || 'Manual'
);

const isCaseOverdue = (caseItem) => {
  if (!['open', 'in_progress'].includes(caseItem.status)) return false;
  if (!caseItem.due_date) return false;
  return caseItem.due_date < getLocalDateInputValue();
};

const flattenSearchValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const getCaseSearchText = (caseItem) => [
  caseItem.id,
  caseItem.ticket_id,
  caseItem.summary,
  caseItem.details,
  caseItem.status,
  caseItem.priority,
  caseItem.case_type,
  formatCaseType(caseItem.case_type),
  caseItem.creation_source,
  getSourceLabel(caseItem),
  caseItem.client_name,
  caseItem.client_full_name,
  caseItem.client_email,
  caseItem.client_phone,
  caseItem.service_type_name,
  caseItem.service_address,
  caseItem.technician_name,
  caseItem.technician_full_name,
  caseItem.assigned_to_name,
  caseItem.assigned_to_full_name,
  caseItem.created_by_name
].map(flattenSearchValue).join(' ').toLowerCase();

const matchesCaseFilters = (caseItem, filters) => {
  if (filters.status === 'open_work' && !['open', 'in_progress'].includes(caseItem.status)) return false;
  if (filters.status === 'overdue' && !isCaseOverdue(caseItem)) return false;
  if (!['all', 'open_work', 'overdue'].includes(filters.status) && caseItem.status !== filters.status) return false;
  if (CASE_TYPE_VALUES.includes(filters.caseType) && caseItem.case_type !== filters.caseType) return false;
  if (PRIORITY_VALUES.includes(filters.priority) && caseItem.priority !== filters.priority) return false;
  if (SOURCE_VALUES.includes(filters.source) && caseItem.creation_source !== filters.source) return false;

  const search = String(filters.search || '').trim().toLowerCase();
  if (search && !getCaseSearchText(caseItem).includes(search)) return false;

  return true;
};

export default function FollowUpCases() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cases, setCases] = useState([]);
  const [totalCases, setTotalCases] = useState(0);
  const [caseSummary, setCaseSummary] = useState({});
  const [assignees, setAssignees] = useState([]);
  const [completedTickets, setCompletedTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  // Messages carry their tone; guessing from the word "Unable" showed some errors in green.
  const [message, setMessageState] = useState({ text: '', tone: 'success' });
  const setMessage = (text, tone = 'success') => setMessageState({ text: text || '', tone });
  const showError = (text) => setMessage(text, 'error');
  // Errors from an open dialog are shown inside it, not behind it.
  const [formError, setFormError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [statusDecision, setStatusDecision] = useState(null);
  const [statusNote, setStatusNote] = useState('');
  const [savingCase, setSavingCase] = useState(false);
  const statusFilter = searchParams.get('status') || 'all';
  const caseTypeFilter = searchParams.get('case_type') || 'all';
  const priorityFilter = searchParams.get('priority') || 'all';
  const sourceFilter = searchParams.get('source') || 'all';
  const appliedSearch = searchParams.get('search') || '';
  const requestedPage = Number(searchParams.get('page') || 1);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const [searchTerm, setSearchTerm] = useState(appliedSearch);
  const [form, setForm] = useState(emptyForm);

  const load = async ({ preserveMessage = false } = {}) => {
    const requestFilters = {};

    if (statusFilter !== 'all') requestFilters.status = statusFilter;
    if (CASE_TYPE_VALUES.includes(caseTypeFilter)) requestFilters.caseType = caseTypeFilter;
    if (PRIORITY_VALUES.includes(priorityFilter)) requestFilters.priority = priorityFilter;
    if (SOURCE_VALUES.includes(sourceFilter)) requestFilters.creationSource = sourceFilter;
    if (appliedSearch.trim()) requestFilters.search = appliedSearch.trim();
    requestFilters.ordering = statusFilter === 'overdue' ? 'due_date' : '-created_at';
    requestFilters.page = currentPage;

    setLoading(true);
    try {
      const [casePage, summaryData] = await Promise.all([
        fetchFollowUpCases(requestFilters),
        fetchFollowUpCaseSummary(requestFilters)
      ]);
      setCases(casePage.results);
      setTotalCases(casePage.count);
      setCaseSummary(summaryData);
      
      if (completedTickets.length === 0) {
        // Fetch tickets in background to avoid blocking the main view
        fetchServiceTickets({ workspace: 'after_sales' })
          .then(ticketList => {
            const eligibleTickets = ticketList.filter((ticket) => (
              ticket.status === 'completed' || ticket.status.startsWith('turned_over')
            ));
            setCompletedTickets(eligibleTickets);
            setForm((current) => ({
              ...current,
              service_ticket: current.service_ticket || eligibleTickets[0]?.id || ''
            }));
          })
          .catch(err => console.error('Failed to load tickets', err));
      }
      
      if (!preserveMessage) setMessage('');
    } catch (error) {
      setCases([]);
      showError(error.message || 'Unable to load after-sales cases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter, caseTypeFilter, priorityFilter, sourceFilter, appliedSearch, currentPage]);

  useEffect(() => {
    fetchFollowUpAssignees()
      .then(setAssignees)
      .catch((error) => showError(error.message || 'Unable to load after-sales case owners.'));
  }, []);

  useEffect(() => {
    setSearchTerm(appliedSearch);
  }, [appliedSearch]);

  useEffect(() => {
    const nextSearch = searchTerm.trim();
    if (nextSearch === appliedSearch) return undefined;

    const timeoutId = setTimeout(() => {
      updateFilter('search', nextSearch);
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, appliedSearch]);

  const updateFilter = (key, value) => {
    const nextParams = new URLSearchParams(searchParams);
    if (!value || value === 'all') {
      nextParams.delete(key);
    } else {
      nextParams.set(key, value);
    }
    if (key !== 'page') nextParams.delete('page');
    setSearchParams(nextParams);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const openCreateForm = () => {
    setFormError('');
    setConfirmDiscard(false);
    setForm((current) => ({ ...emptyForm, service_ticket: current.service_ticket || completedTickets[0]?.id || '' }));
    setShowCreateForm(true);
  };

  const formHasChanges = Boolean(form.summary.trim() || form.details.trim() || form.due_date || form.assigned_to
    || form.case_type !== emptyForm.case_type || form.priority !== emptyForm.priority || form.requires_revisit);

  const closeCreateForm = () => {
    setShowCreateForm(false);
    setConfirmDiscard(false);
    setFormError('');
  };

  // Backdrop, Escape, Close and Dismiss ask before throwing away a typed follow-up.
  const requestCloseCreateForm = () => {
    if (formHasChanges) {
      setConfirmDiscard(true);
      return;
    }
    closeCreateForm();
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || confirmDiscard) return;
      if (statusDecision && !savingCase) {
        setStatusDecision(null);
        setDialogError('');
      } else if (showCreateForm) requestCloseCreateForm();
      else if (selectedCase && !savingCase) {
        setSelectedCase(null);
        setDialogError('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  const createCase = async () => {
    setFormError('');
    try {
      const created = await createFollowUpCase({
        ...form,
        service_ticket: Number(form.service_ticket),
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        due_date: form.due_date || null
      });
      setMessage(`After-sales case created${created?.id ? `: ${formatCaseId(created.id)}` : ''}.`);
      setShowCreateForm(false);
      setForm({
        ...emptyForm,
        service_ticket: completedTickets[0]?.id || ''
      });
      await load({ preserveMessage: true });
    } catch (error) {
      setFormError(error.message || 'Unable to create after-sales case.');
    }
  };

  const STATUS_RESULT = { in_progress: 'is being handled', resolved: 'is marked as done', open: 'was reopened', closed: 'was closed' };

  const updateStatus = async (caseItem, status, note = '') => {
    setSavingCase(true);
    setDialogError('');
    try {
      const payload = { status, status_change_note: note };
      if (status === 'resolved' || status === 'closed') payload.resolution_notes = note;
      await updateFollowUpCase(caseItem.id, payload);
      setMessage(`After-sales case updated. ${formatCaseId(caseItem.id)} ${STATUS_RESULT[status] || 'was updated'}.`);
      setStatusDecision(null);
      setStatusNote('');
      setSelectedCase(null);
      await load({ preserveMessage: true });
    } catch (error) {
      if (statusDecision) setDialogError(error.message || 'Unable to update after-sales case.');
      else showError(error.message || 'Unable to update after-sales case.');
    } finally {
      setSavingCase(false);
    }
  };

  const requestStatusChange = (caseItem, status) => {
    if (status === 'in_progress') {
      updateStatus(caseItem, status);
      return;
    }
    setStatusDecision({ caseItem, status });
    setStatusNote('');
    setDialogError('');
  };

  const updateOwner = async (caseItem, assignedTo) => {
    setSavingCase(true);
    setDialogError('');
    try {
      const updatedCase = await updateFollowUpCase(caseItem.id, {
        assigned_to: assignedTo ? Number(assignedTo) : null,
        status_change_note: 'Case owner updated.'
      });
      setSelectedCase(updatedCase);
      setMessage(`Case owner updated for ${formatCaseId(caseItem.id)}: ${updatedCase?.assigned_to_full_name || 'Unassigned'}.`);
      // The change is saved; refreshing the list must not keep the dialog locked.
      setSavingCase(false);
      await load({ preserveMessage: true });
    } catch (error) {
      setDialogError(error.message || 'Unable to update the case owner.');
    } finally {
      setSavingCase(false);
    }
  };

  const activeFilters = useMemo(() => ({
    status: statusFilter,
    caseType: caseTypeFilter,
    priority: priorityFilter,
    source: sourceFilter,
    search: appliedSearch
  }), [statusFilter, caseTypeFilter, priorityFilter, sourceFilter, appliedSearch]);

  const visibleCases = useMemo(
    () => cases.filter((caseItem) => matchesCaseFilters(caseItem, activeFilters)),
    [cases, activeFilters]
  );


  const newHandoffs = Number(caseSummary.new_cases ?? visibleCases.filter((c) => c.status === 'open').length);
  const inProgressCases = Number(caseSummary.in_progress_cases ?? visibleCases.filter((c) => c.status === 'in_progress').length);
  const overdueCases = Number(caseSummary.overdue_cases ?? visibleCases.filter(isCaseOverdue).length);
  const resolvedCases = Number(caseSummary.resolved_cases ?? visibleCases.filter((c) => c.status === 'resolved').length);
  const totalPages = Math.max(1, Math.ceil(totalCases / PAGE_SIZE));

  return (
    <Layout>
      <section className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:max-w-md lg:justify-end">
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              + New Follow-Up
            </button>
          </div>
        </div>
      </section>

      {message.text && (
        <div
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mt-4 rounded-xl border p-4 text-sm ${
            message.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <section aria-label="After-sales summary" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'New Handoffs', value: caseSummary.new_cases ?? newHandoffs, icon: FiAlertCircle, status: 'open' },
          { label: 'Being Handled', value: inProgressCases, icon: FiClock, status: 'in_progress' },
          { label: 'Overdue', value: overdueCases, icon: FiAlertCircle, status: 'overdue' },
          { label: 'Done', value: resolvedCases, icon: FiCheckCircle, status: 'resolved' },
        ].map(({ label, value, icon: Icon, status }) => (
          <button
            key={label}
            type="button"
            onClick={() => updateFilter('status', status)}
            aria-pressed={statusFilter === status}
            className={`rounded-xl border bg-white p-5 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md ${statusFilter === status ? 'border-brand-400 ring-1 ring-brand-200' : 'border-slate-200'}`}
          >
            <span className="flex items-center justify-between">
              <span>
                <span className="block text-[13px] font-medium text-slate-500">{label}</span>
                <span className="mt-2 block text-3xl font-bold text-slate-900">{value}</span>
              </span>
              <Icon className="text-4xl text-slate-200" aria-hidden="true" />
            </span>
          </button>
        ))}
      </section>

      <SearchFilterBar
        className="mt-6"
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchLabel="Find a follow-up case"
        searchPlaceholder="Search customer, ticket, or issue"
        filters={[
          { key: 'status', label: 'Case status', value: statusFilter, defaultValue: 'all', onChange: (value) => updateFilter('status', value), options: STATUS_FILTER_OPTIONS },
          { key: 'reason', label: 'Follow-up reason', value: caseTypeFilter, defaultValue: 'all', onChange: (value) => updateFilter('case_type', value), options: [{ value: 'all', label: 'Any reason' }, ...CASE_TYPE_OPTIONS] },
          { key: 'urgency', label: 'Urgency', value: priorityFilter, defaultValue: 'all', onChange: (value) => updateFilter('priority', value), options: [{ value: 'all', label: 'Any urgency' }, ...PRIORITY_OPTIONS] },
          { key: 'source', label: 'Created from', value: sourceFilter, defaultValue: 'all', onChange: (value) => updateFilter('source', value), options: SOURCE_FILTER_OPTIONS },
        ]}
        onClear={clearFilters}
      />

      {/* Cases Table/Cards Section */}
      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white p-0 shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Cases ({totalCases})</h2>
            <span className="text-sm text-slate-500">{loading ? 'Loading...' : `${visibleCases.length} shown`}</span>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : visibleCases.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No follow-ups found.
          </div>
        ) : (
          <>
            {/* Mobile Cards View */}
            <div className="md:hidden">
              <div className="divide-y divide-slate-200">
                {visibleCases.map((caseItem) => (
                  <div key={caseItem.id} className="p-4 hover:bg-slate-50">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Follow-up {formatCaseId(caseItem.id)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TYPE_CHIP_CLASSES[caseItem.case_type] || TYPE_CHIP_CLASSES.follow_up}`}>
                            {formatCaseType(caseItem.case_type)}
                          </span>
                        </div>
                        <div className="mt-1 font-semibold text-slate-950">{getCaseTitle(caseItem)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatTicketId(caseItem.ticket_id)} / {caseItem.service_type_name || 'Service'}
                        </div>
                      </div>
                      <StatusBadge status={caseItem.status} size="sm" />
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                          <span className="text-xs text-slate-500">Customer</span>
                        <div className="font-medium text-slate-800">{caseItem.client_full_name || caseItem.client_name || 'Client'}</div>
                        <div className="truncate text-xs text-slate-500">{getContactLine(caseItem)}</div>
                      </div>
                      <div>
                          <span className="text-xs text-slate-500">Case owner</span>
                        <div className="font-medium text-slate-800">{caseItem.assigned_to_full_name || 'Unassigned'}</div>
                      </div>
                      <div>
                          <span className="text-xs text-slate-500">Created from</span>
                        <div className="font-medium text-slate-700">{getSourceLabel(caseItem)}</div>
                      </div>
                      <div>
                          <span className="text-xs text-slate-500">Follow up by</span>
                        <div className="font-medium text-slate-700">{formatDate(caseItem.due_date)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => { setDialogError(''); setSelectedCase(caseItem); }}
                        aria-label={`Details for ${formatCaseId(caseItem.id)}`}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Details
                      </button>
                      {caseItem.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => requestStatusChange(caseItem, 'in_progress')}
                          aria-label={`Start work on ${formatCaseId(caseItem.id)}`}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Start work
                        </button>
                      )}
                      {caseItem.status !== 'resolved' && caseItem.status !== 'closed' && (
                        <button
                          type="button"
                          onClick={() => requestStatusChange(caseItem, 'resolved')}
                          aria-label={`Mark as Done: ${formatCaseId(caseItem.id)}`}
                          className="rounded-lg bg-emerald-500 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600"
                        >
                          Mark as Done
                        </button>
                      )}
                      {(caseItem.status === 'resolved' || caseItem.status === 'closed') && (
                        <button
                          type="button"
                          onClick={() => requestStatusChange(caseItem, 'open')}
                          aria-label={`Reopen ${formatCaseId(caseItem.id)}`}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden max-h-[68vh] overflow-auto md:block">
              <table className="min-w-[1120px] table-fixed border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-28 border-b border-slate-200 px-4 py-3">Case ID</th>
                    <th className="w-80 border-b border-slate-200 px-4 py-3">Follow-Up</th>
                    <th className="w-64 border-b border-slate-200 px-4 py-3">Customer</th>
                    <th className="w-52 border-b border-slate-200 px-4 py-3">Case Owner</th>
                    <th className="w-56 border-b border-slate-200 px-4 py-3">Progress</th>
                    <th className="w-48 border-b border-slate-200 px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCases.map((caseItem) => (
                    <tr key={caseItem.id} className="bg-white transition hover:bg-brand-50/40">
                      <td className="border-b border-slate-100 px-4 py-3 align-middle font-semibold text-brand-700">{formatCaseId(caseItem.id)}</td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle">
                        <div className="min-w-0">
                          <div className="line-clamp-2 font-semibold leading-5 text-slate-950">{getCaseTitle(caseItem)}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {formatTicketId(caseItem.ticket_id)} / {caseItem.service_type_name || 'Service'}
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle">
                        <div className="truncate font-medium text-slate-900">
                          {caseItem.client_full_name || caseItem.client_name || 'Client'}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">{getContactLine(caseItem)}</div>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle">
                        {caseItem.assigned_to_full_name ? (
                          <div className="truncate font-medium text-slate-900">{caseItem.assigned_to_full_name}</div>
                        ) : (
                          <div className="text-sm text-slate-400">Unassigned</div>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TYPE_CHIP_CLASSES[caseItem.case_type] || TYPE_CHIP_CLASSES.follow_up}`}>
                            {formatCaseType(caseItem.case_type)}
                          </span>
                          <StatusBadge status={caseItem.status} size="sm" />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${SOURCE_CHIP_CLASSES[caseItem.creation_source] || SOURCE_CHIP_CLASSES.manual}`}>
                            {getSourceLabel(caseItem)}
                          </span>
                          <span className="text-slate-500">{formatDate(caseItem.due_date)}</span>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 align-middle text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => { setDialogError(''); setSelectedCase(caseItem); }}
                            aria-label={`Details for ${formatCaseId(caseItem.id)}`}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Details
                          </button>
                          {caseItem.status === 'open' && (
                            <button
                              type="button"
                          onClick={() => requestStatusChange(caseItem, 'in_progress')}
                          aria-label={`Start work on ${formatCaseId(caseItem.id)}`}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Start work
                            </button>
                          )}
                          {caseItem.status !== 'resolved' && caseItem.status !== 'closed' && (
                            <button
                              type="button"
                          onClick={() => requestStatusChange(caseItem, 'resolved')}
                          aria-label={`Mark as Done: ${formatCaseId(caseItem.id)}`}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              Mark as Done
                            </button>
                          )}
                          {(caseItem.status === 'resolved' || caseItem.status === 'closed') && (
                            <button
                              type="button"
                          onClick={() => requestStatusChange(caseItem, 'open')}
                          aria-label={`Reopen ${formatCaseId(caseItem.id)}`}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm">
                <span className="text-slate-500">
                  Page {currentPage} of {totalPages} · {totalCases} cases
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateFilter('page', String(Math.max(1, currentPage - 1)))}
                    disabled={currentPage <= 1 || loading}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => updateFilter('page', String(Math.min(totalPages, currentPage + 1)))}
                    disabled={currentPage >= totalPages || loading}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {showCreateForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          onClick={requestCloseCreateForm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-follow-up-title"
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 id="new-follow-up-title" className="text-lg font-semibold text-slate-900">New Follow-Up</h3>
              </div>
              <button
                type="button"
                onClick={requestCloseCreateForm}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label htmlFor="follow-up-ticket" className="mb-1 block text-sm font-medium text-slate-700">Completed service ticket</label>
                <select
                  id="follow-up-ticket"
                  value={form.service_ticket}
                  onChange={(event) => setForm({ ...form, service_ticket: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {completedTickets.length > 0 ? (
                    completedTickets.map((ticket) => (
                      <option key={ticket.id} value={ticket.id}>{formatTicketId(ticket.id)} {ticket.client} - {ticket.service}</option>
                    ))
                  ) : (
                    <option value="">No completed tickets</option>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="follow-up-reason" className="mb-1 block text-sm font-medium text-slate-700">Reason</label>
                <select
                  id="follow-up-reason"
                  value={form.case_type}
                  onChange={(event) => setForm({ ...form, case_type: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {CASE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="follow-up-urgency" className="mb-1 block text-sm font-medium text-slate-700">Urgency</label>
                <select
                  id="follow-up-urgency"
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="follow-up-summary" className="mb-1 block text-sm font-medium text-slate-700">What needs attention</label>
                <input
                  id="follow-up-summary"
                  value={form.summary}
                  onChange={(event) => setForm({ ...form, summary: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Example: Client reported cooling issue after installation"
                />
              </div>
              <div>
                <label htmlFor="follow-up-due" className="mb-1 block text-sm font-medium text-slate-700">Follow up by</label>
                <input
                  type="date"
                  id="follow-up-due"
                  min={getLocalDateInputValue()}
                  value={form.due_date}
                  onChange={(event) => setForm({ ...form, due_date: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="follow-up-owner" className="mb-1 block text-sm font-medium text-slate-700">Case owner</label>
                <select
                  id="follow-up-owner"
                  value={form.assigned_to}
                  onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>{assignee.name} ({assignee.role})</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <label htmlFor="follow-up-notes" className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  id="follow-up-notes"
                  value={form.details}
                  onChange={(event) => setForm({ ...form, details: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  rows="3"
                  placeholder="Add contact notes, issue details, or promised action."
                />
              </div>
            </div>

            {formError ? (
              <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p>
            ) : null}
            <div className="sticky bottom-0 mt-5 flex justify-end gap-3 border-t border-slate-200 bg-white pt-4">
              <button
                type="button"
                onClick={requestCloseCreateForm}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={createCase}
                disabled={!form.service_ticket || !form.summary}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create Follow-Up
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedCase ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm"
          onClick={() => !savingCase && setSelectedCase(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="after-sales-case-title"
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{formatCaseId(selectedCase.id)}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TYPE_CHIP_CLASSES[selectedCase.case_type] || TYPE_CHIP_CLASSES.follow_up}`}>
                    {formatCaseType(selectedCase.case_type)}
                  </span>
                  <StatusBadge status={selectedCase.status} size="sm" />
                </div>
                <h3 id="after-sales-case-title" className="mt-3 text-lg font-semibold leading-6 text-slate-950">{getCaseTitle(selectedCase)}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {formatTicketId(selectedCase.ticket_id)} · {selectedCase.service_type_name || 'Service record'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCase(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-6 px-6 py-5">
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Follow-Up</h4>
                <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Summary</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-950">{selectedCase.summary || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Follow up by</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatDate(selectedCase.due_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Urgency</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatReadableValue(selectedCase.priority)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Source</dt>
                    <dd className="mt-1 text-sm text-slate-700">{getSourceLabel(selectedCase)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Created by</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedCase.created_by_name || 'System'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Updated</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatDate(selectedCase.updated_at)}</dd>
                  </div>
                </dl>
                <div className="mt-5 max-w-sm">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="after-sales-owner">
                    Case owner
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <FiUser className="shrink-0 text-slate-400" />
                    <select
                      id="after-sales-owner"
                      value={selectedCase.assigned_to || ''}
                      onChange={(event) => updateOwner(selectedCase, event.target.value)}
                      disabled={savingCase}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>{assignee.name} ({assignee.role})</option>
                      ))}
                    </select>
                  </div>
                  {dialogError ? <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{dialogError}</p> : null}
                </div>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Customer</h4>
                <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Name</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-950">{selectedCase.client_full_name || selectedCase.client_name || 'Client'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedCase.client_phone || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</dt>
                    <dd className="mt-1 break-words text-sm text-slate-700">{selectedCase.client_email || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Address</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedCase.service_address || '-'}</dd>
                  </div>
                </dl>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ticket</h4>
                <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket</dt>
                    <dd className="mt-1 text-sm font-semibold text-brand-700">{formatTicketId(selectedCase.ticket_id)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedCase.service_type_name || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Technician</dt>
                    <dd className="mt-1 text-sm text-slate-700">{selectedCase.technician_full_name || selectedCase.technician_name || 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Completed</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatDate(selectedCase.ticket_completed_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Warranty</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatReadableValue(selectedCase.ticket_warranty_status)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Warranty end</dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatDate(selectedCase.ticket_warranty_end_date)}</dd>
                  </div>
                </dl>
              </section>

              <section className="grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Notes</h4>
                  <div className="mt-3 min-h-20 whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                    {selectedCase.details || 'No notes added.'}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Resolution</h4>
                  <div className="mt-3 min-h-20 whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                    {selectedCase.resolution_notes || 'No resolution notes yet.'}
                  </div>
                </div>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Case Activity</h4>
                {selectedCase.events?.length ? (
                  <ol className="mt-4 space-y-3">
                    {selectedCase.events.map((event) => (
                      <li key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">{formatReadableValue(event.event_type)}</span>
                          <span className="text-xs text-slate-500">{formatDate(event.created_at)}</span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">{event.actor_name || 'System'}</p>
                        {(event.from_status || event.to_status) && (
                          <p className="mt-2 text-sm text-slate-700">
                            {event.from_status ? formatReadableValue(event.from_status) : 'Created'} → {formatReadableValue(event.to_status)}
                          </p>
                        )}
                        {event.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{event.notes}</p>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No case activity has been recorded yet.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {statusDecision ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => !savingCase && setStatusDecision(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-status-decision-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="case-status-decision-title" className="text-lg font-semibold text-slate-950">
              {statusDecision.status === 'open' ? 'Reopen case' : 'Resolve case'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {formatCaseId(statusDecision.caseItem.id)} · {getCaseTitle(statusDecision.caseItem)}
            </p>
            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-700">
                {statusDecision.status === 'open' ? 'Reason for reopening' : 'Resolution notes'}
              </span>
              <textarea
                value={statusNote}
                onChange={(event) => setStatusNote(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={statusDecision.status === 'open'
                  ? 'Explain what still needs attention.'
                  : 'Describe the action taken and outcome for the client.'}
                className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            {dialogError ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{dialogError}</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setStatusDecision(null); setDialogError(''); }}
                disabled={savingCase}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => updateStatus(statusDecision.caseItem, statusDecision.status, statusNote.trim())}
                disabled={!statusNote.trim() || savingCase}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingCase ? 'Saving...' : statusDecision.status === 'open' ? 'Reopen Case' : 'Resolve Case'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmDiscard ? (
        <ConfirmationDialog
          title="Discard this follow-up?"
          message="The follow-up you started has not been created."
          tone="warning"
          icon="warning"
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={closeCreateForm}
        />
      ) : null}
    </Layout>
  );
}
