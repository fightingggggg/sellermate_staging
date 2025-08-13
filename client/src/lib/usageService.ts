import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment, 
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { MEMBERSHIP_LIMITS } from '@/types';
import { getKSTDateKeyWith7AMCutoff, getKSTMonthKeyWith7AMCutoff } from '@/lib/utils';

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

  // 월별 사용량 경로 (예: users/{safeEmail}/usageMonthly/2025-08)
  private static getMonthlyUsageCollectionPath(userEmail: string): string {
    const safeEmail = userEmail
      .replace(/\./g, '_dot_')
      .replace(/@/g, '_at_')
      .replace(/-/g, '_dash_')
      .replace(/\+/g, '_plus_');
    return `users/${safeEmail}/usageMonthly`;
  }

  private static getCurrentMonthString(): string {
    return getKSTMonthKeyWith7AMCutoff();
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

  private static getTodayString(): string {
    return getKSTDateKeyWith7AMCutoff();
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
    const membershipType = await this.getUserMembershipType(userEmail);
    const maxCount = MEMBERSHIP_LIMITS[membershipType].dailyKeywordAnalysis;
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
    const membershipType = await this.getUserMembershipType(userEmail);
    const maxCount = MEMBERSHIP_LIMITS[membershipType].dailyProductOptimization;
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
      const dailyRef = doc(db, usagePath, today);

      const monthlyPath = this.getMonthlyUsageCollectionPath(userEmail);
      const monthKey = this.getCurrentMonthString();
      const monthlyRef = doc(db, monthlyPath, monthKey);

      const batch = writeBatch(db);
      batch.set(dailyRef, {
        keywordAnalysis: increment(1),
        lastUpdated: serverTimestamp()
      }, { merge: true });
      batch.set(monthlyRef, {
        keywordAnalysis: increment(1),
        lastUpdated: serverTimestamp()
      }, { merge: true });

      await batch.commit();

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
      const dailyRef = doc(db, usagePath, today);

      const monthlyPath = this.getMonthlyUsageCollectionPath(userEmail);
      const monthKey = this.getCurrentMonthString();
      const monthlyRef = doc(db, monthlyPath, monthKey);

      const batch = writeBatch(db);
      batch.set(dailyRef, {
        productOptimization: increment(1),
        lastUpdated: serverTimestamp()
      }, { merge: true });
      batch.set(monthlyRef, {
        productOptimization: increment(1),
        lastUpdated: serverTimestamp()
      }, { merge: true });

      await batch.commit();

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