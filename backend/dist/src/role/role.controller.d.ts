import type { Request } from 'express';
import { RoleService } from './role.service';
import { AuthPayload } from '../auth/auth.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReplacePermissionsDto } from './dto/replace-permissions.dto';
export declare class RoleController {
    private readonly roles;
    constructor(roles: RoleService);
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
    create(dto: CreateRoleDto, me: AuthPayload, req: Request): Promise<{
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
    update(id: string, dto: UpdateRoleDto, me: AuthPayload, req: Request): Promise<{
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
    remove(id: string, me: AuthPayload, req: Request): Promise<{
        id: string;
        deleted: boolean;
    }>;
    replacePermissions(id: string, dto: ReplacePermissionsDto, me: AuthPayload, req: Request): Promise<{
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
