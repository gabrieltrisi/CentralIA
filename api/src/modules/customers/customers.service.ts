import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyService } from '../../common/company/company.service';
import { IspboxService } from '../ispbox/ispbox.service';
import { IspboxAccessService } from '../ispbox/ispbox-access.service';
import { IspboxActionsService } from '../ispbox/ispbox-actions.service';
import { IspboxMapperService, NormalizedCustomer } from '../ispbox/ispbox-mapper.service';
import { IspboxCustomer } from '../ispbox/dto/ispbox.dto';

export interface CustomerLookupQuery {
  phone?: string | null;
  cpf?: string | null;
  name?: string | null;
}

export type CustomerLookupSource = 'local' | 'ispbox' | 'ispbox-multiple' | 'none';

export interface CustomerLookupResult {
  source: CustomerLookupSource;
  customer?: Awaited<ReturnType<CustomersService['findByPhone']>>;
  candidates?: NormalizedCustomer[];
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
    private readonly ispbox: IspboxService,
    private readonly access: IspboxAccessService,
    private readonly mapper: IspboxMapperService,
    private readonly ispboxActions: IspboxActionsService,
  ) {}

  /**
   * Busca livre (telefone/CPF/nome) + snapshot ISPBOX — usado pela tela
   * /settings/ispbox (somente leitura). Sincroniza o cliente local quando vem
   * da ISPBOX.
   */
  async lookupWithSnapshot(query: string, companyId: string, actorId?: string) {
    const term = (query ?? '').trim();
    if (!term) return { source: 'none' as const };
    const digits = term.replace(/\D/g, '');
    const hasLetters = /[a-zA-Z]/.test(term);
    const lookup = await this.resolveCustomer(
      hasLetters ? { name: term } : { cpf: digits, phone: digits },
      companyId,
    );
    if (lookup.source === 'ispbox-multiple' || !lookup.customer) {
      return { source: lookup.source, candidates: lookup.candidates };
    }
    const customer = lookup.customer;
    const snapshot = await this.ispboxActions.snapshot({
      ispboxId: customer.ispboxId ?? '',
      serviceId: customer.services?.[0]?.ispboxServiceId,
      actor: { actorType: 'user', actorId, companyId, phone: customer.phone },
    });
    return {
      source: lookup.source,
      customer: {
        id: customer.id, name: customer.name, cpfCnpj: customer.cpfCnpj,
        phone: customer.phone, email: customer.email, ispboxId: customer.ispboxId,
      },
      snapshot,
    };
  }

  /**
   * Resolve o cliente para o atendimento: tenta o banco local primeiro; se não
   * encontrar e a ISPBOX estiver habilitada, busca lá e sincroniza o Customer
   * local + serviços. Retorna `candidates` quando há múltiplos resultados.
   */
  async resolveCustomer(query: CustomerLookupQuery, companyId?: string): Promise<CustomerLookupResult> {
    // 1) Banco local
    let local = query.cpf ? await this.findByCpf(query.cpf) : null;
    if (!local && query.phone) local = await this.findByPhone(query.phone);
    if (!local && query.name) {
      local = await this.prisma.customer.findFirst({
        where: { ...(companyId ? { companyId } : {}), name: { contains: query.name, mode: 'insensitive' } },
        include: { services: true },
      });
    }
    if (local) return { source: 'local', customer: local };

    // 2) ISPBOX (somente leitura, se habilitada)
    if (!this.access.canRead()) return { source: 'none' };
    const term = (query.cpf || query.phone || query.name || '').trim();
    if (!term) return { source: 'none' };

    const results = ((await this.ispbox.listCustomers({ search: term })) as any[]) ?? [];
    if (results.length === 0) return { source: 'none' };
    if (results.length > 1) {
      return { source: 'ispbox-multiple', candidates: results.map((r) => this.mapper.customer(r)) };
    }
    const customer = await this.syncFromIspbox(this.mapper.customer(results[0]).ispboxId, companyId);
    return { source: 'ispbox', customer };
  }

  async findAll(
    companyId?: string,
    opts: { search?: string; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const term = opts.search?.trim();
    const where = {
      ...(companyId ? { companyId } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { cpfCnpj: { contains: term, mode: 'insensitive' as const } },
              { phone: { contains: term, mode: 'insensitive' as const } },
              { email: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { services: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId?: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { services: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    if (companyId && customer.companyId !== companyId) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return customer;
  }

  /** Localiza o cliente local por id da ISPBOX (na empresa padrão). */
  async findByIspboxId(ispboxId: string) {
    const companyId = await this.company.getDefaultCompanyId();
    return this.prisma.customer.findUnique({
      where: { companyId_ispboxId: { companyId, ispboxId } },
      include: { services: true },
    });
  }

  /** Localiza por telefone (E.164 ou variações). */
  findByPhone(phone: string) {
    const needle = (phone ?? '').replace(/\D/g, '').slice(-8);
    if (needle.length < 6) return Promise.resolve(null);
    return this.prisma.customer.findFirst({
      where: { phone: { contains: needle } },
      include: { services: true },
    });
  }

  /** Localiza por CPF/CNPJ (apenas dígitos). */
  findByCpf(cpf: string) {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length < 6) return Promise.resolve(null);
    return this.prisma.customer.findFirst({
      where: { cpfCnpj: { contains: digits } },
      include: { services: true },
    });
  }

  /**
   * Sincroniza (upsert) um cliente a partir da ISPBOX usando o id da ISPBOX,
   * incluindo seus serviços.
   */
  async syncFromIspbox(ispboxId: string, companyId?: string) {
    const resolvedCompany = companyId ?? (await this.company.getDefaultCompanyId());
    const data = (await this.ispbox.getCustomer(ispboxId)) as IspboxCustomer;
    const n = this.mapper.customer(data);
    const mapped = { name: n.nome, cpfCnpj: n.cpfCnpj, email: n.email, phone: n.telefone };

    const customer = await this.prisma.customer.upsert({
      where: { companyId_ispboxId: { companyId: resolvedCompany, ispboxId } },
      create: { companyId: resolvedCompany, ispboxId, ...mapped },
      update: mapped,
    });

    await this.syncServices(customer.id, ispboxId);
    return this.findOne(customer.id);
  }

  /** Sincroniza os serviços do cliente a partir da ISPBOX. */
  async syncServices(customerId: string, ispboxId: string) {
    const services = (await this.ispbox.listServices(ispboxId)) ?? [];
    for (const svc of services as any[]) {
      const ispboxServiceId = String(svc?.id ?? '');
      if (!ispboxServiceId) continue;
      const existing = await this.prisma.customerService.findFirst({
        where: { customerId, ispboxServiceId },
      });
      const payload = { type: svc?.tipo ?? null, status: svc?.status ?? null };
      if (existing) {
        await this.prisma.customerService.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await this.prisma.customerService.create({
          data: { customerId, ispboxServiceId, ...payload },
        });
      }
    }
  }
}
