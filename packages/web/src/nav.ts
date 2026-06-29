export interface NavItem {
  label: string;
  path: string;
  icon: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Sidebar structure + icons ported 1:1 from the original t-card.html. */
export const NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '/', icon: 'dashboard' }],
  },
  {
    label: 'Shop Floor',
    items: [{ label: 'T-Card Board', path: '/board', icon: 'board' }],
  },
  {
    label: 'Orders',
    items: [
      { label: 'All Orders', path: '/orders', icon: 'orders' },
      { label: 'All Tickets', path: '/tickets', icon: 'tickets' },
      { label: 'In Production', path: '/in-production', icon: 'inproduction' },
      { label: 'Ready to Despatch', path: '/ready', icon: 'ready' },
      { label: 'Despatched', path: '/despatched', icon: 'despatched' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { label: 'Schedule', path: '/schedule', icon: 'schedule' },
      { label: 'Moulds', path: '/moulds', icon: 'moulds' },
      { label: 'Product Catalogue', path: '/catalogue', icon: 'catalogue' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Customers', path: '/customers', icon: 'customers' },
      { label: 'Operatives & Settings', path: '/operatives', icon: 'operatives' },
      { label: 'Activity Log', path: '/audit', icon: 'tickets' },
    ],
  },
];
