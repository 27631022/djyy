"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['log', 'error', 'warn', 'debug'],
    });
    const config = app.get(config_1.ConfigService);
    const port = config.get('PORT', 3001);
    const corsOrigin = config.get('CORS_ORIGIN', 'http://localhost:5173');
    app.enableCors({
        origin: corsOrigin.split(',').map((o) => o.trim()),
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));
    app.setGlobalPrefix('api');
    await app.listen(port);
    common_1.Logger.log(`党建益友 平台后端启动: http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();
//# sourceMappingURL=main.js.map