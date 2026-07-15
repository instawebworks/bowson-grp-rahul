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

/**
 * Filter input rendered inside a <th>. Ported from the prototype's `.cf-input`:
 * it's disguised as the plain column header (transparent, bold, uppercase, grey)
 * so the header row looks clean, and only reveals a box on hover / focus, or
 * turns teal once a filter is applied. The placeholder is the column name.
 */
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
  const base = 'w-full min-w-16 cursor-text rounded px-1.5 py-1 outline-none';
  return (
    <input
      value={filters[col] ?? ''}
      placeholder={placeholder}
      title={`Filter by ${placeholder}`}
      onChange={(e) => onChange(col, e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={
        active
          ? `${base} border border-teal bg-teal-l/50 text-xs font-semibold normal-case tracking-normal text-text`
          : `${base} border border-transparent bg-transparent text-[10px] font-bold uppercase tracking-wide text-text3 placeholder:text-text3` +
            ' hover:border-border hover:bg-surface2 hover:text-text2' +
            ' focus:border-teal focus:bg-surface focus:text-xs focus:font-normal focus:normal-case focus:tracking-normal focus:text-text'
      }
    />
  );
}
