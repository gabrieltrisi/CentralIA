export interface Customer {
  id: string;
  name: string;
  cpfCnpj?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface Conversation {
  id: string;
  status: string;
  channel: string;
  intent?: string | null;
  contact?: string | null;
  assignedUserId?: string | null;
  customer?: Customer | null;
  lastMessageAt?: string | null;
  unread?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: string; // CUSTOMER | AGENT | AI | SYSTEM
  content: string;
  createdAt: string;
  metadata?: unknown;
}

export interface Attachment {
  id: string;
  type?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active?: boolean;
}

export interface ConversationDetail extends Conversation {
  customer?: (Customer & { services?: { id: string; type?: string | null; status?: string | null }[] }) | null;
  messages: Message[];
  attachments: Attachment[];
  assignedUser?: { id: string; name: string; email: string; role: string } | null;
  tickets?: Ticket[];
  fsm?: { state: string; collectedData: Record<string, unknown> } | null;
}

export interface Ticket {
  id: string;
  type: string;
  status: string;
  summary?: string | null;
  ispboxOsId?: string | null;
  customer?: Customer | null;
  workOrders?: { id: string; status: string; ispboxOsId?: string | null }[];
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  event: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  priority?: string | null;
  customerId?: string | null;
  conversationId?: string | null;
  updatedAt?: string | null;
  events?: TicketEvent[];
}

export interface CustomerServiceItem {
  id: string;
  type?: string | null;
  status?: string | null;
  ispboxServiceId?: string | null;
}

export interface CustomerDetail extends Customer {
  companyId?: string;
  ispboxId?: string | null;
  services?: CustomerServiceItem[];
}

export interface ConversationSummary {
  conversationId: string;
  customerName: string;
  intent: 'COMMERCIAL' | 'SUPPORT' | 'FINANCIAL' | 'HUMAN' | 'UNKNOWN';
  intentLabel: string;
  currentSituation: string;
  highlights: string[];
  collectedData: string[];
  pendingItems: string[];
  recommendedNextStep: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  handoffReason: string | null;
  lastUpdatedAt: string;
  aiEnhanced: boolean;
}

export interface CopilotReply {
  suggestion: string;
  reasoningLabel: string;
  confidence: number;
  canSendAutomatically: false;
}

export interface HumanQueueItem {
  id: string;
  reason: string;
  status: string;
  summary?: string | null;
  priority?: string | null;
  dueAt?: string | null;
  slaStatus?: 'on_time' | 'due_soon' | 'overdue' | 'resolved';
  firstResponseMinutes?: number | null;
  assignedUserId?: string | null;
  // O backend retorna a conversa completa (com intent/status) e o cliente.
  conversation?: {
    id: string;
    contact?: string | null;
    intent?: string | null;
    type?: string | null;
    status?: string | null;
    customer?: Customer | null;
  };
  resolvedAt?: string | null;
  createdAt: string;
}

export interface StatsOverview {
  conversasAbertas: number;
  aguardandoHumano: number;
  ticketsAbertos: number;
  atendimentosHoje: number;
  mensagensHoje: number;
  mediaPrimeiraRespostaMin: number | null;
  slaNoPrazo: number;
  slaAtrasado: number;
  pixGeradosHoje: number;
  osAbertasHoje: number;
}

export interface SlaStats {
  total: number;
  onTime: number;
  late: number;
  averageFirstResponseMinutes: number | null;
  averageResolutionMinutes: number | null;
}

export interface Presence {
  userId: string;
  status: 'ONLINE' | 'AWAY' | 'OFFLINE';
  lastSeenAt: string;
}

export interface IspboxDiagnostics {
  appMode: string;
  ispboxEnabled: boolean;
  config: {
    baseUrlConfigured: boolean;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    scopesConfigured: boolean;
    requestIdConfigured: boolean;
  };
  authStatus: 'ok' | 'error' | 'unknown' | 'sandbox';
  lastError: string | null;
  lastRenewedAt: string | null;
  writeFlags: {
    financialPaymentActions: boolean;
    supportOsCreation: boolean;
    pilotMode: boolean;
    pilotAllowIspboxWrite: boolean;
  };
}

export interface IspboxCharge {
  id: string;
  valor: number | null;
  vencimento: string | null;
  status: string | null;
  situacao: 'open' | 'overdue' | 'paid';
}

export interface IspboxSnapshot {
  available: boolean;
  reason?: string;
  ispboxId?: string;
  customerName?: string;
  services?: { ispboxServiceId: string; tipo: string | null; status: string | null }[];
  internetStatus?: { online: boolean; status: string };
  charges?: { open: IspboxCharge[]; overdue: IspboxCharge[]; paid: IspboxCharge[]; total: number };
  fetchedAt?: string;
}

export interface IspboxLookupResult {
  source: 'local' | 'ispbox' | 'ispbox-multiple' | 'none';
  customer?: { id: string; name: string; cpfCnpj?: string | null; phone?: string | null; email?: string | null; ispboxId?: string | null };
  candidates?: { ispboxId: string; nome: string; cpfCnpj: string | null; telefone: string | null }[];
  snapshot?: IspboxSnapshot;
}

export interface KnowledgeArticle {
  id: string;
  companyId?: string | null;
  category: string;
  title: string;
  content: string;
  active: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actorType: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface HealthReport {
  status: string;
  appMode: string;
  pilotMode?: boolean;
  checks: {
    database: string;
    redis: string;
    queues?: string;
    storage?: string;
    ispbox: string;
    anthropic: string;
    meta: string;
  };
}

export interface MetaDiagnostics {
  appMode: string;
  pilotMode: boolean;
  pilotAllowedPhonesCount: number;
  meta: {
    verifyTokenConfigured: boolean;
    appSecretConfigured: boolean;
    phoneNumberIdConfigured: boolean;
    accessTokenConfigured: boolean;
    graphVersion: string;
  };
  outbound: { allowed: boolean; reason: string };
  lastEventAt: string | null;
  lastError: { operation: string; at: string; message: string } | null;
}
