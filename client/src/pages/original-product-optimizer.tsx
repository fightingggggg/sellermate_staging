import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Coins, Copy } from "lucide-react";

export default function OriginalProductOptimizerPage() {
  const [productName, setProductName] = useState("");
  const [result, setResult] = useState<null | { productName: string; reason: string }>(null);
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const handleOptimize = async () => {
    if (!productName.trim()) {
      alert("상품명을 입력해주세요.");
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
        <div className="grid md:grid-cols-4 gap-4 mb-6 max-w-3xl mx-auto">
          <Link href="/keyword-competition-analysis" onClick={(e: any)=>handleTopMenuNavigate(e, "/keyword-competition-analysis") }>
            <Card className="border hover:border-green-400 shadow-sm hover:shadow-md transition opacity-50 hover:opacity-100 h-full flex flex-col">
              <CardHeader className="py-2"><CardTitle className="text-base font-bold">키워드 경쟁률 분석</CardTitle></CardHeader>
              <CardContent className="pt-0 pb-2"><CardDescription className="text-xs text-gray-600">월간 검색량과 1페이지 묶음상품, 리뷰 수, 순위로 노출 경쟁률 확인</CardDescription></CardContent>
            </Card>
          </Link>

          <Link href="/product-optimizer/complete" onClick={(e: any)=>handleTopMenuNavigate(e, "/product-optimizer/complete") }>
            <Card className="border hover:border-blue-400 shadow-sm hover:shadow-md transition opacity-50 hover:opacity-100 h-full flex flex-col">
              <CardHeader className="py-2"><CardTitle className="text-base font-bold">완벽한 상품명 최적화</CardTitle></CardHeader>
              <CardContent className="pt-0 pb-2"><CardDescription className="text-xs text-gray-600">실제 상위 키워드, 검색 로직, 네이버 SEO를 고려한 상품명</CardDescription></CardContent>
            </Card>
          </Link>

          <Link href="/product-optimizer/quick" onClick={(e: any)=>handleTopMenuNavigate(e, "/product-optimizer/quick") }>
            <Card className="border hover:border-sky-400 shadow-sm hover:shadow-md transition opacity-50 hover:opacity-100 h-full flex flex-col">
              <CardHeader className="py-2"><CardTitle className="text-base font-bold">빠른 상품명 최적화</CardTitle></CardHeader>
              <CardContent className="pt-0 pb-2"><CardDescription className="text-xs text-gray-600">실제 상위 키워드, 네이버 SEO를 고려한 상품명</CardDescription></CardContent>
            </Card>
          </Link>

          <Link href="/product-optimizer/original" onClick={(e: any)=>handleTopMenuNavigate(e, "/product-optimizer/original") }>
            <Card className="border-2 border-purple-500 shadow-sm hover:shadow-md transition h-full flex flex-col relative">
              <Badge variant="secondary" className="absolute -top-2 -right-2 bg-purple-100 text-purple-700 text-xs px-2 py-0.5 z-10">Beta</Badge>
              <CardHeader className="py-2"><CardTitle className="text-base font-bold">상품명 그대로 최적화</CardTitle></CardHeader>
              <CardContent className="pt-0 pb-2"><CardDescription className="text-xs text-gray-600">기존 상품명을 SEO 맞게 재배열</CardDescription></CardContent>
            </Card>
          </Link>
        </div>

        {/* 설명 카드 – 메뉴 아래 */}
        <Card className="border border-blue-200 bg-white shadow-sm max-w-2xl mx-auto mb-6">
          <CardContent className="py-4 text-center">
            <p className="text-xs sm:text-sm font-medium text-gray-700">
               입력한 상품명을 네이버 상위노출 규칙에 맞게 재배열합니다.
             </p>
          </CardContent>
        </Card>

        {/* 입력 카드 */}
        <Card className="border border-blue-200 bg-blue-50 shadow-sm max-w-4xl mx-auto">
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
                className="flex-1 px-4 py-4 text-sm md:px-8 md:py-6 md:text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-[#1a73e8] transition-all duration-200"
              />
              <Button disabled={loading} onClick={handleOptimize} className="bg-[#1a73e8] hover:bg-[#1a73e8]/90 text-white px-4 py-4 md:px-8 md:py-6 rounded-lg font-semibold transition-all duration-200 hover:scale-105 md:w-auto w-full flex items-center justify-center gap-2">
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
                <div className="flex-1 h-1 bg-blue-100 overflow-hidden rounded animate-pulse">
                  <div className="w-full h-full bg-gradient-to-r from-sky-400 to-blue-600" />
                </div>
                <span className="text-sm text-blue-600 whitespace-nowrap">상품명 최적화 중...</span>
              </div>
            )}
            
            {/* 결과 표시 */}
            {result && showResult && (
              <div className="space-y-6 mt-8 max-w-6xl mx-auto">
                {/* 최적화된 상품명 섹션 */}
                <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-3 text-xl font-bold text-blue-800">
                      <Sparkles className="h-6 w-6 text-blue-600" />
                      최적화된 상품명
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-white border border-blue-200 rounded-lg p-6">
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
                          className="border-blue-600 text-blue-600 hover:bg-blue-50 shrink-0"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 최적화 이유 섹션 */}
                <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-3 text-xl font-bold text-blue-800">
                      <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      최적화 이유
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-white border border-blue-200 rounded-lg p-6">
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
    </DashboardLayout>
  );
} 