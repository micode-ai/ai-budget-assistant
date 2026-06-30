import { IsString, IsIn } from 'class-validator';

export const ALLOWED_EMOJIS = ['👍', '❤️', '😮', '😂', '🔥', '😬'] as const;

export class ReactToFeedEventApiDto {
  @IsString()
  @IsIn(ALLOWED_EMOJIS as unknown as string[])
  emoji: string;
}
