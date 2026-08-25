import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentAccessService } from './attachment-access.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentGuard } from './attachment.guard';

@Module({
  imports: [AuthModule], // reexporta JwtModule para o AttachmentGuard
  controllers: [AttachmentsController],
  providers: [AttachmentAccessService, AttachmentGuard],
  exports: [AttachmentAccessService],
})
export class AttachmentsModule {}
