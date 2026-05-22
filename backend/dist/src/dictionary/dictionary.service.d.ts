import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDictionaryDto } from './dto/create-dictionary.dto';
import { UpdateDictionaryDto } from './dto/update-dictionary.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';
interface ActorContext {
    actorId?: string;
    actorName?: string;
    ip?: string;
}
export declare class DictionaryService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    listDictionaries(includeInactive?: boolean): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        builtin: boolean;
        sortOrder: number;
        active: boolean;
        createdAt: Date;
        updatedAt: Date;
        itemCount: number;
    }[]>;
    findDictionary(idOrCode: string, includeInactiveItems?: boolean): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        builtin: boolean;
        sortOrder: number;
        active: boolean;
        createdAt: Date;
        updatedAt: Date;
        items: {
            code: string;
            parentId: string | null;
            sortOrder: number;
            active: boolean;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            label: string;
            dictId: string;
        }[];
    }>;
    findByIdOrCode(idOrCode: string): Promise<{
        name: string;
        code: string;
        sortOrder: number;
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        builtin: boolean;
    }>;
    create(input: CreateDictionaryDto, actor: ActorContext): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        builtin: boolean;
        sortOrder: number;
        active: boolean;
        createdAt: Date;
        updatedAt: Date;
        items: {
            code: string;
            parentId: string | null;
            sortOrder: number;
            active: boolean;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            label: string;
            dictId: string;
        }[];
    }>;
    update(id: string, input: UpdateDictionaryDto, actor: ActorContext): Promise<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        builtin: boolean;
        sortOrder: number;
        active: boolean;
        createdAt: Date;
        updatedAt: Date;
        items: {
            code: string;
            parentId: string | null;
            sortOrder: number;
            active: boolean;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            label: string;
            dictId: string;
        }[];
    }>;
    remove(id: string, actor: ActorContext): Promise<{
        id: string;
        deleted: boolean;
    }>;
    createItem(dictId: string, input: CreateDictItemDto, actor: ActorContext): Promise<{
        code: string;
        parentId: string | null;
        sortOrder: number;
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        label: string;
        dictId: string;
    }>;
    updateItem(dictId: string, itemId: string, input: UpdateDictItemDto, actor: ActorContext): Promise<{
        code: string;
        parentId: string | null;
        sortOrder: number;
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        label: string;
        dictId: string;
    }>;
    removeItem(dictId: string, itemId: string, actor: ActorContext): Promise<{
        id: string;
        deleted: boolean;
    }>;
    private validateParentId;
    private nextSortOrder;
}
export {};
