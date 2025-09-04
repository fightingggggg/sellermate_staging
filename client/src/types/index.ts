// Analysis types
export interface KeywordItem {
  key: string;
  value: number;
  change?: number;
  status?: 'added' | 'removed' | 'increased' | 'decreased' | 'unchanged';
  currentRank?: number | null;
  previousRank?: number | null;
  rankChange?: number;
}

export interface AnalysisData {
  lastUpdated: string;
  keywords: KeywordItem[];
  tags: KeywordItem[];
  keywordCounts: KeywordItem[];
  savedAt: string;
}

// Query type
export interface AnalysisSnapshot {
  keywords: KeywordItem[];
  tags: KeywordItem[];
  keywordCounts: KeywordItem[];
  lastUpdated: string;
  savedAt: string;
}

export interface Query {
  id: string;
  text: string;
  lastUpdated: string;
  email: string;
  dates: Record<string, AnalysisSnapshot>;
  currentSnapshot?: AnalysisSnapshot;
  previousSnapshot?: AnalysisSnapshot;
  keywords: KeywordItem[]; // 변화가 적용된 키워드 목록
  tags: KeywordItem[]; // 변화가 적용된 태그 목록
  keywordCounts: KeywordItem[]; // 변화가 적용된 키워드 개수 목록

}

// User type
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

// User Profile type with additional information
export interface UserProfile extends User {
  businessName?: string;
  businessLink?: string;
  number?: string;
  name?: string; // 사용자의 실제 이름 (이메일 회원가입 시)
  birthDate?: string; // 생년월일 추가
  emailVerified?: boolean;
  createdAt?: string;
  membershipType?: 'basic' | 'booster'; // 멤버십 타입 추가
  membershipExpiresAt?: string; // 멤버십 만료일
}

// Stats type
export interface DashboardStats {
  queryCount: number;
  lastUpdated: string;
  changesCount: number;
}

// History types
export interface KeywordHistory {
  id: string;
  userEmail: string;
  keyword: string;
  pageIndex?: number; // 페이지 번호 (빠른 상품명 최적화용)
  type: 'keyword-analysis' | 'complete-optimizer' | 'quick-optimizer';
  timestamp: Date;
  data: any; // 각 타입별 결과 데이터
  aiResult?: {
    productName: string;
    reason: string;
    recommendedTags: string[];
    recommendedCategories: string[];
  }; // AI 결과 (빠른 상품명 최적화용)
  isStarred?: boolean;
  
  // 완벽한 상품명 생성 단계별 데이터
  completeOptimizerData?: {
    currentStep: 1 | 2 | 3; // 현재 진행된 단계
    step2Data?: {
      synonymGroups: Array<{
        id: number;
        keywords: string[];
        merged?: boolean;
      }>;
      combResult: Record<string, '조합형' | '일체형'>;
      selectedMain: string;
    };
    step3Data?: {
      productNames: string[];
      reason: string;
      tags: string[];
      categories: string[];
    };
  };
}

export interface UserHistoryPreferences {
  maxHistoryItems: number;
  autoSave: boolean;
  showHistoryByDefault: boolean;
}

// 멤버십 제한 설정
export interface MembershipLimits {
  maxHistoryItems: number;
  dailyKeywordAnalysis: number;
  dailyProductOptimization: number;
  monthlyExtensionUsage: number;
}

// 멤버십 타입별 제한 설정
export const MEMBERSHIP_LIMITS: Record<string, MembershipLimits> = {
  basic: {
    maxHistoryItems: 3,
    dailyKeywordAnalysis: 5,
    dailyProductOptimization: 3,
    monthlyExtensionUsage: 20
  },
  booster: {
    maxHistoryItems: 30,
    dailyKeywordAnalysis: 30,
    dailyProductOptimization: 20,
    monthlyExtensionUsage: -1 // 무제한
  }
};
