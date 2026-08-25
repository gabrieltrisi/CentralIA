import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';

// PresenceService vem do PresenceModule (também @Global) — sem aresta de import.
@Global()
@Module({
  imports: [AuthModule], // JwtService para autenticar o handshake
  providers: [EventsGateway, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
