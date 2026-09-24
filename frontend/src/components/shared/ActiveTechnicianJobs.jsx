import { FiAlertCircle, FiMapPin, FiUser, FiClock } from 'react-icons/fi';
import StatusBadge from '../ui/StatusBadge';

export default function ActiveTechnicianJobs({ jobs = [], title = 'Active Technician Jobs', onJobClick, onViewAll }) {
  if (!jobs || jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{title}</h3>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <FiAlertCircle className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-slate-500">No active technician jobs at this time</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{jobs.length} active job{jobs.length !== 1 ? 's' : ''}; markers follow recorded job status, not elapsed time</p>
        </div>
        {onViewAll && <button type="button" onClick={onViewAll} className="shrink-0 text-sm font-semibold text-brand-600 hover:text-brand-700">Open dispatch</button>}
      </div>

      <div className="divide-y divide-slate-200">
        {jobs.slice(0, 6).map((job) => {
          const JobContainer = onJobClick ? 'button' : 'div';
          return <JobContainer
            key={job.id}
            {...(onJobClick ? { type: 'button', onClick: (event) => onJobClick(job, event.currentTarget), 'aria-label': `View job details for ${job.technician || 'technician'} on ${job.service_type || 'active job'}` } : {})}
            className="block w-full p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
          >
            {/* Top row: Technician, Status, Priority */}
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  <FiUser size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">Technician: {job.technician}</p>
                  <p className="text-xs text-slate-500">Client: {job.client}</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <StatusBadge status={job.status} size="sm" />
              </div>
            </div>

            {/* Middle row: Service Type */}
            <div className="mb-3">
              <p className="text-sm text-slate-700">
                <span className="font-medium">{job.service_type}</span>
                {job.priority && (
                  <>
                    {' • '}
                    <span className={`text-xs font-semibold ${
                      job.priority === 'High' || job.priority === 'Urgent'
                        ? 'text-red-600'
                        : job.priority === 'Normal'
                        ? 'text-yellow-600'
                        : 'text-green-600'
                    }`}>
                      {job.priority}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    job.progress_track === 'inspection'
                      ? 'bg-violet-50 text-violet-700'
                      : 'bg-blue-50 text-blue-700'
                  }`}>
                    {job.progress_track_label || 'Service job'}
                  </span>
                  <p className="truncate text-xs font-medium text-slate-600">{job.progress_label || 'Current workflow stage'}</p>
                </div>
                <p className="text-xs font-semibold text-slate-700">{job.progress ?? 0}%</p>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    job.progress_paused || job.status === 'On Hold'
                      ? 'bg-yellow-500'
                      : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                  }`}
                  style={{ width: `${Math.min(job.progress ?? 0, 100)}%` }}
                  role="progressbar"
                  aria-label={job.progress_label || 'Current workflow stage'}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={job.progress ?? 0}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">Status checkpoint · 100% only after completion</p>
            </div>

            {/* Bottom row: Location and Start Time */}
            <div className="flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-start sm:gap-4">
              {job.location && (
                <div className="flex items-start gap-1.5 flex-1 min-w-0">
                  <FiMapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                  <p className="line-clamp-2 sm:truncate">{job.location}</p>
                </div>
              )}
              {job.start_time && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <FiClock className="h-3.5 w-3.5 text-slate-400" />
                  <p>{new Date(job.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              )}
            </div>
          </JobContainer>;
        })}
      </div>
    </div>
  );
}
