import 'dotenv/config'
import './instrument'

import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { apiReference } from '@scalar/nestjs-api-reference'
import type { Request, Response } from 'express'
import { Logger } from 'nestjs-pino'
import { join } from 'path'
import { AppModule } from './app.module'
import { mcp } from './mcp/mcp.strategy'

function corsOrigins(): string[] {
  const fromEnv = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://youtube-script.antonkzavcenco300.workers.dev',
    ...fromEnv,
  ];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // Needed so req.ip / x-forwarded-for reflect the real client behind Railway/proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Logo / favicon for Claude connectors (often fetch host favicon).
  app.useStaticAssets(join(process.cwd(), 'public'), {
    index: false,
    maxAge: '7d',
  });

  // Browser → Floret (esp. POST /votes) so anti-spam uses the visitor IP, not a BFF.
  // MCP clients may send Authorization + DELETE for session teardown.
  app.enableCors({
    origin: corsOrigins(),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'Mcp-Session-Id',
      'Last-Event-ID',
    ],
    exposedHeaders: ['Mcp-Session-Id'],
    maxAge: 86400,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Floret')
      .setDescription('YouTube transcript API')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    app.getHttpAdapter().get('/openapi.json', (_req: Request, res: Response) => {
      res.json(document);
    });

    app.use(
      '/reference',
      apiReference({
        url: '/openapi.json',
      }),
    );
  }

  mcp.setHttpAdapter(app.getHttpAdapter());
  app.connectMicroservice({ strategy: mcp });
  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  app.get(Logger).log(`Floret listening on port ${port} (MCP at /mcp)`);
}
bootstrap();
