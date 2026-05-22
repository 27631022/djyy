import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReplacePermissionsDto } from './dto/replace-permissions.dto';
interface ActorContext {
    actorId?: string;
    actorName?: string;
    ip?: string;
}
export declare class RoleService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        builtin: boolean;
        createdAt: Date;
        userCount: number;
        permissionCount: number;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        builtin: boolean;
        createdAt: Date;
        userCount: number;
        permissions: {
            id: string;
            code: string;
            name: string;
            category: string;
            pluginName: string | null;
        }[];
    }>;
    listUsers(id: string): Promise<{
        userId: string;
        username: string;
        name: string;
        avatarUrl: string | null;
        active: boolean;
        scope: string;
        scopeOrgs: {
            id: string;
            name: string;
            kind: string;
        }[];
        grantedAt: Date;
    }[]>;
    create(input: CreateRoleDto, actor: ActorContext): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        builtin: boolean;
        createdAt: Date;
        userCount: number;
        permissions: {
            id: string;
            code: string;
            name: string;
            category: string;
            pluginName: string | null;
        }[];
    }>;
    update(id: string, input: UpdateRoleDto, actor: ActorContext): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        builtin: boolean;
        createdAt: Date;
        userCount: number;
        permissions: {
            id: string;
            code: string;
            name: string;
            category: string;
            pluginName: string | null;
        }[];
    }>;
    remove(id: string, actor: ActorContext): Promise<{
        id: string;
        deleted: boolean;
    }>;
    replacePermissions(id: string, dto: ReplacePermissionsDto, actor: ActorContext): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        builtin: boolean;
        createdAt: Date;
        userCount: number;
        permissions: {
            id: string;
            code: string;
            name: string;
            category: string;
            pluginName: string | null;
        }[];
    }>;
}
export {};
