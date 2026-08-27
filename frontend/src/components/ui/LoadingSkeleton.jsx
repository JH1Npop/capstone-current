export function RouteSkeleton() {
  return (
    <div className="min-h-dvh bg-brand-900 p-1 sm:p-2">
      <div className="min-h-[calc(100dvh-0.5rem)] rounded-[14px] bg-gradient-to-br from-brand-100 via-slate-50 to-brand-200 sm:min-h-[calc(100dvh-1rem)] sm:rounded-[18px] lg:flex">
        <aside className="hidden w-64 shrink-0 bg-brand-900 lg:block">
          <div className="px-6 py-6">
            <div className="skeleton mx-auto h-16 w-24 bg-white/15" />
          </div>
          <div className="space-y-3 px-4">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="skeleton h-8 w-full bg-white/10" />
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="space-y-3">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-8 w-56" />
            </div>
            <div className="flex gap-2">
              <div className="skeleton h-10 w-10" />
              <div className="skeleton h-10 w-24" />
            </div>
          </div>
          <PageSkeleton />
        </main>
      </div>
    </div>
  );
}

export function PageSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="stat-card p-4 sm:p-5">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-4 h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="skeleton h-5 w-44" />
          <div className="skeleton mt-2 h-3 w-64 max-w-full" />
        </div>
        <TableSkeleton rows={rows} />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5, compact = false }) {
  return (
    <div className={compact ? 'p-3' : 'p-4'}>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <div
                key={columnIndex}
                className={`skeleton h-5 ${columnIndex === 0 ? 'w-full' : 'w-4/5'}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5, compact = false }) {
  return (
    <div className={compact ? 'space-y-2 p-3' : 'space-y-3 p-4'}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-xl border border-slate-100 bg-white px-3 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/2" />
            </div>
            <div className="skeleton h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ rows = 4 }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="skeleton h-5 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
