// API response shapes (Prisma models serialised to JSON — dates as ISO strings).

export interface Customer {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  region: string | null;
}

export interface Operative {
  id: number;
  name: string;
  skills: string[];
  defaultHrs: number | null;
  dayPattern: number[];
}

export interface Mould {
  id: number;
  ref: string;
  name: string | null;
  qty: number;
  status: string;
  notes: string | null;
}

export interface CataloguePart {
  id: number;
  detail: string;
  spec: string | null;
  hrs: number;
  price: number;
  drawing: string | null;
  mouldId: number | null;
}

export interface CatalogueHardware {
  id: number;
  name: string;
  qty: number;
  notes: string | null;
}

export interface Catalogue {
  id: number;
  productCode: string;
  name: string;
  code: string | null;
  drawing: string | null;
  unitPrice: number;
  parts: CataloguePart[];
  hardware: CatalogueHardware[];
}

export interface TicketAssignment {
  id: number;
  ticketId: number;
  operativeId: number;
  operative?: Operative;
}

export interface TimeSession {
  id: number;
  ticketId: number;
  operativeId: number;
  start: string;
  end: string | null;
}

export interface Ticket {
  id: number;
  tn: number | null;
  orderId: number;
  type: string;
  compParentId: number | null;
  detail: string;
  spec: string | null;
  drawing: string | null;
  status: string;
  pct: number;
  wc: string | null;
  hrs: number;
  qty: number;
  unitPrice: number;
  netPrice: number;
  mouldId: number | null;
  mould?: Mould | null;
  resinType: string | null;
  deadline?: string | null;
  completed: string | null;
  assignments?: TicketAssignment[];
  time?: TimeSession[];
  order?: Order;
}

export interface Order {
  id: number;
  orderNumber: string;
  customerId: number | null;
  customer?: Customer | null;
  siteName: string | null;
  status: string;
  deadline: string | null;
  despatch: string | null;
  wc: string | null;
  resinType: string;
  themeImage: string | null;
  notes: string | null;
  value: number;
  isDraft: boolean;
  tickets?: Ticket[];
  createdAt: string;
}

export interface DashboardData {
  orders: {
    total: number;
    pending: number;
    inProgress: number;
    readyToDespatch: number;
    despatched: number;
    overdue: number;
  };
  moulds: {
    total: number;
    inUse: number;
    available: number;
    maintenance: number;
    utilisation: number;
  };
  tickets: { live: number; preProduction: number };
}
