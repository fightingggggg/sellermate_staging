import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { doc, onSnapshot, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MEMBERSHIP_LIMITS } from '@/types';
import { getKSTDateKeyWith7AMCutoff } from '@/lib/utils';

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

    const todayKey = getKSTDateKeyWith7AMCutoff();
    const docRef = doc(db, `users/${safeEmail}/usage`, todayKey);

    const unsubscribe = onSnapshot(docRef, async (snap) => {
      const data = snap.exists() ? snap.data() as any : {};
      
      // 멤버십 타입 확인
      let membershipType: 'basic' | 'booster' = 'basic';
      try {
        // subscriptions 컬렉션에서 활성 또는 취소된 구독 확인
        const subscriptionsRef = collection(db, 'subscriptions');
        const q = query(
          subscriptionsRef,
          where('uid', '==', safeEmail),
          where('status', 'in', ['ACTIVE', 'CANCELLED'])
        );
        
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const subscriptionDoc = querySnapshot.docs[0];
          const subscriptionData = subscriptionDoc.data();
          
          // plan이 BOOSTER이고 아직 해지 예정일이 지나지 않았으면 booster
          if (subscriptionData.plan === 'BOOSTER') {
            const endDate = subscriptionData.endDate?.toDate?.() || new Date();
            const now = new Date();
            
            // 해지 예정일까지는 부스터 멤버십 사용 가능
            if (endDate > now) {
              membershipType = 'booster';
            }
          }
        }
      } catch (error) {
        console.warn('Failed to get user membership type:', error);
      }

      const maxKeywordAnalysis = MEMBERSHIP_LIMITS[membershipType].dailyKeywordAnalysis;
      const maxProductOptimization = MEMBERSHIP_LIMITS[membershipType].dailyProductOptimization;
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