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
  /** Per-week day-hour overrides keyed "<mondayIso>_d<dayIdx>" (0=Mon…6=Sun). */
  dayHrs: Record<string, number> | null;
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
  singlePiece: boolean;
  assemblyHrs: number;
  gelCureMins: number | null;
  lamCureMins: number | null;
  specUrl: string | null;
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
  cureTargetStage: string | null;
  cureStart: string | null;
  cureMins: number | null;
  cureCleared: boolean;
  resinType: string | null;
  deadline?: string | null;
  completed: string | null;
  qcRef: string | null;
  despatchDate: string | null;
  partialDespatch: boolean;
  managerOverride: boolean;
  assignments?: TicketAssignment[];
  time?: TimeSession[];
  parts?: Ticket[];
  order?: Order;
}

export interface PackingItem {
  name: string;
  qty: number;
  notes: string;
  checked: boolean;
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
  packingChecklist: PackingItem[] | null;
  packingNotes: string | null;
  isDraft: boolean;
  tickets?: Ticket[];
  createdAt: string;
}

export interface DashboardBlocker {
  id: number;
  tn: number | null;
  detail: string;
  status: string;
  orderId: number;
  orderNumber: string | null;
  siteName: string | null;
}

export interface DashboardData {
  orders: { active: number; pending: number; overdue: number };
  tickets: { slidesInProduction: number; partsInProduction: number; manHours: number };
  moulds: { total: number; inUse: number; maintenance: number; utilisation: number };
  capacity: {
    weeklyCapacity: number;
    committed8: number;
    totalCapacity8: number;
    utilisation8: number;
    leadTimeWeeks: number | null;
  };
  recentOrders: {
    id: number;
    orderNumber: string;
    status: string;
    deadline: string | null;
    customer: string | null;
    items: number;
    progress: number;
  }[];
  hoursByStage: { stage: string; hrs: number }[];
  blockers: {
    maintenance: (DashboardBlocker & { mouldRef: string; mouldNotes: string | null })[];
    noMould: DashboardBlocker[];
  };
  overdueOrders: {
    id: number;
    orderNumber: string;
    customer: string | null;
    status: string;
    deadline: string;
    daysOver: number;
  }[];
  stageCapacity: {
    thisWeek: { stage: string; trained: number; available: number }[];
    nextWeek: { stage: string; trained: number; available: number }[];
  };
  thisWeek: string;
  nextWeek: string;
}
