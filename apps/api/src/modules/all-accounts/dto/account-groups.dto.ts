import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, Length } from 'class-validator';

/** Body of POST / PATCH `/account-groups`. Shape mirrors `UpsertAccountGroupDto` in shared-types. */
export class UpsertAccountGroupBody {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  accountIds!: string[];
}
