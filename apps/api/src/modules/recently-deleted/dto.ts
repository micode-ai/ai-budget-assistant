import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RestoreItemDto {
  @IsIn(['expense', 'income'])
  entityType!: 'expense' | 'income';

  @IsString()
  id!: string;
}

export class RestoreDeletedDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RestoreItemDto)
  items!: RestoreItemDto[];
}
