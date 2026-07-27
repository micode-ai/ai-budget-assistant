import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { SplitParticipantInput } from '@budget/shared-types';

// The shared-types CreateSplitDto/SplitParticipantInput are plain interfaces with no
// class-validator decorators, so NestJS's ValidationPipe silently skips them (same gap
// SettleUpPayDto closed for trip settle-up). These local decorated classes are what's
// actually bound in the controller's @Body(). The service re-validates independently
// (it is unit-tested directly, bypassing the HTTP pipe), so these are defense in depth.
export class SplitParticipantInputDto implements SplitParticipantInput {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];
}

export class CreateSplitDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SplitParticipantInputDto)
  participants: SplitParticipantInputDto[];

  @IsIn(['items', 'equal'])
  mode: 'items' | 'equal';
}
