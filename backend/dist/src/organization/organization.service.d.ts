import { Organization } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto, OrgKind } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
export interface OrgTreeNode extends Organization {
    children: OrgTreeNode[];
    directMembers: number;
    transitiveMembers: number;
}
export interface OrgMember {
    userId: string;
    username: string;
    name: string;
    viaOrgId: string;
    viaOrgName: string;
    position: string | null;
    isPrimary: boolean;
    isDirect: boolean;
}
export declare class OrganizationService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private validateKindType;
    findAll(opts?: {
        kind?: OrgKind;
        includeInactive?: boolean;
    }): Promise<Organization[]>;
    findTree(opts?: {
        kind?: OrgKind;
        includeInactive?: boolean;
    }): Promise<OrgTreeNode[]>;
    listMembers(id: string, recursive?: boolean): Promise<OrgMember[]>;
    findOne(id: string): Promise<Organization>;
    create(dto: CreateOrganizationDto): Promise<Organization>;
    move(sourceId: string, targetId: string, position: 'before' | 'after' | 'inside'): Promise<Organization>;
    update(id: string, dto: UpdateOrganizationDto): Promise<Organization>;
    softDelete(id: string): Promise<Organization>;
    hardDelete(id: string): Promise<void>;
    private collectDescendantIds;
}
