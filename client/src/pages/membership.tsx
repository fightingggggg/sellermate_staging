import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, Lock, AlertCircle, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import LoginPage from "@/components/LoginPage";
import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function MembershipPage() {
  const { currentUser } = useAuth();
  const [, navigate] = useLocation();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<{
    type: 'basic' | 'booster';
    subscriptionInfo?: any;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const basicFeatures = [
    "키워드 경쟁률 분석 3회/일",
    "상품 최적화 3회/일",
    "확장프로그램 20회/월",
    "최근 내역 3개 저장",
    "총 월 150회 키워드 분석, 90회 상품 최적화!",
  ];

  const boosterFeatures = [
    "키워드 경쟁률 분석 50회/일",
    "상품 최적화 30회/일",
    "최근 내역 50개 저장",
    "확장프로그램 무제한",
    "총 월 1,500회 키워드 분석, 900회 상품 최적화!",
  ];

  // 멤버십 상태 확인
  useEffect(() => {
    const checkMembershipStatus = async () => {
      if (!currentUser?.uid) {
        setMembershipStatus({ type: 'basic' });
        setLoading(false);
        return;
      }

      const cacheKey = `membershipType:${currentUser.uid}`;
      const cachedType = (typeof window !== 'undefined' ? (localStorage.getItem(cacheKey) as 'basic' | 'booster' | null) : null);

      // 캐시가 있으면 즉시 UI 반영 (버튼 빠른 활성/비활성)
      if (cachedType) {
        setMembershipStatus({ type: cachedType });
        setLoading(false);
      } else {
        // 캐시가 없으면 우선 basic으로 가정하여 UI 지연을 최소화
        setMembershipStatus({ type: 'basic' });
        setLoading(false);
      }

      try {
        // 백그라운드에서 토큰 확보 후 서버 검증
        const { auth } = await import('@/lib/firebase');
        const token = await auth.currentUser?.getIdToken?.();
        if (!token) return;
        const response = await fetch(`/api/membership/type/${currentUser.uid}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          const latestType = data.data.membershipType as 'basic' | 'booster';
          setMembershipStatus({
            type: latestType,
            subscriptionInfo: data.data.subscriptionInfo
          });
          // 최신 결과 캐시 저장
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem(cacheKey, latestType);
            }
          } catch {}
        }
      } catch (error) {
        console.error('멤버십 상태 확인 실패:', error);
      }
    };

    checkMembershipStatus();
  }, [currentUser?.uid]);

  const handleSubscribeClick = () => {
    if (!currentUser) {
      setShowLoginModal(true);
    } else {
      navigate("/subscription");
    }
  };

  const handleBasicPlanClick = () => {
    if (!currentUser) {
      setShowLoginModal(true);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto py-16 px-4">
        <h1 className="text-3xl md:text-4xl font-extrabold text-center mb-6 text-gray-800">
          <span className="block md:inline mb-2 md:mb-0">상위노출 경쟁력,</span>
          <span className="block md:inline mb-2 md:mb-0">
            <img src="/logo.png" alt="스토어부스터" className="mobile-logo-membership-top mx-auto md:mx-0 inline-block align-top" style={{ height: '1.5em', margin: 0, verticalAlign: 'top', marginTop: '-0.4em' }} />의
          </span>
          <span className="block md:inline"> 독자적 기능으로 강화하세요</span>
        </h1>
        <p className="text-lg text-center text-gray-600 mb-12">
          키워드 경쟁률 분석, 네이버 SEO 맞춤 상품 최적화는 오직 스토어 부스터만 제공하고 있습니다.  
        </p>



        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* BASIC */}
          <Card className="border-blue-300 shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col h-full">
            <CardHeader className="bg-blue-50 border-b border-blue-100 py-6">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-2xl font-bold text-blue-500">베이직</CardTitle>
                <span className="text-2xl md:text-3xl font-extrabold text-blue-500 whitespace-nowrap">평생 무료</span>
              </div>
              <CardDescription className="text-gray-500 mt-1">
                초보 셀러분들을 위한 무료 혜택
              </CardDescription>
            </CardHeader>
            <CardContent className="py-6 flex-1 flex flex-col">
              <ul className="space-y-3 mb-8 flex-1">
                {/* 키워드 경쟁률 분석 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>
                    키워드 경쟁률 분석
                    <span className="text-gray-500 ml-1 font-bold">5회/일</span>
                    {/* <span className="ml-1 text-blue-600 font-semibold">→ 10회/일<span className="text-gray-500 text-sm font-normal">(한시적 제공)</span></span> */}
                  </span>
                </li>

                {/* 상품 최적화 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    상품 최적화
                    <span className="text-gray-500 ml-1 font-bold">3회/일</span>
                    {/* <span className="ml-1 text-blue-600 font-semibold">→ 10회/일<span className="text-gray-500 text-sm font-normal">(한시적 제공)</span></span> */}
                    <ul className="list-disc ml-6 mt-2 space-y-1 text-sm text-gray-600">
                      <li>
                        완벽한 상품 최적화
                        <span className="block text-xs text-gray-500 ml-1">동의어·조합형 검사 등 네이버 검색 로직까지 체크!</span>
                      </li>
                      <li>빠른 상품 최적화</li>
                    </ul>
                  </div>
                </li>
    {/* 최근 내역 저장 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>
                    최근 내역 저장
                    <span className="text-gray-500 ml-1 font-bold"> 3개</span>
                    {/* <span className="ml-1 text-blue-600 font-semibold">→ 10개<span className="text-gray-500 text-sm font-normal">(한시적 제공)</span></span> */}
                  </span>
                </li>

                {/* 확장프로그램 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>
                    확장프로그램
                    <span className="text-gray-500 ml-1 font-bold">20회/월</span>
                    {/* <span className="ml-1 text-blue-600 font-semibold">→ 무제한<span className="text-gray-500 text-sm font-normal">(한시적 제공)</span></span> */}
                  </span>
                </li>

                {/* 여백 추가 */}
                <li className="h-5"></li>
            
                {/* 월 총합 강조 */}
                <li className="flex items-center space-x-2 text-base md:text-lg text-blue-600 font-bold">
                  <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
                  <span>총 월 150회 키워드 경쟁률 분석 · 90회 상품 최적화!</span>
                </li>
              </ul>
              {membershipStatus?.type === 'booster' ? (
                <div className="w-full py-2 px-4 text-center text-gray-400 font-semibold border border-gray-200 rounded-md bg-gray-50 mt-auto cursor-not-allowed select-none">
                  기본 플랜
                </div>
              ) : currentUser ? (
                <div className="w-full py-2 px-4 text-center text-blue-600 font-semibold border border-blue-300 rounded-md bg-blue-50 mt-auto">
                  현재 이용 중
                </div>
              ) : (
                <Button
                  onClick={handleBasicPlanClick}
                  className="w-full py-2 px-4 text-center text-blue-600 font-semibold border border-blue-300 rounded-md bg-blue-50 hover:bg-blue-100 mt-auto"
                  variant="outline"
                >
                  평생 무료로 이용하기
                </Button>
              )}
            </CardContent>
          </Card>

          {/* BOOSTER */}
          <Card className="border-blue-500 shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col h-full">
            <CardHeader className="bg-blue-50 border-b border-blue-100 py-6">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-2xl font-bold text-blue-600">부스터</CardTitle>
                <span className="text-2xl md:text-3xl font-extrabold text-blue-600 whitespace-nowrap">월 9,900원</span>
              </div>
              <CardDescription className="text-gray-500 mt-1">
              하루 300원으로 상위 노출 광고비를 줄이세요!
              </CardDescription>
            </CardHeader>
            <CardContent className="py-6 flex-1 flex flex-col">
              <ul className="space-y-3 mb-8 flex-1">
                {/* 키워드 경쟁률 분석 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>키워드 경쟁률 분석 <span className="text-blue-600 font-semibold">30회/일</span></span>
                </li>

                {/* 상품 최적화 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    상품 최적화 <span className="text-blue-600 font-semibold">20회/일</span>
                    <ul className="list-disc ml-6 mt-1 space-y-1 text-sm">
                      <li>
                        완벽한 상품 최적화
                        <span className="block text-xs text-gray-500 ml-1">동의어·조합형 검사 등 네이버 검색 로직까지 체크!</span>
                      </li>
                      <li>빠른 상품 최적화</li>
                    </ul>
                  </div>
                </li>
                 
                 {/* 최근 내역 저장 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>최근 내역 저장 <span className="text-blue-600 font-semibold">30개</span></span>
                </li>

                {/* 확장프로그램 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>확장프로그램 <span className="text-blue-600 font-semibold">무제한</span></span>
                </li>
                
 {/* 신규 기능 */}
 {/* <li className="flex items-center space-x-2 text-base text-blue-600 font-bold">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>+ 신규 기능</span>
                </li> */}
              
              <li className="h-5"></li>
                {/* 월 총합 강조 */}
                <li className="flex items-center space-x-2 text-base md:text-lg text-blue-600 font-bold">
                  <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
                  <span>총 월 900회 키워드 경쟁률 분석 · 600회 상품 최적화!</span>
                </li>
               
              </ul>
              <Button
                onClick={handleSubscribeClick}
                className="w-full py-2 px-4 text-center text-white font-semibold border border-blue-600 rounded-md bg-blue-600 hover:bg-blue-700 mt-auto"
                disabled={loading || membershipStatus?.type === 'booster'}
              >
                {membershipStatus?.type === 'booster' ? '현재 이용 중' : '구독하기'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-center mt-12 text-lg md:text-xl font-semibold text-gray-800">
          <span className="block md:inline">
            <img src="/logo.png" alt="스토어부스터" className="mobile-logo-membership-bottom" style={{ height: '1.5em', margin: 0, display: 'inline-block', verticalAlign: 'top', marginTop: '-0.1em' }} />는 스마트스토어 셀러님들이
          </span>
          <span className="block md:inline">더 편하게, 더 많이 벌 수 있기를 </span>
          <span className="block md:inline text-blue-600">진심으로 바라는 마음에서 </span>
          <span className="block md:inline text-blue-600">시작되었습니다.</span>
        </p>

        {/* 유의사항 */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">유의사항</h3>
          <ul className="space-y-1 text-xs text-gray-600">
            <li className="flex items-start space-x-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>구독 구매 후 바로 사용하실 수 있습니다</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>30일 주기로 자동 결제됩니다</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>환불은 7일 내 미사용자일 경우에만 가능하며, 전액환불 됩니다. 환불 시 즉시 제공 혜택이 중단됩니다. </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>구매 후 7일 이후, 혹은 1번이라도 사용했을 경우 환불은 불가합니다.</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>해지는 내 프로필에서 언제든 가능합니다. 해지 시 만료일까지 사용가능하며 다음 결제일에 자동 결제가 이루어지지 않습니다</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>이 외의 사항은 이용약관을 따릅니다.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* 로그인 모달 */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="max-w-md p-0 border-none bg-transparent shadow-none">
          <LoginPage isModal={true} onLoginSuccess={() => {
            setShowLoginModal(false);
            navigate("/subscription");
          }} />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
} 