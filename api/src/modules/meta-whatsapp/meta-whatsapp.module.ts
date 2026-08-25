import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MetaWhatsappService } from './meta-whatsapp.service';
import { MetaWhatsappSenderService } from './meta-whatsapp-sender.service';
import { MetaWhatsappMediaService } from './meta-whatsapp-media.service';
import { MetaWhatsappMessageParser } from './meta-whatsapp-message.parser';
import { MetaDiagnosticsService } from './meta-diagnostics.service';
import { MetaSignatureGuard } from './meta-signature.guard';
import { MetaWhatsappController } from './meta-whatsapp.controller';

@Module({
  imports: [HttpModule.register({ timeout: 20000 })],
  controllers: [MetaWhatsappController],
  providers: [
    MetaWhatsappService,
    MetaWhatsappSenderService,
    MetaWhatsappMediaService,
    MetaWhatsappMessageParser,
    MetaDiagnosticsService,
    MetaSignatureGuard,
  ],
  exports: [
    MetaWhatsappService,
    MetaWhatsappSenderService,
    MetaWhatsappMediaService,
    MetaWhatsappMessageParser,
  ],
})
export class MetaWhatsappModule {}
