// Sidebar nav icons — ported 1:1 from the t-card.html wireframe (14×14 viewBox).

const fill = (children: React.ReactNode) => (
  <svg viewBox="0 0 14 14" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
    {children}
  </svg>
);
const stroke = (children: React.ReactNode) => (
  <svg
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-3.5 w-3.5 shrink-0"
  >
    {children}
  </svg>
);

const ICONS: Record<string, React.ReactNode> = {
  dashboard: fill(
    <>
      <rect x="1" y="1" width="5" height="5" rx="1" />
      <rect x="8" y="1" width="5" height="5" rx="1" />
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="8" y="8" width="5" height="5" rx="1" />
    </>,
  ),
  board: fill(
    <>
      <rect x="1" y="1" width="3" height="12" rx="1" />
      <rect x="5.5" y="1" width="3" height="9" rx="1" />
      <rect x="10" y="1" width="3" height="11" rx="1" />
    </>,
  ),
  orders: fill(<path d="M1 2h12v1.5H1zm0 4h12v1.5H1zm0 4h8v1.5H1z" />),
  tickets: stroke(
    <>
      <rect x="1" y="2" width="12" height="10" rx="1.5" />
      <path d="M4 2v10M4 7h7" />
    </>,
  ),
  inproduction: stroke(
    <>
      <circle cx="7" cy="7" r="5" />
      <path d="M7 4v3l2 1.5" />
    </>,
  ),
  ready: stroke(<path d="M2 7h7m-3-3 4 3-4 3M12 2v10" />),
  despatched: stroke(
    <>
      <polyline points="1,4 7,4 7,12 1,12" />
      <polyline points="7,4 13,4 13,12 7,12" />
      <line x1="1" y1="8" x2="13" y2="8" />
    </>,
  ),
  schedule: stroke(
    <>
      <rect x="1" y="2" width="12" height="11" rx="1" />
      <path d="M1 6h12M4 2v4M10 2v4" />
    </>,
  ),
  moulds: stroke(
    <>
      <rect x="1" y="3" width="12" height="9" rx="1.5" />
      <path d="M4 3V1.5M10 3V1.5M1 7h12M4 7v5M10 7v5" />
    </>,
  ),
  catalogue: stroke(<path d="M2 2h10v10H2zM5 2v10M2 6h10M2 9h3" />),
  customers: fill(
    <>
      <circle cx="7" cy="4.5" r="2.5" />
      <path d="M1 13c0-3 2.7-5 6-5s6 2 6 5" />
    </>,
  ),
  operatives: stroke(
    <>
      <circle cx="5" cy="4" r="2.5" />
      <path d="M1 13c0-2.8 1.8-4.5 4-4.5" />
      <circle cx="10.5" cy="7" r="2" />
      <path d="M8 13c0-2 1-3 2.5-3s2.5 1 2.5 3" />
    </>,
  ),
};

export function NavIcon({ name }: { name: string }) {
  return <>{ICONS[name] ?? null}</>;
}
