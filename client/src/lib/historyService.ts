import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  getDoc, 
  doc, 
  deleteDoc, 
  updateDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  increment
} from 'firebase/firestore';
import { db } from './firebase';
import { KeywordHistory, MEMBERSHIP_LIMITS } from '@/types';

// 개발 환경에서 디버그 함수 로드
if (process.env.NODE_ENV === 'development') {
  import('./debugHistory');
}

// 개선된 컬렉션 구조
const USERS_COLLECTION = 'users';
const HISTORY_SUBCOLLECTION = 'history';
const STATS_COLLECTION = 'user_stats';
// 새로운 최상위 컬렉션들
const KEYWORD_ANALYSIS_COLLECTION = 'keywordAnalysis';
const QUICK_PRODUCT_OPTIMIZE_COLLECTION = 'productNameOptimizeQuick';
const COMPLETE_PRODUCT_OPTIMIZE_COLLECTION = 'productNameOptimizeComplete';
const MAX_HISTORY_ITEMS = 50; // 사용자당 최대 히스토리 증가
const LOCAL_CACHE_KEY = 'keyword_history_cache';
const LOCAL_CACHE_DURATION = 5 * 60 * 1000; // 5분으로 증가

export class HistoryService {
  // 로컬 캐시 저장
  private static saveToLocalCache(userEmail: string, type: KeywordHistory['type'], data: KeywordHistory[]) {
    try {
      const cache = this.getLocalCache();
      const key = `${userEmail}_${type}`;
      cache[key] = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('Failed to save to local cache:', error);
    }
  }

  // 로컬 캐시 가져오기
  private static getLocalCache(): Record<string, { data: KeywordHistory[], timestamp: number }> {
    try {
      const cached = localStorage.getItem(LOCAL_CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      console.warn('Failed to get local cache:', error);
      return {};
    }
  }

  // 로컬 캐시에서 히스토리 가져오기
  static getFromLocalCache(userEmail: string, type: KeywordHistory['type']): KeywordHistory[] | null {
    try {
      const cache = this.getLocalCache();
      const key = `${userEmail}_${type}`;
      const cached = cache[key];
      
      if (!cached) return null;
      
      // 캐시가 만료되었으면 null 반환
      if (Date.now() - cached.timestamp > LOCAL_CACHE_DURATION) {
        return null;
      }
      
      return cached.data.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
    } catch (error) {
      console.warn('Failed to get from local cache:', error);
      return null;
    }
  }

  // 개선된 문서 ID 생성 (해시 기반)
  private static generateDocumentId(userEmail: string, keyword: string, type: string, pageIndex?: number): string {
    const baseString = `${keyword}_${type}_${pageIndex || 0}`;
    // 간단한 해시 생성 (실제로는 crypto.subtle.digest 사용 권장)
    let hash = 0;
    for (let i = 0; i < baseString.length; i++) {
      const char = baseString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit 정수로 변환
    }
    return `${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
  }

  // 사용자 문서 경로 생성
  private static getUserHistoryPath(userEmail: string): string {
    // 이메일을 안전한 문서 ID로 변환 (Firebase 보안 규칙과 일치)
    const safeEmail = userEmail
      .replace(/\./g, '_dot_')
      .replace(/@/g, '_at_')
      .replace(/-/g, '_dash_')
      .replace(/\+/g, '_plus_');
    return `${USERS_COLLECTION}/${safeEmail}/${HISTORY_SUBCOLLECTION}`;
  }

  // 사용자의 멤버십 타입 확인
  private static async getUserMembershipType(userEmail: string): Promise<'basic' | 'booster'> {
    try {
      const safeEmail = userEmail
        .replace(/\./g, '_dot_')
        .replace(/@/g, '_at_')
        .replace(/-/g, '_dash_')
        .replace(/\+/g, '_plus_');
      
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
            return 'booster';
          }
        }
      }
      
      return 'basic'; // 활성/취소된 구독이 없거나 BOOSTER가 아니거나 만료되었으면 basic
    } catch (error) {
      console.warn('Failed to get user membership type:', error);
      return 'basic'; // 에러 시 기본값
    }
  }

  // 사용자의 히스토리 제한 확인
  private static async checkHistoryLimit(userEmail: string): Promise<{ canSave: boolean; currentCount: number; maxCount: number; membershipType: 'basic' | 'booster' }> {
    try {
      const membershipType = await this.getUserMembershipType(userEmail);
      const maxHistoryItems = MEMBERSHIP_LIMITS[membershipType].maxHistoryItems;
      
      // 현재 히스토리 개수 확인 (모든 타입 합계)
      const historyPath = this.getUserHistoryPath(userEmail);
      const historyQuery = query(collection(db, historyPath));
      const snapshot = await getDocs(historyQuery);
      const currentCount = snapshot.docs.length;
      
      const canSave = currentCount < maxHistoryItems;
      
      console.log(`[History Limit] User: ${userEmail}, Type: ${membershipType}, Current: ${currentCount}, Max: ${maxHistoryItems}, Can Save: ${canSave}`);
      
      return { canSave, currentCount, maxCount: maxHistoryItems, membershipType };
    } catch (error) {
      console.error('Error checking history limit:', error);
      // 에러 시 기본적으로 저장 허용
      return { canSave: true, currentCount: 0, maxCount: 3, membershipType: 'basic' };
    }
  }

  // 외부 훅이나 컴포넌트에서 직접 호출할 수 있도록 공개 메서드 추가
  // 내부 로직은 checkHistoryLimit 를 그대로 재사용한다.
  static async getHistoryLimit(userEmail: string): Promise<{ canSave: boolean; currentCount: number; maxCount: number; membershipType: 'basic' | 'booster' }> {
    return await this.checkHistoryLimit(userEmail);
  }

  // 히스토리 항목 저장
  static async saveHistory(
    userEmail: string,
    keyword: string,
    type: KeywordHistory['type'],
    data: any,
    pageIndex?: number
  ): Promise<string> {
    try {
      // 통계는 히스토리 저장 성공 여부와 무관하게 먼저 증가시킴 (fire-and-forget)
      this.incrementUserStats(userEmail, type);

      // Firebase에서는 undefined 필드를 허용하지 않으므로, undefined 값을 모두 제거
      const cleanedData = JSON.parse(JSON.stringify(data ?? {}));
      console.log('Saving history for user:', userEmail, 'keyword:', keyword, 'type:', type, 'pageIndex:', pageIndex);
      
      // 히스토리 제한 확인 (제한에 도달한 경우, 자동 정리 후 한 번 더 시도)
      let limitCheck = await this.checkHistoryLimit(userEmail);

      if (!limitCheck.canSave) {
        console.log(`[History Limit] Limit reached (${limitCheck.currentCount}/${limitCheck.maxCount}). Attempting automatic cleanup before aborting.`);
        // 오래된 항목 자동 정리 시도 (비동기지만 이 경우에는 즉시 기다림)
        await this.cleanupOldHistoryAsync(userEmail, type);

        // 정리 후 다시 확인
        limitCheck = await this.checkHistoryLimit(userEmail);

        if (!limitCheck.canSave) {
          // 여전히 초과라면 에러 처리
          console.log(`[History Limit] Still cannot save after cleanup (${limitCheck.currentCount}/${limitCheck.maxCount}).`);
          throw new Error(`히스토리 저장 제한에 도달했습니다. (${limitCheck.currentCount}/${limitCheck.maxCount})`);
        } else {
          console.log('[History Limit] Cleanup succeeded, proceeding with save.');
        }
      }
      
      // 새로운 구조 저장 (레거시 경로 제거됨)
      return await this.saveHistoryNewStructure(userEmail, keyword, type, cleanedData, pageIndex);
    } catch (error) {
      console.error('Error saving history:', error);
      throw error;
    }
  }

  // 새로운 구조로 히스토리 저장
  private static async saveHistoryNewStructure(
    userEmail: string,
    keyword: string,
    type: KeywordHistory['type'],
    data: any,
    pageIndex?: number
  ): Promise<string> {
    const batch = writeBatch(db);
    const historyPath = this.getUserHistoryPath(userEmail);
    
    // 기존 동일한 키워드+타입+페이지 조합 찾기
    const existingQuery = query(
      collection(db, historyPath),
      where('keyword', '==', keyword.trim()),
      where('type', '==', type),
      where('pageIndex', '==', pageIndex || null)
    );
    
    const existingDocs = await getDocs(existingQuery);
    
    // 기존 문서들 삭제
    existingDocs.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // 새 문서 ID 생성
    const docId = this.generateDocumentId(userEmail, keyword, type, pageIndex);
    const newDocRef = doc(db, historyPath, docId);
    
    // 새 히스토리 항목 생성
    const historyItem: any = {
      keyword: keyword.trim(),
      type,
      data,
      timestamp: serverTimestamp(),
      isStarred: false,
      pageIndex: pageIndex || null,
      keywordLower: keyword.trim().toLowerCase(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    batch.set(newDocRef, historyItem);

    // 배치 실행 (히스토리 저장만 이루어짐)
    await batch.commit();
    
    console.log('History saved with new structure, ID:', docId);
    
    // 비동기로 오래된 항목 정리
    this.cleanupOldHistoryAsync(userEmail, type);

    // 히스토리 업데이트 이벤트 발생
    window.dispatchEvent(new CustomEvent('historyUpdated', { 
      detail: { type, userEmail } 
    }));

    return docId;
  }

  // (레거시 구조 저장 로직 제거됨)

  // 사용자의 히스토리 조회
  static async getHistory(
    userEmail: string,
    type: KeywordHistory['type'],
    limitCount: number = 20
  ): Promise<KeywordHistory[]> {
    try {
      console.log('Getting history for user:', userEmail, 'type:', type);
      
      // 새로운 구조 시도
      try {
        return await this.getHistoryNewStructure(userEmail, type, limitCount);
      } catch (newError) {
        console.warn('New structure failed, trying legacy:', newError);
        // 새로운 구조 실패 시 레거시 방식으로 fallback
        return await this.getHistoryLegacy(userEmail, type, limitCount);
      }
    } catch (error) {
      console.error('Error getting history:', error);
      return [];
    }
  }

  // 새로운 구조로 히스토리 조회
  private static async getHistoryNewStructure(
    userEmail: string,
    type: KeywordHistory['type'],
    limitCount: number = 20
  ): Promise<KeywordHistory[]> {
    const historyPath = this.getUserHistoryPath(userEmail);
    console.log('History path:', historyPath);
    
    const historyQuery = query(
      collection(db, historyPath),
      where('type', '==', type),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(historyQuery);
    console.log('New structure query result:', snapshot.docs.length, 'documents');
    
    const historyItems = snapshot.docs.map(doc => ({
      id: doc.id,
      userEmail,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date()
    })) as KeywordHistory[];
    
    // 로컬 캐시에 저장
    this.saveToLocalCache(userEmail, type, historyItems);
    
    return historyItems;
  }

  // 레거시 구조로 히스토리 조회
  private static async getHistoryLegacy(
    userEmail: string,
    type: KeywordHistory['type'],
    limitCount: number = 20
  ): Promise<KeywordHistory[]> {
    const historyQuery = query(
      collection(db, 'keyword_history'),
      where('userEmail', '==', userEmail),
      where('type', '==', type),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(historyQuery);
    console.log('Legacy structure query result:', snapshot.docs.length, 'documents');
    
    const historyItems = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date()
    })) as KeywordHistory[];
    
    // 로컬 캐시에 저장
    this.saveToLocalCache(userEmail, type, historyItems);
    
    return historyItems;
  }

  // 특정 히스토리 항목 삭제
  static async deleteHistory(historyId: string, userEmail: string, type?: KeywordHistory['type']): Promise<void> {
    try {
      const historyPath = this.getUserHistoryPath(userEmail);
      await deleteDoc(doc(db, historyPath, historyId));
      
      // 히스토리 업데이트 이벤트 발생
      window.dispatchEvent(new CustomEvent('historyUpdated', {
        detail: { userEmail, type }
      }));
    } catch (error) {
      console.error('Error deleting history:', error);
      throw error;
    }
  }

  // 즐겨찾기 토글
  static async toggleStar(historyId: string, isStarred: boolean, userEmail: string, type?: KeywordHistory['type']): Promise<void> {
    try {
      const historyPath = this.getUserHistoryPath(userEmail);
      await updateDoc(doc(db, historyPath, historyId), {
        isStarred,
        updatedAt: serverTimestamp()
      });
      
      // 히스토리 업데이트 이벤트 발생
      window.dispatchEvent(new CustomEvent('historyUpdated', {
        detail: { userEmail, type }
      }));
    } catch (error) {
      console.error('Error toggling star:', error);
      throw error;
    }
  }

  // 비동기 정리 (성능 개선)
  private static async cleanupOldHistoryAsync(userEmail: string, type: KeywordHistory['type']): Promise<void> {
    try {
      // 백그라운드에서 실행
      setTimeout(async () => {
        const historyPath = this.getUserHistoryPath(userEmail);
        const membershipType = await this.getUserMembershipType(userEmail);
        const maxAllowed = MEMBERSHIP_LIMITS[membershipType].maxHistoryItems;

        const allHistoryQuery = query(
          collection(db, historyPath),
          where('type', '==', type),
          orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(allHistoryQuery);
        
        if (snapshot.docs.length > maxAllowed) {
          const batch = writeBatch(db);
          const docsToDelete = snapshot.docs.slice(maxAllowed);
          
          docsToDelete.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          console.log(`Cleaned up ${docsToDelete.length} old history items for user ${userEmail} (membership: ${membershipType})`);
        }
      }, 1000); // 1초 후 실행
    } catch (error) {
      console.error('Error in async cleanup:', error);
    }
  }

  // 히스토리 전체 삭제
  static async clearHistory(
    userEmail: string,
    type?: KeywordHistory['type']
  ): Promise<void> {
    try {
      const historyPath = this.getUserHistoryPath(userEmail);
      let historyQuery;
      
      if (type) {
        historyQuery = query(
          collection(db, historyPath),
          where('type', '==', type)
        );
      } else {
        historyQuery = query(
          collection(db, historyPath)
        );
      }

      const snapshot = await getDocs(historyQuery);
      
      // 배치로 삭제 (더 효율적)
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      console.log(`Cleared ${snapshot.docs.length} history items`);
      
      // 히스토리 업데이트 이벤트 발생
      window.dispatchEvent(new CustomEvent('historyUpdated', {
        detail: { userEmail, type }
      }));
    } catch (error) {
      console.error('Error clearing history:', error);
      throw error;
    }
  }

  // AI 결과로 히스토리 업데이트
  static async updateHistoryWithAIResult(
    userEmail: string,
    keyword: string,
    type: KeywordHistory['type'],
    aiResult: {
      productName: string;
      reason: string;
      recommendedTags: string[];
      recommendedCategories: string[];
    },
    pageIndex?: number
  ): Promise<void> {
    try {
      console.log('Updating history with AI result for:', userEmail, keyword, type, 'pageIndex:', pageIndex);
      const historyPath = this.getUserHistoryPath(userEmail);
      const historyQuery = query(
        collection(db, historyPath),
        where('keyword', '==', keyword),
        where('type', '==', type)
      );
      
      const snapshot = await getDocs(historyQuery);
      
      if (!snapshot.empty) {
        // 클라이언트 사이드에서 페이지 번호로 필터링
        const filteredDocs = snapshot.docs.filter(doc => {
          const docData = doc.data();
          const docPageIndex = docData.pageIndex;
          
          // 페이지 번호가 지정된 경우: 정확히 같은 페이지 번호만
          if (pageIndex !== undefined) {
            return docPageIndex === pageIndex;
          }
          // 페이지 번호가 지정되지 않은 경우: pageIndex가 없는 문서만
          else {
            return docPageIndex === undefined || docPageIndex === null;
          }
        });
        
        if (filteredDocs.length > 0) {
          // 가장 최근 항목 업데이트
          const sortedDocs = filteredDocs.sort((a, b) => {
            const aTime = a.data().timestamp?.toDate() || new Date(0);
            const bTime = b.data().timestamp?.toDate() || new Date(0);
            return bTime.getTime() - aTime.getTime();
          });
          
          const docRef = sortedDocs[0].ref;
          await updateDoc(docRef, {
            aiResult: aiResult,
            updatedAt: serverTimestamp()
          });
          
          console.log('History updated with AI result successfully');
          
          // 히스토리 업데이트 이벤트 발생
          window.dispatchEvent(new CustomEvent('historyUpdated', {
            detail: { userEmail, type }
          }));
        } else {
          console.warn('No matching history found to update with AI result for pageIndex:', pageIndex);
        }
      } else {
        console.warn('No history found to update with AI result');
      }
    } catch (error) {
      console.error('Error updating history with AI result:', error);
      throw error;
    }
  }

  // 완벽한 상품명 생성 2단계 데이터로 히스토리 업데이트
  static async updateHistoryWithStep2Data(
    userEmail: string,
    keyword: string,
    step2Data: {
      synonymGroups: Array<{
        id: number;
        keywords: string[];
        merged?: boolean;
      }>;
      combResult: Record<string, '조합형' | '일체형'>;
      selectedMain: string;
      combMainMap?: Record<string,string>;
    },
    pageIndex?: number
  ): Promise<void> {
    try {
      console.log('Updating history with Step2 data for:', userEmail, keyword, 'pageIndex:', pageIndex);
      const historyPath = this.getUserHistoryPath(userEmail);
      const historyQuery = query(
        collection(db, historyPath),
        where('keyword', '==', keyword),
        where('type', '==', 'complete-optimizer')
      );
      
      const snapshot = await getDocs(historyQuery);
      
      if (!snapshot.empty) {
        console.log('Found history documents:', snapshot.size);
        // 클라이언트 사이드에서 페이지 번호로 필터링
        const filteredDocs = snapshot.docs.filter(doc => {
          const docData = doc.data();
          const docPageIndex = docData.pageIndex;
          
          if (pageIndex !== undefined) {
            return docPageIndex === pageIndex;
          } else {
            return docPageIndex === undefined || docPageIndex === null;
          }
        });
        
        console.log('Filtered documents by pageIndex:', filteredDocs.length, 'pageIndex:', pageIndex);
        
        if (filteredDocs.length > 0) {
          // 가장 최근 항목 업데이트
          const sortedDocs = filteredDocs.sort((a, b) => {
            const aTime = a.data().timestamp?.toDate() || new Date(0);
            const bTime = b.data().timestamp?.toDate() || new Date(0);
            return bTime.getTime() - aTime.getTime();
          });
          
          const docRef = sortedDocs[0].ref;
          const currentData = sortedDocs[0].data();
          
          console.log('Updating document with step2Data:', step2Data);
          
          await updateDoc(docRef, {
            completeOptimizerData: {
              ...currentData.completeOptimizerData,
              currentStep: 2,
              step2Data: step2Data
            },
            updatedAt: serverTimestamp()
          });
          
          console.log('History updated with Step2 data successfully');
          
          // 히스토리 업데이트 이벤트 발생
          window.dispatchEvent(new CustomEvent('historyUpdated', {
            detail: { userEmail, type: 'complete-optimizer' }
          }));
        } else {
          console.warn('No matching history found to update with Step2 data for pageIndex:', pageIndex);
        }
      } else {
        console.warn('No complete-optimizer history documents found for keyword:', keyword);
      }
    } catch (error) {
      console.error('Error updating history with Step2 data:', error);
      throw error;
    }
  }

  // 완벽한 상품명 생성 3단계 데이터로 히스토리 업데이트
  static async updateHistoryWithStep3Data(
    userEmail: string,
    keyword: string,
    step3Data: {
      productNames: string[];
      reason: string;
      tags: string[];
      categories: string[];
    },
    pageIndex?: number
  ): Promise<void> {
    try {
      console.log('Updating history with Step3 data for:', userEmail, keyword, 'pageIndex:', pageIndex);
      const historyPath = this.getUserHistoryPath(userEmail);
      const historyQuery = query(
        collection(db, historyPath),
        where('keyword', '==', keyword),
        where('type', '==', 'complete-optimizer')
      );
      
      const snapshot = await getDocs(historyQuery);
      
      if (!snapshot.empty) {
        // 클라이언트 사이드에서 페이지 번호로 필터링
        const filteredDocs = snapshot.docs.filter(doc => {
          const docData = doc.data();
          const docPageIndex = docData.pageIndex;
          
          if (pageIndex !== undefined) {
            return docPageIndex === pageIndex;
          } else {
            return docPageIndex === undefined || docPageIndex === null;
          }
        });
        
        if (filteredDocs.length > 0) {
          // 가장 최근 항목 업데이트
          const sortedDocs = filteredDocs.sort((a, b) => {
            const aTime = a.data().timestamp?.toDate() || new Date(0);
            const bTime = b.data().timestamp?.toDate() || new Date(0);
            return bTime.getTime() - aTime.getTime();
          });
          
          const docRef = sortedDocs[0].ref;
          const currentData = sortedDocs[0].data();
          
          await updateDoc(docRef, {
            completeOptimizerData: {
              ...currentData.completeOptimizerData,
              currentStep: 3,
              step3Data: step3Data
            },
            updatedAt: serverTimestamp()
          });
          
          console.log('History updated with Step3 data successfully');
          
          // 히스토리 업데이트 이벤트 발생
          window.dispatchEvent(new CustomEvent('historyUpdated', {
            detail: { userEmail, type: 'complete-optimizer' }
          }));
        } else {
          console.warn('No matching history found to update with Step3 data for pageIndex:', pageIndex);
        }
      } else {
        console.warn('No history found to update with Step3 data');
      }
    } catch (error) {
      console.error('Error updating history with Step3 data:', error);
      throw error;
    }
  }

  // ===== 새로운 컬렉션 메서드들 =====

  // 키워드 경쟁률 분석 저장
  static async saveKeywordAnalysis(
    userEmail: string,
    uid: string,
    keyword: string,
    data: any,
    pageIndex?: number
  ): Promise<string> {
    console.log('🔍 [키워드 경쟁률 분석] 저장 시도:', { userEmail, keyword, pageIndex });
    
    try {
      const monthId = this.getMonthId();
      const entryId = this.makeEntryId(keyword, pageIndex);
      const docRef = doc(db, KEYWORD_ANALYSIS_COLLECTION, monthId, uid, entryId);
      
      const analysisItem = {
        uid,
        userEmail,
        keyword: keyword.trim(),
        type: 'keyword-analysis',
        data,
        timestamp: serverTimestamp(),
        pageIndex: pageIndex || null,
        keywordLower: keyword.trim().toLowerCase(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(docRef, analysisItem);
      
      console.log('✅ [키워드 경쟁률 분석] 저장 성공:', docRef.id);
      return docRef.id;
      
    } catch (error) {
      console.error('❌ [키워드 경쟁률 분석] 저장 실패:', error);
      throw error;
    }
  }

  // 히스토리 저장 여부와 관계없이 통계(user_stats)만 증가시킵니다.
  private static async incrementUserStats(userEmail: string, type: KeywordHistory['type']) {
    try {
      const safeEmail = userEmail
        .replace(/\./g, '_dot_')
        .replace(/@/g, '_at_')
        .replace(/-/g, '_dash_')
        .replace(/\+/g, '_plus_');
      const statsRef = doc(db, STATS_COLLECTION, safeEmail);
      await setDoc(
        statsRef,
        {
          [`${type}Count`]: increment(1),
          lastActivity: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      console.warn('[HistoryService] incrementUserStats failed (ignored):', err);
    }
  }

  // ===== 공용: 날짜 기반 문서 ID 생성 =====
  // YYYY-MM 형태로 월 식별자 반환
  private static getMonthId(): string {
    return new Date().toISOString().slice(0, 7); // "2024-08"
  }

  // 키워드와 pageIndex를 이용해 고정 entryId 반환 (공백 등 제거)
  private static makeEntryId(keyword: string, pageIndex?: number): string {
    const safeKeyword = keyword.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/gi, '_');
    return `${safeKeyword}_${pageIndex || 0}`;
  }

  // ===== 빠른 상품명 최적화 저장 =====
  static async saveQuickProductNameOptimize(
    userEmail: string,
    uid: string,
    keyword: string,
    data: any,
    aiResult: {
      productName: string;
      reason: string;
      recommendedTags: string[];
      recommendedCategories: string[];
    },
    pageIndex?: number
  ): Promise<string> {
    console.log('📝 [빠른 상품명] 저장 시도:', { userEmail, keyword, pageIndex });

    try {
      const monthId = this.getMonthId();
      const entryId = this.makeEntryId(keyword, pageIndex);
      const docRef = doc(db, QUICK_PRODUCT_OPTIMIZE_COLLECTION, monthId, uid, entryId);

      const item = {
        uid,
        userEmail,
        keyword: keyword.trim(),
        type: 'quick-optimizer',
        data,
        aiResult,
        timestamp: serverTimestamp(),
        pageIndex: pageIndex || null,
        keywordLower: keyword.trim().toLowerCase(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(docRef, item);
      console.log('✅ [빠른 상품명] 저장 성공:', docRef.id);
      return docRef.id;

    } catch (error) {
      console.error('❌ [빠른 상품명] 저장 실패:', error);
      throw error;
    }
  }

  // ===== 완벽한 상품명 최적화 저장 =====
  static async saveCompleteProductNameOptimize(
    userEmail: string,
    uid: string,
    keyword: string,
    data: any,
    pageIndex?: number
  ): Promise<string> {
    console.log('📝 [완벽한 상품명] 저장 시도:', { userEmail, keyword });

    try {
      const monthId = this.getMonthId();
      const entryId = this.makeEntryId(keyword, pageIndex);
      const docRef = doc(db, COMPLETE_PRODUCT_OPTIMIZE_COLLECTION, monthId, uid, entryId);

      const item = {
        uid,
        userEmail,
        keyword: keyword.trim(),
        type: 'complete-optimizer',
        data,
        currentStep: (data as any).currentStep ?? 1,
        timestamp: serverTimestamp(),
        pageIndex: pageIndex || null,
        keywordLower: keyword.trim().toLowerCase(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        // 기존 데이터 병합 업데이트 (단계별 데이터 축적)
        const prev = existingSnap.data() as any;
        await setDoc(docRef, {
          currentStep: item.currentStep,
          data: {
            ...(prev.data || {}),
            ...(item.data || {})
          },
          updatedAt: serverTimestamp()
        }, { merge: true });
        console.log('✅ [완벽한 상품명] 기존 문서 업데이트 완료:', docRef.id);
        return docRef.id;
      }

      // 없으면 새 문서 생성
      await setDoc(docRef, item);
      console.log('✅ [완벽한 상품명] 새 문서 저장 성공:', docRef.id);
      return docRef.id;

    } catch (error) {
      console.error('❌ [완벽한 상품명] 저장 실패:', error);
      throw error;
    }
  }


} 