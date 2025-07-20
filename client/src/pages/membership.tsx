import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, Lock } from "lucide-react";
import { useLocation } from "wouter";

export default function MembershipPage() {
  const { currentUser } = useAuth();
  const [, navigate] = useLocation();

  const basicFeatures = [
    "키워드 경쟁률 분석 10회/일 – (초기 혜택! 기본 5회)",
    "상품 최적화 10회/일 – (초기 혜택! 기본 5회)",
    "확장프로그램 20회/월",
    "최근 내역 10개 저장",
    "총 월 300회 키워드 분석, 300회 상품 최적화!",
  ];

  const boosterFeatures = [
    "키워드 경쟁률 분석 50회/일",
    "상품 최적화 30회/일",
    "최근 내역 50개 저장",
    "확장프로그램 무제한",
    "총 월 1,500회 키워드 분석, 900회 상품 최적화!",
  ];

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
                    <span className="line-through text-gray-400 ml-1">3회/일</span>
                    <span className="ml-1 text-blue-600 font-semibold">→ 10회/일<span className="text-gray-500 text-sm font-normal">(한시적 제공)</span></span>
                  </span>
                </li>

                {/* 상품 최적화 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    상품 최적화
                    <span className="line-through text-gray-400 ml-1">3회/일</span>
                    <span className="ml-1 text-blue-600 font-semibold">→ 10회/일<span className="text-gray-500 text-sm font-normal">(한시적 제공)</span></span>
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
                    <span className="line-through text-gray-400 ml-1">3개</span>
                    <span className="ml-1 text-blue-600 font-semibold">→ 10개<span className="text-gray-500 text-sm font-normal">(한시적 제공)</span></span>
                  </span>
                </li>

                {/* 확장프로그램 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>
                    확장프로그램
                    <span className="line-through text-gray-400 ml-1"> 20회/월</span>
                    <span className="ml-1 text-blue-600 font-semibold">→ 무제한<span className="text-gray-500 text-sm font-normal">(한시적 제공)</span></span>
                  </span>
                </li>

                {/* 여백 추가 */}
                <li className="h-5"></li>
            
                {/* 월 총합 강조 */}
                <li className="flex items-center space-x-2 text-base md:text-lg text-blue-600 font-bold">
                  <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
                  <span>총 월 300회 키워드 경쟁률 분석 · 300회 상품 최적화!</span>
                </li>
              </ul>
              {currentUser ? (
                <div className="w-full py-2 px-4 text-center text-blue-600 font-semibold border border-blue-300 rounded-md bg-blue-50 mt-auto">
                  현재 이용 중
                </div>
              ) : (
                <div className="w-full py-2 px-4 text-center text-blue-600 font-semibold border border-blue-300 rounded-md bg-blue-50 mt-auto">
                  평생 무료로 이용하기
                </div>
              )}
            </CardContent>
          </Card>

          {/* BOOSTER */}
          <Card className="border-blue-500 shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col h-full">
            <CardHeader className="bg-blue-50 border-b border-blue-100 py-6">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-2xl font-bold text-blue-600">부스터</CardTitle>
                <span className="text-2xl md:text-3xl font-extrabold text-blue-600 whitespace-nowrap">월 14,900원</span>
              </div>
              <CardDescription className="text-gray-500 mt-1">
              합리적인 가격, 믿을 수 없는 사용 횟수!
              </CardDescription>
            </CardHeader>
            <CardContent className="py-6 flex-1 flex flex-col">
              <ul className="space-y-3 mb-8 flex-1">
                {/* 키워드 경쟁률 분석 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>키워드 경쟁률 분석 <span className="text-blue-600 font-semibold">50회/일</span></span>
                </li>

                {/* 상품 최적화 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    상품 최적화 <span className="text-blue-600 font-semibold">30회/일</span>
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
                  <span>최근 내역 저장 <span className="text-blue-600 font-semibold">50개</span></span>
                </li>

                {/* 확장프로그램 */}
                <li className="flex items-start space-x-2 text-base text-gray-700">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>확장프로그램 <span className="text-blue-600 font-semibold">무제한</span></span>
                </li>
                
 {/* 신규 기능 */}
 <li className="flex items-center space-x-2 text-base text-blue-600 font-bold">
                  <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span>+ 신규 기능</span>
                </li>
              
                {/* 월 총합 강조 */}
                <li className="flex items-center space-x-2 text-base md:text-lg text-blue-600 font-bold">
                  <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
                  <span>총 월 1,500회 키워드 경쟁률 분석 · 900회 상품 최적화!</span>
                </li>
               
              </ul>
              <div className="w-full py-2 px-4 text-center text-gray-600 font-semibold border border-gray-300 rounded-md bg-gray-50 mt-auto">
                준비 중! 곧 만나요 🚀
              </div>
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
      </div>
    </DashboardLayout>
  );
} 