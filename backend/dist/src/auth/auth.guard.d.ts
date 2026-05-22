import { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthService } from './auth.service';
export declare class AuthGuard implements CanActivate {
    private readonly auth;
    constructor(auth: AuthService);
    canActivate(ctx: ExecutionContext): boolean;
}
