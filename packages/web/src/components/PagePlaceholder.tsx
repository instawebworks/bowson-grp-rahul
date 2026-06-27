interface Props {
  title: string;
  phase?: string;
}

/** Temporary view shell — replaced as each feature is built out. */
export function PagePlaceholder({ title, phase }: Props) {
  return (
    <>
      <header className="sticky top-0 z-50 flex items-center gap-2.5 border-b border-border bg-surface px-5 py-2.5">
        <div className="text-sm font-bold tracking-tight">{title}</div>
      </header>
      <div className="flex-1 p-5">
        <div className="rounded-lg border border-dashed border-border2 bg-surface p-8 text-center text-text3">
          <div className="text-sm font-medium text-text2">{title}</div>
          <div className="mt-1 text-xs">
            Not built yet{phase ? ` — ${phase}` : ''}.
          </div>
        </div>
      </div>
    </>
  );
}
