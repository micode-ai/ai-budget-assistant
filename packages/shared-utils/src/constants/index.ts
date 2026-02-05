import type { Currency, CategoryType } from '@budget/shared-types';

// Default categories
export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Food & Dining', icon: 'utensils', color: '#FF6B6B' },
  { name: 'Transportation', icon: 'car', color: '#4ECDC4' },
  { name: 'Shopping', icon: 'shopping-bag', color: '#45B7D1' },
  { name: 'Entertainment', icon: 'film', color: '#96CEB4' },
  { name: 'Bills & Utilities', icon: 'file-invoice', color: '#FFEAA7' },
  { name: 'Healthcare', icon: 'heartbeat', color: '#DDA0DD' },
  { name: 'Education', icon: 'book', color: '#98D8C8' },
  { name: 'Personal Care', icon: 'spa', color: '#F7DC6F' },
  { name: 'Home', icon: 'home', color: '#BB8FCE' },
  { name: 'Travel', icon: 'plane', color: '#85C1E9' },
  { name: 'Gifts & Donations', icon: 'gift', color: '#F1948A' },
  { name: 'Subscriptions', icon: 'redo', color: '#82E0AA' },
  { name: 'Other', icon: 'ellipsis-h', color: '#AEB6BF' },
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', icon: 'briefcase', color: '#27AE60' },
  { name: 'Freelance', icon: 'laptop', color: '#3498DB' },
  { name: 'Investments', icon: 'chart-line', color: '#9B59B6' },
  { name: 'Gifts', icon: 'gift', color: '#E74C3C' },
  { name: 'Other Income', icon: 'plus-circle', color: '#1ABC9C' },
] as const;

// Supported currencies
export const SUPPORTED_CURRENCIES: { code: Currency; name: string; symbol: string }[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
];

// Budget periods
export const BUDGET_PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
] as const;

// Alert thresholds
export const DEFAULT_ALERT_THRESHOLDS = [50, 75, 90, 100] as const;

// Sync settings
export const SYNC_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 1000,
  batchSize: 50,
  conflictResolutionStrategies: ['server-wins', 'client-wins', 'merge', 'user-decide'] as const,
  defaultStrategy: 'merge' as const,
};

// API settings
export const API_CONFIG = {
  timeout: 30000,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  supportedAudioFormats: ['webm', 'mp3', 'wav', 'm4a', 'ogg'] as const,
  supportedImageFormats: ['jpg', 'jpeg', 'png', 'heic'] as const,
};

// Chat settings
export const CHAT_CONFIG = {
  maxMessageLength: 4000,
  maxHistoryMessages: 20,
  streamingEnabled: true,
};

// Analytics time ranges
export const TIME_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
] as const;

// Chart colors palette
export const CHART_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
  '#F1948A',
  '#82E0AA',
  '#AEB6BF',
] as const;

// UUID generation (simple version, use uuid package in production)
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Debounce utility
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Throttle utility
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// Sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry utility
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; backoff?: boolean } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = true } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = backoff ? delayMs * Math.pow(2, attempt) : delayMs;
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
