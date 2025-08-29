import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PrefillProvider } from "@/components/KeywordOptimizer/KeywordOptimizerWizard";
import QuickStep1Collect from "@/components/KeywordOptimizer/steps/QuickStep1Collect";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { useIsMobile } from "@/hooks/use-mobile";
import { PcOnlyModal } from "@/components/ui/pc-only-modal";

export default function QuickProductOptimizerPage() {
  const [, navigate] = useLocation();

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
        <div className="grid md:grid-cols-4 gap-4 mb-6 max-w-3xl mx-auto">
          {/* 메인 키워드 경쟁률 분석 카드 */}
          <Link href="/keyword-competition-analysis" onClick={(e: any) => handleTopMenuNavigate(e, "/keyword-competition-analysis")}>
            <Card className="border hover:border-green-400 shadow-sm hover:shadow-md transition opacity-50 hover:opacity-100 h-full flex flex-col">
              <CardHeader className="py-2">
                <CardTitle className="text-base font-bold">키워드 경쟁률 분석</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-2">
                <CardDescription className="text-xs text-gray-600">
                  월간 검색량과 1페이지 묶음상품, 리뷰 수, 순위로 노출 경쟁률 확인
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          {/* 완벽 카드 */}
          <Link href="/product-optimizer/complete" onClick={(e: any) => handleTopMenuNavigate(e, "/product-optimizer/complete")}>
            <Card className="border hover:border-blue-400 shadow-sm hover:shadow-md transition opacity-50 hover:opacity-100 h-full flex flex-col">
              <CardHeader className="py-2">
                <CardTitle className="text-base font-bold">완벽한 상품명 최적화</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-2">
                <CardDescription className="text-xs text-gray-600">
                  실제 상위 키워드, 검색 로직, 네이버 SEO를 고려한 상품명
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          {/* 빠른 카드 (현재 페이지) */}
          <Link href="/product-optimizer/quick" onClick={(e: any) => handleTopMenuNavigate(e, "/product-optimizer/quick")}>
            <Card className="border-2 border-sky-500 shadow-sm hover:shadow-md transition h-full flex flex-col">
              <CardHeader className="py-2">
                <CardTitle className="text-base font-bold">빠른 상품명 최적화</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-2">
                <CardDescription className="text-xs text-gray-600">
                  실제 상위 키워드, 네이버 SEO를 고려한 상품명
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          {/* 상품명 그대로 최적화 카드 */}
          <Link href="/product-optimizer/original" onClick={(e: any)=>handleTopMenuNavigate(e, "/product-optimizer/original") }>
            <Card className="border hover:border-purple-400 shadow-sm hover:shadow-md transition opacity-50 hover:opacity-100 h-full flex flex-col relative">
              <Badge variant="secondary" className="absolute -top-2 -right-2 bg-purple-100 text-purple-700 text-xs px-2 py-0.5 z-10">Beta</Badge>
              <CardHeader className="py-2">
                <CardTitle className="text-base font-bold">상품명 그대로 최적화</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-2">
                <CardDescription className="text-xs text-gray-600">
                  기존 상품명을 SEO 맞게 재배열
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* 사용 안내 말풍성 */}
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
                  <br/>실제 <span className="font-semibold">상위 키워드와 네이버 SEO를 고려한 상품명</span>을 만들어요.
                </p>
              </div>
            </div>
            {/* 말풍성 꼬리 */}
            <div className="absolute left-8 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-sky-200"></div>
            <div className="absolute left-8 -bottom-1.5 w-0 h-0 border-l-7 border-r-7 border-t-7 border-l-transparent border-r-transparent border-t-sky-100"></div>
          </div>
        </div>



        <PrefillProvider>
          <QuickStep1Collect onDone={() => {}} />
        </PrefillProvider>

        {/* PC 전용 모달 */}
        <PcOnlyModal 
          open={showPcOnlyModal} 
          onOpenChange={setShowPcOnlyModal} 
        />
      </div>
    </DashboardLayout>
  );
} 