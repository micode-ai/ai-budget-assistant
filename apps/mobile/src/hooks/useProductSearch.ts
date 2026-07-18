import { useCallback, useMemo, useState } from 'react';
import { api } from '@/services/api';
import type { ProductListItem } from '@budget/shared-types';

const FREQUENT_COUNT = 8;

export function useProductSearch() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const load = useCallback(() => {
    setLoadingProducts(true);
    api
      .getProducts()
      .then((list) => {
        setProducts([...list].sort((a, b) => b.purchaseCount - a.purchaseCount));
      })
      .catch((e) => console.warn('Failed to load tracked products:', e))
      .finally(() => setLoadingProducts(false));
  }, []);

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const filteredProducts = useMemo(
    () =>
      trimmedQuery
        ? products.filter((p) => p.canonicalName.toLowerCase().includes(lowerQuery))
        : [],
    [products, trimmedQuery, lowerQuery],
  );
  const frequentlyBought = useMemo(() => products.slice(0, FREQUENT_COUNT), [products]);
  const hasExactMatch = useMemo(
    () => (trimmedQuery ? products.some((p) => p.canonicalName.toLowerCase() === lowerQuery) : false),
    [products, trimmedQuery, lowerQuery],
  );

  return {
    query,
    setQuery,
    trimmedQuery,
    loadingProducts,
    filteredProducts,
    frequentlyBought,
    hasExactMatch,
    load,
  };
}
