import type { Currency } from '@budget/shared-types';

// Currency formatting
const currencyConfig: Record<Currency, { symbol: string; locale: string; position: 'before' | 'after' }> = {
  USD: { symbol: '$', locale: 'en-US', position: 'before' },
  EUR: { symbol: '€', locale: 'de-DE', position: 'after' },
  PLN: { symbol: 'zł', locale: 'pl-PL', position: 'after' },
  GBP: { symbol: '£', locale: 'en-GB', position: 'before' },
  UAH: { symbol: '₴', locale: 'uk-UA', position: 'after' },
  RUB: { symbol: '₽', locale: 'ru-RU', position: 'after' },
};

export function formatCurrency(amount: number, currency: Currency): string {
  const config = currencyConfig[currency];
  const formatted = new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return config.position === 'before' ? `${config.symbol}${formatted}` : `${formatted} ${config.symbol}`;
}

export function formatCompactCurrency(amount: number, currency: Currency): string {
  const config = currencyConfig[currency];

  if (amount >= 1000000) {
    const formatted = (amount / 1000000).toFixed(1);
    return config.position === 'before'
      ? `${config.symbol}${formatted}M`
      : `${formatted}M ${config.symbol}`;
  }

  if (amount >= 1000) {
    const formatted = (amount / 1000).toFixed(1);
    return config.position === 'before'
      ? `${config.symbol}${formatted}K`
      : `${formatted}K ${config.symbol}`;
  }

  return formatCurrency(amount, currency);
}

export function getCurrencySymbol(currency: Currency): string {
  return currencyConfig[currency].symbol;
}

// Date formatting
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions, locale: string = 'en-US'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  }
}

// Date range helpers
export function getStartOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getStartOfMonth(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfMonth(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getStartOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfWeek(date: Date = new Date()): Date {
  const start = getStartOfWeek(date);
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Percentage formatting
export function formatPercentage(value: number, decimals: number = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatPercentageChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// Number formatting
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('en-US', options).format(value);
}

export function formatCompactNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}
