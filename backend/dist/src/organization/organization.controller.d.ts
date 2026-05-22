import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
export declare class OrganizationController {
    private readonly service;
    constructor(service: OrganizationService);
    list(kind?: string, inactive?: string): Promise<{
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
    }[]>;
    tree(kind?: string, inactive?: string): Promise<import("./organization.service").OrgTreeNode[]>;
    findOne(id: string): Promise<{
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
    }>;
    members(id: string, recursive?: string): Promise<import("./organization.service").OrgMember[]>;
    create(dto: CreateOrganizationDto): Promise<{
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
    }>;
    update(id: string, dto: UpdateOrganizationDto): Promise<{
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
    }>;
    move(id: string, body: {
        targetId: string;
        position: 'before' | 'after' | 'inside';
    }): Promise<{
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
    }>;
    remove(id: string, hard?: string): Promise<void>;
}
