export declare class ListUsersQuery {
    search?: string;
    adminOrgId?: string;
    partyOrgId?: string;
    active?: string;
    hasParty?: string;
    take?: number;
    skip?: number;
    sortBy?: 'createdAt' | 'name' | 'username';
    sortDir?: 'asc' | 'desc';
}
