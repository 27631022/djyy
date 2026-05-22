import { OrgKind, OrgType } from './create-organization.dto';
export declare class UpdateOrganizationDto {
    name?: string;
    code?: string;
    kind?: OrgKind;
    type?: OrgType;
    parentId?: string | null;
    sortOrder?: number;
    active?: boolean;
    isVirtual?: boolean;
    meta?: string;
}
