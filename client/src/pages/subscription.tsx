import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, CreditCard, ArrowLeft, Leaf, Zap, Users, Bell, BarChart, TrendingUp, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNicePay } from "@/hooks/useNicePay";
import BillingKeyForm from "@/components/BillingKeyForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";

export default function SubscriptionPage() {
  const { currentUser } = useAuth();
  const [, navigate] = useLocation();
  const { loading, error, getBillingKeyStatus, requestPayment, testBillingPayment, getSubscriptionInfo, runAutoPayment } = useNicePay();
  
  const [billingKeyStatus, setBillingKeyStatus] = useState<any>(null);
  const [showBillingKeyForm, setShowBillingKeyForm] = useState(false);
  const [showBillingKeyModal, setShowBillingKeyModal] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);
  const [billingKeyInfo, setBillingKeyInfo] = useState<any>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'naver' | 'kakao' | 'card'>('card');
  const [paymentPeriod, setPaymentPeriod] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    checkBillingKeyStatus();
    fetchBillingKeyInfo();
  }, []);

  const checkBillingKeyStatus = async () => {
    const status = await getBillingKeyStatus();
    setBillingKeyStatus(status);
  };

  const fetchBillingKeyInfo = async () => {
    if (!currentUser?.uid) {
      console.log('사용자 UID가 없어서 결제 수단 정보를 가져올 수 없습니다.');
      return;
    }
    
    try {
      const billingKeyDoc = await getDoc(doc(db, 'billingKeys', currentUser.uid));
      
      if (billingKeyDoc.exists()) {
        const billingKeyData = billingKeyDoc.data();
        console.log('결제 수단 정보 로드됨:', billingKeyData);
        setBillingKeyInfo({
          id: billingKeyDoc.id,
          ...billingKeyData
        });
      } else {
        console.log('등록된 결제 수단이 없음');
        setBillingKeyInfo(null);
      }
    } catch (error) {
      console.error('결제 수단 정보 가져오기 실패:', error);
      setBillingKeyInfo(null);
    }
  };

  const handleBillingKeySuccess = async () => {
    setShowBillingKeyForm(false);
    setShowBillingKeyModal(false);
    await checkBillingKeyStatus();
    
    // 카드 등록 성공 후 바로 결제 진행
    setPaymentStatus('processing');

    try {
      const orderId = `SUB_${Date.now()}_${currentUser?.uid}`;
      const amount = 14900;
      const result = await requestPayment({
        amount: amount,
        goodsName: "부스터 플랜 구독",
        orderId: orderId
      });

      if (result?.success) {
        // 구독 정보를 Firestore에 저장
        try {
          const subscriptionData = {
            uid: currentUser?.uid,
            plan: 'BOOSTER',
            status: 'ACTIVE',
            startDate: serverTimestamp(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30일 후
            lastPaymentAmount: amount,
            lastPaymentOrderId: orderId,
            paymentMethod: selectedPaymentMethod,
            paymentHistory: [{
              amount: amount,
              date: serverTimestamp(),
              orderId: orderId,
              status: 'SUCCESS',
              plan: 'BOOSTER'
            }],
            createdAt: serverTimestamp()
          };

          await addDoc(collection(db, 'subscriptions'), subscriptionData);
        } catch (error) {
          console.error('구독 정보 저장 실패:', error);
          // 구독 정보 저장 실패해도 결제는 성공했으므로 계속 진행
        }

        setPaymentStatus('success');
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

  const handlePaymentMethodSelect = (method: 'naver' | 'kakao' | 'card') => {
    setSelectedPaymentMethod(method);
  };

  const handleSubscribe = async () => {
    // 일반 카드 선택 시 등록된 카드가 없으면 모달 표시
    if (selectedPaymentMethod === 'card' && !billingKeyStatus?.hasBillingKey) {
      setShowBillingKeyModal(true);
      return;
    }

    setPaymentStatus('processing');

    try {
      const orderId = `SUB_${Date.now()}_${currentUser?.uid}`;
      const amount = 14900;
      const result = await requestPayment({
        amount: amount,
        goodsName: "부스터 플랜 구독",
        orderId: orderId
      });

      if (result?.success) {
        // 구독 정보를 Firestore에 저장
        try {
          const subscriptionData = {
            uid: currentUser?.uid,
            plan: 'BOOSTER',
            status: 'ACTIVE',
            startDate: serverTimestamp(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30일 후
            lastPaymentAmount: amount,
            lastPaymentOrderId: orderId,
            paymentMethod: selectedPaymentMethod,
            paymentHistory: [{
              amount: amount,
              date: serverTimestamp(),
              orderId: orderId,
              status: 'SUCCESS',
              plan: 'BOOSTER'
            }],
            createdAt: serverTimestamp()
          };

          await addDoc(collection(db, 'subscriptions'), subscriptionData);
        } catch (error) {
          console.error('구독 정보 저장 실패:', error);
          // 구독 정보 저장 실패해도 결제는 성공했으므로 계속 진행
        }

        setPaymentStatus('success');
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
    setShowBillingKeyModal(false);
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

  const monthlyPrice = 14900;
  const finalPrice = monthlyPrice;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => navigate("/membership")}
            className="flex items-center text-gray-600 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            뒤로가기
          </button>
          
          {/* 진행 단계 */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
              <span className="ml-2 text-sm font-medium text-blue-600">주문/결제</span>
            </div>
            <div className="w-8 h-px bg-gray-300"></div>
            <div className="flex items-center">
              <div className="w-6 h-6 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center text-sm font-bold">2</div>
              <span className="ml-2 text-sm font-medium text-gray-500">완료</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 왼쪽 컬럼 - 주문 상품 및 결제 방법 (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* 주문 상품 */}
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-gray-800">주문 상품</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Leaf className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 mb-1">부스터 플랜 구독</h3>
                    <p className="text-sm text-gray-600 mb-4">입문자를 위한 기본 종합 세트</p>
                    
                    {/* 공통 기능 */}
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <Zap className="w-4 h-4 mr-2 text-blue-500" />
                        공통 기능
                      </h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div>• AI 매일 30회</div>
                        <div>• 아카데미 강의 무제한 시청</div>
                      </div>
                    </div>

                    {/* 셀러 기능 */}
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <BarChart className="w-4 h-4 mr-2 text-blue-500" />
                        셀러 기능
                      </h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div>• 키워드 분석 50회/일</div>
                        <div>• 키워드 알림 매일</div>
                        <div>• 상품 분석 및 실시간 순위 추적 (월 50회)</div>
                        <div>• 상품 순위 확인 (일 30개)</div>
                        <div>• 카카오톡 알림 (등록 키워드 100개)</div>
                      </div>
                    </div>

                    {/* 인플루언서 기능 */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <Users className="w-4 h-4 mr-2 text-blue-500" />
                        인플루언서 기능
                      </h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div>• 키워드 분석 50회/일</div>
                        <div>• 채널 영향력 확인 (일 10회)</div>
                        <div>• 블로그/포스트 진단 (일 10개)</div>
                        <div>• 포스트 순위 확인 (일 10회)</div>
                        <div>• 카카오톡 알림 (등록 키워드 20개)</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 결제 방법 */}
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-gray-800">결제 방법</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {/* 네이버페이 */}
                  <button
                    onClick={() => handlePaymentMethodSelect('naver')}
                    className={`p-4 border rounded-lg text-center transition-all ${
                      selectedPaymentMethod === 'naver' 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 bg-green-500 rounded mx-auto mb-2 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">N</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">네이버페이</span>
                  </button>

                  {/* 카카오페이 */}
                  <button
                    onClick={() => handlePaymentMethodSelect('kakao')}
                    className={`p-4 border rounded-lg text-center transition-all ${
                      selectedPaymentMethod === 'kakao' 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 bg-yellow-400 rounded mx-auto mb-2 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">K</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">카카오페이</span>
                  </button>

                  {/* 일반 카드 */}
                  <button
                    onClick={() => handlePaymentMethodSelect('card')}
                    className={`p-4 border rounded-lg text-center transition-all ${
                      selectedPaymentMethod === 'card' 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 bg-blue-100 rounded mx-auto mb-2 flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {billingKeyInfo ? (
                        <div>
                          <div>등록된 카드</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {billingKeyInfo.cardName}
                            {billingKeyInfo.cardNo && ` (${billingKeyInfo.cardNo})`}
                          </div>
                        </div>
                      ) : (
                        '일반 카드'
                      )}
                    </span>
                  </button>
                </div>
                
                {/* 등록된 카드 정보 표시 */}
                {billingKeyInfo && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">등록된 카드 정보</h4>
                    <div className="text-sm text-blue-700 space-y-1">
                      {billingKeyInfo.cardName && <p>• 카드명: {billingKeyInfo.cardName}</p>}
                      {billingKeyInfo.cardNo && <p>• 카드번호: {billingKeyInfo.cardNo}</p>}
                      {billingKeyInfo.expiry && <p>• 유효기간: {billingKeyInfo.expiry}</p>}
                      {billingKeyInfo.status && <p>• 상태: {billingKeyInfo.status}</p>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 오른쪽 컬럼 - 결제 상세 (1/3) */}
          <div className="lg:col-span-1">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-gray-800">결제 상세</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 주문 상품 가격 */}
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-gray-700">주문 상품</span>
                  <span className="font-medium">{monthlyPrice.toLocaleString()}원</span>
                </div>

                {/* 최종 결제 금액 */}
                <div className="flex justify-between items-center py-3">
                  <span className="text-lg font-semibold text-gray-800">최종 결제 금액</span>
                  <span className="text-xl font-bold text-blue-600">{finalPrice.toLocaleString()}원</span>
                </div>

                {/* 결제 버튼 */}
                <Button 
                  onClick={handleSubscribe}
                  className="w-full py-4 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  disabled={loading || paymentStatus === 'processing'}
                >
                  {paymentStatus === 'processing' ? '처리중...' : `${finalPrice.toLocaleString()}원 결제하기`}
                </Button>

                {/* 결제 상태 표시 */}
                {paymentStatus === 'success' && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
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
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 카드 등록 모달 */}
        <Dialog open={showBillingKeyModal} onOpenChange={setShowBillingKeyModal}>
          <DialogContent className="max-w-md border-0 shadow-none p-0">
            <BillingKeyForm 
              onSuccess={handleBillingKeySuccess}
              onCancel={() => setShowBillingKeyModal(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
} 