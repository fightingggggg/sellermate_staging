import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight, Home, User, BarChart, Users, Zap, Bell, TrendingUp, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function SubscriptionCompletePage() {
  const [, navigate] = useLocation();
  const { currentUser } = useAuth();

  useEffect(() => {
    // 바로 프로필 페이지로 이동
    navigate("/profile");
  }, [navigate]);

  const features = [
    {
      icon: <Zap className="w-5 h-5 text-blue-500" />,
      title: "AI 매일 30회",
      description: "AI 키워드 분석을 매일 30회까지 이용하세요"
    },
    {
      icon: <BarChart className="w-5 h-5 text-blue-500" />,
      title: "키워드 분석 50회/일",
      description: "셀러와 인플루언서 모두 키워드 분석 50회 제공"
    },
    {
      icon: <Bell className="w-5 h-5 text-blue-500" />,
      title: "키워드 알림",
      description: "등록한 키워드의 순위 변화를 실시간으로 알림"
    },
    {
      icon: <TrendingUp className="w-5 h-5 text-blue-500" />,
      title: "상품/포스트 분석",
      description: "상품 순위 추적 및 블로그 포스트 진단 기능"
    },
    {
      icon: <MessageCircle className="w-5 h-5 text-blue-500" />,
      title: "카카오톡 알림",
      description: "중요한 키워드 변화를 카카오톡으로 받아보세요"
    },
    {
      icon: <Users className="w-5 h-5 text-blue-500" />,
      title: "채널 영향력 확인",
      description: "인플루언서 전용 채널 영향력 분석 기능"
    }
  ];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-12 px-4">
        {/* 성공 메시지 섹션 */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            구독이 완료되었습니다! 🎉
          </h1>
          <p className="text-lg text-gray-600 mb-2">
            부스터 플랜 구독이 성공적으로 활성화되었습니다.
          </p>
          <p className="text-sm text-gray-500">
            잠시 후 프로필 페이지로 이동합니다.
          </p>
        </div>

        {/* 구독 정보 카드 */}
        <Card className="mb-8 border-2 border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <CheckCircle className="w-5 h-5" />
              구독 정보
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-white p-3 rounded-lg">
                <div className="font-medium text-gray-700">구독 플랜</div>
                <div className="text-green-600 font-semibold">부스터 플랜</div>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <div className="font-medium text-gray-700">결제 금액</div>
                <div className="text-green-600 font-semibold">14,900원</div>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <div className="font-medium text-gray-700">다음 결제일</div>
                <div className="text-green-600 font-semibold">
                  {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 제공 기능 섹션 */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            이제 이용할 수 있는 기능들
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, index) => (
              <Card key={index} className="border border-gray-200 hover:border-blue-300 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                      <p className="text-sm text-gray-600">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 다음 단계 안내 */}
        <Card className="mb-8 border-2 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <ArrowRight className="w-5 h-5" />
              다음 단계
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">프로필 설정</h4>
                  <p className="text-sm text-gray-600">계정 정보와 알림 설정을 확인해보세요</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">키워드 등록</h4>
                  <p className="text-sm text-gray-600">관심 있는 키워드를 등록하고 알림을 받아보세요</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">AI 분석 시작</h4>
                  <p className="text-sm text-gray-600">AI 키워드 분석으로 더 나은 결과를 만들어보세요</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 액션 버튼들 */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            onClick={() => navigate("/profile")}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
          >
            <User className="w-4 h-4" />
            프로필로 이동
          </Button>
          <Button 
            onClick={() => navigate("/")}
            variant="outline"
            className="flex items-center gap-2 px-6 py-3"
          >
            <Home className="w-4 h-4" />
            홈으로 이동
          </Button>
        </div>

        {/* 추가 안내 */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 mb-2">
            궁금한 점이 있으시면 언제든지 문의해주세요.
          </p>
          <p className="text-xs text-gray-400">
            구독 관련 문의: support@sellermate.com
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
} 