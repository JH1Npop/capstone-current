import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import EquipmentReturnDialog from '../../components/shared/EquipmentReturnDialog';
import { fetchTechnicianHistory, fetchTicketTimeline } from '../../api/api';
import { FiDownload, FiEye, FiFileText, FiImage, FiMessageSquare, FiMoreHorizontal, FiRotateCcw, FiSearch, FiShield, FiStar, FiTool, FiX } from 'react-icons/fi';
import { formatTicketId } from '../../utils/roleIds';
import { API_BASE_URL } from '../../api/core';

const formatDate = (dateStr) =>
  dateStr ? new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : 'Not scheduled';

const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const formatStatusLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getProofImages = (job) =>
  job.completionProofImages || job.completion_proof_images || [];

const isVideoProof = (item) => (
  String(item?.type || '').toLowerCase() === 'video'
  || /\.(mp4|webm|ogg|mov)(?:$|[?#])/i.test(item?.url || '')
);

const resolveProofUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const mediaPath = raw.startsWith('/')
    ? raw
    : raw.startsWith('media/')
      ? `/${raw}`
      : raw.startsWith('checklists/')
        ? `/media/${raw}`
        : raw;

  if (/^https?:\/\//i.test(API_BASE_URL)) {
    try {
      return new URL(mediaPath, API_BASE_URL).href;
    } catch {
      return mediaPath;
    }
  }
  return mediaPath.startsWith('/') ? mediaPath : `/${mediaPath}`;
};

const getProofMedia = (job) => {
  const completionImages = getProofImages(job).map((item, index) => ({
    id: `completion-${index}`,
    name: `Completion proof ${index + 1}`,
    type: typeof item === 'object' ? item?.type || 'photo' : 'photo',
    url: resolveProofUrl(typeof item === 'string' ? item : item?.url || item?.file || item?.src),
  }));
  const checklistMedia = (job.inspection?.proof_media || []).map((item, index) => ({
    id: `checklist-${index}`,
    name: item?.name || item?.filename || `Checklist proof ${index + 1}`,
    type: typeof item === 'object' ? item?.type || 'photo' : 'photo',
    url: resolveProofUrl(typeof item === 'string' ? item : item?.url || item?.file || item?.src),
  }));
  return [...completionImages, ...checklistMedia].filter((item) => item.url);
};

const getChecklistItems = (job) =>
  Array.isArray(job.inspection?.checklist_items) ? job.inspection.checklist_items : [];

const getEquipmentSnapshot = (job) =>
  Array.isArray(job.inspection?.required_equipment_snapshot) ? job.inspection.required_equipment_snapshot : [];

const getEquipmentName = (item) => {
  if (typeof item === 'string') return item;
  return item?.name || item?.item_name || item?.itemName || item?.label || 'Equipment';
};

const DetailBlock = ({ label, value }) => (
  <div>
    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="text-sm font-medium text-slate-900">{value || '-'}</div>
  </div>
);

const buildHistoryReport = (job) => `AFN Technician Job Report
Ticket: ${formatTicketId(job.ticketId)}
Client: ${job.client?.full_name || job.client}
Service: ${job.service}
Completed: ${formatDate(job.completedDate || job.scheduledDate)}
Priority: ${job.priority || 'Normal'}
Address: ${job.address || 'Not provided'}
Lead Technician: ${job.leadTechnician || 'Unassigned'}
Crew: ${job.crewSummary || 'No crew assigned'}
Warranty: ${formatStatusLabel(job.warrantyStatus || job.warranty_status || 'not_applicable')}
  Next Maintenance: ${job.maintenanceSchedule?.next_due_date ? formatDate(job.maintenanceSchedule.next_due_date) : 'Not scheduled'}
Started: ${formatDateTime(job.startTime)}
Finished: ${formatDateTime(job.endTime)}
Actual Duration: ${job.durationMinutes != null ? `${job.durationMinutes} minutes` : 'Not recorded'}
Checklist Steps: ${getChecklistItems(job).length}
Proof Files: ${getProofMedia(job).length}

Notes:
${job.completionNotes || job.completion_notes || job.notes || 'No notes captured for this completed job.'}
`;

export default function TechnicianJobHistory() {
  const { user } = useAuth();
  const techName = user?.username || '';
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedJob, setSelectedJob] = useState(null);
  const [imageViewer, setImageViewer] = useState(null);
  const [selectedProof, setSelectedProof] = useState(null);
  const [timelineJob, setTimelineJob] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionJob, setActionJob] = useState(null);
  const [equipmentReturnJob, setEquipmentReturnJob] = useState(null);
  const loadSequence = useRef(0);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadHistory(), 350);
    return () => window.clearTimeout(timeout);
  }, [techName, searchTerm, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (equipmentReturnJob) return;
      setSelectedProof(null);
      setImageViewer(null);
      setActionJob(null);
      setSelectedJob(null);
      setTimelineJob(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [equipmentReturnJob]);

  const loadHistory = async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setHistory([]);
      setTotal(0);
      setTotalPages(1);
      setError('The From date cannot be later than the To date.');
      setLoading(false);
      return;
    }
    try {
      const data = await fetchTechnicianHistory(techName, {
        search: searchTerm.trim(), dateFrom, dateTo, page, pageSize,
      });
      if (sequence !== loadSequence.current) return;
      setHistory(data.results);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setError('');
      if (data.page !== page) setPage(data.page);
    } catch (loadError) {
      if (sequence !== loadSequence.current) return;
      setHistory([]);
      setTotal(0);
      setTotalPages(1);
      setError(loadError.message || 'Unable to load job history.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };

  const downloadHistoryReport = (job) => {
    const reportBlob = new Blob([buildHistoryReport(job)], { type: 'text/plain;charset=utf-8' });
    const reportUrl = URL.createObjectURL(reportBlob);
    const link = document.createElement('a');
    link.href = reportUrl;
    link.download = `ticket-${job.ticketId}-report.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(reportUrl);
  };

  const openTimeline = async (job) => {
    setTimelineJob(job);
    setTimelineEvents([]);
    setTimelineError('');
    setTimelineLoading(true);
    try {
      const events = await fetchTicketTimeline(job.ticketId || job.id);
      setTimelineEvents(events);
    } catch (loadError) {
      setTimelineError(loadError.message || 'Unable to load ticket timeline.');
    } finally {
      setTimelineLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mb-4">
        <p className="text-sm text-slate-500">Completed jobs, proof files, reports, and performance history.</p>
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
          <label className="relative block">
            <span className="sr-only">Search job history</span>
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }}
              placeholder="Search ticket, client, service, address"
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">From</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => { setDateFrom(event.target.value); setPage(1); }}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-16 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">To</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => { setDateTo(event.target.value); setPage(1); }}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-12 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          <p className="font-semibold">Job history could not be loaded.</p>
          <p className="mt-1">{error}</p>
          <button type="button" onClick={loadHistory} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold hover:bg-red-100">Try again</button>
        </div>
      ) : loading ? (
        <ListSkeleton rows={6} />
      ) : history.length === 0 && !searchTerm && !dateFrom && !dateTo ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <FiFileText className="mx-auto mb-6 h-16 w-16 text-slate-400" />
          <h3 className="mb-3 text-xl font-semibold text-slate-900">No completed jobs yet</h3>
          <p className="mx-auto mb-8 max-w-md text-slate-600">
            Your completed service history will appear here. Check My Jobs for current work.
          </p>
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          No completed jobs match the current filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Completed Jobs</h3>
              <p className="text-xs text-slate-500">Showing {history.length} of {total} completed job{total === 1 ? '' : 's'}.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Customer & Service</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Checklist / Proof</th>
                  <th className="px-4 py-3">Warranty / Maintenance</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((job) => {
                  const proofCount = getProofMedia(job).length;
                  const checklistCount = getChecklistItems(job).length;
                  return (
                    <tr
                      key={job.id}
                      className="border-t border-slate-100 align-top transition hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedJob(job)}
                          className="font-semibold text-brand-600 hover:text-brand-700"
                        >
                          {formatTicketId(job.ticketId)}
                        </button>
                        <div className="mt-1">
                          <StatusBadge status="completed" size="sm" />
                        </div>
                      </td>
                      <td className="min-w-[15rem] px-4 py-3">
                        <div className="font-semibold text-slate-900">{job.client?.full_name || job.client}</div>
                        <div className="mt-1 text-xs text-slate-500">{job.service}</div>
                        <div className="mt-1 line-clamp-1 text-xs text-slate-400">{job.address || 'No address recorded'}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatDate(job.completedDate || job.scheduledDate)}
                        {job.priority && (
                          <div className="mt-1">
                            <StatusBadge status={job.priority || 'normal'} size="sm" />
                          </div>
                        )}
                      </td>
                      <td className="min-w-[11rem] px-4 py-3 text-xs text-slate-600">
                        <div><span className="font-semibold text-slate-800">Lead:</span> {job.leadTechnician || 'Unassigned'}</div>
                        <div className="mt-1 line-clamp-2">
                          <span className="font-semibold text-slate-800">Crew:</span>{' '}
                          {job.crewMembers?.length ? job.crewMembers.map((member) => member.name).join(', ') : 'None'}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {checklistCount || 0} step{checklistCount === 1 ? '' : 's'}
                          </span>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            {proofCount} proof
                          </span>
                        </div>
                      </td>
                      <td className="min-w-[12rem] px-4 py-3 text-xs text-slate-600">
                        <div>
                          <span className="font-semibold text-slate-800">Warranty:</span>{' '}
                          {formatStatusLabel(job.warrantyStatus || job.warranty_status || 'not_applicable')}
                        </div>
                        <div className="mt-1">
                          <span className="font-semibold text-slate-800">Maintenance:</span>{' '}
                          {job.maintenanceSchedule?.next_due_date ? formatDate(job.maintenanceSchedule.next_due_date) : 'Not scheduled'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setActionJob(job)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                          title="Open actions"
                          aria-label={`Open actions for ${formatTicketId(job.ticketId)}`}
                        >
                          <FiMoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
            <label className="flex items-center gap-2 text-slate-500">
              Rows
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-700">
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Page {page} of {totalPages}</span>
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {actionJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="technician-job-actions-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 id="technician-job-actions-title" className="text-lg font-semibold text-slate-900">Job Actions</h3>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {formatTicketId(actionJob.ticketId)} - {actionJob.client?.full_name || actionJob.client}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionJob(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close actions"
              >
                <FiX size={18} />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedJob(actionJob);
                  setActionJob(null);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FiEye className="text-brand-500" size={17} />
                View details
              </button>
              <button
                type="button"
                onClick={() => {
                  openTimeline(actionJob);
                  setActionJob(null);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FiMessageSquare className="text-blue-500" size={17} />
                View timeline
              </button>
              {getProofMedia(actionJob).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setImageViewer(actionJob);
                    setActionJob(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FiImage className="text-emerald-500" size={17} />
                  View proof files
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  downloadHistoryReport(actionJob);
                  setActionJob(null);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FiDownload className="text-slate-500" size={17} />
                Download summary
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <div className="card p-5 md:col-span-2">
          <h4 className="mb-4 text-lg font-semibold text-slate-900">Performance Summary</h4>
          <p className="leading-relaxed text-slate-600">
            {history.length > 0
              ? `Completed ${total} jobs. Use the filters above to review a specific service record.`
              : 'Your performance metrics will appear here as you complete more jobs.'}
          </p>
        </div>
        <div className="card p-5">
          <h4 className="mb-4 text-center text-lg font-semibold">Total Jobs</h4>
          <div className="text-center text-3xl font-bold text-slate-900">{total}</div>
        </div>
      </div>

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="technician-job-details-title" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selectedJob.status || 'completed'} size="sm" />
                  <span className="font-mono text-xs font-semibold tracking-wide text-slate-500">{formatTicketId(selectedJob.ticketId)}</span>
                </div>
                <h3 id="technician-job-details-title" className="mt-2 truncate text-xl font-bold text-slate-900">{selectedJob.service}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Service record for {selectedJob.client?.full_name || selectedJob.client}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close details"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="space-y-4 bg-slate-50/60 p-5">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
                <DetailBlock label="Completed" value={formatDate(selectedJob.completedDate || selectedJob.scheduledDate)} />
                <DetailBlock label="Priority" value={selectedJob.priority || 'Normal'} />
                <DetailBlock label="Role" value={selectedJob.assignmentRole === 'crew' ? 'Crew Member' : 'Lead Technician'} />
                <DetailBlock label="Rating" value={selectedJob.clientRating ? `${selectedJob.clientRating}/5` : 'Not yet rated'} />
                <DetailBlock label="Started" value={formatDateTime(selectedJob.startTime)} />
                <DetailBlock label="Finished" value={formatDateTime(selectedJob.endTime)} />
                <DetailBlock label="Actual Duration" value={selectedJob.durationMinutes != null ? `${selectedJob.durationMinutes} minutes` : 'Not recorded'} />
                <div className="md:col-span-4">
                  <DetailBlock label="Address" value={selectedJob.address || 'No address recorded.'} />
                </div>
              </div>

              {(selectedJob.installedEquipment?.length || selectedJob.fieldServiceReports?.length || selectedJob.generatedDocuments?.length) ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Installed Equipment</div>
                    {selectedJob.installedEquipment?.length ? selectedJob.installedEquipment.map((equipment) => (
                      <div key={equipment.id} className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm last:mb-0">
                        <p className="font-semibold text-slate-900">{equipment.equipment_type || 'Equipment'} · {equipment.brand_model || 'No model'}</p>
                        <p className="mt-1 text-xs text-slate-500">Serial: {equipment.serial_number || 'Not recorded'}</p>
                      </div>
                    )) : <p className="text-sm text-slate-500">No installed equipment linked.</p>}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Official Record References</div>
                    {selectedJob.fieldServiceReports?.map((report, index) => (
                      <div key={report.id} className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm last:mb-0">
                        <p className="font-semibold text-slate-900">Field Service Report {index + 1}{report.client_acknowledged ? ' · Client acknowledged' : ''}</p>
                        <p className="mt-1 text-xs text-slate-500">Voltage: {report.voltage_reading || '-'} · Amperage: {report.ampere_reading || '-'}</p>
                        {report.recommendation ? <p className="mt-1 text-xs text-slate-600">Recommendation: {report.recommendation}</p> : null}
                      </div>
                    ))}
                    {selectedJob.generatedDocuments?.map((document) => <p key={document.id} className="mt-1 text-sm text-slate-700">{document.title} · {formatStatusLabel(document.status)}</p>)}
                    {!selectedJob.fieldServiceReports?.length && !selectedJob.generatedDocuments?.length ? <p className="text-sm text-slate-500">No official documents linked.</p> : null}
                    <p className="mt-3 text-xs leading-5 text-slate-500">Official documents remain controlled by the office. The download below is a personal work-summary copy.</p>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Completion Notes</div>
                <div className="text-sm leading-6 text-slate-700">
                  {selectedJob.completionNotes || selectedJob.completion_notes || selectedJob.notes || 'No notes were captured for this completed job.'}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Team</div>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-[5rem_1fr] gap-3">
                      <span className="text-slate-500">Lead</span>
                      <span className="font-medium text-slate-900">{selectedJob.leadTechnician || 'Unassigned'}</span>
                    </div>
                    <div className="grid grid-cols-[5rem_1fr] gap-3">
                      <span className="text-slate-500">Crew</span>
                      <span className="text-slate-900">
                        {selectedJob.crewMembers?.length
                          ? selectedJob.crewMembers.map((member) => member.name).join(', ')
                          : 'No crew assigned'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Materials</div>
                    {selectedJob.assignmentRole !== 'crew' ? (
                      <button type="button" onClick={() => setEquipmentReturnJob(selectedJob)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                        <FiRotateCcw size={13} /> Submit return
                      </button>
                    ) : null}
                  </div>
                  {selectedJob.inventoryReservations?.length ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      {selectedJob.inventoryReservations.map((item) => (
                        <div key={item.id || `${item.itemName}-${item.quantity}`} className="grid grid-cols-[1fr_4rem] border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                          <span className="min-w-0 truncate font-medium text-slate-900">{item.itemName}</span>
                          <span className="text-right text-slate-500">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  ) : getEquipmentSnapshot(selectedJob).length ? (
                    <div className="flex flex-wrap gap-2">
                      {getEquipmentSnapshot(selectedJob).map((item, index) => (
                        <span key={`${getEquipmentName(item)}-${index}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {getEquipmentName(item)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No materials were recorded for this job.</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FiShield className="text-blue-500" /> Warranty
                  </div>
                  <p className="text-sm text-slate-700">
                    {formatStatusLabel(selectedJob.warrantyStatus || selectedJob.warranty_status || 'not_applicable')}
                  </p>
                  {(selectedJob.warrantyEndDate || selectedJob.warranty_end_date) && (
                    <p className="mt-1 text-xs text-slate-500">
                      Ends {formatDate(selectedJob.warrantyEndDate || selectedJob.warranty_end_date)}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FiTool className="text-emerald-500" /> Maintenance
                  </div>
                  <p className="text-sm text-slate-700">
                    {selectedJob.maintenanceSchedule?.next_due_date
                      ? formatDate(selectedJob.maintenanceSchedule.next_due_date)
                      : 'Not scheduled'}
                  </p>
                  {selectedJob.maintenanceSchedule?.status && (
                    <p className="mt-1 text-xs text-slate-500">
                      {formatStatusLabel(selectedJob.maintenanceSchedule.status)}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FiStar className="text-yellow-500" /> Client Rating
                  </div>
                  <p className="text-sm text-slate-700">
                    {selectedJob.clientRating ? `${selectedJob.clientRating}/5` : 'Not yet rated'}
                  </p>
                  {selectedJob.clientFeedback && (
                    <p className="mt-2 text-xs leading-5 text-slate-500">{selectedJob.clientFeedback}</p>
                  )}
                </div>
              </div>

              {(selectedJob.inspection || getProofMedia(selectedJob).length > 0) && (
              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                {selectedJob.inspection && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Checklist Steps</div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {selectedJob.inspection.is_completed ? 'Completed' : 'Not completed'}
                      </span>
                    </div>
                    {getChecklistItems(selectedJob).length ? (
                      <div className="space-y-2">
                        {getChecklistItems(selectedJob).map((item, index) => (
                          <div key={`${item.label || item.title || index}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="flex items-start justify-between gap-3 text-sm">
                              <span className="font-medium text-slate-900">{item.label || item.title || item.name || `Step ${index + 1}`}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                {item.completed ? 'Done' : 'Missing'}
                              </span>
                            </div>
                            {item.description && <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No individual checklist steps were saved for this job.</p>
                    )}
                    {selectedJob.inspection.additional_notes && (
                      <p className="mt-2 text-sm text-slate-600">{selectedJob.inspection.additional_notes}</p>
                    )}
                  </div>
                )}
                {getProofMedia(selectedJob).length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Proof Files</div>
                    <div className="grid grid-cols-2 gap-3">
                      {getProofMedia(selectedJob).slice(0, 6).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedProof(item)}
                          className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left"
                        >
                          {isVideoProof(item) ? (
                            <video src={item.url} preload="metadata" muted className="h-28 w-full object-cover" aria-label={item.name} />
                          ) : (
                            <img src={item.url} alt={item.name} className="h-28 w-full object-cover transition group-hover:scale-[1.02]" />
                          )}
                          <div className="truncate px-2 py-1.5 text-xs font-medium text-slate-600">{item.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedJob.afterSalesCases?.length > 0 && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FiMessageSquare className="text-blue-500" /> After-Sales Follow-Ups
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedJob.afterSalesCases.map((caseItem) => (
                    <div key={caseItem.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="font-medium text-slate-900">{caseItem.summary}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{formatStatusLabel(caseItem.case_type)}</span>
                        <StatusBadge status={caseItem.status} size="sm" />
                        {caseItem.due_date ? <span>Due {formatDate(caseItem.due_date)}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
              <p className="text-xs text-slate-500">Read-only completed service record</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSelectedJob(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Close details
                </button>
              <button
                type="button"
                onClick={() => downloadHistoryReport(selectedJob)}
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Download Work Summary
              </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {equipmentReturnJob && (
        <EquipmentReturnDialog
          ticketId={equipmentReturnJob.ticketId || equipmentReturnJob.id}
          mode="submit"
          onClose={() => setEquipmentReturnJob(null)}
        />
      )}

      {imageViewer && getProofMedia(imageViewer).length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="technician-proof-gallery-title" className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 id="technician-proof-gallery-title" className="text-2xl font-bold text-slate-900">Proof Files</h3>
                <p className="text-slate-600">
                  {formatTicketId(imageViewer.ticketId)} - {imageViewer.client?.full_name || imageViewer.client}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImageViewer(null);
                  setSelectedProof(null);
                }}
                className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {getProofMedia(imageViewer).map((image, idx) => (
                <button
                  key={image.id || idx}
                  type="button"
                  onClick={() => setSelectedProof(image)}
                  className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left"
                >
                  {isVideoProof(image) ? (
                    <video src={image.url} preload="metadata" muted className="h-48 w-full object-cover" aria-label={image.name || `Proof ${idx + 1}`} />
                  ) : (
                    <img
                      src={image.url}
                      alt={image.name || `Proof ${idx + 1}`}
                      className="h-48 w-full object-cover hover:scale-105 transition"
                    />
                  )}
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-slate-900 to-transparent p-3 opacity-0 hover:opacity-100 transition">
                    <span className="text-sm font-medium text-white">{image.name || `Image ${idx + 1}`}</span>
                  </div>
                </button>
              ))}
            </div>

            {(imageViewer.completionNotes || imageViewer.completion_notes) && (
              <div className="mt-6 rounded-xl border-l-4 border-blue-500 bg-blue-50 p-4">
                <h4 className="mb-2 font-semibold text-blue-900">Work Notes</h4>
                <p className="text-sm text-blue-800">
                  {imageViewer.completionNotes || imageViewer.completion_notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedProof && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="technician-proof-title" className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h3 id="technician-proof-title" className="truncate text-lg font-bold text-slate-900">{selectedProof.name || 'Proof image'}</h3>
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
              {isVideoProof(selectedProof) ? (
                <video src={selectedProof.url} controls className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg" />
              ) : (
                <img
                  src={selectedProof.url}
                  alt={selectedProof.name || 'Proof image'}
                  className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <TicketTimelineModal
        ticket={timelineJob}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => setTimelineJob(null)}
      />
    </Layout>
  );
}
