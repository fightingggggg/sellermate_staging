import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PrefillProvider } from "@/components/KeywordOptimizer/KeywordOptimizerWizard";
import QuickStep1Collect from "@/components/KeywordOptimizer/steps/QuickStep1Collect";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    const menuName = path.includes('keyword-competition-analysis') ? '키워드_경쟁률_분석' : 
                    path.includes('complete') ? '완벽한_상품명_최적화' : '빠른_상품명_최적화';
    trackEvent('Navigation', menuName, null, {
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
        <h2 className="text-center text-base text-gray-700 mb-3 font-semibold">
          실제 이용자 중 <span className="font-bold text-blue-600">55%가</span> <span className="font-bold text-blue-600">상품명만 바꿔서</span> <span className="font-bold text-blue-600">순위 상승을 경험</span>했어요!
        </h2>


        {/* 상단 메뉴 카드 */}
        <div className="grid md:grid-cols-3 gap-4 mb-6 max-w-2xl mx-auto">
          {/* 메인 키워드 경쟁률 분석 카드 */}
          <Link href="/keyword-competition-analysis" onClick={(e: any) => handleTopMenuNavigate(e, "/keyword-competition-analysis")}>
            <Card className="border hover:border-green-400 shadow-sm hover:shadow-md transition opacity-50 hover:opacity-100">
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
            <Card className="border hover:border-blue-400 shadow-sm hover:shadow-md transition opacity-50 hover:opacity-100">
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
            <Card className="border-2 border-sky-500 shadow-sm hover:shadow-md transition">
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
        </div>

        {/* 설명 카드 */}
        <Card className="border border-blue-200 bg-blue-50 shadow-sm max-w-2xl mx-auto mb-6">
          <CardContent className="py-4 text-center">
            <p className="text-xs sm:text-sm font-medium text-gray-700">
              상위 노출 상품의 키워드, 태그를 분석해 네이버 SEO 맞춤 상품명, 태그, 카테고리를 제안해요.
            </p>
          </CardContent>
        </Card>

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