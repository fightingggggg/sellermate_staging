import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface UsageStat {
  current: number;
  max: number;
  remaining: number;
}

export interface UsageInfo {
  keywordAnalysis: UsageStat;
  productOptimization: UsageStat;
}

interface UsageContextValue {
  usageInfo: UsageInfo | null;
  isLoading: boolean;
}

const UsageContext = createContext<UsageContextValue>({ usageInfo: null, isLoading: true });

export function UsageProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // reset when user changes
    setUsageInfo(null);
    if (!currentUser?.email) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const safeEmail = currentUser.email
      .replace(/\./g, '_dot_')
      .replace(/@/g, '_at_')
      .replace(/-/g, '_dash_')
      .replace(/\+/g, '_plus_');

    const today = new Date().toISOString().split('T')[0];
    const docRef = doc(db, `users/${safeEmail}/usage`, today);

    const unsubscribe = onSnapshot(docRef, (snap) => {
      const data = snap.exists() ? snap.data() as any : {};
      const maxKeywordAnalysis = 10;
      const maxProductOptimization = 10;
      const keywordCurrent = data.keywordAnalysis || 0;
      const productCurrent = data.productOptimization || 0;

      setUsageInfo({
        keywordAnalysis: {
          current: keywordCurrent,
          max: maxKeywordAnalysis,
          remaining: Math.max(0, maxKeywordAnalysis - keywordCurrent)
        },
        productOptimization: {
          current: productCurrent,
          max: maxProductOptimization,
          remaining: Math.max(0, maxProductOptimization - productCurrent)
        }
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.email]);

  return (
    <UsageContext.Provider value={{ usageInfo, isLoading }}>
      {children}
    </UsageContext.Provider>
  );
}

export function useUsage() {
  return useContext(UsageContext);
} 