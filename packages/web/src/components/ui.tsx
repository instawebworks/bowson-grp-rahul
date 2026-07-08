import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { statusStyle } from '../lib/format';
import { GlobalBar } from './GlobalBar';

export function PageHeader({
  title,
  sub,
  actions,
  globalActions = true,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
  globalActions?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-surface px-5 py-2">
      <div>
        <div className="text-sm font-bold tracking-tight">{title}</div>
        {sub && <div className="text-[11px] text-text3">{sub}</div>}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <GlobalBar actions={globalActions} leading={actions} />
      </div>
    </header>
  );
}

export function Content({ children }: { children: ReactNode }) {
  return <div className="flex-1 p-5">{children}</div>;
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-[14px]"
      style={statusStyle(status)}
    >
      {status}
    </span>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'default' | 'red' | 'green' | 'amber' | 'blue';
}) {
  const toneColor: Record<string, string> = {
    default: 'inherit',
    red: '#922020',
    green: '#0c6b50',
    amber: '#a86e0a',
    blue: '#1558a0',
  };
  return (
    <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text3">{label}</div>
      <div className="text-[22px] font-bold leading-none tracking-tight" style={{ color: toneColor[tone] }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] text-text3">{sub}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-surface ${className ?? ''}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-border bg-surface2 px-3.5 py-2.5">
          <div className="text-xs font-semibold">{title}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-border bg-surface2 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-text3"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-xs text-text3">
        {message}
      </td>
    </tr>
  );
}

export function QueryState({
  isLoading,
  error,
  colSpan,
}: {
  isLoading: boolean;
  error: unknown;
  colSpan: number;
}) {
  if (isLoading) return <EmptyRow colSpan={colSpan} message="Loading…" />;
  if (error)
    return (
      <EmptyRow
        colSpan={colSpan}
        message={`Could not load data — ${(error as Error).message}. Is the API running and the database configured?`}
      />
    );
  return null;
}

export function Button({
  children,
  variant = 'default',
  ...props
}: { variant?: 'default' | 'primary' | 'danger' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<string, string> = {
    default: 'border-border2 bg-surface text-text hover:bg-surface2',
    primary: 'border-teal bg-teal text-white hover:bg-teal2',
    danger: 'border-transparent bg-red/10 text-red hover:bg-red/20',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  sub,
  onClose,
  onX,
  children,
  footer,
  width = 'max-w-xl',
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  /** Optional distinct handler for the ✕ button (defaults to onClose). */
  onX?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-[5vh]"
      onMouseDown={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${width} flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-start justify-between border-b border-border bg-surface2 px-4 py-3">
          <div>
            <div className="text-sm font-bold">{title}</div>
            {sub && <div className="text-[11px] text-text3">{sub}</div>}
          </div>
          <button onClick={onX ?? onClose} className="text-text3 hover:text-text" aria-label="Close">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-none justify-end gap-2 border-t border-border bg-surface2 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function FormSection({
  title,
  children,
  size = 'sm',
}: {
  title: string;
  children: ReactNode;
  size?: 'sm' | 'lg';
}) {
  const legend = size === 'lg' ? 'text-[11px]' : 'text-[10px]';
  return (
    <fieldset className="mb-4 last:mb-0">
      <legend className={`mb-2 w-full border-b border-border pb-1 ${legend} font-bold uppercase tracking-wide text-text3`}>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

export function Field({
  label,
  required,
  children,
  size = 'sm',
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  size?: 'sm' | 'lg';
}) {
  const lbl = size === 'lg' ? 'text-xs' : 'text-[11px]';
  return (
    <label className="block">
      <span className={`mb-1 block ${lbl} font-semibold text-text2`}>
        {label}
        {required && <span className="text-red"> *</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-md border border-border2 bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-teal';

/** Larger, more legible input styling (14px) for the customer-facing order forms. */
export const inputClassLg =
  'w-full rounded-md border border-border2 bg-surface px-3 py-1.5 text-sm outline-none focus:border-teal';

export function ProgressBar({ pct }: { pct: number }) {
  const hue = Math.round((pct / 100) * 120); // red → green
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface3">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: `hsl(${hue} 60% 42%)` }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums text-text2">{pct}%</span>
    </div>
  );
}
