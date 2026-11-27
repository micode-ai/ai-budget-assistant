import type { SupportContext, SupportThreadStatus } from '../entities/support';

export interface SendSupportMessageDto {
  body: string;
  context: SupportContext;
}

export interface UpdateSupportThreadDto {
  autoTranslate: boolean;
}

export interface AdminSupportReplyDto {
  body: string;
}

export interface AdminUpdateSupportThreadDto {
  status?: SupportThreadStatus;
  muted?: boolean;
}
