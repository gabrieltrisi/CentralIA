import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { IspboxExceptionFilter } from './modules/ispbox/errors/ispbox-exception.filter';
import { setupBullBoard } from './queue/bull-board.setup';
import { JsonLogger } from './common/logger/json.logger';
import { requestContextMiddleware } from './common/context/request-context.middleware';

async function bootstrap() {
  process.env.TZ = 'America/Sao_Paulo';
  const app = await NestFactory.create(AppModule, {
    logger: new JsonLogger(),
    rawBody: true, // necessário para validar a assinatura HMAC do webhook Meta
  });
  const config = app.get(ConfigService);

  // Contexto de correlação (requestId/correlationId) em todas as requisições.
  app.use(requestContextMiddleware);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.enableCors({
    origin: config.get<string[]>('corsOrigins'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new IspboxExceptionFilter());

  // Dashboard das filas BullMQ
  setupBullBoard(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CentralIA API')
    .setDescription('Backend do CentralIA — ISPBOX, WhatsApp, IA e atendimento')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = config.get<number>('port') ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 CentralIA API em http://localhost:${port}`);
  console.log(`📚 Swagger em http://localhost:${port}/api`);
  console.log(`🗂️  Filas (Bull Board) em http://localhost:${port}/admin/queues`);
}
bootstrap();
