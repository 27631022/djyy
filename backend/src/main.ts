import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded, static as expressStatic } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  const isDev = process.env.NODE_ENV !== 'production';

  const whitelist = corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);

  // ⚠️ CORS 必须注册在 body parser 之前。
  // 否则「请求体过大(PayloadTooLargeError / 413)」在 body 解析阶段就抛出,
  // 绕过了 CORS 中间件,错误响应不带 Access-Control-Allow-Origin,
  // 浏览器会把这个 413 误报成 "No 'Access-Control-Allow-Origin' header"(假 CORS、真 413)。
  app.enableCors({
    origin: (origin, cb) => {
      // 无 Origin(同源请求 / curl / Postman):放行
      if (!origin) return cb(null, true);
      // 显式白名单
      if (whitelist.includes(origin)) return cb(null, true);
      // 开发环境:允许局域网内任意主机的 5173/5174 端口
      // (5173=react 前端,5174=3D 展厅客户端;同源 POST 浏览器也带 Origin,经 vite proxy 透传到这)
      if (isDev && /^https?:\/\/[^/]+:517[34]$/.test(origin)) return cb(null, true);
      return cb(new Error(`CORS rejected: ${origin}`));
    },
    credentials: true,
  });

  // Express 默认 JSON body 上限 100KB。证书 PDF(V2 起 ×3 超采样 + 底图)的 base64
  // 单张可能十几 MB,旧的 10MB 上限会触发 413。放宽到 50MB(admin 操作、单张证书,内存可接受)。
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // 3D 展厅客户端静态托管:exhibition-client 构建产物挂 /exhibition/
  // 端口约定 = 对外只有 5173(react)/3001(本服务),展厅不再占独立端口;
  // 与 /api 同源 → 素材/字体/halls 全零 CORS。改展厅代码后 cd exhibition-client && npm run build 即生效。
  const exhibitionDist = config.get<string>(
    'EXHIBITION_DIST_DIR',
    join(process.cwd(), '..', 'exhibition-client', 'dist'),
  );
  if (existsSync(exhibitionDist)) {
    app.use('/exhibition', expressStatic(exhibitionDist));
    Logger.log(`3D 展厅客户端已托管: /exhibition/ ← ${exhibitionDist}`, 'Bootstrap');
  } else {
    Logger.warn(
      `未找到展厅构建产物(${exhibitionDist}),/exhibition 不可用 —— 先 cd exhibition-client && npm run build`,
      'Bootstrap',
    );
  }

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
