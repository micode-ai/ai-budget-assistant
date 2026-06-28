/**
 * Notification Auto-Capture service.
 * Subscribes to onBankNotification DeviceEventEmitter events (Android only) and
 * turns each matching notification into an expense via the existing offline-first pipeline.
 *
 * Responsibilities:
 *  1. Parse the raw notification text via notificationParser
 *  2. Dedup via externalRef (sha256-based, matches the spec §2a formula)
 *  3. Resolve category via merchantRulesStore → suggestCategoryFromMerchantPL → uncategorized
 *  4. Write expense via expenseStore.addExpense (SQLite first, API fire-and-forget)
 *  5. Emit an in-app toast so the user sees the capture happened
 *
 * OFFLINE-FIRST: follows expenseStore.addExpense — SQLite write is awaited; API call is
 * fire-and-forget with console.warn on failure (never console.error per CLAUDE.md offline rule).
 *
 * NEVER import from apps/api/ — mobile-engineer scope only.
 */
import { Platform } from 'react-native';
import { addBankNotificationListener, type BankNotificationPayload } from '@/services/notificationCapture';
import { parseNotification } from '../notificationParser';
import { useExpenseStore } from '@/stores/expenseStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useMerchantRulesStore } from '@/stores/merchantRulesStore';
import { useAuthStore } from '@/stores/authStore';
import { sha256SimpleHex } from './dedup';

/** In-app toast callback — injected by the settings screen / app root to avoid hard dep on UI. */
let _toastHandler: ((message: string, expenseId: string) => void) | null = null;

export function setToastHandler(handler: (message: string, expenseId: string) => void): void {
  _toastHandler = handler;
}

let _unsubscribe: (() => void) | null = null;

/**
 * Start listening for bank notification events.
 * Safe to call on all platforms — on iOS/web the subscription is a no-op.
 * Called from app/_layout.tsx after authentication (or from auto-capture settings toggle).
 */
export function subscribeToCapture(): void {
  if (Platform.OS !== 'android') return;
  if (_unsubscribe) return; // already subscribed

  _unsubscribe = addBankNotificationListener(handleBankNotification);
}

/**
 * Stop listening (called on logout or when the user disables the feature).
 */
export function unsubscribeFromCapture(): void {
  _unsubscribe?.();
  _unsubscribe = null;
}

async function handleBankNotification(payload: BankNotificationPayload): Promise<void> {
  try {
    const parsed = parseNotification(
      payload.packageName,
      payload.title,
      payload.text,
      payload.postedAt,
    );
    if (!parsed) return;

    const { amount, merchant, currencyCode, occurredAt, suggestedCategory } = parsed;

    // --- Dedup ---
    const isoDate = occurredAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const dedupKey = `${payload.packageName}|${amount}|${merchant ?? ''}|${isoDate}`;
    const externalRef = `notif:${await sha256SimpleHex(dedupKey)}`;

    const existingExpenses = useExpenseStore.getState().expenses;
    const alreadyExists = existingExpenses.some(
      (e) => e.externalRef === externalRef && !e.isDeleted,
    );
    if (alreadyExists) return; // server-side unique constraint is the backstop, this is the fast path

    // --- Category resolution ---
    // Priority: merchantRulesStore (user-trained) → suggestCategoryFromMerchantPL → undefined
    let categoryId: string | undefined;
    if (merchant) {
      const merchantRulesStore = useMerchantRulesStore.getState();
      if (!merchantRulesStore.isLoaded) {
        // Best-effort load; skip if not available (offline or first launch)
        try { await merchantRulesStore.loadRules(); } catch { /* ignore */ }
      }
      const ruleCategoryId = merchant ? merchantRulesStore.getRuleForMerchant(merchant) : null;
      if (ruleCategoryId) {
        categoryId = ruleCategoryId;
      } else if (suggestedCategory) {
        // Resolve category name to local id
        const catStore = useCategoryStore.getState();
        const cat = catStore.getCategoryByName(suggestedCategory, 'expense');
        categoryId = cat?.id;
      }
    }

    // --- Create expense (offline-first) ---
    const userId = useAuthStore.getState().user?.id ?? '';
    const expense = await useExpenseStore.getState().addExpense({
      userId,
      amount,
      currencyCode: currencyCode as any,
      description: merchant
        ? `${merchant} (auto-captured)`
        : `Bank notification (auto-captured)`,
      merchant: merchant ?? undefined,
      date: occurredAt,
      categoryId,
      source: 'notification',
      externalRef,
      isRecurring: false,
      isDebt: false,
      isDebtRepayment: false,
    });

    // --- UX feedback: in-app toast ---
    if (_toastHandler) {
      const label = merchant
        ? `${amount.toFixed(2)} ${currencyCode} · ${merchant}`
        : `${amount.toFixed(2)} ${currencyCode}`;
      _toastHandler(label, expense.id);
    }
  } catch (e) {
    // Log with warn, never error (CLAUDE.md offline-logging rule + no crash reporting)
    console.warn('[NotificationCapture] Failed to process notification:', e);
  }
}
