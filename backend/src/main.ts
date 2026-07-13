import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded, static as expressStatic } from 'express';
import type { Request, Response, NextFunction } from 'express';
import compression from 'compression';
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
      // 无 Origin(普通同源请求 / curl / Postman):放行
      if (!origin) return cb(null, true);
      // 显式白名单
      if (whitelist.includes(origin)) return cb(null, true);
      // 开发环境:允许局域网内任意主机的 517x/3001
      // - 5173=react 前端(同源 POST 浏览器也带 Origin,经 vite proxy 透传到这);
      //   vite strictPort=false 端口被占会自动递增(多会话/preview 冒烟),故放行整个 517x 段
      // - 3001=本服务自身(展厅托管在 /exhibition/,<script type="module"> 即使同源也带 Origin!)
      if (isDev && /^https?:\/\/[^/]+:(517\d|3001)$/.test(origin)) return cb(null, true);
      // ⚠ 不要 cb(new Error(...)) —— 那会让请求直接 500。
      // cb(null, false) = 不发 CORS 头:同源请求不受影响,真跨域由浏览器按标准拦截。
      return cb(null, false);
    },
    credentials: true,
  });

  // gzip 压缩(静态前端 + API JSON):现场活动 40 台手机同时拉 JS,压缩后每台 ~0.7MB → ~0.2MB,
  // 一个 WiFi AP 上的突发下载量减 2/3。WebSocket 帧不经此中间件,不受影响。
  app.use(compression());

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
    app.use(
      '/exhibition',
      expressStatic(exhibitionDist, {
        // index.html 禁缓存:每次 build 后用户刷新即拿新入口(assets 带 hash,可长缓存)
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
          }
        },
      }),
    );
    Logger.log(`3D 展厅客户端已托管: /exhibition/ ← ${exhibitionDist}`, 'Bootstrap');
  } else {
    Logger.warn(
      `未找到展厅构建产物(${exhibitionDist}),/exhibition 不可用 —— 先 cd exhibition-client && npm run build`,
      'Bootstrap',
    );
  }

  // 平台前端生产包静态托管(现场活动模式):react/dist 存在即挂到根路径。
  // 40 台手机同时扫码时,Vite dev server(5173,按模块散文件发)会被拖垮 —— 正式活动先
  // cd react && npm run build,让手机直接访问 http://<IP>:3001/play/XXX 拿压缩产物(同源零配置,
  // API/socket 地址本就按 hostname 推断打 3001)。平时开发照旧用 5173,互不影响。
  const reactDist = config.get<string>('REACT_DIST_DIR', join(process.cwd(), '..', 'react', 'dist'));
  if (existsSync(join(reactDist, 'index.html'))) {
    app.use(
      expressStatic(reactDist, {
        setHeaders: (res, filePath) => {
          // index.html 禁缓存(每次 build 刷新即新);带 hash 的 assets 可长缓存
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
          else res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        },
      }),
    );
    // SPA 回退:非 API/socket/展厅、无扩展名的 GET 一律回 index.html(/play/XX、/screen/XX、/admin…)
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') return next();
      const p = req.path;
      if (p.startsWith('/api') || p.startsWith('/socket.io') || p.startsWith('/exhibition')) return next();
      if (p.includes('.')) return next(); // 带扩展名的静态请求交给上面的 static(未命中则 404)
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(reactDist, 'index.html'));
    });
    Logger.log(`平台前端已托管: / ← ${reactDist}(现场活动请让手机访问本端口)`, 'Bootstrap');
  } else {
    Logger.log(
      `未找到平台前端构建产物(${reactDist}),3001 不托管前端 —— 现场活动前先 cd react && npm run build`,
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
