import { useId, useMemo, useState } from 'react';
import { FiChevronDown, FiFilter, FiSearch, FiX } from 'react-icons/fi';

const fieldClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100';

const getOptionLabel = (filter) => {
  if (filter.formatValue) return filter.formatValue(filter.value);
  const option = filter.options?.find((entry) => String(entry.value) === String(filter.value));
  return option?.label || String(filter.value || '');
};

export default function SearchFilterBar({
  searchValue,
  onSearchChange,
  searchLabel = 'Search',
  searchPlaceholder = 'Search',
  filters = [],
  onClear,
  className = '',
  disabled = false,
  initiallyExpanded = false,
  toolbarContent,
}) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const hasSearch = typeof onSearchChange === 'function';
  const normalizedSearch = String(searchValue || '').trim();
  const activeFilters = useMemo(() => filters.filter((filter) => (
    filter.countAsActive !== false
    && String(filter.value ?? '') !== String(filter.defaultValue ?? '')
  )), [filters]);
  const hasAnythingToClear = Boolean(normalizedSearch) || activeFilters.length > 0;

  const clearEverything = () => {
    if (onClear) {
      onClear();
    } else {
      if (hasSearch) onSearchChange('');
      filters.forEach((filter) => filter.onChange(filter.defaultValue ?? ''));
    }
    setExpanded(false);
  };

  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`} aria-label="Search and filters">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {hasSearch ? (
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">{searchLabel}</span>
            <span className="relative block">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                type="search"
                value={searchValue || ''}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                disabled={disabled}
                className={`${fieldClass} pl-10 ${normalizedSearch ? 'pr-10' : 'pr-3'}`}
              />
              {normalizedSearch ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <FiX size={16} />
                </button>
              ) : null}
            </span>
          </label>
        ) : null}

        {filters.length ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50/40"
          >
            <FiFilter size={17} />
            Filters
            {activeFilters.length ? <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">{activeFilters.length}</span> : null}
            <FiChevronDown className={`transition ${expanded ? 'rotate-180' : ''}`} size={16} />
          </button>
        ) : null}
        {toolbarContent ? (
          <div className={`flex min-w-0 flex-wrap items-center gap-2 ${hasSearch ? '' : 'sm:ml-auto'}`}>
            {toolbarContent}
          </div>
        ) : null}
      </div>

      {expanded && filters.length ? (
        <div id={panelId} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-3">
          {filters.map((filter) => (
            <label key={filter.key} className="min-w-0">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">{filter.label}</span>
              {filter.type === 'date' ? (
                <input
                  type="date"
                  value={filter.value || ''}
                  min={filter.min}
                  max={filter.max}
                  onChange={(event) => filter.onChange(event.target.value)}
                  disabled={disabled || filter.disabled}
                  className={fieldClass}
                />
              ) : (
                <select
                  value={filter.value}
                  onChange={(event) => filter.onChange(event.target.value)}
                  disabled={disabled || filter.disabled}
                  className={fieldClass}
                >
                  {(filter.options || []).map((option) => (
                    <option key={String(option.value)} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
              {filter.helpText ? <span className="mt-1 block text-xs text-slate-500">{filter.helpText}</span> : null}
            </label>
          ))}
        </div>
      ) : null}

      {activeFilters.length || hasAnythingToClear ? (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active filters">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => filter.onChange(filter.defaultValue ?? '')}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-100"
              aria-label={`Remove ${filter.label} filter`}
            >
              <span>{filter.label}: {getOptionLabel(filter)}</span>
              <FiX size={13} />
            </button>
          ))}
          {hasAnythingToClear ? (
            <button type="button" onClick={clearEverything} className="min-h-8 px-2 text-xs font-semibold text-slate-600 hover:text-slate-950">
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
