import { PermissionService } from './permission.service';
export declare class PermissionController {
    private readonly perms;
    constructor(perms: PermissionService);
    list(): Promise<{
        name: string;
        code: string;
        id: string;
        createdAt: Date;
        pluginName: string | null;
        description: string | null;
        builtin: boolean;
        category: string;
    }[]>;
}
