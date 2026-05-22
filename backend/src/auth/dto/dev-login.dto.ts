import { IsString, MaxLength, MinLength } from 'class-validator';

export class DevLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;
}
