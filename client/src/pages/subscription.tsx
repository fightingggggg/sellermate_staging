import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, CreditCard, ArrowLeft, Leaf, Zap, Users, Bell, BarChart, TrendingUp, MessageCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNicePay } from "@/hooks/useNicePay";
import BillingKeyForm from "@/components/BillingKeyForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { calculateAge, maskCardNumber, formatCardNumberWithPrefix } from "@/lib/utils";
import LoginPage from "@/components/LoginPage";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";

export default function SubscriptionPage() {
  const { currentUser } = useAuth();
  const [, navigate] = useLocation();
  const { loading, error, getBillingKeyStatus, requestPayment } = useNicePay();
  const { toast } = useToast();
  
  const [billingKeyStatus, setBillingKeyStatus] = useState<any>(null);
  const [showBillingKeyForm, setShowBillingKeyForm] = useState(false);
  const [showBillingKeyModal, setShowBillingKeyModal] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);
  const [billingKeyInfo, setBillingKeyInfo] = useState<any>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'card'>('card');
  const [paymentPeriod, setPaymentPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [userAge, setUserAge] = useState<number | null>(null);
  const [ageLoading, setAgeLoading] = useState(true);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [userProvider, setUserProvider] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'none' | 'active' | 'cancelled' | 'expired'>('none');
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);


  useEffect(() => {
    if (!currentUser?.uid) return;
    checkBillingKeyStatus();
    fetchBillingKeyInfo();
    checkUserAge();
    checkSubscriptionStatus();
    
    // 계정 병합 완료 확인
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mergeComplete') === 'true') {
      toast({
        title: "계정 병합 완료",
        description: "이메일 계정이 소셜 계정과 성공적으로 병합되었습니다. 이제 소셜 로그인으로 간편하게 이용하실 수 있습니다.",
      });
      
      // URL에서 mergeComplete 파라미터 제거
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('mergeComplete');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [currentUser?.uid]);

  const checkBillingKeyStatus = async () => {
    const status = await getBillingKeyStatus();
    setBillingKeyStatus(status);
  };

  const checkUserAge = async () => {
    if (!currentUser?.uid) {
      setAgeLoading(false);
      return;
    }
    
    try {
      const userDoc = await getDoc(doc(db, 'usersInfo', currentUser.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const birthDate = userData.birthDate;
        const provider = userData.provider;
        
        setUserProvider(provider);
        console.log('사용자 provider:', provider);
        
        if (birthDate) {
          const age = calculateAge(birthDate);
          setUserAge(age);
          console.log('사용자 나이:', age);
        } else {
          console.log('생년월일 정보가 없습니다.');
          setUserAge(null);
        }
      } else {
        console.log('사용자 정보가 없습니다.');
        setUserAge(null);
        setUserProvider(null);
      }
    } catch (error) {
      console.error('사용자 나이 확인 실패:', error);
      setUserAge(null);
      setUserProvider(null);
    } finally {
      setAgeLoading(false);
    }
  };

  const fetchBillingKeyInfo = async () => {
    if (!currentUser?.uid) {
      console.log('사용자 UID가 없어서 결제 수단 정보를 가져올 수 없습니다.');
      return;
    }
    try {
      const idToken = await (auth.currentUser?.getIdToken?.() ?? Promise.resolve(null));
      if (!idToken) {
        // 토큰이 아직 준비되지 않았으면 스킵
        return;
      }
      const resp = await fetch(`/api/nicepay/billing-key/${currentUser.uid}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await resp.json();
      if (!resp.ok || !data?.hasBillingKey) {
        setBillingKeyInfo(null);
        return;
      }
      setBillingKeyInfo({
        id: currentUser.uid,
        ...data,
      });
    } catch (error) {
      console.error('결제 수단 정보 가져오기 실패:', error);
      setBillingKeyInfo(null);
    }
  };

  const checkSubscriptionStatus = async () => {
    if (!currentUser?.uid) {
      setSubscriptionLoading(false);
      return;
    }
    
    try {
      // 구독 정보 조회
      const subscriptionsRef = collection(db, 'subscriptions');
      const subscriptionQuery = query(
        subscriptionsRef,
        where('uid', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const subscriptionSnapshot = await getDocs(subscriptionQuery);
      
      if (!subscriptionSnapshot.empty) {
        const subscriptionDoc = subscriptionSnapshot.docs[0];
        const subscriptionData = subscriptionDoc.data();
        
        console.log('구독 정보:', subscriptionData);
        
        const now = new Date();
        const endDate = subscriptionData.endDate?.toDate ? subscriptionData.endDate.toDate() : new Date(subscriptionData.endDate);
        
        if (subscriptionData.status === 'ACTIVE') {
          setSubscriptionStatus('active');
          setSubscriptionInfo(subscriptionData);
        } else if (subscriptionData.status === 'CANCELLED' && endDate > now) {
          // 해지되었지만 만료일이 남아있는 경우
          setSubscriptionStatus('cancelled');
          setSubscriptionInfo(subscriptionData);
        } else {
          // 만료된 경우
          setSubscriptionStatus('expired');
          setSubscriptionInfo(subscriptionData);
        }
      } else {
        setSubscriptionStatus('none');
        setSubscriptionInfo(null);
      }
    } catch (error) {
      console.error('구독 상태 확인 실패:', error);
      setSubscriptionStatus('none');
      setSubscriptionInfo(null);
    } finally {
      setSubscriptionLoading(false);
    }
  };



  const handleBillingKeySuccess = async () => {
    setShowBillingKeyForm(false);
    setShowBillingKeyModal(false);
    await checkBillingKeyStatus();
    
    // 에러 초기화
    setAgeError(null);
    
    // 이메일/기타 로그인 사용자는 소셜 전환 유도 (네이버/카카오만 나이 확인 진행)
    if (userProvider !== 'naver' && userProvider !== 'kakao') {
      setShowLoginModal(true);
      return;
    }
    
    // 나이 확인 중이면 대기 (소셜 사용자 대상)
    if (ageLoading) {
      setAgeError('나이 확인 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    
    // 나이 확인 (만 14세 미만 차단)
    if (userAge !== null && userAge < 14) {
      setAgeError('만 14세 미만은 결제가 불가능합니다.');
      return;
    }
    
    // 소셜 사용자에서 생년월일 정보가 없는 경우 결제 허용 (추가 차단 없음)
    
    // 구독 상태 확인
    if (subscriptionStatus === 'active') {
      setAgeError('이미 구독 중입니다. 추가 결제가 필요하지 않습니다.');
      return;
    }
    
    if (subscriptionStatus === 'cancelled') {
      setAgeError('구독이 해지되었지만 만료일까지 서비스를 이용할 수 있습니다.');
      return;
    }
    
    // 카드 등록 성공 후 바로 결제 진행
    setPaymentStatus('processing');

    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD 형식
      const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0'); // 6자리 랜덤 숫자
      const orderId = `SUB_${randomNum}_${currentUser?.uid}`;
      const amount = 9900;
      const result = await requestPayment({
        amount: amount,
        goodsName: "부스터 플랜 구독",
        orderId: orderId
      });

      if (result?.success) {
        // 구독 정보를 Firestore에 저장
        try {
          // 서버가 결제 성공 시 구독 문서를 uid로 생성/업데이트합니다.
          // 중복 생성 방지를 위해 클라이언트에서는 생성하지 않습니다.
          console.log('구독 정보는 서버에서 생성/업데이트됩니다.');
        } catch (error) {
          console.error('구독 정보 확인 중 경고:', error);
        }

        setPaymentStatus('success');
        navigate("/subscription-complete");
      } else {
        // requestPayment가 실패하면 useNicePay에서 error 상태를 설정하므로
        // paymentStatus는 'idle'로 유지
        setPaymentStatus('idle');
      }
    } catch (err) {
      // 예외 발생 시에도 useNicePay에서 error 상태를 설정하므로
      // paymentStatus는 'idle'로 유지
      setPaymentStatus('idle');
    }
  };

  const handlePaymentMethodSelect = (method: 'card') => {
    setSelectedPaymentMethod(method);
  };

  const handleSubscribe = async () => {
    // 에러 초기화
    setAgeError(null);
    
    // 구독 상태 확인
    if (subscriptionStatus === 'active') {
      setAgeError('이미 구독 중입니다. 추가 결제가 필요하지 않습니다.');
      return;
    }
    
    if (subscriptionStatus === 'cancelled') {
      setAgeError('구독이 해지되었지만 만료일까지 서비스를 이용할 수 있습니다.');
      return;
    }
    
    // 이메일/기타 로그인 사용자는 소셜 전환 유도 (네이버/카카오만 나이 확인 진행)
    if (userProvider !== 'naver' && userProvider !== 'kakao') {
      setShowLoginModal(true);
      return;
    }
    
    // 나이 확인 중이면 대기 (소셜 사용자 대상)
    if (ageLoading) {
      setAgeError('나이 확인 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    
    // 나이 확인 (만 14세 미만 차단)
    if (userAge !== null && userAge < 14) {
      setAgeError('만 14세 미만은 결제가 불가능합니다.');
      return;
    }
    
    // 소셜 사용자에서 생년월일 정보가 없는 경우 결제 허용 (추가 차단 없음)

    // 일반 카드 선택 시 등록된 카드가 없으면 모달 표시
    if (selectedPaymentMethod === 'card' && !billingKeyStatus?.hasBillingKey) {
      setShowBillingKeyModal(true);
      return;
    }

    setPaymentStatus('processing');

    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD 형식
      const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0'); // 6자리 랜덤 숫자
      const orderId = `SUB${randomNum}_${currentUser?.uid}`;
      const amount = 9900;
      const result = await requestPayment({
        amount: amount,
        goodsName: "부스터 플랜 구독",
        orderId: orderId
      });

      if (result?.success) {
        // 구독 정보를 Firestore에 저장
        try {
          // 서버가 결제 성공 시 구독 문서를 uid로 생성/업데이트합니다.
          // 중복 생성을 막기 위해 클라이언트에서는 생성하지 않습니다.
          console.log('구독 정보는 서버에서 생성/업데이트됩니다.');
        } catch (error) {
          console.error('구독 정보 확인 중 경고:', error);
        }

        setPaymentStatus('success');
        navigate("/subscription-complete");
      } else {
        // requestPayment가 실패하면 useNicePay에서 error 상태를 설정하므로
        // paymentStatus는 'idle'로 유지
        setPaymentStatus('idle');
      }
    } catch (err) {
      // 예외 발생 시에도 useNicePay에서 error 상태를 설정하므로
      // paymentStatus는 'idle'로 유지
      setPaymentStatus('idle');
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
            isMembershipPage={true}
          />
        </div>
      </DashboardLayout>
    );
  }

  const monthlyPrice = 9900;
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
                    <img src="/icon.png" alt="부스터 플랜 아이콘" className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 mb-1">부스터 플랜 구독</h3>

                    <p className="text-sm font-medium text-blue-600 mb-4">스마트스토어 상위노출 경쟁력 부스터!</p>
                    
                    <div className="space-y-3 text-sm text-gray-600">
                      <div>• 키워드 경쟁률 분석 30회/일</div>
                      <div>• 상품 최적화 20회/일</div>
                      <div className="ml-4">• 완벽한 상품 최적화</div>
                      <div className="ml-4">• 동의어·조합형 검사 등 네이버 검색 로직까지 체크!</div>
                      <div className="ml-4">• 빠른 상품 최적화</div>
                      <div>• 최근 내역 저장 30개</div>
                      <div>• 확장프로그램 무제한</div>
                    </div>
                    
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm font-medium text-blue-800">
                        총 월 900회 키워드 경쟁률 분석 · 600회 상품 최적화!
                      </p>
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
                <div className="flex justify-center">
                  {/* 일반 카드 */}
                  <button
                    onClick={() => handlePaymentMethodSelect('card')}
                    className={`p-4 border rounded-lg text-center transition-all w-full max-w-xs ${
                      selectedPaymentMethod === 'card' 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 bg-blue-100 rounded mx-auto mb-2 flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {billingKeyInfo?.cardInfo?.cardName && billingKeyInfo?.cardInfo?.cardNo ? (
                          <div>
                            <div>등록된 카드</div>
                            <div className="text-xs text-gray-500 mt-1">
                              <div>
                                {billingKeyInfo.cardInfo.cardName.replace(/[\[\]]/g, '')} {billingKeyInfo.cardInfo.cardNo}
                              </div>
                            </div>
                          </div>
                        ) : (
                          '일반 카드'
                        )}
                    </span>
                  </button>
                </div>
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
                  disabled={
                    loading || 
                    paymentStatus === 'processing' || 
                    ((userProvider === 'naver' || userProvider === 'kakao') && ageLoading) || 
                    subscriptionLoading ||
                    ((userProvider === 'naver' || userProvider === 'kakao') && (userAge !== null && userAge < 14)) ||
                    subscriptionStatus === 'active' ||
                    subscriptionStatus === 'cancelled'
                  }
                >
                  {(((userProvider === 'naver' || userProvider === 'kakao') && ageLoading) || subscriptionLoading) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : ((userProvider === 'naver' || userProvider === 'kakao') && userAge !== null && userAge < 14) ? '만 14세 미만은 결제 불가' :
                     subscriptionStatus === 'active' ? '이미 구독 중입니다' :
                     subscriptionStatus === 'cancelled' ? '구독 만료일까지 이용 가능' :
                     paymentStatus === 'processing' ? '처리중...' : 
                     `${finalPrice.toLocaleString()}원 결제하기`}
                </Button>

                {/* 결제 상태 표시 */}


                {ageError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{ageError}</AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}



                {/* 구독 상태 안내 */}
                {subscriptionStatus === 'active' && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      현재 부스터 플랜을 이용 중입니다. 구독 기간이 만료되면 자동으로 결제됩니다.
                    </AlertDescription>
                  </Alert>
                )}

                {subscriptionStatus === 'cancelled' && subscriptionInfo && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {subscriptionInfo.endDate?.toDate ? 
                        subscriptionInfo.endDate.toDate().toLocaleDateString() : 
                        new Date(subscriptionInfo.endDate).toLocaleDateString()}까지 서비스를 이용할 수 있습니다. 계속 이용하려면, 구독을 유지해주세요.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 카드 등록 모달 */}
        <Dialog open={showBillingKeyModal} onOpenChange={setShowBillingKeyModal}>
          <DialogContent className="max-w-md border-0 shadow-none p-0 [&>button]:hidden">
            <BillingKeyForm 
              onSuccess={handleBillingKeySuccess}
              onCancel={() => setShowBillingKeyModal(false)}
              isMembershipPage={true}
            />
          </DialogContent>
        </Dialog>

        {/* 네이버/카카오 로그인 필요 모달 */}
        <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center text-lg font-semibold text-gray-800">
                결제 전 본인 확인이 필요합니다
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                네이버/카카오톡 계정으로 전환해주세요
                <br />
                아래 버튼을 통해 간편하게 회원 전환이 가능합니다
              </p>
              
              <div className="space-y-3">
                <Button
                  className="w-full bg-[#03C75A] hover:bg-[#02b152] text-white"
                  onClick={() => {
                    setShowLoginModal(false);
                    const mergeUrl = new URL("/api/auth/naver", window.location.origin);
                    mergeUrl.searchParams.set('merge', 'true');
                    mergeUrl.searchParams.set('emailUid', currentUser?.uid || '');
                    mergeUrl.searchParams.set('email', currentUser?.email || '');
                    // 비밀번호는 보안상 URL에 포함하지 않고, 소셜 로그인 후 별도로 입력받도록 처리
                    window.location.href = mergeUrl.toString();
                  }}
                >
                  네이버로 간편 회원가입
                </Button>
                
                <Button
                  className="w-full bg-[#FEE500] hover:bg-[#ffd400] text-black"
                  onClick={() => {
                    setShowLoginModal(false);
                    const mergeUrl = new URL("/api/auth/kakao", window.location.origin);
                    mergeUrl.searchParams.set('merge', 'true');
                    mergeUrl.searchParams.set('emailUid', currentUser?.uid || '');
                    mergeUrl.searchParams.set('email', currentUser?.email || '');
                    // 비밀번호는 보안상 URL에 포함하지 않고, 소셜 로그인 후 별도로 입력받도록 처리
                    window.location.href = mergeUrl.toString();
                  }}
                >
                  카카오톡으로 간편 회원가입
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
} 