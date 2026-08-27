import { FiAlertCircle, FiMapPin, FiUser, FiClock } from 'react-icons/fi';
import StatusBadge from '../ui/StatusBadge';

export default function ActiveTechnicianJobs({ jobs = [], title = 'Active Technician Jobs' }) {
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
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{jobs.length} technician{jobs.length !== 1 ? 's' : ''} actively working</p>
      </div>

      <div className="divide-y divide-slate-200">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="p-4 transition-colors hover:bg-slate-50"
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
                <p className="text-xs text-slate-500">Progress</p>
                <p className="text-xs font-semibold text-slate-700">{job.progress || 0}%</p>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    job.status === 'On Hold'
                      ? 'bg-yellow-500'
                      : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                  }`}
                  style={{ width: `${Math.min(job.progress || 0, 100)}%` }}
                />
              </div>
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
          </div>
        ))}
      </div>
    </div>
  );
}
