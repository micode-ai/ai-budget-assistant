import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { initializeDatabase, db } from './client';
import { hydrateTransactions } from '@/stores/hydrateTransactions';

interface DatabaseContextValue {
  isReady: boolean;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  isReady: false,
  error: null,
});

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return { ...context, db };
}

interface DatabaseProviderProps {
  children: ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function init() {
      try {
        await initializeDatabase();
        setIsReady(true);
        await hydrateTransactions();
      } catch (e) {
        console.error('Failed to initialize database:', e);
        setError(e instanceof Error ? e : new Error('Database initialization failed'));
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DatabaseContext.Provider value={{ isReady, error }}>
      {children}
    </DatabaseContext.Provider>
  );
}
