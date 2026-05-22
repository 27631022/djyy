import { PrismaService } from '../prisma/prisma.service';
export declare class PermissionService {
    private readonly prisma;
    constructor(prisma: PrismaService);
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
