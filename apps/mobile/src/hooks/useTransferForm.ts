import { useState, useEffect, useMemo, useRef } from 'react';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { parseAmount } from '@/utils/amount';
import { useWalletStore } from '@/stores/walletStore';
import { useAccountStore } from '@/stores/accountStore';
import { api } from '@/services/api';
import type { Currency } from '@budget/shared-types';
import {
  buildFrequentTransfers,
  type FrequentTransfer,
} from '@/features/wallet/frequentTransfers';
import { exceedsAvailable, resolveAccountBalance } from '@/features/wallet/transferBalances';
import { useTranslation } from 'react-i18next';

/**
 * Owns all form state, FX-rate lookup, and submit logic for the transfer-creation
 * screen. Pure data/behavior layer — the screen owns only the JSX and theme/style
 * concerns. Mirrors `useExpenseMultiSelect`/`useHomeScreenData`: subscribes to the
 * stores it needs itself so the screen doesn't have to thread props through.
 */
export function useTransferForm() {
  const { t } = useTranslation();
  const addTransfer = useWalletStore((s) => s.addTransfer);
  const transfers = useWalletStore((s) => s.transfers);
  const walletSummary = useWalletStore((s) => s.walletSummary);
  const accountSummaries = useWalletStore((s) => s.accountSummaries);
  const loadAccountSummaries = useWalletStore((s) => s.loadAccountSummaries);
  const accounts = useAccountStore((s) => s.accounts);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  const [fromAccountId, setFromAccountId] = useState(currentAccountId || '');
  const [toAccountId, setToAccountId] = useState('');
  const [fromCurrency, setFromCurrency] = useState<Currency>('USD');
  const [toCurrency, setToCurrency] = useState<Currency>('USD');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [notes, setNotes] = useState('');
  const [countAsIncome, setCountAsIncome] = useState(false);
  const [loadingRate, setLoadingRate] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // A frequent-transfer chip carries its own currencies. Without these guards the
  // account-change effects below would immediately overwrite them with each
  // account's default currency, silently discarding what the chip restored.
  const prefillFromRef = useRef(false);
  const prefillToRef = useRef(false);

  // Balances of the *other* accounts are server-side only — the local SQLite
  // mirror holds nothing for an account the user has never opened.
  useEffect(() => {
    loadAccountSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set default currencies from selected accounts
  useEffect(() => {
    if (prefillFromRef.current) {
      prefillFromRef.current = false;
      return;
    }
    const fromAccount = accounts.find((a) => a.id === fromAccountId);
    if (fromAccount) setFromCurrency(fromAccount.currencyCode as Currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAccountId]);

  useEffect(() => {
    if (prefillToRef.current) {
      prefillToRef.current = false;
      return;
    }
    const toAccount = accounts.find((a) => a.id === toAccountId);
    if (toAccount) setToCurrency(toAccount.currencyCode as Currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toAccountId]);

  const fetchRate = async () => {
    setLoadingRate(true);
    try {
      const data = await api.getExchangeRates(fromCurrency);
      const rate = data.rates[toCurrency];
      if (rate) {
        setExchangeRate(rate.toFixed(4));
        if (fromAmount) {
          setToAmount((parseAmount(fromAmount) * rate).toFixed(2));
        }
      }
    } catch {
      // ignore — rate field stays empty
    } finally {
      setLoadingRate(false);
    }
  };

  // Fetch exchange rate when currencies differ
  useEffect(() => {
    if (fromCurrency === toCurrency) {
      setExchangeRate('1');
      if (fromAmount) setToAmount(fromAmount);
      return;
    }
    fetchRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCurrency, toCurrency]);

  const onFromAmountChange = (value: string) => {
    setFromAmount(value);
    if (value && exchangeRate) {
      setToAmount((parseAmount(value) * parseAmount(exchangeRate)).toFixed(2));
    } else {
      setToAmount('');
    }
  };

  const onToAmountChange = (value: string) => {
    setToAmount(value);
    if (value && exchangeRate) {
      setFromAmount((parseAmount(value) / parseAmount(exchangeRate)).toFixed(2));
    } else {
      setFromAmount('');
    }
  };

  const onRateChange = (value: string) => {
    setExchangeRate(value);
    if (fromAmount && value) {
      setToAmount((parseAmount(fromAmount) * parseAmount(value)).toFixed(2));
    }
  };

  const balanceSources = useMemo(
    () => ({ accountSummaries, localSummary: walletSummary, currentAccountId }),
    [accountSummaries, walletSummary, currentAccountId],
  );

  const payableAccounts = useMemo(
    () => accounts.filter((a) => a.myRole !== 'viewer'),
    [accounts],
  );

  const otherAccounts = useMemo(
    () => accounts.filter((a) => a.id !== fromAccountId),
    [accounts, fromAccountId],
  );

  const frequentTransfers = useMemo(
    () =>
      buildFrequentTransfers(transfers, {
        eligibleAccountIds: accounts.map((a) => a.id),
        readOnlyAccountIds: accounts.filter((a) => a.myRole === 'viewer').map((a) => a.id),
      }),
    [transfers, accounts],
  );

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '…';

  /** Balance shown under an account chip, in that account's own currency. */
  const chipBalance = (id: string, currencyCode: string) =>
    resolveAccountBalance(balanceSources, id, currencyCode);

  // Keyed to the *selected* transfer currency, not the account's default: the
  // amount is entered in `fromCurrency`, so that is the balance that constrains it.
  const availableFrom = resolveAccountBalance(balanceSources, fromAccountId, fromCurrency);
  const isOverBalance = exceedsAvailable(parseAmount(fromAmount), availableFrom);

  const applyFrequentTransfer = (f: FrequentTransfer) => {
    if (f.fromAccountId !== fromAccountId) prefillFromRef.current = true;
    if (f.toAccountId !== toAccountId) prefillToRef.current = true;
    setFromAccountId(f.fromAccountId);
    setToAccountId(f.toAccountId);
    setFromCurrency(f.fromCurrency);
    setToCurrency(f.toCurrency);
    setExchangeRate(String(f.exchangeRate));
    setFromAmount(String(f.fromAmount));
    setToAmount(String(f.toAmount));
  };

  const applyMaxAmount = () => {
    if (availableFrom !== null && availableFrom > 0) {
      onFromAmountChange(availableFrom.toFixed(2));
    }
  };

  const handleSubmit = () => {
    if (!fromAccountId || !toAccountId) {
      showAlert(t('common.error'), t('transfer.sameAccountError'));
      return;
    }
    if (fromAccountId === toAccountId) {
      showAlert(t('common.error'), t('transfer.sameAccountError'));
      return;
    }

    const from = parseAmount(fromAmount);
    const to = parseAmount(toAmount);
    const rate = parseAmount(exchangeRate);

    if (!from || !to || !rate || from <= 0 || to <= 0 || rate <= 0) {
      showAlert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    addTransfer({
      fromAccountId,
      fromCurrency,
      fromAmount: from,
      toAccountId,
      toCurrency,
      toAmount: to,
      exchangeRate: rate,
      date,
      notes: notes || undefined,
      countAsIncome,
    });

    router.back();
  };

  return {
    // account/currency/amount state
    fromAccountId,
    setFromAccountId,
    toAccountId,
    setToAccountId,
    fromCurrency,
    setFromCurrency,
    toCurrency,
    setToCurrency,
    fromAmount,
    onFromAmountChange,
    toAmount,
    onToAmountChange,
    exchangeRate,
    onRateChange,
    loadingRate,
    // notes/income/date
    notes,
    setNotes,
    countAsIncome,
    setCountAsIncome,
    date,
    setDate,
    showDatePicker,
    setShowDatePicker,
    // derived
    payableAccounts,
    otherAccounts,
    frequentTransfers,
    accountName,
    chipBalance,
    availableFrom,
    isOverBalance,
    // actions
    applyFrequentTransfer,
    applyMaxAmount,
    handleSubmit,
  };
}

export type UseTransferFormReturn = ReturnType<typeof useTransferForm>;
