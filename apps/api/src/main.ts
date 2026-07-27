import './instrument';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // The API runs behind nginx, which sets X-Forwarded-For. Without trusting the
  // proxy, Express's req.ip (and req.ips, which ThrottlerGuard's default tracker
  // reads) resolves to nginx's own address for every request, so ALL callers
  // worldwide share one throttler bucket on every public/unauthenticated route
  // (e.g. the receipt-split guest page GET /s/:token, GET /users/search) — a
  // trivial denial of service. `1` trusts exactly one hop (the nginx reverse
  // proxy in front of this container).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Increase body size limit for base64 audio/image uploads
  // verify callback preserves rawBody for Stripe webhook signature verification
  app.use(
    json({
      limit: '50mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(
    urlencoded({
      extended: true,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Global prefix (exclude webhook routes from versioning)
  app.setGlobalPrefix('api/v1', {
    exclude: ['webhooks/stripe', 'telegram/webhook', 'whatsapp/webhook', 'slack/events', 'slack/interactivity', 'slack/install', 'slack/oauth/callback', 's/:token', 's/:token/paid'],
  });

  // CORS — allow only explicitly configured origins; fall back to localhost for local dev
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:8081', 'http://localhost:3001'];
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app.getHttpAdapter().getInstance());
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
