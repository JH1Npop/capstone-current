import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState, ErrorState } from '../../components/ui/StateDisplay';
import { FiCalendar, FiEye, FiImage, FiMapPin, FiMessageSquare, FiMoreHorizontal, FiStar, FiX } from 'react-icons/fi';
import StatusBadge from '../../components/ui/StatusBadge';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import SearchFilterBar from '../../components/shared/SearchFilterBar';
import { fetchClientRequests, fetchTicketTimeline } from '../../api/api';
import { clientTechnicianDisplayOrDash } from '../../utils/clientTechnicianDisplay';
import { API_BASE_URL } from '../../api/core';
import { formatRequestId, formatTicketId } from '../../utils/roleIds';

const ITEMS_PER_PAGE = 10;

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

const getProofImages = (service) =>
  service.completion_proof_images || service.completionProofImages || [];

const isVideoProof = (item) => (
  String(item?.type || '').toLowerCase() === 'video'
  || /\.(mp4|webm|ogg|mov)(?:$|[?#])/i.test(item?.url || '')
);

const getProofMedia = (service) => {
  const completionImages = getProofImages(service).map((item, index) => ({
    id: `completion-${index}`,
    name: `Completion proof ${index + 1}`,
    type: typeof item === 'object' ? item?.type || 'photo' : 'photo',
    url: resolveProofUrl(typeof item === 'string' ? item : item?.url || item?.file || item?.src),
  }));
  const checklistMedia = [
    ...(Array.isArray(service.proof_media) ? service.proof_media : []),
    ...(Array.isArray(service.inspection?.proof_media) ? service.inspection.proof_media : []),
  ].map((item, index) => ({
    id: `checklist-${index}`,
    name: item?.name || item?.filename || `Checklist proof ${index + 1}`,
    type: typeof item === 'object' ? item?.type || 'photo' : 'photo',
    url: resolveProofUrl(typeof item === 'string' ? item : item?.url || item?.file || item?.src),
  }));
  return [...completionImages, ...checklistMedia].filter((item) => item.url);
};

export default function ClientServiceHistory() {
  const [history, setHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, completed, rated, pending_rating
  const [sortBy, setSortBy] = useState('recent'); // recent, oldest, highest_rating
  const [currentPage, setCurrentPage] = useState(1);
  const [timelineService, setTimelineService] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [actionService, setActionService] = useState(null);
  const [imageViewer, setImageViewer] = useState(null);
  const [selectedProof, setSelectedProof] = useState(null);
  const navigate = useNavigate();
  // Only the newest timeline request may fill the timeline (a slow earlier one is ignored).
  const timelineSequence = useRef(0);

  // Escape closes only the top window: the photo, then the proof list, then the actions.
  useEffect(() => {
    if (!actionService && !imageViewer && !selectedProof) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (selectedProof) setSelectedProof(null);
      else if (imageViewer) setImageViewer(null);
      else setActionService(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [actionService, imageViewer, selectedProof]);

  useEffect(() => {
    loadServiceHistory();
  }, []);

  useEffect(() => {
    filterAndSortHistory();
  }, [history, searchTerm, filterType, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, sortBy]);

  const loadServiceHistory = async () => {
    setLoading(true);
    try {
      const data = await fetchClientRequests();
      // Filter to show completed services
      const completedServices = data.filter(req => req.status === 'completed');
      setHistory(completedServices);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load service history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortHistory = () => {
    const query = searchTerm.trim().toLowerCase();
    let filtered = [...history];

    if (query) {
      filtered = filtered.filter((service) => [
        service.ticket_id ? formatTicketId(service.ticket_id) : '',
        formatRequestId(service.id),
        service.service_type_name,
        service.service_type,
        service.description,
        service.address,
        clientTechnicianDisplayOrDash(service),
        service.warranty_status,
      ].filter(Boolean).join(' ').toLowerCase().includes(query));
    }

    // Apply filter
    if (filterType === 'rated') {
      filtered = filtered.filter(h => h.client_rating !== null && h.client_rating !== undefined);
    } else if (filterType === 'pending_rating') {
      filtered = filtered.filter(h => h.client_rating === null || h.client_rating === undefined);
    }

    // Apply sort
    if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.completed_date || 0) - new Date(b.completed_date || 0));
    } else if (sortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.completed_date || 0) - new Date(a.completed_date || 0));
    } else if (sortBy === 'highest_rating') {
      // Unrated services go last, not mixed in with low ratings.
      filtered.sort((a, b) => (b.client_rating ?? -1) - (a.client_rating ?? -1));
    }

    setFilteredHistory(filtered);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedHistory = filteredHistory.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const formatStatusLabel = (value) =>
    String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const getProofCount = (service) => getProofMedia(service).length;

  const openTimeline = async (service) => {
    if (!service.ticket_id) {
      return;
    }

    const sequence = ++timelineSequence.current;
    setTimelineService(service);
    setTimelineEvents([]);
    setTimelineError('');
    setTimelineLoading(true);
    try {
      const events = await fetchTicketTimeline(service.ticket_id);
      if (sequence === timelineSequence.current) setTimelineEvents(events);
    } catch (loadError) {
      if (sequence === timelineSequence.current) setTimelineError(loadError.message || 'Unable to load ticket timeline.');
    } finally {
      if (sequence === timelineSequence.current) setTimelineLoading(false);
    }
  };

  const ratedServices = history.filter((service) => service.client_rating != null);
  const averageRating = ratedServices.length
    ? (ratedServices.reduce((total, service) => total + Number(service.client_rating), 0) / ratedServices.length).toFixed(1)
    : null;
  const needRating = history.length - ratedServices.length;
  const openDetails = (service) => navigate(`/client/requests/${service.id}?entity=request`);

  if (loading) {
    return (
      <Layout>
        <div className="rounded-xl bg-white shadow-sm">
          <ListSkeleton rows={5} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {history.length > 0 ? (
          <dl aria-label="Your service summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed services</dt>
              <dd className="mt-1 text-2xl font-bold text-slate-900">{history.length}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your average rating</dt>
              <dd className="mt-1 flex items-baseline gap-1.5 text-2xl font-bold text-slate-900">
                {averageRating ? <><FiStar className="h-5 w-5 self-center fill-amber-400 text-amber-400" aria-hidden="true" />{averageRating}<span className="text-sm font-medium text-slate-500">/5</span></> : <span className="text-base font-semibold text-slate-500">No ratings yet</span>}
              </dd>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:col-span-1">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waiting for your rating</dt>
              <dd className="mt-1 flex items-center justify-between gap-2">
                <span className="text-2xl font-bold text-slate-900">{needRating}</span>
                {needRating > 0 ? (
                  <button type="button" onClick={() => setFilterType('pending_rating')} className="min-h-11 rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-100">
                    Show them
                  </button>
                ) : null}
              </dd>
            </div>
          </dl>
        ) : null}

        {error && (
          <ErrorState
            error={error}
            onRetry={loadServiceHistory}
          />
        )}

        <SearchFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchLabel="Find a completed service"
          searchPlaceholder="Search service, technician, address, or ticket"
          filters={[
            { key: 'rating', label: 'Rating status', value: filterType, defaultValue: 'all', onChange: setFilterType, options: [
              { value: 'all', label: 'Any rating status' }, { value: 'rated', label: 'Already rated' }, { value: 'pending_rating', label: 'Needs your rating' },
            ] },
            { key: 'sort', label: 'Sort order', value: sortBy, defaultValue: 'recent', onChange: setSortBy, options: [
              { value: 'recent', label: 'Most recent first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'highest_rating', label: 'Highest rated first' },
            ] },
          ]}
          onClear={() => {
            setSearchTerm('');
            setFilterType('all');
            setSortBy('recent');
          }}
        />

{/* Service History Table */}
{filteredHistory.length === 0 ? (
  <EmptyState
    title="No completed services found"
    description={searchTerm || filterType !== 'all' ? "Try adjusting your search criteria or filters." : "Completed jobs will appear here after service closeout."}
    onAction={searchTerm || filterType !== 'all' ? () => { setSearchTerm(''); setFilterType('all'); } : undefined}
    actionLabel={searchTerm || filterType !== 'all' ? "Clear filters" : undefined}
  />
) : (
  <>
    <div className="grid gap-3 md:hidden">
      {paginatedHistory.map((service) => (
        <article
          key={service.id}
          aria-label={service.service_type_name || service.service_type || 'Completed service'}
          className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">
                {service.service_type_name || service.service_type}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Technician: {clientTechnicianDisplayOrDash(service)}
              </p>
            </div>
            <StatusBadge status={service.warranty_status || 'not_applicable'} size="sm" />
          </div>

          {service.description && (
            <p className="mt-3 line-clamp-2 text-sm text-slate-600">{service.description}</p>
          )}

          <div className="mt-3 grid gap-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2">
              <FiCalendar className="h-4 w-4 text-brand-500" />
              {formatDate(service.completed_date)}
            </span>
            <span className="inline-flex items-center gap-2">
              <FiMapPin className="h-4 w-4 text-brand-500" />
              <span className="line-clamp-1">{service.address || '-'}</span>
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Proof: {getProofCount(service)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {service.client_rating ? <><FiStar size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" />{service.client_rating}/5</> : 'Not rated'}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openDetails(service)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <FiEye size={15} />
              {service.client_rating ? 'View details' : 'View and rate'}
            </button>
            <button
              type="button"
              onClick={() => setActionService(service)}
              aria-label={`More actions for ${service.service_type_name || service.service_type || 'this service'}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FiMoreHorizontal size={15} />
              More
            </button>
          </div>
        </article>
      ))}
    </div>

    <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="text-base font-semibold text-slate-900">Completed Services</h3>
        <p className="text-sm text-slate-500">
          {filteredHistory.length > ITEMS_PER_PAGE
            ? `Showing ${pageStartIndex + 1}–${Math.min(pageStartIndex + ITEMS_PER_PAGE, filteredHistory.length)} of ${filteredHistory.length} services`
            : `Showing ${filteredHistory.length} service${filteredHistory.length === 1 ? '' : 's'}`}
        </p>
      </div>
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-[28%] px-4 py-3">Service</th>
            <th className="w-[14%] px-4 py-3">Completed</th>
            <th className="w-[17%] px-4 py-3">Technician</th>
            <th className="w-[14%] px-4 py-3">Warranty</th>
            <th className="w-[10%] px-4 py-3">Rating</th>
            <th className="w-[9%] px-4 py-3">Proof</th>
            <th className="w-[8%] px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {paginatedHistory.map((service) => (
            <tr key={service.id} className="hover:bg-slate-50">
              <td className="px-4 py-4">
                <p className="truncate font-semibold text-slate-900" title={service.service_type_name || service.service_type}>
                  {service.service_type_name || service.service_type}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500" title={service.address || service.description || ''}>
                  {service.address || service.description || '-'}
                </p>
              </td>
              <td className="px-4 py-4 text-slate-700">{formatDate(service.completed_date)}</td>
              <td className="px-4 py-4">
                <span className="block truncate text-slate-700" title={clientTechnicianDisplayOrDash(service)}>
                  {clientTechnicianDisplayOrDash(service)}
                </span>
              </td>
              <td className="px-4 py-4">
                <StatusBadge status={service.warranty_status || 'not_applicable'} size="sm" />
                {service.warranty_end_date && (
                  <p className="mt-1 text-xs text-slate-500">{formatDate(service.warranty_end_date)}</p>
                )}
              </td>
              <td className="px-4 py-4">
                {service.client_rating ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                    <FiStar size={14} className="fill-yellow-400 text-yellow-400" />
                    {service.client_rating}/5
                  </span>
                ) : (
                  <button type="button" onClick={() => openDetails(service)} className="-my-2.5 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline" aria-label={`Rate ${service.service_type_name || service.service_type || 'this service'}`}>
                    <FiStar size={14} aria-hidden="true" /> Rate
                  </button>
                )}
              </td>
              <td className="px-4 py-4">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getProofCount(service) > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  {getProofCount(service)} proof{getProofCount(service) !== 1 ? 's' : ''}
                </span>
              </td>
              <td className="px-4 py-4 text-right">
                <button
                  type="button"
                  onClick={() => setActionService(service)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  title="Open actions"
                  aria-label={`More actions for ${service.service_type_name || service.service_type || 'this service'}`}
                >
                  <FiMoreHorizontal size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
)}
        {filteredHistory.length > ITEMS_PER_PAGE && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <span className="text-slate-500">
              Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + ITEMS_PER_PAGE, filteredHistory.length)} of {filteredHistory.length} services
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
              <span className="text-slate-500">Page {safeCurrentPage} of {totalPages}</span>
              <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
      {actionService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && setActionService(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="service-actions-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 id="service-actions-title" className="text-lg font-semibold text-slate-900">Service Actions</h3>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {actionService.service_type_name || actionService.service_type || 'Completed service'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionService(null)}
                className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close actions"
              >
                <FiX size={18} />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  navigate(`/client/requests/${actionService.id}?entity=request`);
                  setActionService(null);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FiEye className="text-brand-500" size={17} />
                View service details
              </button>
              {actionService.ticket_id && (
                <button
                  type="button"
                  onClick={() => {
                    openTimeline(actionService);
                    setActionService(null);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FiMessageSquare className="text-blue-500" size={17} />
                  View timeline
                </button>
              )}
              {getProofMedia(actionService).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setImageViewer(actionService);
                    setActionService(null);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FiImage className="text-emerald-500" size={17} />
                  View proof files
                </button>
              )}
              {!actionService.client_rating && (
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/client/requests/${actionService.id}?entity=request`);
                    setActionService(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-left text-sm font-semibold text-brand-700 hover:bg-brand-100"
                >
                  <FiStar size={17} />
                  Rate service
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {imageViewer && getProofMedia(imageViewer).length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && setImageViewer(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="proof-files-title" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 id="proof-files-title" className="text-2xl font-bold text-slate-900">Proof Files</h3>
                <p className="truncate text-slate-600">
                  {imageViewer.service_type_name || imageViewer.service_type || 'Completed service'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImageViewer(null);
                  setSelectedProof(null);
                }}
                className="min-h-11 rounded-lg bg-slate-100 px-4 py-2 text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {getProofMedia(imageViewer).map((image, index) => (
                <button
                  key={image.id || index}
                  type="button"
                  onClick={() => setSelectedProof(image)}
                  aria-label={`Preview ${image.name || `proof ${index + 1}`}`}
                  className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                >
                  {isVideoProof(image) ? (
                    <video src={image.url} preload="metadata" muted className="h-44 w-full object-cover" aria-label={image.name || `Proof ${index + 1}`} />
                  ) : (
                    <img
                      src={image.url}
                      alt={image.name || `Proof ${index + 1}`}
                      className="h-44 w-full object-cover transition group-hover:scale-[1.03]"
                    />
                  )}
                  <div className="truncate px-3 py-2 text-xs font-medium text-slate-600">{image.name || `Proof ${index + 1}`}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedProof && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProof(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="proof-preview-title" className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h3 id="proof-preview-title" className="truncate text-lg font-semibold text-slate-900">{selectedProof.name || 'Proof image'}</h3>
                <p className="text-sm text-slate-500">Service proof preview</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProof(null)}
                className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close proof preview"
              >
                <FiX size={20} />
              </button>
            </div>
            <div className="max-h-[78vh] overflow-auto bg-slate-100 p-4">
              {isVideoProof(selectedProof) ? (
                <video src={selectedProof.url} controls className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg shadow-sm" />
              ) : (
                <img
                  src={selectedProof.url}
                  alt={selectedProof.name || 'Proof image'}
                  className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg object-contain shadow-sm"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <TicketTimelineModal
        ticket={timelineService}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => {
          timelineSequence.current += 1;
          setTimelineService(null);
        }}
      />
    </Layout>
  );
}
