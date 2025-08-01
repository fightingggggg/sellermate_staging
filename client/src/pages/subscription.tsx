import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, CreditCard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNicePay } from "@/hooks/useNicePay";
import BillingKeyForm from "@/components/BillingKeyForm";

export default function SubscriptionPage() {
  const { currentUser } = useAuth();
  const [, navigate] = useLocation();
  const { loading, error, getBillingKeyStatus, requestPayment } = useNicePay();
  
  const [billingKeyStatus, setBillingKeyStatus] = useState<any>(null);
  const [showBillingKeyForm, setShowBillingKeyForm] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');

  useEffect(() => {
    checkBillingKeyStatus();
  }, []);

  const checkBillingKeyStatus = async () => {
    const status = await getBillingKeyStatus();
    setBillingKeyStatus(status);
  };

  const handleBillingKeySuccess = () => {
    setShowBillingKeyForm(false);
    checkBillingKeyStatus();
  };

  const handleSubscribe = async () => {
    if (!billingKeyStatus?.hasBillingKey) {
      setShowBillingKeyForm(true);
      return;
    }

    setPaymentStatus('processing');

    try {
      const orderId = `SUB_${Date.now()}_${currentUser?.uid}`;
      const result = await requestPayment({
        amount: 14900, // 월 14,900원
        goodsName: "스토어부스터 부스터 플랜",
        orderId: orderId
      });

      if (result?.success) {
        setPaymentStatus('success');
        // 성공 시 프로필 페이지로 이동
        setTimeout(() => {
          navigate("/profile");
        }, 2000);
      } else {
        setPaymentStatus('failed');
      }
    } catch (err) {
      setPaymentStatus('failed');
    }
  };

  const handleCancel = () => {
    setShowBillingKeyForm(false);
    navigate("/membership");
  };

  if (showBillingKeyForm) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto py-16 px-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">카드 등록</h1>
            <p className="text-gray-600">
              자동 결제를 위해 카드 정보를 등록해주세요.
            </p>
          </div>
          
          <BillingKeyForm 
            onSuccess={handleBillingKeySuccess}
            onCancel={handleCancel}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-16 px-4">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
            부스터 플랜 구독
          </h1>
          <p className="text-lg text-gray-600">
            월 14,900원으로 더 많은 기능을 이용해보세요
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 구독 정보 */}
          <Card className="border-blue-500 shadow-lg">
            <CardHeader className="bg-blue-50 border-b border-blue-100">
              <CardTitle className="text-2xl font-bold text-blue-600">부스터 플랜</CardTitle>
              <CardDescription className="text-gray-600">
                월 14,900원 • 자동 결제
              </CardDescription>
            </CardHeader>
            <CardContent className="py-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>키워드 경쟁률 분석 50회/일</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>상품 최적화 30회/일</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>최근 내역 50개 저장</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>확장프로그램 무제한</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>신규 기능 우선 이용</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 결제 정보 */}
          <Card className="border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl font-bold">결제 정보</CardTitle>
              <CardDescription>
                등록된 카드로 자동 결제됩니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 카드 정보 표시 */}
              {billingKeyStatus?.hasBillingKey ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <CreditCard className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-800">등록된 카드</span>
                  </div>
                  <p className="text-sm text-green-700">
                    {billingKeyStatus.cardInfo?.cardName || '카드'} • 
                    {billingKeyStatus.cardInfo?.cardNo || '****-****-****-****'}
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                    <span className="font-medium text-yellow-800">카드 미등록</span>
                  </div>
                  <p className="text-sm text-yellow-700">
                    구독을 위해 카드를 등록해주세요
                  </p>
                </div>
              )}

              {/* 결제 상태 표시 */}
              {paymentStatus === 'success' && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    구독이 성공적으로 완료되었습니다! 잠시 후 프로필 페이지로 이동합니다.
                  </AlertDescription>
                </Alert>
              )}

              {paymentStatus === 'failed' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    결제 처리 중 오류가 발생했습니다. 다시 시도해주세요.
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* 구독 버튼 */}
              <div className="space-y-3">
                <Button 
                  onClick={handleSubscribe}
                  className="w-full py-3 text-lg font-semibold"
                  disabled={loading || paymentStatus === 'processing'}
                >
                  {paymentStatus === 'processing' ? '처리중...' : 
                   billingKeyStatus?.hasBillingKey ? '구독 시작하기' : '카드 등록하기'}
                </Button>
                
                <Button 
                  onClick={() => navigate("/membership")}
                  variant="outline"
                  className="w-full"
                >
                  돌아가기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 유의사항 */}
        <div className="mt-12 p-6 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">유의사항</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-1">•</span>
              <span>구독은 즉시 시작되며, 매월 자동으로 결제됩니다</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-1">•</span>
              <span>결제 주기는 30일입니다</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-1">•</span>
              <span>환불은 7일 내 미사용자일 경우에만 가능하며, 전액환불됩니다</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-1">•</span>
              <span>해지는 언제든 가능하며, 해지 시 남은 기간 동안 사용가능합니다</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-1">•</span>
              <span>카드 정보는 안전하게 암호화되어 저장됩니다</span>
            </li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
} 