import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RequestContext } from '../../common/context/request-context';
import { Public, Roles } from '../../common/auth/decorators';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { MetaWhatsappSenderService } from './meta-whatsapp-sender.service';
import { MetaDiagnosticsService } from './meta-diagnostics.service';
import { MetaSignatureGuard } from './meta-signature.guard';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('meta-whatsapp')
@Controller('meta-whatsapp')
export class MetaWhatsappController {
  private readonly logger = new Logger('MetaWebhook');

  constructor(
    private readonly meta: MetaWhatsappService,
    private readonly sender: MetaWhatsappSenderService,
    private readonly diagnostics: MetaDiagnosticsService,
  ) {}

  /** Handshake de verificação do webhook (GET com hub.* params). */
  @Public()
  @Get('webhook')
  @ApiExcludeEndpoint()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && this.meta.verifyToken(token)) {
      return challenge;
    }
    throw new ForbiddenException('Token de verificação inválido.');
  }

  /** Recebe eventos da Meta (assinatura validada pelo guard) e os enfileira. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  @UseGuards(MetaSignatureGuard)
  @ApiExcludeEndpoint()
  async receive(@Body() payload: any) {
    if (payload?.object !== 'whatsapp_business_account') {
      throw new BadRequestException('Payload inesperado.');
    }
    this.logger.log(
      JSON.stringify({
        provider: 'meta',
        event: 'webhook_received',
        correlationId: RequestContext.get()?.correlationId,
      }),
    );
    await this.meta.enqueueInbound(payload);
    return { received: true };
  }

  @Post('send')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enviar mensagem de texto via WhatsApp' })
  send(@Body() dto: SendMessageDto) {
    return this.sender.sendText(dto.to, dto.text);
  }

  @Get('diagnostics')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Diagnóstico da Meta (ADMIN) — sem expor segredos' })
  diag() {
    return this.diagnostics.build();
  }
}
