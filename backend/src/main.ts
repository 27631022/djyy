import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');

  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');

  await app.listen(port);
  Logger.log(`党建益友 平台后端启动: http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();
