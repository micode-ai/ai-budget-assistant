import type { CategoryType } from '../entities';

export interface CreateCategoryDto {
  name: string;
  icon?: string;
  color?: string;
  type: CategoryType;
  parentId?: string;
}

export interface UpdateCategoryDto {
  name?: string;
  icon?: string;
  color?: string;
  parentId?: string | null;
}

export interface CategorySuggestionResponse {
  categoryId?: string;
  categoryName: string;
  confidence: number;
  source: 'history' | 'ai';
}
