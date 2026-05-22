import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
interface ActorContext {
    actorId?: string;
    actorName?: string;
    ip?: string;
}
export declare class UserCustomFieldService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(includeInactive?: boolean): Promise<{
        code: string;
        type: string;
        sortOrder: number;
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        builtin: boolean;
        label: string;
        dictCode: string | null;
        placeholder: string | null;
        required: boolean;
    }[]>;
    listActive(): Promise<{
        code: string;
        type: string;
        sortOrder: number;
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        builtin: boolean;
        label: string;
        dictCode: string | null;
        placeholder: string | null;
        required: boolean;
    }[]>;
    findOne(id: string): Promise<{
        code: string;
        type: string;
        sortOrder: number;
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        builtin: boolean;
        label: string;
        dictCode: string | null;
        placeholder: string | null;
        required: boolean;
    }>;
    create(input: CreateCustomFieldDto, actor: ActorContext): Promise<{
        code: string;
        type: string;
        sortOrder: number;
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        builtin: boolean;
        label: string;
        dictCode: string | null;
        placeholder: string | null;
        required: boolean;
    }>;
    update(id: string, input: UpdateCustomFieldDto, actor: ActorContext): Promise<{
        code: string;
        type: string;
        sortOrder: number;
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        builtin: boolean;
        label: string;
        dictCode: string | null;
        placeholder: string | null;
        required: boolean;
    }>;
    remove(id: string, actor: ActorContext): Promise<{
        id: string;
        deleted: boolean;
    }>;
    validateAndSanitize(values: Record<string, string>): Promise<Record<string, string>>;
}
export {};
