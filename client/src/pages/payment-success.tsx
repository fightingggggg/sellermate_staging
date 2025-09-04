import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { maskCardNumber, formatCardNumberWithPrefix } from "@/lib/utils";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, CreditCard, ArrowRight, Home, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function PaymentSuccessPage() {
  const { currentUser } = useAuth();
  const [, navigate] = useLocation();
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // URL 파라미터에서 결제 정보 추출 (표시용 최소 정보만 사용)
    const url = new URL(window.location.href);
    const urlParams = new URLSearchParams(url.search);
    const orderId = urlParams.get('orderId');
    const authResultCode = urlParams.get('authResultCode');
    const authResultMsg = urlParams.get('authResultMsg');
    // 민감정보는 사용하지 않음(billingKey, cardNo 등)
    const cardName = urlParams.get('cardName') || undefined;

    if (authResultCode === '0000') {
      setPaymentInfo({
        orderId,
        authResultCode,
        authResultMsg,
        cardName,
        success: true
      });
    } else {
      setPaymentInfo({
        orderId,
        authResultCode,
        authResultMsg,
        success: false
      });
    }

    // 민감 파라미터 및 쿼리를 즉시 제거하여 유출 최소화
    history.replaceState({}, document.title, url.pathname);
    setLoading(false);
  }, []);

  const handleGoToProfile = () => {
    navigate("/profile");
  };

  const handleGoToHome = () => {
    navigate("/");
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto py-16 px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">결제 정보를 확인하는 중...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!paymentInfo?.success) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto py-16 px-4">
          <Card className="border-red-200 shadow-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-red-600">결제 실패</CardTitle>
              <CardDescription className="text-gray-600">
                카드 등록 중 문제가 발생했습니다
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">
                  오류 코드: {paymentInfo?.authResultCode}
                </p>
                <p className="text-sm text-red-700 mt-1">
                  오류 메시지: {paymentInfo?.authResultMsg}
                </p>
              </div>

              <div className="space-y-3">
                <Button 
                  onClick={() => navigate("/subscription")}
                  className="w-full"
                >
                  다시 시도하기
                </Button>
                <Button 
                  onClick={handleGoToHome}
                  variant="outline"
                  className="w-full"
                >
                  홈으로 돌아가기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-16 px-4">
        <Card className="border-green-200 shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-600">카드 등록 완료!</CardTitle>
            <CardDescription className="text-gray-600">
              자동 결제를 위한 카드가 성공적으로 등록되었습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 등록된 카드 정보 */}
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <CreditCard className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-800">등록된 카드</span>
              </div>
              <p className="text-sm text-green-700">
                {paymentInfo?.cardName || '카드'} • {'****-****-****-****'}
              </p>
            </div>

            {/* 안내 메시지 */}
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 text-sm font-bold">1</span>
                </div>
                <div>
                  <p className="font-medium text-gray-800">구독 시작</p>
                  <p className="text-sm text-gray-600">이제 부스터 플랜 구독을 시작할 수 있습니다</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 text-sm font-bold">2</span>
                </div>
                <div>
                  <p className="font-medium text-gray-800">자동 결제</p>
                  <p className="text-sm text-gray-600">매월 자동으로 결제되어 서비스를 이용할 수 있습니다</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 text-sm font-bold">3</span>
                </div>
                <div>
                  <p className="font-medium text-gray-800">언제든 해지 가능</p>
                  <p className="text-sm text-gray-600">구독은 언제든지 해지할 수 있으며, 남은 기간 동안 사용 가능합니다</p>
                </div>
              </div>
            </div>

            {/* 다음 단계 버튼들 */}
            <div className="space-y-3 pt-4">
              <Button 
                onClick={() => navigate("/subscription")}
                className="w-full py-3 text-lg font-semibold"
              >
                구독 시작하기
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={handleGoToProfile}
                  variant="outline"
                  className="w-full"
                >
                  <User className="w-4 h-4 mr-2" />
                  프로필
                </Button>
                <Button 
                  onClick={handleGoToHome}
                  variant="outline"
                  className="w-full"
                >
                  <Home className="w-4 h-4 mr-2" />
                  홈
                </Button>
              </div>
            </div>

            {/* 주문 정보 */}
            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                주문번호: {paymentInfo?.orderId}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
} 