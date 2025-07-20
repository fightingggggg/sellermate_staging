import React, { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "wouter";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import KeywordOptimizerWizard from "@/components/KeywordOptimizer/KeywordOptimizerWizard";
import { trackEvent } from "@/lib/analytics";
import { useIsMobile } from "@/hooks/use-mobile";
import { PcOnlyModal } from "@/components/ui/pc-only-modal";

// 더 이상 마법사 컴포넌트를 렌더하지 않음 (인트로 페이지)

export default function CompleteProductOptimizerPage() {
  // allowPrefill 플래그 유무를 바로 확인하여, Prefill 의도(=히스토리 복원)가 아니면 즉시 캐시를 제거합니다.
  if (typeof window !== "undefined") {
    const allow = sessionStorage.getItem("allowPrefill") === "1";
    if (!allow) {
      try {
        localStorage.removeItem("latestKeywordAnalysis");
        // 불필요한 캐시 데이터 제거 로그
        console.log("[CompleteProductOptimizer] 초기 렌더 단계에서 캐시 데이터 제거 (allowPrefill 없음)");
      } catch {}
    }
  }

  const didInitRef = useRef(false);
  if (!didInitRef.current) {
    didInitRef.current = true;
  }
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [keyword, setKeyword] = useState<string>("");
  const [, navigate] = useLocation();

  // 모바일 체크 및 PC 전용 모달
  const isMobile = useIsMobile();
  const [showPcOnlyModal, setShowPcOnlyModal] = useState(false);

  // 상단 메뉴 카드용 핸들러 - 확인 모달 없이 기본 화면으로 이동
  const handleTopMenuNavigate = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    
    // GA4 – 완벽한 상품명 최적화 페이지에서 메뉴 버튼 클릭 추적
    const menuName = path.includes('keyword-competition-analysis') ? '키워드_경쟁률_분석' : 
                    path.includes('quick') ? '빠른_상품명_최적화' : '완벽한_상품명_최적화';
    trackEvent('Navigation', menuName, null, {
      from_page: '완벽한_상품명_최적화',
    });
    
    // 기본 화면이 뜨도록 모든 관련 데이터 제거
    try {
      sessionStorage.removeItem("allowPrefill");
      localStorage.removeItem("latestKeywordAnalysis");
    } catch {}
    
    // 현재 페이지에서 다시 선택한 경우 기본 화면으로 리셋하기 위해 새로고침
    if (window.location.pathname === path) {
      window.dispatchEvent(new Event('optimizerReset'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(path);
    }
  };

  const handleNavigate = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    
    // GA4 – 완벽한 상품명 최적화에서 다른 최적화로 이동 시 추적
    const menuName = path.includes('quick') ? '빠른_상품명_최적화' : '키워드_경쟁률_분석';
    trackEvent('Navigation', menuName, null, {
      from_page: '완벽한_상품명_최적화',
    });
    
    const hasData = !!localStorage.getItem("latestKeywordAnalysis");
    if (hasData) {
      try {
        const raw = localStorage.getItem("latestKeywordAnalysis");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.keyword) {
            // 캐시 데이터 활용 로그
            console.log("[Navigation] localStorage.latestKeywordAnalysis에서 키워드를 불러옵니다:", {
              keyword: parsed.keyword,
              from: "CompleteProductOptimizerPage"
            });
            setKeyword(parsed.keyword);
          }
        }
      } catch {}
      setPendingPath(path);
      setConfirmOpen(true);
      return;
    }
    // 분석 데이터 없으면 바로 이동 (SPA 네비게이션)
    navigate(path);
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
          {/* 메인 키워드 경쟁률 분석 카드 (먼저 표시) */}
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

          {/* 완벽 카드 (현재 페이지) */}
          <Link href="/product-optimizer/complete" onClick={(e: any) => handleTopMenuNavigate(e, "/product-optimizer/complete")}>
            <Card className="border-2 border-blue-500 shadow-sm hover:shadow-md transition">
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

          {/* 빠른 카드 */}
          <Link href="/product-optimizer/quick" onClick={(e:any)=>handleTopMenuNavigate(e, "/product-optimizer/quick") }>
            <Card className="border hover:border-sky-400 shadow-sm hover:shadow-md transition opacity-50 hover:opacity-100">
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

        {/* 확인 팝업 */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>빠른 상품명 최적화 이동</DialogTitle>
            </DialogHeader>
            <p className="text-sm">"{keyword}" 키워드로 빠른 상품명 최적화를 진행하시겠어요?</p>
            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" size="sm" onClick={()=>setConfirmOpen(false)}>취소</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={()=>{ if(pendingPath){ try{sessionStorage.setItem("allowPrefill","1");}catch{} navigate(pendingPath);} }}>확인</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 완벽한 상품명 최적화 마법사 */}
        <KeywordOptimizerWizard />

        {/* PC 전용 모달 */}
        <PcOnlyModal 
          open={showPcOnlyModal} 
          onOpenChange={setShowPcOnlyModal} 
        />
      </div>
    </DashboardLayout>
  );
} 