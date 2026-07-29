import 'dotenv/config';
import './instrument';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Floret')
      .setDescription('YouTube transcript API')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    app.getHttpAdapter().get('/openapi.json', (_req, res) => {
      res.json(document);
    });

    app.use(
      '/reference',
      apiReference({
        url: '/openapi.json',
      }),
    );
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
