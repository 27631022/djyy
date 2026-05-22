import type { Request } from 'express';
import { UserCustomFieldService } from './user-custom-field.service';
import { AuthPayload } from '../auth/auth.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
export declare class UserCustomFieldController {
    private readonly service;
    constructor(service: UserCustomFieldService);
    list(inactive?: string): Promise<{
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
    create(dto: CreateCustomFieldDto, me: AuthPayload, req: Request): Promise<{
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
    update(id: string, dto: UpdateCustomFieldDto, me: AuthPayload, req: Request): Promise<{
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
    remove(id: string, me: AuthPayload, req: Request): Promise<{
        id: string;
        deleted: boolean;
    }>;
}
