export type VoiceDigestChannel = 'telegram' | 'whatsapp' | 'slack';

export interface VoiceDigestSettings {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday, in the user's time zone. */
  day: number;
  /** 0–23, in the user's time zone. */
  hour: number;
  channel: VoiceDigestChannel | null;
  /** Bots this user has linked — the only valid channel choices. */
  availableChannels: VoiceDigestChannel[];
  /** False when WhatsApp is linked but the digest template is not configured yet. */
  whatsappAvailable: boolean;
}

export interface UpdateVoiceDigestDto {
  enabled?: boolean;
  day?: number;
  hour?: number;
  channel?: VoiceDigestChannel;
}
