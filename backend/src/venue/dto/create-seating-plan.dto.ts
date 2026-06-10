import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSeatingPlanDto {
  @IsString()
  @IsNotEmpty()
  layoutId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;
}
