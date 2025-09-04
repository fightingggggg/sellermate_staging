import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight, Leaf, Zap, BarChart, Users, Bell, MessageCircle, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function SubscriptionCompletePage() {
  const [, navigate] = useLocation();
  const { currentUser } = useAuth();
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // 체크마크 애니메이션 시작
    const timer = setTimeout(() => setIsAnimating(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleGoToKeywordAnalysis = () => {
    navigate("/keyword-competition-analysis");
  };

  const handleGoToProductOptimizer = () => {
    navigate("/product-optimizer/complete");
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div></div> {/* 왼쪽 공간 */}
          
          {/* 진행 단계 */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="w-6 h-6 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center text-sm font-bold">1</div>
              <span className="ml-2 text-sm font-medium text-gray-500">주문/결제</span>
            </div>
            <div className="w-8 h-px bg-gray-300"></div>
            <div className="flex items-center">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
              <span className="ml-2 text-sm font-medium text-blue-600">완료</span>
            </div>
          </div>
        </div>

        {/* 성공 메시지 섹션 */}
        <div className="text-center mb-12">
          <div className="relative inline-block mb-6">
            <div className={`w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center transition-all duration-1000 ${
              isAnimating ? 'scale-110 shadow-lg' : 'scale-100'
            }`}>
              <img 
                src="/icon.png" 
                alt="스토어부스터" 
                className={`w-12 h-12 transition-all duration-1000 ${
                  isAnimating ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                }`}
              />
            </div>
            {/* 파티클 효과 */}
            {isAnimating && (
              <>
                <div className="absolute -top-2 -left-2 w-4 h-4 bg-blue-400 rounded-full animate-ping"></div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-ping" style={{animationDelay: '0.2s'}}></div>
                <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-600 rounded-full animate-ping" style={{animationDelay: '0.4s'}}></div>
              </>
            )}
          </div>
          
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            구독이 완료되었습니다!
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            부스터 플랜에 가입해주셔서 감사합니다
          </p>
          <p className="text-gray-500">
            이제 스토어부스터로 상위노출 경쟁력을 상승시켜봐요!
          </p>
        </div>

        

        {/* 액션 버튼 */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            onClick={handleGoToKeywordAnalysis}
            className="px-8 py-4 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center"
          >
            키워드 경쟁률 분석
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          
          <Button 
            onClick={handleGoToProductOptimizer}
            variant="outline"
            className="px-8 py-4 text-lg font-semibold border-blue-600 text-blue-600 hover:bg-blue-50 rounded-lg flex items-center"
          >
            완벽한 상품명 최적화
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>

        {/* 추가 안내 */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm">
            문의사항이 있으시면 언제든지 official.sellermate@gmail.com으로 연락주세요
          </p>
          <p className="text-gray-400 text-xs mt-2">
            구독 기간: 30일 | 자동 갱신 | 언제든지 해지 가능
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
} 