import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PrefillProvider } from "@/components/KeywordOptimizer/KeywordOptimizerWizard";
import { useOptimizer } from "@/contexts/OptimizerContext";
import QuickStep1Collect from "@/components/KeywordOptimizer/steps/QuickStep1Collect";
import { useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { useIsMobile } from "@/hooks/use-mobile";
import { PcOnlyModal } from "@/components/ui/pc-only-modal";
import MenuCardGrid from "@/components/MenuCardGrid";

function QuickPageInner() {
  const [, navigate] = useLocation();
  const { aiResult } = useOptimizer();

  // 모바일 체크 및 PC 전용 모달
  const isMobile = useIsMobile();
  const [showPcOnlyModal, setShowPcOnlyModal] = React.useState(false);

  // 상단 메뉴 카드용 핸들러 - 확인 모달 없이 기본 화면으로 이동
  const handleTopMenuNavigate = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    
    // GA4 – 빠른 상품명 최적화 페이지에서 메뉴 버튼 클릭 추적
    const eventName = path.includes('keyword-competition-analysis') ? 'menu_keyword_analysis' : 
                      path.includes('complete') ? 'menu_product_optimizer_complete' : 'menu_product_optimizer_quick';
    trackEvent('CardMenu', eventName, null, {
      from_page: '빠른_상품명_최적화',
    });
    
    // 기본 화면이 뜨도록 모든 관련 데이터 제거
    try {
      sessionStorage.removeItem("allowPrefill");
      localStorage.removeItem("latestKeywordAnalysis");
    } catch {}
    
    // 현재 페이지에서 다시 선택한 경우 리셋을 위해 새로고침
    if (window.location.pathname === path) {
      // 같은 페이지 – Optimizer 리셋 이벤트 발송
      window.dispatchEvent(new Event('optimizerReset'));
      // 캐시 제거 후 스크롤 맨 위로
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(path);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-0 pb-8 space-y-6">
        {/* 경험 헤더 */}
        <h2 className="text-center text-base text-gray-700 mb-3 font-semibold mt-6">
          실제 이용자 중 <span className="font-bold text-blue-600">55%가</span> <span className="font-bold text-blue-600">상품명만 바꿔서</span>
          <br className="block sm:hidden" />
          <span className="font-bold text-blue-600"> 순위 상승을 경험</span>했어요!
        </h2>

        {/* 상단 메뉴 카드 */}
        <MenuCardGrid 
          currentPageId="quick-optimizer"
          onCardClick={handleTopMenuNavigate}
        />

        {/* 사용 안내 말풍성 */}
        {!aiResult && (
          <div className="max-w-2xl mx-auto mb-6 relative">
            <div className="bg-gradient-to-r from-sky-50 to-sky-100 border-2 border-sky-200 rounded-2xl p-4 shadow-md relative">
              <div className="flex items-start gap-3">
                <div className="bg-sky-500 rounded-full p-1.5 flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-sky-800 mb-1">언제 사용하면 좋을까요?</p>
                  <p className="text-sm text-sky-700 leading-relaxed mb-1">
                    <span className="font-semibold">빠르게 키워드 기반 상품명을 생성</span>하고 싶을 때 사용!
                    <br/>실제 상위 키워드와 <span className="font-semibold">네이버 SEO를 고려한 상품명</span>을 만들어요.
                  </p>
                </div>
              </div>
              {/* 말풍성 꼬리 */}
              <div className="absolute left-8 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-sky-200"></div>
              <div className="absolute left-8 -bottom-1.5 w-0 h-0 border-l-7 border-r-7 border-t-7 border-l-transparent border-r-transparent border-t-sky-100"></div>
            </div>
          </div>
        )}


        <QuickStep1Collect onDone={() => {}} />

        {/* PC 전용 모달 */}
        <PcOnlyModal 
          open={showPcOnlyModal} 
          onOpenChange={setShowPcOnlyModal} 
        />
      </div>
    </DashboardLayout>
  );
}

export default function QuickProductOptimizerPage() {
  return (
    <PrefillProvider>
      <QuickPageInner />
    </PrefillProvider>
  );
} 