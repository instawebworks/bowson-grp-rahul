import { useState } from 'react';

/**
 * Per-column filter inputs in table headers — ported from the prototype's
 * simple always-visible column-filter engine (cfInput / cfMatch).
 */
export function useColumnFilters() {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const set = (col: string, val: string) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (val) next[col] = val.toLowerCase();
      else delete next[col];
      return next;
    });

  /** Case-insensitive substring match; empty filter passes everything. */
  const match = (col: string, cellVal: string | number | null | undefined) => {
    const f = filters[col];
    return !f || String(cellVal ?? '').toLowerCase().includes(f);
  };

  const clear = () => setFilters({});
  const hasFilters = Object.keys(filters).length > 0;

  return { filters, set, match, clear, hasFilters };
}

/** Filter input rendered inside a <th>. */
export function FilterInput({
  col,
  placeholder,
  filters,
  onChange,
}: {
  col: string;
  placeholder: string;
  filters: Record<string, string>;
  onChange: (col: string, val: string) => void;
}) {
  const active = !!filters[col];
  return (
    <input
      value={filters[col] ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(col, e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={`w-full min-w-16 rounded border bg-surface px-1.5 py-1 text-[10px] font-normal normal-case tracking-normal outline-none placeholder:text-text3 focus:border-teal ${
        active ? 'border-teal bg-teal-l/40' : 'border-border2'
      }`}
    />
  );
}
