import { HistoryService } from './historyService';

export class DebugHistory {
  // 간단한 히스토리 저장 테스트
  static async testSaveHistory(userEmail: string): Promise<void> {
    console.log('🧪 Testing history save for:', userEmail);
    
    try {
      const testData = {
        categories: ['테스트 카테고리'],
        totalProducts: 123,
        page: 1
      };
      
      const docId = await HistoryService.saveHistory(
        userEmail,
        '테스트 키워드',
        'keyword-analysis',
        testData,
        1
      );
      
      console.log('✅ History saved successfully with ID:', docId);
      
      // 저장 후 조회 테스트
      const history = await HistoryService.getHistory(userEmail, 'keyword-analysis', 10);
      console.log('✅ History retrieved:', history.length, 'items');
      
      if (history.length > 0) {
        console.log('📄 Latest history item:', history[0]);
      }
      
    } catch (error) {
      console.error('❌ History test failed:', error);
    }
  }
  
  // 사용자 경로 테스트
  static testUserPath(userEmail: string): void {
    console.log('🔍 Testing user path generation for:', userEmail);
    
    // 경로 생성 로직 복제 (private 메서드이므로)
    const safeEmail = userEmail
      .replace(/\./g, '_dot_')
      .replace(/@/g, '_at_')
      .replace(/-/g, '_dash_')
      .replace(/\+/g, '_plus_');
    
    const path = `users/${safeEmail}/history`;
    console.log('📁 Generated path:', path);
    console.log('📁 Safe email:', safeEmail);
  }


}

// 개발 환경에서만 전역으로 노출
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).DebugHistory = DebugHistory;
} 