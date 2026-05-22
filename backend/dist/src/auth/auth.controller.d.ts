import { AuthService, AuthPayload } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { DevLoginDto } from './dto/dev-login.dto';
import { AuditService } from '../audit/audit.service';
import type { Request } from 'express';
export declare class AuthController {
    private readonly auth;
    private readonly prisma;
    private readonly audit;
    constructor(auth: AuthService, prisma: PrismaService, audit: AuditService);
    devLogin(dto: DevLoginDto, req: Request): Promise<{
        token: string;
        user: {
            id: string;
            username: string;
            name: string;
            email: string | null;
            avatarUrl: string | null;
        };
    }>;
    me(current?: AuthPayload): Promise<{
        id: string;
        username: string;
        name: string;
        email: string | null;
        avatarUrl: string | null;
        active: boolean;
        memberships: {
            admin: ({
                org: {
                    name: string;
                    code: string;
                    kind: string;
                    type: string;
                    parentId: string | null;
                    sortOrder: number;
                    active: boolean;
                    isVirtual: boolean;
                    meta: string | null;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                };
            } & {
                userId: string;
                orgId: string;
                isPrimary: boolean;
                position: string | null;
                joinedAt: Date;
            })[];
            party: ({
                org: {
                    name: string;
                    code: string;
                    kind: string;
                    type: string;
                    parentId: string | null;
                    sortOrder: number;
                    active: boolean;
                    isVirtual: boolean;
                    meta: string | null;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                };
            } & {
                userId: string;
                orgId: string;
                isPrimary: boolean;
                position: string | null;
                joinedAt: Date;
            })[];
        };
        roles: {
            code: string;
            name: string;
            scope: string;
            scopeOrgs: {
                id: string;
                name: string;
                kind: string;
            }[];
            grantedAt: Date;
        }[];
    }>;
}
