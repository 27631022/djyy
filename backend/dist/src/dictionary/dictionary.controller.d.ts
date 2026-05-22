import type { Request } from 'express';
import { DictionaryService } from './dictionary.service';
import { AuthPayload } from '../auth/auth.service';
import { CreateDictionaryDto } from './dto/create-dictionary.dto';
import { UpdateDictionaryDto } from './dto/update-dictionary.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';
export declare class DictionaryController {
    private readonly dicts;
    constructor(dicts: DictionaryService);
    list(inactive?: string): Promise<{
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
    findOne(idOrCode: string, inactive?: string): Promise<{
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
    create(dto: CreateDictionaryDto, me: AuthPayload, req: Request): Promise<{
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
    update(id: string, dto: UpdateDictionaryDto, me: AuthPayload, req: Request): Promise<{
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
    remove(id: string, me: AuthPayload, req: Request): Promise<{
        id: string;
        deleted: boolean;
    }>;
    createItem(id: string, dto: CreateDictItemDto, me: AuthPayload, req: Request): Promise<{
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
    updateItem(id: string, itemId: string, dto: UpdateDictItemDto, me: AuthPayload, req: Request): Promise<{
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
    removeItem(id: string, itemId: string, me: AuthPayload, req: Request): Promise<{
        id: string;
        deleted: boolean;
    }>;
}
