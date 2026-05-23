import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Express 默认 JSON body 上限 100KB,但证书模板的 designJson 里可能含
  // base64 编码的底图 + 图片元素(V2),容易突破。放宽到 10MB(前端上传时已限单图 2MB)。
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  const isDev = process.env.NODE_ENV !== 'production';

  const whitelist = corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);

  app.enableCors({
    origin: (origin, cb) => {
      // 无 Origin(同源请求 / curl / Postman):放行
      if (!origin) return cb(null, true);
      // 显式白名单
      if (whitelist.includes(origin)) return cb(null, true);
      // 开发环境:允许局域网内任意主机的 5173 端口(前端 dev server)
      // 形如 http://10.10.10.195:5173 / http://192.168.x.x:5173 都放行
      if (isDev && /^https?:\/\/[^/]+:5173$/.test(origin)) return cb(null, true);
      return cb(new Error(`CORS rejected: ${origin}`));
    },
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

  // 显式监听 0.0.0.0,确保局域网可达(Windows 下 Nest 默认行为不稳)
  await app.listen(port, '0.0.0.0');
  Logger.log(`党建益友 平台后端启动: http://localhost:${port}/api (监听 0.0.0.0)`, 'Bootstrap');
}

bootstrap();
