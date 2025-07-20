import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';

// CustomEvent 타입 확장
declare global {
  interface WindowEventMap {
    'usage-updated': CustomEvent;
  }
}

export type UsageType = 'keyword-analysis' | 'product-optimization';

interface DailyUsage {
  date: string; // YYYY-MM-DD 형식
  keywordAnalysis: number;
  productOptimization: number;
  lastUpdated: Timestamp;
}

interface UsageLimit {
  canUse: boolean;
  currentCount: number;
  maxCount: number;
  remainingCount: number;
}

export class UsageService {
  private static getUsageCollectionPath(userEmail: string): string {
    const safeEmail = userEmail
      .replace(/\./g, '_dot_')
      .replace(/@/g, '_at_')
      .replace(/-/g, '_dash_')
      .replace(/\+/g, '_plus_');
    return `users/${safeEmail}/usage`;
  }

  private static getTodayString(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  // 사용자의 일일 사용량 가져오기
  static async getDailyUsage(userEmail: string): Promise<DailyUsage> {
    try {
      const usagePath = this.getUsageCollectionPath(userEmail);
      const today = this.getTodayString();
      const docRef = doc(db, usagePath, today);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data() as DailyUsage;
      } else {
        // 오늘 날짜 문서가 없으면 새로 생성
        const defaultUsage: DailyUsage = {
          date: today,
          keywordAnalysis: 0,
          productOptimization: 0,
          lastUpdated: serverTimestamp() as Timestamp
        };
        await setDoc(docRef, defaultUsage);
        return defaultUsage;
      }
    } catch (error) {
      console.error('Error getting daily usage:', error);
      // 에러 시 기본값 반환
      return {
        date: this.getTodayString(),
        keywordAnalysis: 0,
        productOptimization: 0,
        lastUpdated: serverTimestamp() as Timestamp
      };
    }
  }

  // 키워드 분석 사용량 확인
  static async checkKeywordAnalysisLimit(userEmail: string): Promise<UsageLimit> {
    const usage = await this.getDailyUsage(userEmail);
    const maxCount = 10; // 하루 10회 제한
    // keywordAnalysis 필드가 없거나 undefined/null인 경우 0으로 간주
    const currentCount = usage.keywordAnalysis ?? 0;
    const canUse = currentCount < maxCount;
    
    return {
      canUse,
      currentCount,
      maxCount,
      remainingCount: Math.max(0, maxCount - currentCount)
    };
  }

  // 상품 최적화 사용량 확인
  static async checkProductOptimizationLimit(userEmail: string): Promise<UsageLimit> {
    const usage = await this.getDailyUsage(userEmail);
    const maxCount = 10; // 하루 10회 제한 (완벽한 + 빠른 합산)
    // productOptimization 필드가 없거나 undefined/null인 경우 0으로 간주
    const currentCount = usage.productOptimization ?? 0;
    const canUse = currentCount < maxCount;
    
    return {
      canUse,
      currentCount,
      maxCount,
      remainingCount: Math.max(0, maxCount - currentCount)
    };
  }

  // 키워드 분석 사용량 증가
  static async incrementKeywordAnalysis(userEmail: string): Promise<void> {
    try {
      const usagePath = this.getUsageCollectionPath(userEmail);
      const today = this.getTodayString();
      const docRef = doc(db, usagePath, today);
      
      await setDoc(docRef, {
        keywordAnalysis: increment(1),
        lastUpdated: serverTimestamp()
      }, { merge: true });
      
      console.log(`[Usage] Keyword analysis count incremented for ${userEmail}`);
      
      // 전역 이벤트 발생으로 사용량 표시 업데이트
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('usage-updated'));
      }
    } catch (error) {
      console.error('Error incrementing keyword analysis usage:', error);
      throw error;
    }
  }

  // 상품 최적화 사용량 증가
  static async incrementProductOptimization(userEmail: string): Promise<void> {
    try {
      const usagePath = this.getUsageCollectionPath(userEmail);
      const today = this.getTodayString();
      const docRef = doc(db, usagePath, today);
      
      await setDoc(docRef, {
        productOptimization: increment(1),
        lastUpdated: serverTimestamp()
      }, { merge: true });
      
      console.log(`[Usage] Product optimization count incremented for ${userEmail}`);
      
      // 전역 이벤트 발생으로 사용량 표시 업데이트
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('usage-updated'));
      }
    } catch (error) {
      console.error('Error incrementing product optimization usage:', error);
      throw error;
    }
  }

  // 사용량 제한 확인 및 증가 (한 번에 처리)
  static async checkAndIncrementUsage(userEmail: string, type: UsageType): Promise<UsageLimit> {
    let limit: UsageLimit;
    
    if (type === 'keyword-analysis') {
      limit = await this.checkKeywordAnalysisLimit(userEmail);
      if (limit.canUse) {
        await this.incrementKeywordAnalysis(userEmail);
      }
    } else {
      limit = await this.checkProductOptimizationLimit(userEmail);
      if (limit.canUse) {
        await this.incrementProductOptimization(userEmail);
      }
    }
    
    return limit;
  }
} 