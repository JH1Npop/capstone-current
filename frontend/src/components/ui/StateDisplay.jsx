import React from 'react';

export function EmptyState({
  title = 'No records found',
  description = 'There are currently no items to display here.',
  icon: Icon,
  actionLabel,
  onAction,
  compact = false,
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-brand-50/30 text-center shadow-sm transition-all duration-300 hover:shadow-md ${
        compact ? 'py-8 px-4' : 'py-14 px-6 sm:px-12'
      }`}
    >
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-brand-500/5 blur-2xl pointer-events-none" />
      <div className="absolute -left-12 -bottom-12 h-36 w-36 rounded-full bg-blue-500/5 blur-2xl pointer-events-none" />

      <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-100 to-brand-50 text-brand-600 shadow-inner ring-4 ring-brand-50/50">
        {Icon ? (
          <Icon className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" />
        ) : (
          <svg className="h-8 w-8 stroke-[1.75]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>

      <h3 className={`font-semibold text-slate-800 tracking-tight ${compact ? 'text-base' : 'text-lg sm:text-xl'}`}>
        {title}
      </h3>
      <p className={`mx-auto mt-1 max-w-sm text-slate-500 ${compact ? 'text-xs' : 'text-sm'}`}>
        {description}
      </p>

      {actionLabel && onAction && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/20 ring-1 ring-inset ring-brand-500/30 transition-all duration-200 hover:bg-brand-500 hover:shadow-lg hover:shadow-brand-500/30 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We encountered an unexpected issue while loading this data. Please try again.',
  error,
  onRetry,
  compact = false,
}) {
  const displayMessage = typeof error === 'string'
    ? error
    : error?.message || error?.response?.data?.error || message;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-red-200/80 bg-gradient-to-br from-red-50/90 via-white to-red-50/30 text-center shadow-sm transition-all duration-300 ${
        compact ? 'py-6 px-4' : 'py-12 px-6 sm:px-10'
      }`}
    >
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-red-500/10 blur-xl pointer-events-none" />

      <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 shadow-inner ring-4 ring-red-50">
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>

      <h3 className={`font-semibold text-red-900 tracking-tight ${compact ? 'text-base' : 'text-lg'}`}>
        {title}
      </h3>
      <p className={`mx-auto mt-1 max-w-md text-red-700/80 ${compact ? 'text-xs' : 'text-sm'}`}>
        {displayMessage}
      </p>

      {onRetry && (
        <div className="mt-5">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-red-500/20 ring-1 ring-inset ring-red-500/30 transition-all duration-200 hover:bg-red-500 hover:shadow-lg active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

export function PermissionDeniedState({
  title = 'Access Restricted',
  message = 'You do not have the necessary permissions or role capability to view this section.',
  actionLabel = 'Return to Dashboard',
  onAction,
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/30 py-14 px-6 text-center shadow-sm sm:px-12">
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

      <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-inner ring-4 ring-amber-50">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>

      <h3 className="text-lg font-semibold text-amber-950 sm:text-xl tracking-tight">
        {title}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-amber-800/80">
        {message}
      </p>

      {onAction && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-500/20 ring-1 ring-inset ring-amber-500/30 transition-all duration-200 hover:bg-amber-500 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export function LoadingSkeleton({
  rows = 3,
  type = 'table', // 'table', 'card', or 'list'
  className = '',
}) {
  if (type === 'card') {
    return (
      <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${className}`}>
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="animate-pulse rounded-2xl border border-surface-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded-full bg-slate-200" />
              <div className="h-6 w-6 rounded-full bg-slate-100" />
            </div>
            <div className="mt-4 h-8 w-16 rounded-lg bg-slate-200" />
            <div className="mt-2 h-3 w-28 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className={`space-y-3 ${className}`}>
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="animate-pulse rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="h-5 w-16 rounded-full bg-slate-100" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-3 w-2/3 rounded bg-slate-100" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm ${className}`}>
      <div className="border-b border-surface-100 bg-slate-50/50 p-4">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="divide-y divide-surface-100">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex items-center justify-between p-4 animate-pulse">
            <div className="space-y-2 w-1/4">
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-3 w-16 rounded bg-slate-100" />
            </div>
            <div className="space-y-2 w-1/4">
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="h-3 w-20 rounded bg-slate-100" />
            </div>
            <div className="h-6 w-20 rounded-full bg-slate-100" />
            <div className="h-8 w-8 rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

