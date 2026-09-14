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
import type { SplitParticipantInput, ReassignSplitItemInput } from '@budget/shared-types';

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

/**
 * Body of `PATCH :id/receipt-split/items/:itemId/reassign` (ABA-546, in-place
 * line reassignment). See docs/contracts/receipt-split-in-place-reassignment.md.
 * `participantIds` is the FULL new claimant list for the item — the service
 * re-validates every id against the split's live participants independently.
 */
export class ReassignSplitItemDto implements ReassignSplitItemInput {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  participantIds: string[];
}

/**
 * Body of the public, unauthenticated `POST /s/:token/flag` (guest-split-item-dispute).
 * Both fields are optional and BOTH must still be re-validated server-side against the
 * real participant/expense before use — `itemId` here is only "a string this form
 * submitted", never "an item id this guest is entitled to name" (see
 * GuestController.flagItem's clamping against `participant.itemIds`).
 */
export class FlagSplitItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  itemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
