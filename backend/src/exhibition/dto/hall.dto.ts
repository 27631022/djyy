import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Fixture, HallMeta, Wall } from '../exhibition.types';

/**
 * 新建展厅 — 保存平面图 JSON(规格 5.5 POST /halls)。
 * meta/walls/fixtures 以结构化对象提交,service 落库时 JSON.stringify;素材以 fileId 引用。
 * P1 深层结构不强校验(管理端 P2/P3 才产出),只保证顶层形状与必填。
 */
export class CreateHallDto {
  @IsString() @MinLength(1) @MaxLength(128)
  name!: string;

  @IsOptional() @IsObject()
  meta?: HallMeta;

  @IsOptional() @IsArray()
  walls?: Wall[];

  @IsOptional() @IsArray()
  fixtures?: Fixture[];

  @IsOptional() @IsString()
  thumbnailFileId?: string;

  @IsOptional() @IsString()
  envModelFileId?: string;

  @IsOptional() @IsBoolean()
  published?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;
}

/** 更新展厅(规格 5.5 PUT /halls/:id;本项目用 PATCH 部分更新) */
export class UpdateHallDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128)
  name?: string;

  @IsOptional() @IsObject()
  meta?: HallMeta;

  @IsOptional() @IsArray()
  walls?: Wall[];

  @IsOptional() @IsArray()
  fixtures?: Fixture[];

  @IsOptional() @IsString()
  thumbnailFileId?: string;

  @IsOptional() @IsString()
  envModelFileId?: string;

  @IsOptional() @IsBoolean()
  published?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;
}
