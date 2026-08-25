import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { Roles } from '../../common/auth/decorators';
import { IspboxService } from './ispbox.service';
import { IspboxDiagnosticsService } from './ispbox-diagnostics.service';
import {
  AddWorkOrderNoteDto,
  CreateWorkOrderDto,
  ListChargesQueryDto,
  ListCustomersQueryDto,
  ListWorkOrdersQueryDto,
  TemporaryUnblockDto,
} from './dto/ispbox.dto';

/**
 * Endpoints internos que encapsulam a API ISPBOX V2 oficial.
 * Prefixo: /ispbox
 */
@ApiTags('ispbox')
@Controller('ispbox')
export class IspboxController {
  constructor(
    private readonly ispbox: IspboxService,
    private readonly diagnostics: IspboxDiagnosticsService,
  ) {}

  // ----- Diagnóstico (ADMIN/MANAGER, sem segredos) -----
  @Get('diagnostics')
  @Roles(UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Diagnóstico da ISPBOX (ADMIN/MANAGER) — sem segredos' })
  diag() {
    return this.diagnostics.build();
  }

  @Post('test-auth')
  @Roles(UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Testar autenticação ISPBOX sob demanda (ADMIN/MANAGER)' })
  testAuth() {
    return this.diagnostics.testAuth();
  }

  // ----- Clientes -----
  @Get('clientes')
  @ApiOperation({ summary: 'Listar clientes' })
  listCustomers(@Query() query: ListCustomersQueryDto) {
    return this.ispbox.listCustomers(query);
  }

  @Get('clientes/:clientesId')
  @ApiOperation({ summary: 'Buscar cliente' })
  getCustomer(@Param('clientesId') clientesId: string) {
    return this.ispbox.getCustomer(clientesId);
  }

  // ----- Serviços -----
  @Get('clientes/:clientesId/servicos')
  @ApiOperation({ summary: 'Listar serviços do cliente' })
  listServices(@Param('clientesId') clientesId: string) {
    return this.ispbox.listServices(clientesId);
  }

  @Get('clientes/:clientesId/servicos/:servicosId')
  @ApiOperation({ summary: 'Detalhar serviço' })
  getService(
    @Param('clientesId') clientesId: string,
    @Param('servicosId') servicosId: string,
  ) {
    return this.ispbox.getService(clientesId, servicosId);
  }

  // ----- Internet -----
  @Get('clientes/:clientesId/servicos/:servicosId/internet/status')
  @ApiOperation({ summary: 'Consultar status da internet' })
  internetStatus(
    @Param('clientesId') clientesId: string,
    @Param('servicosId') servicosId: string,
  ) {
    return this.ispbox.internetStatus(clientesId, servicosId);
  }

  @Post(
    'clientes/:clientesId/servicos/:servicosId/internet/desconectar/:desconectarId',
  )
  @ApiOperation({ summary: 'Desconectar internet' })
  disconnect(
    @Param('clientesId') clientesId: string,
    @Param('servicosId') servicosId: string,
    @Param('desconectarId') desconectarId: string,
  ) {
    return this.ispbox.disconnectInternet(clientesId, servicosId, desconectarId);
  }

  @Patch('clientes/:clientesId/servicos/:servicosId/desbloqueio-temporario')
  @ApiOperation({ summary: 'Desbloqueio temporário' })
  temporaryUnblock(
    @Param('clientesId') clientesId: string,
    @Param('servicosId') servicosId: string,
    @Body() dto: TemporaryUnblockDto,
  ) {
    return this.ispbox.temporaryUnblock(clientesId, servicosId, dto);
  }

  // ----- Cobranças -----
  @Get('clientes/:clientesId/servicos/:servicosId/cobrancas')
  @ApiOperation({ summary: 'Listar cobranças' })
  listCharges(
    @Param('clientesId') clientesId: string,
    @Param('servicosId') servicosId: string,
    @Query() query: ListChargesQueryDto,
  ) {
    return this.ispbox.listCharges(clientesId, servicosId, query);
  }

  @Get('clientes/:clientesId/servicos/:servicosId/cobrancas/:cobrancasId')
  @ApiOperation({ summary: 'Detalhar cobrança' })
  getCharge(
    @Param('clientesId') clientesId: string,
    @Param('servicosId') servicosId: string,
    @Param('cobrancasId') cobrancasId: string,
  ) {
    return this.ispbox.getCharge(clientesId, servicosId, cobrancasId);
  }

  @Get(
    'clientes/:clientesId/servicos/:servicosId/cobrancas/:cobrancasId/pagamento/pdf',
  )
  @ApiOperation({ summary: 'PDF do pagamento da cobrança' })
  async chargePdf(
    @Param('clientesId') clientesId: string,
    @Param('servicosId') servicosId: string,
    @Param('cobrancasId') cobrancasId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.ispbox.chargePaymentPdf(
      clientesId,
      servicosId,
      cobrancasId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="cobranca-${cobrancasId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  @Post(
    'clientes/:clientesId/servicos/:servicosId/cobrancas/:cobrancasId/pagamento/qrcode/gerar',
  )
  @ApiOperation({ summary: 'Gerar QR Code PIX do pagamento' })
  generateQrCode(
    @Param('clientesId') clientesId: string,
    @Param('servicosId') servicosId: string,
    @Param('cobrancasId') cobrancasId: string,
  ) {
    return this.ispbox.generatePaymentQrCode(clientesId, servicosId, cobrancasId);
  }

  // ----- Ordens de Serviço -----
  @Get('ordens-servicos')
  @ApiOperation({ summary: 'Listar ordens de serviço' })
  listWorkOrders(@Query() query: ListWorkOrdersQueryDto) {
    return this.ispbox.listWorkOrders(query);
  }

  @Post('ordens-servicos')
  @ApiOperation({ summary: 'Abrir ordem de serviço' })
  createWorkOrder(@Body() dto: CreateWorkOrderDto) {
    return this.ispbox.createWorkOrder(dto);
  }

  @Get('ordens-servicos/tipos')
  @ApiOperation({ summary: 'Listar tipos de ordem de serviço' })
  workOrderTypes() {
    return this.ispbox.workOrderTypes();
  }

  @Get('ordens-servicos/:ordensServicosId')
  @ApiOperation({ summary: 'Detalhar ordem de serviço' })
  getWorkOrder(@Param('ordensServicosId') ordensServicosId: string) {
    return this.ispbox.getWorkOrder(ordensServicosId);
  }

  @Post('ordens-servicos/:ordensServicosId/anotacoes')
  @ApiOperation({ summary: 'Adicionar anotação em OS' })
  addWorkOrderNote(
    @Param('ordensServicosId') ordensServicosId: string,
    @Body() dto: AddWorkOrderNoteDto,
  ) {
    return this.ispbox.addWorkOrderNote(ordensServicosId, dto);
  }
}
