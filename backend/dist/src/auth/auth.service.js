"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
let AuthService = AuthService_1 = class AuthService {
    logger = new common_1.Logger(AuthService_1.name);
    secret;
    ttlMs = 7 * 24 * 3600 * 1000;
    constructor() {
        this.secret = process.env.AUTH_SECRET ?? 'dev-secret-CHANGE-IN-PROD';
        if (this.secret === 'dev-secret-CHANGE-IN-PROD') {
            this.logger.warn('AUTH_SECRET 未配置,正在使用开发密钥。生产环境必须设置 .env 中的 AUTH_SECRET');
        }
    }
    signToken(payload) {
        const now = Date.now();
        const full = { ...payload, iat: now, exp: now + this.ttlMs };
        const header = this.b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const body = this.b64url(JSON.stringify(full));
        const signature = this.sign(`${header}.${body}`);
        return `${header}.${body}.${signature}`;
    }
    verifyToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3)
                return null;
            const [header, body, signature] = parts;
            const expected = this.sign(`${header}.${body}`);
            if (signature.length !== expected.length ||
                !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
                return null;
            }
            const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
            if (typeof payload.exp !== 'number' || payload.exp < Date.now())
                return null;
            return payload;
        }
        catch {
            return null;
        }
    }
    sign(input) {
        return crypto.createHmac('sha256', this.secret).update(input).digest('base64url');
    }
    b64url(input) {
        return Buffer.from(input, 'utf8').toString('base64url');
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], AuthService);
//# sourceMappingURL=auth.service.js.map