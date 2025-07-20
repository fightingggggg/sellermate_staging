import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
// import { MEMBERSHIP_LIMITS } from '@/types';
import { HistoryService } from '@/lib/historyService';

interface HistoryLimitInfo {
  currentCount: number;
  maxCount: number;
  membershipType: 'basic' | 'booster';
  canSave: boolean;
  isLoading: boolean;
}

export function useHistoryLimit() {
  const { currentUser } = useAuth();
  const [limitInfo, setLimitInfo] = useState<HistoryLimitInfo>({
    currentCount: 0,
    maxCount: 10,
    membershipType: 'basic',
    canSave: true,
    isLoading: false
  });

  const checkHistoryLimit = async () => {
    if (!currentUser?.email) {
      setLimitInfo({
        currentCount: 0,
        maxCount: 10,
        membershipType: 'basic',
        canSave: true,
        isLoading: false
      });
      return;
    }

    setLimitInfo(prev => ({ ...prev, isLoading: true }));

    try {
      const info = await HistoryService.getHistoryLimit(currentUser.email);

      setLimitInfo({
        currentCount: info.currentCount,
        maxCount: info.maxCount,
        membershipType: info.membershipType,
        canSave: info.canSave,
        isLoading: false
      });

    } catch (error) {
      console.error('Error checking history limit:', error);
      setLimitInfo(prev => ({ ...prev, isLoading: false }));
    }
  };

  useEffect(() => {
    checkHistoryLimit();

    const handler = () => {
      checkHistoryLimit();
    };
    window.addEventListener('historyUpdated', handler as EventListener);
    return () => {
      window.removeEventListener('historyUpdated', handler as EventListener);
    };
  }, [currentUser?.email]);

  return {
    ...limitInfo,
    checkHistoryLimit
  };
} 