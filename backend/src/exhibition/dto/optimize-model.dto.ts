import { IsIn, IsOptional } from 'class-validator';
import type { OptimizePreset } from '../exhibition-model-optimize.service';

export class OptimizeModelDto {
  @IsOptional()
  @IsIn(['orig', 'medium', 'small'])
  preset?: OptimizePreset;
}
