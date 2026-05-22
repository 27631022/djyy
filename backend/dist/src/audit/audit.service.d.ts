import { PrismaService } from '../prisma/prisma.service';
export interface AuditLogInput {
    actorId?: string;
    actorName?: string;
    action: string;
    target?: string;
    pluginName?: string;
    detail?: unknown;
    ip?: string;
}
export interface AuditListQuery {
    take?: number;
    skip?: number;
    action?: string;
    actorId?: string;
    pluginName?: string;
    since?: Date;
    until?: Date;
}
export declare class AuditService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    log(input: AuditLogInput): Promise<void>;
    list(query: AuditListQuery): Promise<{
        total: number;
        items: {
            detail: unknown;
            id: string;
            createdAt: Date;
            actorId: string | null;
            actorName: string | null;
            action: string;
            target: string | null;
            pluginName: string | null;
            ip: string | null;
        }[];
    }>;
}
