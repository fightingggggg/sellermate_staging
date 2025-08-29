import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Coins, Copy } from "lucide-react";
import MenuCardGrid from "@/components/MenuCardGrid";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import LoginPage from "@/components/LoginPage";

export default function OriginalProductOptimizerPage() {
  const [productName, setProductName] = useState("");
  const [result, setResult] = useState<null | { productName: string; reason: string }>(null);
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { currentUser } = useAuth();

  const handleOptimize = async () => {
    if (!productName.trim()) {
      alert("상품명을 입력해주세요.");
      return;
    }

    // 로그인 상태 체크
    if (!currentUser) {
      setShowLoginModal(true);
      return;
    }

    // 1. 최적화 버튼 클릭 추적 - 입력한 상품명과 함께
    trackEvent('Analyze', 'original_optimize_start', null, {
      originalProductName: productName.trim(),
      optimizeType: 'original'
    });

    setLoading(true);
    setShowResult(false);
    setResult(null);
    try {
      const resp = await fetch("/api/optimize-original-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: productName.trim() })
      });
      if (!resp.ok) throw new Error("API error");
      const data = await resp.json();
      
      // 디버깅을 위한 로그 추가
      console.log("=== 원본 상품명 최적화 API 응답 ===");
      console.log("전체 응답:", data);
      console.log("상품명:", data.productName);
      console.log("최적화 이유:", data.reason);
      console.log("최적화 이유 길이:", data.reason?.length);
      console.log("최적화 이유 타입:", typeof data.reason);
      console.log("=====================================");
      
      setResult(data);

      // 2. 최적화 완료 추적 - 입력 상품명, 생성된 상품명, 최적화 이유 함께
      trackEvent('GenerateName', 'original_optimize_success', null, {
        originalProductName: productName.trim(),
        optimizedProductName: data.productName,
        optimizationReason: data.reason,
        optimizeType: 'original',
        reasonLength: data.reason?.length || 0
      });
      
      // 결과를 먼저 설정하고 약간의 지연 후 showResult를 true로 설정
      setTimeout(() => {
        setShowResult(true);
        setTimeout(() => {
          setLoading(false);
        }, 1000); // 결과 표시 후 1초 더 로딩 스피너 유지
      }, 300);
    } catch (e) {
      console.error("최적화 API 오류:", e);
      
      // 최적화 실패 추적
      trackEvent('Error', 'original_optimize_error', null, {
        originalProductName: productName.trim(),
        optimizeType: 'original',
        errorMessage: e instanceof Error ? e.message : 'unknown_error'
      });
      
      alert("최적화 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  const [, navigate] = useLocation();

  const handleTopMenuNavigate = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    trackEvent('CardMenu', 'menu_product_optimizer_original', null, { from_page: '상품명_그대로_최적화', to: path });
    
    // 현재 페이지가 아닌 경우에만 navigate
    if (path !== '/product-optimizer/original') {
      navigate(path);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-0 pb-12 space-y-6">
        {/* 경험 헤더 */}
        <h2 className="text-center text-base text-gray-700 mb-3 font-semibold mt-6">
          실제 이용자 중 <span className="font-bold text-blue-600">55%가</span> <span className="font-bold text-blue-600">상품명만 바꿔서</span>
          <br className="block sm:hidden" />
          <span className="font-bold text-blue-600"> 순위 상승을 경험</span>했어요!
        </h2>

        {/* 상단 메뉴 카드 */}
        <MenuCardGrid 
          currentPageId="original-optimizer"
          onCardClick={handleTopMenuNavigate}
        />

        {/* 사용 안내 말풍성 */}
        {!loading && !result && (
          <div className="max-w-2xl mx-auto mb-6 relative">
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-200 rounded-2xl p-4 shadow-md relative">
              <div className="flex items-start gap-3">
                <div className="bg-purple-500 rounded-full p-1.5 flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-purple-800 mb-1">언제 사용하면 좋을까요?</p>
                  <p className="text-sm text-purple-700 leading-relaxed mb-1">
                    키워드 조합 상품명이 아닌 <span className="font-semibold">브랜드, 사이즈, 수량 등이 포함된 상품명</span>일 때 사용!
                    <br/>입력한 상품명을 <span className="font-semibold">네이버 상품명 SEO, 상위노출 최적화 규칙에 맞게 재배열</span>합니다.
                    <br/>키워드 조합 상품명은 완벽한, 빠른 상품명 최적화 기능을 사용하세요!
                  </p>
                </div>
              </div>
              {/* 말풍성 꼬리 */}
              <div className="absolute left-8 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-purple-200"></div>
              <div className="absolute left-8 -bottom-1.5 w-0 h-0 border-l-7 border-r-7 border-t-7 border-l-transparent border-r-transparent border-t-purple-100"></div>
            </div>
          </div>
        )}

        {/* 입력 카드 */}
        <Card className="border-2 border-purple-200 bg-purple-50 shadow-sm max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Coins className="h-5 w-5 text-purple-600" />
              <span>현재 상품명 입력</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-2 items-stretch">
              <Input
                placeholder="기존 상품명을 입력하세요"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter') handleOptimize(); }}
                className="flex-1 px-4 py-4 text-sm md:px-8 md:py-6 md:text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
              />
              <Button disabled={loading} onClick={handleOptimize} className="bg-purple-600 hover:bg-purple-600/90 text-white px-4 py-4 md:px-8 md:py-6 rounded-lg font-semibold transition-all duration-200 hover:scale-105 md:w-auto w-full flex items-center justify-center gap-2">
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{loading ? '최적화 중...' : '최적화'}</span>
              </Button>
            </div>
            
            {/* 로딩 스피너 - 빠른 상품명 최적화와 같은 스타일 */}
            {loading && (
              <div className="flex items-center gap-2 mt-4 w-full">
                <div className="flex-1 h-1 bg-purple-100 overflow-hidden rounded animate-pulse">
                  <div className="w-full h-full bg-gradient-to-r from-purple-400 to-purple-600" />
                </div>
                <span className="text-sm text-purple-600 whitespace-nowrap">상품명 최적화 중...</span>
              </div>
            )}
            
            {/* 결과 표시 */}
            {result && showResult && (
              <div className="space-y-6 mt-8 max-w-6xl mx-auto">
                {/* 최적화된 상품명 섹션 */}
                <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-purple-100 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-3 text-xl font-bold text-purple-800">
                      <Sparkles className="h-6 w-6 text-purple-600" />
                      최적화된 상품명
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-white border border-purple-200 rounded-lg p-6">
                      <div className="flex items-start gap-3">
                        <p className="text-lg font-semibold text-gray-900 leading-relaxed flex-1">
                          {result.productName}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(result.productName);
                            trackEvent('Copy', 'original_product_name', null, {
                              originalInput: productName,
                              optimizedName: result.productName
                            });
                          }}
                          className="border-purple-600 text-purple-600 hover:bg-purple-50 shrink-0"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 최적화 이유 섹션 */}
                <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-purple-100 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-3 text-xl font-bold text-purple-800">
                      <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      최적화 이유
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-white border border-purple-200 rounded-lg p-6">
                      <div 
                        className="text-base text-gray-700 leading-relaxed whitespace-pre-line" 
                        style={{ 
                          whiteSpace: 'pre-line',
                          wordBreak: 'keep-all',
                          overflowWrap: 'break-word'
                        }}
                      >
                        {result.reason}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

             {/* 로그인 모달 */}
       <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
         <DialogContent className="max-w-md p-0 border-none bg-transparent shadow-none">
           <LoginPage isModal={true} onLoginSuccess={() => {
             setShowLoginModal(false);
           }} />
         </DialogContent>
       </Dialog>
    </DashboardLayout>
  );
} 