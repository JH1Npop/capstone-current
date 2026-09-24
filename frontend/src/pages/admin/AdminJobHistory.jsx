import { useEffect, useRef, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import {
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClipboard,
  FiClock,
  FiDownload,
  FiEye,
  FiFileText,
  FiImage,
  FiMapPin,
  FiPackage,
  FiRotateCcw,
  FiStar,
  FiUser,
  FiX,
} from 'react-icons/fi';
import SearchFilterBar from '../../components/shared/SearchFilterBar';
import EquipmentReturnDialog from '../../components/shared/EquipmentReturnDialog';
import { useAuth } from '../../context/AuthContext';
import { downloadTicketDocument, fetchCompletedJobsHistory, fetchServiceTypes } from '../../api/api';
import { API_BASE_URL } from '../../api/core';
import { SUPERVISOR_DISPATCH_CAPABILITIES, hasAnyCapability } from '../../rbac';
import { formatTicketId } from '../../utils/roleIds';

const formatDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};


const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const isImageSource = (url = '') => {
  const value = String(url).toLowerCase();
  return (
    value.startsWith('data:image/')
    || /\.(apng|avif|gif|jpe?g|png|svg|webp)(\?.*)?$/.test(value)
  );
};

const resolveProofUrl = (url = '') => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;

  const mediaPath = value.startsWith('/')
    ? value
    : value.startsWith('media/')
      ? `/${value}`
      : value.startsWith('checklists/')
        ? `/media/${value}`
        : '';

  if (!mediaPath) return '';

  if (/^https?:\/\//i.test(API_BASE_URL)) {
    try {
      return new URL(mediaPath, API_BASE_URL).href;
    } catch {
      return mediaPath;
    }
  }

  return mediaPath;
};

const unavailableImage =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22480%22 height=%22288%22 viewBox=%220 0 480 288%22%3E%3Crect width=%22480%22 height=%22288%22 fill=%22%23f1f5f9%22/%3E%3Cpath d=%22M156 190h168l-49-62-37 45-25-31-57 48Z%22 fill=%22%23cbd5e1%22/%3E%3Ccircle cx=%22186%22 cy=%2296%22 r=%2222%22 fill=%22%23cbd5e1%22/%3E%3Ctext x=%22240%22 y=%22235%22 text-anchor=%22middle%22 font-family=%22Arial%2C sans-serif%22 font-size=%2218%22 fill=%22%2364758b%22%3EImage unavailable%3C/text%3E%3C/svg%3E';

const normalizeProofMedia = (items = [], fallbackType = 'photo') =>
  (Array.isArray(items) ? items : [])
    .map((item, index) => {
      if (!item) return null;

      if (typeof item === 'string') {
        return {
          id: `${fallbackType}-${index}`,
          type: fallbackType,
          name: `Proof ${index + 1}`,
          rawUrl: item,
          url: resolveProofUrl(item),
        };
      }

      const rawUrl = item.url || item.file || item.src || '';
      const url = resolveProofUrl(rawUrl);

      return {
        id: item.id || `${fallbackType}-${index}`,
        type: item.type || fallbackType,
        name: item.name || item.filename || `Proof ${index + 1}`,
        rawUrl,
        url,
      };
    })
    .filter(Boolean);

function ProofMediaGallery({ title, items, emptyText, onPreview }) {
  const mediaItems = normalizeProofMedia(items);

  if (!mediaItems.length) {
    return emptyText ? (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        {emptyText}
      </div>
    ) : null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h5 className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</h5>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          {mediaItems.length} file{mediaItems.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mediaItems.map((item) => {
          const canPreview = isImageSource(item.url);
          const content = (
            <>
              {canPreview ? (
                <img
                  src={item.url}
                  alt={item.name}
                  onError={(event) => {
                    event.currentTarget.src = unavailableImage;
                  }}
                  className="h-36 w-full bg-slate-100 object-cover transition group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-36 w-full flex-col items-center justify-center gap-2 bg-slate-100 px-4 text-center text-slate-400">
                  <FiFileText size={28} />
                  {!item.url ? (
                    <span className="text-xs font-medium text-slate-500">File path unavailable</span>
                  ) : null}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <span className="truncate font-medium text-slate-700">{item.name}</span>
                {item.url ? <FiEye className="shrink-0 text-slate-400" size={14} /> : null}
              </div>
            </>
          );

          if (!item.url) {
            return (
              <div
                key={`${item.id}-${item.rawUrl || item.name}`}
                className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              >
                {content}
              </div>
            );
          }

          return (
            <button
              key={`${item.id}-${item.url}`}
              type="button"
              onClick={() => onPreview?.(item)}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:border-brand-300 hover:bg-white"
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistDetail({ inspection, onPreviewProof }) {
  if (!inspection) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No inspection checklist was submitted for this job.
      </div>
    );
  }

  const boolBadge = (value, yesLabel = 'Yes', noLabel = 'No') =>
    value ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        <FiCheckCircle size={12} /> {yesLabel}
      </span>
    ) : (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{noLabel}</span>
    );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h5 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Site Assessment</h5>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Site Accessible</span>
            {boolBadge(inspection.site_accessible)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Electrical Available</span>
            {boolBadge(inspection.electrical_available)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Electrical Adequate</span>
            {boolBadge(inspection.electrical_adequate)}
          </div>
          {inspection.roof_condition ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Roof Condition</span>
              <span className="font-medium text-slate-800">{inspection.roof_condition}</span>
            </div>
          ) : null}
          {inspection.recommendation ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Recommendation</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  inspection.recommendation === 'Approved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : inspection.recommendation === 'Rejected'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                }`}
              >
                {inspection.recommendation}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h5 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Safety & Compliance</h5>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Safety Equipment</span>
            {boolBadge(inspection.safety_equipment_present, 'Present', 'Missing')}
          </div>
          {inspection.safety_hazards ? (
            <div>
              <span className="text-slate-600">Hazards</span>
              <p className="mt-1 rounded bg-red-50 p-2 text-xs text-red-700">{inspection.safety_hazards}</p>
            </div>
          ) : null}
          {inspection.structural_assessment ? (
            <div>
              <span className="text-slate-600">Structural</span>
              <p className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-600">{inspection.structural_assessment}</p>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Checklist Completed</span>
            {boolBadge(inspection.is_completed, 'Complete', 'Incomplete')}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h5 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Maintenance & Warranty</h5>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Maintenance Required</span>
            {boolBadge(inspection.maintenance_required)}
          </div>
          {inspection.maintenance_required && inspection.maintenance_profile ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Profile</span>
              <span className="font-medium capitalize text-slate-800">{inspection.maintenance_profile.replace('_', ' ')}</span>
            </div>
          ) : null}
          {inspection.maintenance_required && inspection.maintenance_interval_days ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Interval</span>
              <span className="font-medium text-slate-800">{inspection.maintenance_interval_days} days</span>
            </div>
          ) : null}
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Warranty Provided</span>
              {boolBadge(inspection.warranty_provided)}
            </div>
          </div>
          {inspection.warranty_provided && inspection.warranty_period_days ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Warranty Period</span>
              <span className="font-medium text-slate-800">{inspection.warranty_period_days} days</span>
            </div>
          ) : null}
        </div>
      </div>

      {inspection.follow_up_required ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 md:col-span-2 xl:col-span-3">
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-600">After-Sales Handoff</h5>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold capitalize text-amber-900">
              {(inspection.follow_up_case_type || '').replace('_', ' ')}
            </span>
            {inspection.follow_up_due_date ? (
              <span className="text-amber-800">Due: {formatDate(inspection.follow_up_due_date)}</span>
            ) : null}
          </div>
          {inspection.follow_up_summary ? (
            <p className="mt-2 text-sm text-amber-900">{inspection.follow_up_summary}</p>
          ) : null}
        </div>
      ) : null}

      {inspection.checklist_items?.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2 xl:col-span-3">
          <h5 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Completed Checklist Items</h5>
          <div className="grid gap-2 md:grid-cols-2">
            {inspection.checklist_items.map((item, index) => {
              const label = item.label || item.name || item.title || `Checklist item ${index + 1}`;
              const completed = Boolean(item.completed ?? item.done ?? item.checked);
              return (
                <div
                  key={`${label}-${index}`}
                  className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                >
                  {completed ? (
                    <FiCheckCircle className="mt-0.5 shrink-0 text-emerald-600" size={16} />
                  ) : (
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" />
                  )}
                  <span className={completed ? 'text-slate-700' : 'text-slate-500'}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {inspection.proof_media?.length > 0 ? (
        <div className="md:col-span-2 xl:col-span-3">
          <ProofMediaGallery title="Checklist Proof Media" items={inspection.proof_media} onPreview={onPreviewProof} />
        </div>
      ) : null}

      {inspection.additional_notes ? (
        <div className="md:col-span-2 xl:col-span-3">
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{inspection.additional_notes}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminJobHistory() {
  const { user } = useAuth();
  const canReconcileEquipment = hasAnyCapability(user, SUPERVISOR_DISPATCH_CAPABILITIES);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serviceTypes, setServiceTypes] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [detailsJobId, setDetailsJobId] = useState(null);
  const [sortField, setSortField] = useState('completed_date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [daysFilter, setDaysFilter] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [selectedProof, setSelectedProof] = useState(null);
  const [equipmentReturnJob, setEquipmentReturnJob] = useState(null);
  const [documentError, setDocumentError] = useState('');
  const [downloadingDocument, setDownloadingDocument] = useState('');
  const [exporting, setExporting] = useState(false);
  const searchTimeout = useRef(null);
  const hasLoadedOnce = useRef(false);

  const loadData = async () => {
    setLoading(true);

    try {
      const filters = {};
      if (daysFilter) filters.days = daysFilter;
      if (serviceTypeFilter) filters.serviceType = serviceTypeFilter;
      if (clientFilter) filters.client = clientFilter;
      if (technicianFilter) filters.technician = technicianFilter;
      if (search.trim()) filters.search = search.trim();
      filters.page = page;
      filters.pageSize = pageSize;
      filters.ordering = sortField;
      filters.direction = sortDirection;

      const result = await fetchCompletedJobsHistory(filters);
      setData(result);
      setError('');
    } catch (loadError) {
      setData(null);
      setError(loadError.message || 'Unable to load job history.');
    }

    setLoading(false);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    fetchServiceTypes().then(setServiceTypes).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, daysFilter, serviceTypeFilter, clientFilter, technicianFilter, page, pageSize, sortField, sortDirection]);

  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (!hasLoadedOnce.current) {
      hasLoadedOnce.current = true;
      loadData();
      return () => clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(() => {
      loadData();
    }, 400);

    return () => clearTimeout(searchTimeout.current);
  }, [search, daysFilter, serviceTypeFilter, clientFilter, technicianFilter]);

  const jobs = data?.results || [];

  const sortedJobs = jobs;
  const totalJobs = Number(data?.total || 0);
  const totalPages = Math.max(1, Number(data?.total_pages || 1));
  const currentPage = Math.min(Number(data?.page || page), totalPages);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const paginatedJobs = sortedJobs;
  const selectedJob = sortedJobs.find((job) => job.id === selectedJobId) || null;
  const detailsJob = sortedJobs.find((job) => job.id === detailsJobId) || null;
  const ratedJobsCount = Number(data?.rated_jobs || 0);
  const detailsRegisteredEquipment = Array.isArray(detailsJob?.installed_equipment)
    ? detailsJob.installed_equipment
    : [];
  const detailsReportEquipment = Array.isArray(detailsJob?.field_service_reports)
    ? detailsJob.field_service_reports.filter((report) => report.serial_number || report.brand_model)
    : [];
  const detailsEquipmentRecordCount = detailsRegisteredEquipment.length + detailsReportEquipment.length;
  const detailsProofCount = Array.isArray(detailsJob?.completion_proof_images)
    ? detailsJob.completion_proof_images.length
    : 0;
  const detailsLocation = detailsJob
    ? [detailsJob.address, detailsJob.city, detailsJob.province].filter(Boolean).join(', ') || 'No location recorded'
    : '';

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [currentPage, page]);

  useEffect(() => {
    if (!sortedJobs.length) {
      setSelectedJobId(null);
      return;
    }

    if (!selectedJobId || !sortedJobs.some((job) => job.id === selectedJobId)) {
      const firstJob = sortedJobs[0];
      setSelectedJobId(firstJob.id);
    }
  }, [selectedJobId, sortedJobs]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (equipmentReturnJob) return;
      setSelectedProof(null);
      setDetailsJobId(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [equipmentReturnJob]);

  const handleSort = (field) => {
    setPage(1);
    if (field === sortField) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortDirection(field === 'completed_date' || field === 'ticket_id' || field === 'client_rating' ? 'desc' : 'asc');
  };

  const handleRowClick = (job) => {
    setSelectedJobId(job.id);
  };

  const openJobDetails = (job) => {
    handleRowClick(job);
    setDocumentError('');
    setDetailsJobId(job.id);
  };

  const handleDocumentDownload = async (job, documentType, reportId = null) => {
    const actionKey = `${documentType}-${reportId || 'default'}`;
    setDownloadingDocument(actionKey);
    setDocumentError('');
    try {
      await downloadTicketDocument(job.ticket_id || job.id, documentType, { reportId });
    } catch (downloadError) {
      setDocumentError(downloadError.message || 'Unable to download this document.');
    } finally {
      setDownloadingDocument('');
    }
  };

  const handleExportCsv = async () => {
    if (!totalJobs || exporting) return;
    setExporting(true);
    setError('');

    let exportJobs = [];
    try {
      const commonFilters = {
        days: daysFilter,
        serviceType: serviceTypeFilter,
        client: clientFilter,
        technician: technicianFilter,
        search: search.trim(),
        pageSize: 100,
        ordering: sortField,
        direction: sortDirection,
      };
      const firstPage = await fetchCompletedJobsHistory({ ...commonFilters, page: 1 });
      exportJobs = [...(firstPage.results || [])];
      for (let exportPage = 2; exportPage <= Number(firstPage.total_pages || 1); exportPage += 1) {
        const nextPage = await fetchCompletedJobsHistory({ ...commonFilters, page: exportPage });
        exportJobs.push(...(nextPage.results || []));
      }
    } catch (exportError) {
      setError(exportError.message || 'Unable to export completed jobs.');
      setExporting(false);
      return;
    }

    const rows = [
      [
        'Ticket ID',
        'Completed Date',
        'Client',
        'Technician',
        'Service',
        'Priority',
        'Rating',
        'Client Feedback',
        'Address',
        'City',
        'Province',
        'Checklist',
        'Warranty',
        'Completion Notes',
      ].map(escapeCsvValue).join(','),
      ...exportJobs.map((job) => [
        job.ticket_id || job.id,
        job.completed_date || job.scheduled_date || '',
        job.client || '',
        job.technician || '',
        job.service_type || '',
        job.priority || '',
        job.client_rating ?? '',
        job.client_feedback || '',
        job.address || '',
        job.city || '',
        job.province || '',
        job.inspection ? 'Yes' : 'No',
        job.inspection?.warranty_provided ? 'Yes' : 'No',
        job.completion_notes || '',
      ].map(escapeCsvValue).join(',')),
    ];

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `completed-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    setExporting(false);
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <FiChevronDown className="text-slate-300" size={14} />;
    }

    return sortDirection === 'asc'
      ? <FiChevronUp className="text-slate-500" size={14} />
      : <FiChevronDown className="text-slate-500" size={14} />;
  };

  return (
    <Layout>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">Completed Jobs</p>
          <p className="mt-1.5 text-3xl font-bold text-slate-800">{data?.total ?? '-'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">Rated Jobs</p>
          <p className="mt-1.5 text-3xl font-bold text-blue-600">{ratedJobsCount}</p>
          <p className="mt-1 text-xs text-slate-500">with a client rating</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">Service Types</p>
          <p className="mt-1.5 text-3xl font-bold text-purple-600">{data?.service_types_served ?? '-'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">With Checklist</p>
          <p className="mt-1.5 text-3xl font-bold text-emerald-600">{data?.jobs_with_checklist ?? '-'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">With Warranty</p>
          <p className="mt-1.5 text-3xl font-bold text-amber-600">{data?.jobs_with_warranty ?? '-'}</p>
        </div>
      </section>

      <SearchFilterBar
        className="mt-5"
        searchValue={search}
        onSearchChange={setSearch}
        searchLabel="Find a completed job"
        searchPlaceholder="Search client, technician, address, or service"
        filters={[
          { key: 'period', label: 'Completed during', value: daysFilter, defaultValue: '', onChange: setDaysFilter, options: [
            { value: '', label: 'Any time' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' }, { value: '180', label: 'Last 6 months' }, { value: '365', label: 'Last year' },
          ] },
          { key: 'service', label: 'Service', value: serviceTypeFilter, defaultValue: '', onChange: setServiceTypeFilter, options: [{ value: '', label: 'Any service' }, ...serviceTypes.map((serviceType) => ({ value: String(serviceType.id), label: serviceType.name }))] },
          { key: 'client', label: 'Client', value: clientFilter, defaultValue: '', onChange: setClientFilter, options: [{ value: '', label: 'Any client' }, ...(data?.client_options || []).map((client) => ({ value: String(client.id), label: client.name }))] },
          { key: 'technician', label: 'Technician', value: technicianFilter, defaultValue: '', onChange: setTechnicianFilter, options: [{ value: '', label: 'Any technician' }, ...(data?.technician_options || []).map((technician) => ({ value: String(technician.id), label: technician.name }))] },
        ]}
        onClear={() => {
          setSearch('');
          setDaysFilter('');
          setServiceTypeFilter('');
          setClientFilter('');
          setTechnicianFilter('');
        }}
      />

      <section className="mt-6 space-y-5">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <FiFileText className="text-sky-500" /> Completed Jobs
                </h2>
                <p className="mt-1 text-sm text-slate-500">{totalJobs} record{totalJobs === 1 ? '' : 's'} shown</p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!totalJobs || exporting}
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiDownload className="mr-2" /> {exporting ? 'Preparing…' : 'Export CSV'}
              </button>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={8} columns={5} />
          ) : !totalJobs ? (
            <div className="px-6 py-16 text-center">
              <FiFileText className="mx-auto mb-4 text-slate-300" size={48} />
              <p className="text-lg font-semibold text-slate-600">No completed jobs found</p>
              <p className="mt-1 text-sm text-slate-400">Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:px-5">
                <div className="text-slate-600">
                  Showing <span className="font-semibold text-slate-900">{pageStartIndex + 1}-{Math.min(pageStartIndex + pageSize, totalJobs)}</span> of <span className="font-semibold text-slate-900">{totalJobs}</span> jobs
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-slate-500">
                    Rows
                    <select
                      value={pageSize}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    >
                      {[10, 25, 50, 100].map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="max-h-[68vh] overflow-auto">
                <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-[16%] border-b border-slate-200 px-3 py-3">
                        <button type="button" onClick={() => handleSort('ticket_id')} className="inline-flex items-center gap-1">
                          Ticket {renderSortIcon('ticket_id')}
                        </button>
                      </th>
                      <th className="w-[28%] border-b border-slate-200 px-3 py-3">
                        <button type="button" onClick={() => handleSort('client')} className="inline-flex items-center gap-1">
                          Customer & Service {renderSortIcon('client')}
                        </button>
                      </th>
                      <th className="w-[30%] border-b border-slate-200 px-3 py-3">
                        <button type="button" onClick={() => handleSort('technician')} className="inline-flex items-center gap-1">
                          Technician & Location {renderSortIcon('technician')}
                        </button>
                      </th>
                      <th className="w-[16%] border-b border-slate-200 px-3 py-3">
                        <button type="button" onClick={() => handleSort('client_rating')} className="inline-flex items-center gap-1">
                          Proof & Rating {renderSortIcon('client_rating')}
                        </button>
                      </th>
                      <th className="w-[10%] border-b border-slate-200 px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedJobs.map((job, index) => {
                      const isSelected = selectedJob?.id === job.id;

                      return (
                        <tr
                          key={job.id}
                          onClick={() => handleRowClick(job)}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? 'bg-brand-50/60'
                              : 'bg-white hover:bg-brand-50/40'
                          }`}
                        >
                          <td className="border-b border-slate-100 px-3 py-2 align-middle">
                            <div className="font-semibold text-brand-700">{formatTicketId(job.ticket_id)}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                              <FiClock className="text-slate-400" size={12} />
                              <span className="truncate">{formatDate(job.completed_date || job.scheduled_date)}</span>
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 align-middle">
                            <div className="truncate font-medium text-slate-900" title={job.client || ''}>{job.client}</div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-2">
                              <StatusBadge status={job.priority || 'low'} size="sm" />
                              <span className="truncate text-[11px] text-slate-600" title={job.service_type || ''}>{job.service_type}</span>
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 align-middle">
                            <div className="truncate font-medium text-slate-700" title={job.technician || ''}>{job.technician}</div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500" title={`${job.address || 'No address'}${job.city ? `, ${job.city}` : ''}`}>
                              {job.address || 'No address'}{job.city ? `, ${job.city}` : ''}
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 align-middle">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {job.inspection ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                  <FiCheckCircle size={11} /> Checklist
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">No checklist</span>
                              )}
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {job.client_rating ? `${job.client_rating}/5` : 'No rating'}
                              </span>
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 align-middle text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openJobDetails(job);
                                }}
                                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                title="View details"
                                aria-label="View job details"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm sm:px-5">
                <div className="text-slate-500">
                  Page <span className="font-semibold text-slate-900">{currentPage}</span> of <span className="font-semibold text-slate-900">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>

            </>
          )}
        </div>

      </section>

      {detailsJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6"
          onClick={() => setDetailsJobId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-job-history-details-title"
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={detailsJob.status || 'completed'} size="sm" />
                    <span className="font-mono text-xs font-semibold tracking-wide text-slate-500">{formatTicketId(detailsJob.ticket_id)}</span>
                  </div>
                  <h3 id="admin-job-history-details-title" className="mt-2 text-xl font-semibold text-slate-950">{detailsJob.service_type}</h3>
                  <p className="mt-1 max-w-3xl text-sm text-slate-600">{detailsLocation}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailsJobId(null)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                    aria-label="Close details"
                  >
                    <FiX size={17} />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  <FiClock size={13} className="text-emerald-600" />
                  Completed {formatDate(detailsJob.completed_date || detailsJob.scheduled_date)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  <FiPackage size={13} className="text-brand-600" />
                  {detailsEquipmentRecordCount} equipment record{detailsEquipmentRecordCount === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  <FiImage size={13} className="text-blue-600" />
                  {detailsProofCount} proof file{detailsProofCount === 1 ? '' : 's'}
                </span>
                {detailsJob.client_rating ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                    <FiStar size={13} />
                    Rating {detailsJob.client_rating}/5
                  </span>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-6 py-5">
              <div className="mb-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <FiClipboard className="text-brand-600" size={18} />
                    <h4 className="text-sm font-semibold text-slate-950">Ticket Summary</h4>
                  </div>
                  <dl className="grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket ID</dt>
                      <dd className="mt-1 font-semibold text-slate-900">{formatTicketId(detailsJob.ticket_id)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service</dt>
                      <dd className="mt-1 font-semibold text-slate-900">{detailsJob.service_type}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Priority</dt>
                      <dd className="mt-1"><StatusBadge status={detailsJob.priority || 'low'} size="sm" /></dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Completed Date</dt>
                      <dd className="mt-1 font-semibold text-emerald-700">{formatDateTime(detailsJob.completed_date || detailsJob.scheduled_date)}</dd>
                    </div>
                    <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Started</dt><dd className="mt-1 font-semibold text-slate-900">{formatDateTime(detailsJob.start_time)}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Finished</dt><dd className="mt-1 font-semibold text-slate-900">{formatDateTime(detailsJob.end_time)}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Actual Duration</dt><dd className="mt-1 font-semibold text-slate-900">{detailsJob.duration_minutes != null ? `${detailsJob.duration_minutes} minutes` : '-'}</dd></div>
                  </dl>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <FiUser className="text-brand-600" size={18} />
                    <h4 className="text-sm font-semibold text-slate-950">People</h4>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Client</p>
                      <p className="mt-1 font-semibold text-slate-900">{detailsJob.client || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Technician</p>
                      <p className="mt-1 font-semibold text-slate-900">{detailsJob.technician || 'Unassigned'}</p>
                    </div>
                  </div>
                </section>
              </div>

              <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FiMapPin className="text-brand-600" size={18} />
                  <h4 className="text-sm font-semibold text-slate-950">Service Location</h4>
                </div>
                <p className="text-sm font-semibold text-slate-900">{detailsJob.address || 'No address recorded'}</p>
                <p className="mt-1 text-sm text-slate-600">{[detailsJob.city, detailsJob.province].filter(Boolean).join(', ') || 'No city/province set'}</p>
              </section>

              {(detailsJob.completion_notes || detailsJob.client_feedback) && (
                <section className="mb-4 grid gap-4 lg:grid-cols-2">
                  {detailsJob.completion_notes ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h4 className="text-sm font-semibold text-slate-950">Completion Notes</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{detailsJob.completion_notes}</p>
                    </div>
                  ) : null}

                  {detailsJob.client_feedback ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h4 className="text-sm font-semibold text-slate-950">Client Feedback</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{detailsJob.client_feedback}</p>
                    </div>
                  ) : null}
                </section>
              )}

              <section className="mb-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-950">Assigned Team</h4>
                  <p className="mt-2 text-sm text-slate-700"><span className="font-semibold">Lead:</span> {detailsJob.technician || 'Unassigned'}</p>
                  <p className="mt-1 text-sm text-slate-700"><span className="font-semibold">Crew:</span> {detailsJob.crew_members?.length ? detailsJob.crew_members.map((member) => member.name).join(', ') : 'None'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-950">Materials Used / Reserved</h4>
                      <p className="mt-1 text-xs text-slate-500">Ticket-linked stock movements remain traceable in the inventory ledger.</p>
                    </div>
                    {canReconcileEquipment ? (
                      <button
                        type="button"
                        onClick={() => setEquipmentReturnJob(detailsJob)}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        <FiRotateCcw size={14} /> Review equipment returns
                      </button>
                    ) : null}
                  </div>
                  {detailsJob.inventory_reservations?.length ? (
                    <div className="mt-2 space-y-2">
                      {detailsJob.inventory_reservations.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          <span className="font-medium text-slate-900">{item.item_name} <span className="text-xs text-slate-500">{item.item_sku || ''}</span></span>
                          <span className="text-slate-600">×{item.quantity} · {String(item.status || '').replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-2 text-sm text-slate-500">No inventory records linked.</p>}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-950">Warranty</h4>
                  <p className="mt-2 text-sm text-slate-700">{String(detailsJob.warranty_status || 'not_applicable').replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-xs text-slate-500">{detailsJob.warranty_end_date ? `Coverage ends ${formatDate(detailsJob.warranty_end_date)}` : 'No warranty end date recorded'}</p>
                  {detailsJob.warranty_notes ? <p className="mt-2 text-sm text-slate-600">{detailsJob.warranty_notes}</p> : null}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-950">Maintenance</h4>
                  <p className="mt-2 text-sm text-slate-700">{detailsJob.maintenance_schedule?.next_due_date ? `Next due ${formatDate(detailsJob.maintenance_schedule.next_due_date)}` : 'Not scheduled'}</p>
                  {detailsJob.maintenance_schedule?.maintenance_notes ? <p className="mt-2 text-sm text-slate-600">{detailsJob.maintenance_schedule.maintenance_notes}</p> : null}
                </div>
              </section>

              <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-950">Official Documents</h4>
                    <p className="mt-1 text-xs text-slate-500">Download an operational document generated from this ticket's saved record.</p>
                  </div>
                </div>
                {documentError ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{documentError}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(detailsJob.generated_documents || []).map((document) => (
                    <button key={document.id} type="button" disabled={Boolean(downloadingDocument)} onClick={() => handleDocumentDownload(detailsJob, document.document_type)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {downloadingDocument === `${document.document_type}-default` ? 'Preparing…' : `Download ${document.title}`}
                    </button>
                  ))}
                  {(detailsJob.field_service_reports || []).map((report, index) => (
                    <button key={report.id} type="button" disabled={Boolean(downloadingDocument)} onClick={() => handleDocumentDownload(detailsJob, 'field_service_report', report.id)} className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                      {downloadingDocument === `field_service_report-${report.id}` ? 'Preparing…' : `Field Service Report ${index + 1}`}
                    </button>
                  ))}
                  {!detailsJob.generated_documents?.length && !detailsJob.field_service_reports?.length ? <p className="text-sm text-slate-500">No generated or field-service documents are linked.</p> : null}
                </div>
              </section>

              {detailsJob.timeline?.length ? (
                <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-950">Ticket Timeline</h4>
                  <ol className="mt-3 space-y-3">
                    {detailsJob.timeline.map((event) => (
                      <li key={event.id} className="border-l-2 border-brand-200 pl-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-900">{event.status}</span><time className="text-xs text-slate-500">{formatDateTime(event.timestamp)}</time></div>
                        <p className="mt-1 text-xs text-slate-500">{event.changed_by}{event.notes ? ` · ${event.notes}` : ''}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {detailsJob.field_service_reports?.length ? (
                <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-950">Field Service Report Details</h4>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {detailsJob.field_service_reports.map((report, index) => (
                      <article key={report.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-900">Report {index + 1}</p><span className="text-xs text-slate-500">{report.client_acknowledged ? 'Client acknowledged' : 'Awaiting acknowledgment'}</span></div>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div><dt className="text-slate-500">Voltage</dt><dd className="font-semibold text-slate-800">{report.voltage_reading || '-'}</dd></div>
                          <div><dt className="text-slate-500">Amperage</dt><dd className="font-semibold text-slate-800">{report.ampere_reading || '-'}</dd></div>
                          <div><dt className="text-slate-500">Indoor Temp.</dt><dd className="font-semibold text-slate-800">{report.indoor_temp || '-'}</dd></div>
                          <div><dt className="text-slate-500">Outdoor Temp.</dt><dd className="font-semibold text-slate-800">{report.outdoor_temp || '-'}</dd></div>
                        </dl>
                        {report.recommendation ? <p className="mt-3 text-sm text-slate-600"><span className="font-semibold">Recommendation:</span> {report.recommendation}</p> : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {detailsJob.after_sales_cases?.length ? (
                <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-950">After-Sales Cases</h4>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {detailsJob.after_sales_cases.map((caseItem) => (
                      <div key={caseItem.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{caseItem.summary}</p><StatusBadge status={caseItem.status} size="sm" /></div>
                        <p className="mt-1 text-xs text-slate-500">{String(caseItem.case_type || '').replace(/_/g, ' ')}{caseItem.due_date ? ` · Due ${formatDate(caseItem.due_date)}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
                      <FiPackage size={18} />
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-950">Equipment Installed</h4>
                      <p className="text-xs text-slate-500">Equipment and serial numbers linked to this completed job</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${detailsEquipmentRecordCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {detailsEquipmentRecordCount} record{detailsEquipmentRecordCount === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="p-4">
                  {detailsEquipmentRecordCount > 0 ? (
                    <div className="space-y-4">
                      {detailsRegisteredEquipment.length > 0 && (
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <h5 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Registered Equipment</h5>
                            <span className="text-xs font-medium text-slate-500">{detailsRegisteredEquipment.length} item{detailsRegisteredEquipment.length === 1 ? '' : 's'}</span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {detailsRegisteredEquipment.map((equipment) => (
                              <article key={`equipment-${equipment.id}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-950">{equipment.equipment_type || 'Equipment'}</p>
                                    <p className="mt-1 truncate text-slate-600">{equipment.brand_model || 'No brand/model recorded'}</p>
                                  </div>
                                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Linked</span>
                                </div>
                                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                  <div className="rounded-md bg-slate-50 p-2">
                                    <dt className="font-medium text-slate-500">Serial Number</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">{equipment.serial_number || '-'}</dd>
                                  </div>
                                  <div className="rounded-md bg-slate-50 p-2">
                                    <dt className="font-medium text-slate-500">Capacity</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">{equipment.capacity || '-'}</dd>
                                  </div>
                                  <div className="rounded-md bg-slate-50 p-2">
                                    <dt className="font-medium text-slate-500">Location</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">{equipment.location || '-'}</dd>
                                  </div>
                                  <div className="rounded-md bg-slate-50 p-2">
                                    <dt className="font-medium text-slate-500">Warranty</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">
                                      {equipment.warranty_end ? `Until ${formatDate(equipment.warranty_end)}` : '-'}
                                    </dd>
                                  </div>
                                </dl>
                              </article>
                            ))}
                          </div>
                        </div>
                      )}

                      {detailsReportEquipment.length > 0 && (
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <h5 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Field Report Equipment Notes</h5>
                            <span className="text-xs font-medium text-slate-500">{detailsReportEquipment.length} note{detailsReportEquipment.length === 1 ? '' : 's'}</span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {detailsReportEquipment.map((report) => (
                              <article key={`fsr-${report.id}`} className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-sky-950">{report.brand_model || 'Equipment noted in report'}</p>
                                    <p className="mt-1 text-xs text-sky-700">From Field Service Report</p>
                                  </div>
                                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-700">Report</span>
                                </div>
                                <div className="mt-3 rounded-md bg-white/70 p-2 text-xs">
                                  <p className="font-medium text-sky-700">Serial Number</p>
                                  <p className="mt-1 font-semibold text-sky-950">{report.serial_number || '-'}</p>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                      <FiPackage className="text-slate-300" size={34} />
                      <p className="mt-3 text-sm font-semibold text-slate-700">No equipment records linked</p>
                      <p className="mt-1 max-w-md text-sm text-slate-500">
                        This completed job has no registered equipment or serial-number notes from a field service report.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <ProofMediaGallery
                title="Completion Proof Images"
                items={detailsJob.completion_proof_images}
                onPreview={setSelectedProof}
              />

              <ChecklistDetail inspection={detailsJob.inspection} onPreviewProof={setSelectedProof} />
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
              <p className="text-xs text-slate-500">Read-only completed service record</p>
              <button type="button" onClick={() => setDetailsJobId(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Close details
              </button>
            </div>
          </div>
        </div>
      )}

      {equipmentReturnJob && (
        <EquipmentReturnDialog
          ticketId={equipmentReturnJob.ticket_id || equipmentReturnJob.id}
          mode="review"
          onClose={() => setEquipmentReturnJob(null)}
        />
      )}

      {selectedProof && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="admin-proof-title" className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h3 id="admin-proof-title" className="truncate text-lg font-bold text-slate-900">{selectedProof.name || 'Proof file'}</h3>
                <p className="text-sm text-slate-500">Preview proof file</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedProof.url && (
                  <a
                    href={selectedProof.url}
                    download
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                  >
                    <FiDownload size={15} /> Download
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedProof(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="bg-slate-950 p-4">
              {isImageSource(selectedProof.url) ? (
                <img
                  src={selectedProof.url}
                  alt={selectedProof.name || 'Proof file'}
                  onError={(event) => {
                    event.currentTarget.src = unavailableImage;
                  }}
                  className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
                />
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg bg-white text-center text-slate-500">
                  <FiFileText size={36} />
                  <p className="text-sm font-semibold text-slate-700">Preview is not available for this file type.</p>
                  <p className="text-xs text-slate-500">Use Download to open the file on your device.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
