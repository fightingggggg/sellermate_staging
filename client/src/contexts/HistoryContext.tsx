import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { KeywordHistory } from '@/types';
import { HistoryService } from '@/lib/historyService';
import { useAuth } from './AuthContext';

interface HistoryCache {
  [key: string]: {
    data: KeywordHistory[];
    timestamp: number;
    loading: boolean;
    lastFetch: number;
  };
}

interface HistoryContextType {
  getHistory: (type: KeywordHistory['type']) => KeywordHistory[];
  isLoading: (type: KeywordHistory['type']) => boolean;
  refreshHistory: (type: KeywordHistory['type']) => Promise<void>;
  refreshAllHistory: () => Promise<void>;
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

const CACHE_DURATION = 5 * 60 * 1000; // 5분 캐시
const MIN_FETCH_INTERVAL = 30 * 1000; // 최소 30초 간격으로 API 호출

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<HistoryCache>({});
  const { currentUser } = useAuth();
  const loadingRef = useRef<Set<string>>(new Set()); // 현재 로딩 중인 타입들 추적

  // 사용자가 변경되면 캐시 초기화 및 프리로딩
  useEffect(() => {
    setCache({});
    loadingRef.current.clear();
    
    // 로그인된 사용자의 히스토리 프리로딩
    if (currentUser?.email) {
      const types: KeywordHistory['type'][] = ['keyword-analysis', 'complete-optimizer', 'quick-optimizer'];
      
      // 로컬 캐시에서 즉시 로드
      types.forEach(type => {
        const localCached = HistoryService.getFromLocalCache(currentUser.email!, type);
        if (localCached && localCached.length > 0) {
          console.log(`[HistoryContext] Preloading from local cache for ${type}:`, localCached.length, 'items');
          const now = Date.now();
          setCache(prev => ({
            ...prev,
            [type]: {
              data: localCached,
              timestamp: now,
              loading: false,
              lastFetch: now - CACHE_DURATION + 60000 // 1분 여유로 API 호출 방지
            }
          }));
        }
      });
    }
  }, [currentUser?.email]);

  // 히스토리 로드 함수 (중복 호출 방지)
  const loadHistory = async (type: KeywordHistory['type'], force: boolean = false) => {
    if (!currentUser?.email) {
      const now = Date.now();
      // 렌더링 중 setState 경고를 피하기 위해 다음 이벤트 루프에서 처리
      setTimeout(() => {
        setCache(prev => ({
          ...prev,
          [type]: { 
            data: [], 
            timestamp: now, 
            loading: false,
            lastFetch: now
          }
        }));
      }, 0);
      return;
    }

    // 이미 로딩 중이면 중복 호출 방지
    const loadingKey = `${currentUser.email}_${type}`;
    if (loadingRef.current.has(loadingKey) && !force) {
      console.log(`[HistoryContext] Skipping duplicate load for ${type}`);
      return;
    }

    // 최근에 호출했으면 스킵 (force가 아닌 경우)
    const cached = cache[type];
    if (!force && cached && (Date.now() - cached.lastFetch < MIN_FETCH_INTERVAL)) {
      console.log(`[HistoryContext] Skipping recent fetch for ${type}`);
      return;
    }

    loadingRef.current.add(loadingKey);

    // 로딩 상태 설정
    setCache(prev => ({
      ...prev,
      [type]: { 
        ...prev[type], 
        loading: true,
        data: prev[type]?.data || [],
        timestamp: prev[type]?.timestamp || Date.now(),
        lastFetch: prev[type]?.lastFetch || 0
      }
    }));

    try {
      const historyData = await HistoryService.getHistory(currentUser.email, type, 20);
      console.log(`[HistoryContext] Loaded ${type}:`, historyData.length, 'items');
      
      const now = Date.now();
      setCache(prev => ({
        ...prev,
        [type]: {
          data: historyData,
          timestamp: now,
          loading: false,
          lastFetch: now
        }
      }));
    } catch (error) {
      console.error(`[HistoryContext] Error loading ${type}:`, error);
      const now = Date.now();
      setCache(prev => ({
        ...prev,
        [type]: { 
          data: prev[type]?.data || [], 
          timestamp: now, 
          loading: false,
          lastFetch: now
        }
      }));
    } finally {
      loadingRef.current.delete(loadingKey);
    }
  };

  // 캐시된 히스토리 가져오기 (중복 호출 방지)
  const getHistory = (type: KeywordHistory['type']): KeywordHistory[] => {
    const cached = cache[type];
    
    if (!cached) {
      // 메모리 캐시가 없으면 로컬 스토리지에서 확인
      if (currentUser?.email) {
        const localCached = HistoryService.getFromLocalCache(currentUser.email, type);
        if (localCached && localCached.length > 0) {
          console.log(`[HistoryContext] Using local cache for ${type}:`, localCached.length, 'items');
          const now = Date.now();
          // 렌더링 중 setState 경고를 피하기 위해 다음 이벤트 루프에서 처리
          setTimeout(() => {
            setCache(prev => ({
              ...prev,
              [type]: {
                data: localCached,
                timestamp: now,
                loading: false,
                lastFetch: now - CACHE_DURATION + 30000 // 30초 여유
              }
            }));
          }, 0);
          return localCached;
        } else {
          // 로컬 캐시도 없으면 로드 시작 (비동기로 처리)
          setTimeout(() => loadHistory(type), 0);
        }
      }
      return [];
    }

    // 캐시가 만료되었고 최근에 호출하지 않았으면 백그라운드에서 새로고침
    if (Date.now() - cached.timestamp > CACHE_DURATION && 
        Date.now() - cached.lastFetch > MIN_FETCH_INTERVAL) {
      setTimeout(() => loadHistory(type), 0);
    }

    return cached.data;
  };

  // 로딩 상태 확인
  const isLoading = (type: KeywordHistory['type']): boolean => {
    return cache[type]?.loading || false;
  };

  // 특정 타입 히스토리 새로고침
  const refreshHistory = async (type: KeywordHistory['type']) => {
    await loadHistory(type, true); // force = true
  };

  // 모든 히스토리 새로고침
  const refreshAllHistory = async () => {
    const types: KeywordHistory['type'][] = ['keyword-analysis', 'complete-optimizer', 'quick-optimizer'];
    await Promise.all(types.map(type => loadHistory(type, true))); // force = true
  };

  // 히스토리 업데이트 이벤트 리스너
  useEffect(() => {
    const handleHistoryUpdate = (event: CustomEvent) => {
      const { type } = event.detail;
      console.log(`[HistoryContext] History update event for ${type}`);
      // 이벤트 발생 시에만 강제 새로고침
      setTimeout(() => refreshHistory(type), 100);
    };

    window.addEventListener('historyUpdated', handleHistoryUpdate as EventListener);
    return () => {
      window.removeEventListener('historyUpdated', handleHistoryUpdate as EventListener);
    };
  }, [currentUser?.email]);

  const value: HistoryContextType = {
    getHistory,
    isLoading,
    refreshHistory,
    refreshAllHistory
  };

  return (
    <HistoryContext.Provider value={value}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (context === undefined) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
} 