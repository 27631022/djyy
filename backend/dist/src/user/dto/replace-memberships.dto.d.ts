export declare class MembershipEntryDto {
    orgId: string;
    position?: string;
    isPrimary?: boolean;
}
export declare class ReplaceMembershipsDto {
    memberships: MembershipEntryDto[];
}
