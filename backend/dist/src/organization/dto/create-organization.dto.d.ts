export declare const ORG_KINDS: readonly ["party", "admin"];
export type OrgKind = (typeof ORG_KINDS)[number];
export declare const PARTY_TYPES: readonly ["committee", "general", "branch", "temp_branch", "group"];
export declare const ADMIN_TYPES: readonly ["level1", "level2", "level3", "level4"];
export declare const ALL_ORG_TYPES: readonly ["committee", "general", "branch", "temp_branch", "group", "level1", "level2", "level3", "level4"];
export type OrgType = (typeof ALL_ORG_TYPES)[number];
export declare class CreateOrganizationDto {
    name: string;
    code: string;
    kind: OrgKind;
    type: OrgType;
    parentId?: string | null;
    sortOrder?: number;
    active?: boolean;
    isVirtual?: boolean;
    meta?: string;
}
