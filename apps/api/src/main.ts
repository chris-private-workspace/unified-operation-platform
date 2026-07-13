import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse Cookie headers into req.cookies — the local session's httpOnly access
  // token rides in a cookie (ADR-0006 §7 / AUTH-4c-B). Entra Bearer path is unaffected.
  app.use(cookieParser());

  // validates & strips controller DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // OpenAPI — this is also the contract n8n / future AI plug into
  const config = new DocumentBuilder()
    .setTitle('M365 License Operations Platform')
    .setDescription('System of Action — operational + orchestration API')
    .setVersion('0.1')
    .addBearerAuth() // Entra JWT — endpoints are guarded (ADR-0002)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs/api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
