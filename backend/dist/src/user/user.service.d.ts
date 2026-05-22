import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ReplaceMembershipsDto } from './dto/replace-memberships.dto';
import { ReplaceRolesDto } from './dto/replace-roles.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { AuditService } from '../audit/audit.service';
import { UserCustomFieldService } from '../user-custom-field/user-custom-field.service';
interface ActorContext {
    actorId?: string;
    actorName?: string;
    ip?: string;
}
export declare class UserService {
    private readonly prisma;
    private readonly audit;
    private readonly customFields;
    constructor(prisma: PrismaService, audit: AuditService, customFields: UserCustomFieldService);
    private parseCustomFields;
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
    replaceCustomFields(id: string, values: Record<string, string>, actor: ActorContext): Promise<{
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
    create(input: CreateUserDto, actor: ActorContext): Promise<{
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
    update(id: string, input: UpdateUserDto, actor: ActorContext): Promise<{
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
    softDelete(id: string, actor: ActorContext): Promise<{
        id: string;
        active: boolean;
    }>;
    replaceMemberships(id: string, dto: ReplaceMembershipsDto, actor: ActorContext): Promise<{
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
    replaceRoles(id: string, dto: ReplaceRolesDto, actor: ActorContext): Promise<{
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
}
export {};
