import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TicketStatus,
  TicketType,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyService } from '../../common/company/company.service';
import { EVENTS, EventsService } from '../../common/events/events.service';
import { IspboxService } from '../ispbox/ispbox.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
    private readonly ispbox: IspboxService,
    private readonly events: EventsService,
  ) {}

  async findAll(
    companyId: string,
    opts: { status?: TicketStatus; type?: TicketType; search?: string; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const term = opts.search?.trim();
    const where = {
      companyId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.type ? { type: opts.type } : {}),
      ...(term
        ? {
            OR: [
              { summary: { contains: term, mode: 'insensitive' as const } },
              { customer: { name: { contains: term, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, workOrders: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId?: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { customer: true, workOrders: true, events: true },
    });
    if (!ticket) throw new NotFoundException('Ticket não encontrado');
    if (companyId && ticket.companyId && ticket.companyId !== companyId) {
      throw new ForbiddenException('Acesso negado (empresa).');
    }
    return ticket;
  }

  async create(dto: CreateTicketDto & { companyId?: string }) {
    const companyId = await this.resolveCompany(dto.companyId, dto.customerId);
    const ticket = await this.prisma.ticket.create({
      data: {
        companyId,
        type: dto.type ?? TicketType.SUPPORT,
        summary: dto.summary,
        customerId: dto.customerId,
        conversationId: dto.conversationId,
      },
    });
    await this.addEvent(ticket.id, 'created', { type: ticket.type });
    this.emitUpdated(ticket);
    return ticket;
  }

  addEvent(ticketId: string, event: string, payload?: Prisma.InputJsonValue) {
    return this.prisma.ticketEvent.create({ data: { ticketId, event, payload } });
  }

  async setStatus(id: string, status: TicketStatus) {
    const ticket = await this.prisma.ticket.update({ where: { id }, data: { status } });
    this.emitUpdated(ticket);
    return ticket;
  }

  /** Emite ticket.updated (payload mínimo: ids) para a sala da empresa. */
  private emitUpdated(ticket: { id: string; companyId: string | null; conversationId: string | null; status: TicketStatus }) {
    this.events.emit(ticket.companyId, EVENTS.TICKET_UPDATED, {
      ticketId: ticket.id,
      conversationId: ticket.conversationId,
      status: ticket.status,
    });
  }

  async openWorkOrder(params: {
    ticketId: string;
    ispboxClientId: string;
    ispboxServiceId?: string;
    tipoId: string;
    assunto: string;
    descricao?: string;
  }) {
    const workOrder = await this.prisma.workOrder.create({
      data: { ticketId: params.ticketId, status: WorkOrderStatus.PENDING },
    });
    try {
      const os: any = await this.ispbox.createWorkOrder({
        clientesId: params.ispboxClientId,
        servicosId: params.ispboxServiceId,
        tipoId: params.tipoId,
        assunto: params.assunto,
        descricao: params.descricao,
      });
      const ispboxOsId = String(os?.id ?? '') || null;
      const updated = await this.prisma.workOrder.update({
        where: { id: workOrder.id },
        data: { ispboxOsId, status: WorkOrderStatus.OPEN },
      });
      await this.addEvent(params.ticketId, 'work_order_opened', { ispboxOsId });
      return updated;
    } catch (err) {
      this.logger.error(`Falha ao abrir OS: ${(err as Error).message}`);
      await this.prisma.workOrder.update({
        where: { id: workOrder.id },
        data: { status: WorkOrderStatus.ERROR },
      });
      await this.addEvent(params.ticketId, 'work_order_error', {
        message: (err as Error).message,
      });
      throw err;
    }
  }

  private async resolveCompany(companyId?: string, customerId?: string): Promise<string> {
    if (companyId) return companyId;
    if (customerId) {
      const c = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (c?.companyId) return c.companyId;
    }
    return this.company.getDefaultCompanyId();
  }
}
