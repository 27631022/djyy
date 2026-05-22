export declare const SCOPE_VALUES: readonly ["self", "own", "subtree", "all", "custom"];
export type ScopeValue = (typeof SCOPE_VALUES)[number];
export declare class RoleAssignmentDto {
    roleId: string;
    scope: ScopeValue;
    scopeOrgIds?: string[];
}
export declare class ReplaceRolesDto {
    roles: RoleAssignmentDto[];
}
