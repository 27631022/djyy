export interface AuthPayload {
    sub: string;
    username: string;
    name: string;
    iat: number;
    exp: number;
}
export declare class AuthService {
    private readonly logger;
    private readonly secret;
    private readonly ttlMs;
    constructor();
    signToken(payload: {
        sub: string;
        username: string;
        name: string;
    }): string;
    verifyToken(token: string): AuthPayload | null;
    private sign;
    private b64url;
}
