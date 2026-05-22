import { AuditService } from './audit.service';
export declare class AuditController {
    private readonly audit;
    constructor(audit: AuditService);
    list(take?: string, skip?: string, action?: string, actorId?: string, pluginName?: string, since?: string, until?: string): Promise<{
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
