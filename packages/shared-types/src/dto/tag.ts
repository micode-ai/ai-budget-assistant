export interface CreateTagDto {
  name: string;
  color?: string;
  icon?: string;
  clientId?: string;
}

export interface UpdateTagDto {
  name?: string;
  color?: string | null;
  icon?: string | null;
}

export interface TagSuggestionResponse {
  tags: Array<{
    name: string;
    confidence: number;
    source: 'history' | 'ai';
    existingTagId?: string;
  }>;
}
