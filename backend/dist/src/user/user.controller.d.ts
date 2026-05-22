import type { Request } from 'express';
import { UserService } from './user.service';
import { AuthPayload } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ReplaceMembershipsDto } from './dto/replace-memberships.dto';
import { ReplaceRolesDto } from './dto/replace-roles.dto';
import { ListUsersQuery } from './dto/list-users.query';
export declare class UserController {
    private readonly users;
    constructor(users: UserService);
    list(query: ListUsersQuery): Promise<{
        total: number;
        items: {
            id: string;
            username: string;
            name: string;
            email: string | null;
            phone: string | null;
            avatarUrl: string | null;
            active: boolean;
            createdAt: Date;
            primaryAdmin: {
                orgId: string;
                orgName: string;
                position: string | null;
            } | null;
            partyAffiliation: {
                orgId: string;
                orgName: string;
                position: string | null;
            } | null;
            membershipCount: number;
            roleCount: number;
        }[];
    }>;
    findOne(id: string): Promise<{
        id: string;
        username: string;
        name: string;
        email: string | null;
        phone: string | null;
        avatarUrl: string | null;
        active: boolean;
        externalId: string | null;
        customFields: Record<string, string>;
        createdAt: Date;
        updatedAt: Date;
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
            userRoleId: string;
            roleId: string;
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
    create(dto: CreateUserDto, me: AuthPayload, req: Request): Promise<{
        id: string;
        username: string;
        name: string;
        email: string | null;
        phone: string | null;
        avatarUrl: string | null;
        active: boolean;
        externalId: string | null;
        customFields: Record<string, string>;
        createdAt: Date;
        updatedAt: Date;
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
            userRoleId: string;
            roleId: string;
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
    update(id: string, dto: UpdateUserDto, me: AuthPayload, req: Request): Promise<{
        id: string;
        username: string;
        name: string;
        email: string | null;
        phone: string | null;
        avatarUrl: string | null;
        active: boolean;
        externalId: string | null;
        customFields: Record<string, string>;
        createdAt: Date;
        updatedAt: Date;
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
            userRoleId: string;
            roleId: string;
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
    replaceMemberships(id: string, dto: ReplaceMembershipsDto, me: AuthPayload, req: Request): Promise<{
        id: string;
        username: string;
        name: string;
        email: string | null;
        phone: string | null;
        avatarUrl: string | null;
        active: boolean;
        externalId: string | null;
        customFields: Record<string, string>;
        createdAt: Date;
        updatedAt: Date;
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
            userRoleId: string;
            roleId: string;
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
    replaceRoles(id: string, dto: ReplaceRolesDto, me: AuthPayload, req: Request): Promise<{
        id: string;
        username: string;
        name: string;
        email: string | null;
        phone: string | null;
        avatarUrl: string | null;
        active: boolean;
        externalId: string | null;
        customFields: Record<string, string>;
        createdAt: Date;
        updatedAt: Date;
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
            userRoleId: string;
            roleId: string;
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
    replaceCustomFields(id: string, body: {
        values: Record<string, string>;
    }, me: AuthPayload, req: Request): Promise<{
        id: string;
        username: string;
        name: string;
        email: string | null;
        phone: string | null;
        avatarUrl: string | null;
        active: boolean;
        externalId: string | null;
        customFields: Record<string, string>;
        createdAt: Date;
        updatedAt: Date;
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
            userRoleId: string;
            roleId: string;
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
    remove(id: string, me: AuthPayload, req: Request): Promise<{
        id: string;
        active: boolean;
    }>;
}
