import { IsArray, ArrayMinSize, IsString } from 'class-validator';

export interface MerchantCategoryRuleResponse {
  id: string;
  merchantNormalized: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ReapplyMerchantRuleDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  categoryIds!: string[];
}
