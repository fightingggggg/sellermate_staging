import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, BarChart, Search, ShoppingBag, Lock, Wand2, FileText, CheckSquare, LineChart, Star, Download } from "lucide-react";
import { motion } from "framer-motion";
import ExampleSection from "../components/ExampleSection";
import TextFeaturesSection from "../components/TextFeaturesSection";
import CtaSection from "../components/CtaSection";
import FooterSection from "../components/FooterSection";
import FaqSection from "../components/FaqSection";
import DashboardLayout from "@/components/DashboardLayout";
import ReviewSection from "../components/ReviewSection";


import { trackEvent, trackTimeSpent } from "@/lib/analytics";
import { useEffect, useState, lazy, Suspense } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PcOnlyModal } from "@/components/ui/pc-only-modal";
import { Dialog, DialogContent } from "@/components/ui/dialog";
// import LoginPage from "@/components/LoginPage";
const LoginPage = lazy(() => import("@/components/LoginPage"));
import { Link } from "wouter";

export default function Home() {
  const { currentUser, loading } = useAuth();
  const [, navigate] = useLocation();
  const [keyword, setKeyword] = useState("");

  // 모바일 체크 및 PC 전용 모달
  const isMobile = useIsMobile();
  const [showPcOnlyModal, setShowPcOnlyModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  


  const handleAnalyzeClick = () => {
    // 모바일 체크 - PC 전용 기능
    if (isMobile) {
      if (!currentUser) {
        setShowLoginModal(true);
        return;
      } else {
        setShowPcOnlyModal(true);
        return;
      }
    }

    if (!currentUser) {
      // 비로그인 사용자는 로그인 모달 표시
      trackEvent('Home', 'click', 'keywordSearch', { 
        user_status: 'not_logged_in',
        keyword: keyword.trim() || 'empty'
      });
      setShowLoginModal(true);
      return;
    }
    
    if (!keyword.trim()) {
      // 키워드가 비어있으면 경고 메시지 표시
      trackEvent('Home', 'click', 'keywordSearch', { 
        user_status: 'logged_in',
        keyword: 'empty',
        error: 'empty_keyword'
      });
      alert("키워드를 입력해주세요.");
      return;
    }
    
    // 로그인된 사용자이고 키워드가 있으면 키워드 경쟁률 분석 페이지로 이동
    trackEvent('Home', 'click', 'keywordSearch', { 
      user_status: 'logged_in',
      keyword: keyword.trim(),
      success: true
    });
    navigate(`/keyword-competition-analysis?keyword=${encodeURIComponent(keyword.trim())}`);
  };

  // useEffect(() => {
  //   const cleanupHero = trackTimeSpent('Hero Section');
  //   const cleanupExample = trackTimeSpent('Example Section');
  //   const cleanupTextfeature = trackTimeSpent('Textfeature Section');
  //   const cleanupReview = trackTimeSpent('Review Section');
  //   const cleanupFeatures = trackTimeSpent('Features Section');
  //   const cleanupFaq = trackTimeSpent('FAQ Section');

  //   return () => {
  //     cleanupHero();
  //     cleanupExample();
  //     cleanupTextfeature();
  //     cleanupFeatures();
  //     cleanupReview();
  //     cleanupFaq();
  //   };
  // }, []);

  // useEffect(() => {
  //   const cleanupHome = trackTimeSpent('Home');
  //   return () => {
  //     cleanupHome();
  //   };
  // }, []);



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen flex flex-col relative z-0">
      <section id="hero" className="pt-16 pb-20 bg-gradient-to-br from-sky-50 to-blue-50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="max-w-4xl mb-8">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <div className="mb-4 md:mb-6"><span className="text-[#1a73e8]">광고 없이 상위 노출</span>하는</div>
                <div className="mb-4 md:mb-6">스마트스토어 <span className="text-[#1a73e8]">상품명 키워드</span><span className="block md:inline"> 태그 조합 최적화</span></div>
                <div className="mb-3 md:mb-4">
                 
                  <span className="block md:inline">
                    <img src="/logo.png" alt="스토어부스터" className="mobile-logo-home inline-block align-top h-[1.5em] mt-2 md:mt-[-0.2em]" />
                  </span>
                </div>
              </h2>
              {/* <p className="text-xl mb-8 text-gray-600">
                스마트스토어 상위 노출을 위한 키워드,
                최적의 상품명, 카테고리, 태그 제안
              </p> */}
            </div>
            
            {/* 키워드 입력창 */}
            <div className="w-full max-w-5xl mx-auto">
              <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
                <div className="mb-6 text-center">
                  <h3 className="text-base md:text-xl text-gray-800 mb-2">상위 노출 경쟁률을 분석하고, 최적화된 상품명과 태그를 제안해요</h3>
                  
                  {/* <p className="text-gray-600">상위 노출 경쟁률을 분석하고, 최적화된 상품명, 태그를 제공합니다.</p> */}
                  
                </div>
                <div className="flex flex-col gap-2 items-stretch md:flex-row">
                  <input
                    type="text"
                    placeholder="상품의 메인 키워드를 입력해보세요"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAnalyzeClick();
                      }
                    }}
                    className="flex-1 px-4 py-3 text-sm md:px-6 md:py-4 md:text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-[#1a73e8] transition-all duration-200 text-left md:text-center placeholder:text-left md:placeholder:text-center"
                  />
                  <Button 
                    size="sm"
                    className="w-full md:w-auto bg-[#1a73e8] hover:bg-[#1a73e8]/90 text-white px-4 py-3 md:px-6 md:py-4 rounded-lg font-semibold transition-all duration-200 hover:scale-105 text-base h-auto"
                    onClick={handleAnalyzeClick}
                  >
                    <Search className="w-4 h-4 mr-0.5" />
                    <span className="pr-1">로그인하고 무료로 분석하기</span>
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-center mt-8">
              <div className="flex flex-col md:flex-row items-center">
                <div className="hidden md:flex -space-x-2 mb-4 md:mb-0">
                  <div className="w-10 h-10 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center">
                    <span className="text-xs font-bold">KH</span>
                  </div>
                  <div className="w-10 h-10 rounded-full border-2 border-white bg-gray-300 flex items-center justify-center">
                    <span className="text-xs font-bold">SJ</span>
                  </div>
                  <div className="w-10 h-10 rounded-full border-2 border-white bg-gray-400 flex items-center justify-center">
                    <span className="text-xs font-bold">YM</span>
                  </div>
                </div>
                <div className="md:ml-4 text-center md:text-left">
                  <p className="text-base md:text-lg font-medium text-gray-600">
                    <span className="block md:inline">실제 이용자 중 <span className="font-bold text-[#1a73e8]">55%</span>가 무료 이용으로 </span>
                    <span className="block md:inline"><span className="text-[#1a73e8]">상품명만 바꿔서</span> <span className="font-bold text-[#1a73e8]">순위 상승을 경험</span>!</span>
                  </p>
                </div>
              </div>
              {/* <div className="mt-2">
                <p className="text-sm md:text-base font-medium text-gray-600 text-center">네이버 검색 알고리즘을 준수한 상품명 최적화는 순위 상승과 광고비 절감을 동시에 보장합니다.</p>
              </div> */}
            </div>
          </div>
        </div>
      </section>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <ExampleSection />
      </motion.div>

{/* Feature Section 1 */}
<motion.section
  className="py-16 px-4 bg-gradient-to-r from-blue-50 to-indigo-50"
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.6 }}
>
  <div className="max-w-7xl mx-auto">
    <div className="flex flex-col md:flex-row items-center gap-12">
      {/* Text Content */}
      <motion.div 
        className="space-y-6 max-w-2xl flex-1 text-left md:pr-8"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        viewport={{ once: true }}
      >
        <div className="space-y-4">
          <div className="inline-block px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-xs md:text-sm font-semibold">
            키워드 상위노출 경쟁률 분석
          </div>
          <h3 className="text-xl md:text-4xl font-bold text-gray-900 leading-relaxed">
            <span className="block md:inline">내가 쓰려는 키워드,</span>
            <span className="block md:inline">상위노출이 가능할까?</span>
          </h3>
          <p className="text-sm md:text-lg text-gray-600 leading-relaxed">
            키워드의 월간 검색량과 상품의 리뷰 수, 묶음상품 수, 순위를 분석해<br/>
            상위노출 가능성을 진단합니다. 
          </p>
          <p className="text-sm md:text-lg text-gray-600 leading-relaxed">
            키워드 선택부터 전략적으로!<br/>
            상위노출이 유망한 키워드를 찾아보세요.
          </p>
          <div className="mt-6">
            <Link href="/keyword-competition-analysis" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow text-sm md:text-base">
              키워드 경쟁률 분석 바로가기 <ArrowRight className="inline-block ml-2 w-4 h-4" />
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Screenshot */}
      <motion.div 
        className="relative flex-1 max-w-xl md:mt-0 mt-12"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        viewport={{ once: true }}
      >
        <img
          src="/image1.jpg"
          alt="키워드 분석 화면"
          className="w-full rounded-2xl shadow-2xl"
        />
      </motion.div>
    </div>
  </div>
</motion.section>

{/* 구분선 */}
<div className="w-full h-1 bg-gradient-to-r from-transparent via-white to-transparent mx-auto max-w-4xl"></div>

{/* Feature Section 2 */}
<motion.section
  className="py-16 px-4 bg-gradient-to-r from-blue-50 to-indigo-50"
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.6 }}
>
  <div className="max-w-7xl mx-auto">
    <div className="flex flex-col md:flex-row items-center gap-12">
      {/* Text Content */}
      <motion.div 
        className="space-y-6 max-w-2xl flex-1 text-left md:pr-8"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        viewport={{ once: true }}
      >
        <div className="space-y-4">
          <div className="inline-block px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-xs md:text-sm font-semibold">
            빠른 상품명 최적화
          </div>
          <h3 className="text-xl md:text-4xl font-bold text-gray-900 leading-relaxed">
            광고 없이도 노출 순위를 올리는<br />
            <div className="mt-1 md:mt-4"></div>
            원클릭 키워드 · 상품명 · 태그 추천
          </h3>
          <p className="text-sm md:text-lg text-gray-600 leading-relaxed">
            내 상품이 노출된 페이지를 분석해<br/>
            맞춤 키워드와 카테고리, 태그를 추천하고<br/>
            네이버 SEO 가이드에 최적화된 AI 상품명을 생성합니다.
          </p>
          <p className="text-sm md:text-lg text-gray-600 leading-relaxed">
            클릭 한 번으로 빠르게 상품명을 개선해<br/>
            노출 순위를 높여보세요
          </p>
          <div className="mt-6">
            <Link href="/product-optimizer/quick" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow text-sm md:text-base">
              빠른 상품명 최적화 바로가기 <ArrowRight className="inline-block ml-2 w-4 h-4" />
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Screenshot */}
      <motion.div 
        className="relative flex-1 max-w-xl md:mt-0 mt-12"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        viewport={{ once: true }}
      >
        <img
          src="/image2.jpg"
          alt="상품 등록 최적화 화면"
          className="w-full rounded-2xl shadow-2xl"
        />
      </motion.div>
    </div>
  </div>
</motion.section>

{/* 구분선 */}
<div className="w-full h-1 bg-gradient-to-r from-transparent via-white to-transparent mx-auto max-w-4xl"></div>

{/* Feature Section 3 - 완벽한 상품 최적화 */}
<motion.section
  className="py-16 px-4 bg-gradient-to-r from-blue-50 to-indigo-50"
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.6 }}
>
  <div className="max-w-7xl mx-auto">
    <div className="flex flex-col md:flex-row items-center gap-12">
      {/* Text Content */}
      <motion.div 
        className="space-y-6 max-w-2xl flex-1 text-left md:pr-8"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        viewport={{ once: true }}
      >
        <div className="space-y-4">
          <div className="inline-block px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-xs md:text-sm font-semibold">
            완벽한 상품명 최적화
          </div>
          <h3 className="text-xl md:text-4xl font-bold text-gray-900 leading-relaxed">
            네이버 쇼핑 검색 로직까지 반영한<br />
            <div className="mt-1 md:mt-4"></div>
            더 정교한 키워드 · 상품명 · 태그 최적화
          </h3>
          <p className="text-sm md:text-lg text-gray-600 leading-relaxed">
          빠른 최적화 기능에<br/>
  동의어, 조합형·일체형 키워드 검사까지 더해<br/>
  네이버 검색 로직을 고려한 맞춤 키워드 상품명을 제안합니다.
          </p>
          <p className="text-sm md:text-lg text-gray-600 leading-relaxed">
          더 정교한 최적화로<br/>
          상위노출 가능성을 한층 높여보세요.
          </p>
          <div className="mt-6">
            <Link href="/product-optimizer/complete" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow text-sm md:text-base">
              완벽한 상품명 최적화 바로가기 <ArrowRight className="inline-block ml-2 w-4 h-4" />
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Screenshot */}
      <motion.div 
        className="relative flex-1 max-w-xl md:mt-0 mt-12"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        viewport={{ once: true }}
      >
        <img
          src="/image3.jpg"
          alt="완벽한 상품 최적화 화면"
          className="w-full rounded-2xl shadow-2xl"
        />
      </motion.div>
    </div>
  </div>
</motion.section>


{/* 배너 섹션 */}
<motion.section
  id="banner"
  className="py-12 px-4 bg-gradient-to-r from-blue-600 to-purple-600 relative overflow-hidden z-0"
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.6 }}
>
  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600"></div>
  <div className="absolute inset-0" style={{
    backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 2px, transparent 2px, transparent 8px)`,
    backgroundSize: 'auto'
  }}></div>
  <div className="max-w-4xl md:max-w-none mx-auto text-center relative z-10 px-4 md:px-16">
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      viewport={{ once: true }}
    >
      <h2 className="text-2xl md:text-5xl font-bold text-white leading-relaxed">
        <span className="block md:inline">광고보다 노출 전략이 먼저입니다</span>
        <div className="hidden md:block md:my-8"></div>
        <span className="block mt-3 md:mt-0 md:inline text-xl md:text-4xl">광고에 의존하지 않아도 되는 </span>
        <span className="block md:inline text-xl md:text-4xl">노출 최적화로 순이익을 높이세요</span>
      </h2>
    </motion.div>
  </div>
</motion.section>

{/* 차별점 섹션 */}
<motion.section
  className="py-20 px-4 bg-gradient-to-br from-cyan-50 to-blue-100"
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.6 }}
>
  <div className="max-w-4xl mx-auto">
    <motion.div 
      className="text-center mb-16"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      viewport={{ once: true }}
    >
      <div className="inline-block px-4 py-2 bg-cyan-100 text-cyan-800 rounded-full text-sm md:text-base font-semibold mb-6">
        다른 키워드 분석과 뭐가 다를까요?
      </div>
      <h2 className="text-2xl md:text-4xl font-bold text-gray-900 leading-relaxed max-w-4xl mx-auto">
        <span className="block md:inline">스토어 부스터는 </span>
        <span className="block md:inline">키워드 분석 서비스가 아닙니다</span>
        <div className="hidden md:block md:my-6"></div>
        <span className="block mt-2 md:mt-0 md:inline">상위노출을 위한 실전형 최적화 전략</span>
        <span className="block md:inline">을 제공합니다</span>
      </h2>

    </motion.div>

    <div className="space-y-8">
      {/* 카드 1: 데이터를 넘어선 실전형 키워드 최적화 */}
      <motion.div
        className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-blue-200"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        viewport={{ once: true }}
      >
        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
          <div className="flex-1">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 text-left">
              데이터를 넘어선<br />
              실전형 키워드 최적화
            </h3>
          </div>
          <div className="flex-1">
            <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4 text-left">
              단순히 숫자 데이터만 보여주지 않습니다.
            </p>
            <ul className="space-y-2 text-base md:text-lg text-gray-600 mb-4 text-left">
              <li>• 어떤 키워드가 자연적인 상위노출에 유리한지</li>
              <li>• 어떤 상품명, 태그, 상품 주요 정보가 효과적인지</li>
            </ul>
            <p className="text-base md:text-lg text-gray-600 font-medium text-left">
              즉시 적용 가능한 전략을 바로 확인할 수 있습니다
            </p>
          </div>
        </div>
      </motion.div>

      {/* 카드 2: 실질적 효과 검증 */}
      <motion.div
        className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-blue-200"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        viewport={{ once: true }}
      >
        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
          <div className="flex-1">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 text-left">
              실질적 효과 검증
            </h3>
          </div>
          <div className="flex-1">
            <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4 text-left">
              스토어 부스터는 네이버 공식 SEO 가이드와 검색 알고리즘을 반영합니다.
            </p>
            <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4 text-left">
              이를 학습한 AI가 상품명, 카테고리, 태그, 주요 정보를 최적화합니다.
            </p>
            <p className="text-base md:text-lg text-gray-600 leading-relaxed text-left">
              동의어, 조합형, 일체형 키워드 까지 구분해 상품명의 효율을 극대화합니다.
            </p>
          </div>
        </div>
      </motion.div>

      {/* 카드 3: 광고에 의존하지 않는 성장 선순환 */}
      <motion.div
        className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-blue-200"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        viewport={{ once: true }}
      >
        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
          <div className="flex-1">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 text-left">
              광고에 의존하지 않는<br />
              성장 선순환
            </h3>
          </div>
          <div className="flex-1">
            <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4 text-left">
              광고를 끊으면 매출이 떨어지는 구조는 셀러의 이익을 낮춥니다.
            </p>
            <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4 text-left">
              스토어 부스터는 상품 등록 정보 최적화를 통해<br />
              <span className="font-medium">노출 증가 → 클릭 증가 → 판매 증가 → 매출 증가</span>의 선순환을 만듭니다.
            </p>
            <p className="text-base md:text-lg text-gray-600 leading-relaxed font-medium text-left">
              광고비는 줄이고, 매출과 이익은 높이는 건강한 스토어 운영을 실현하세요
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  </div>
</motion.section>

      

      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <ReviewSection />
      </motion.div>

     

      <motion.section
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
      <FaqSection />
      </motion.section>
      
      {/* <CtaSection /> */}
      <FooterSection />
      
      {/* PC 전용 모달 */}
      <PcOnlyModal 
        open={showPcOnlyModal} 
        onOpenChange={setShowPcOnlyModal} 
      />
      {/* 로그인 모달 */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="max-w-md p-0 border-none bg-transparent shadow-none">
          <Suspense fallback={null}>
            <LoginPage isModal={true} onLoginSuccess={() => {
              setShowLoginModal(false);
              if (isMobile) {
                setShowPcOnlyModal(true);
              }
            }} />
          </Suspense>
        </DialogContent>
      </Dialog>

      </div>
    </DashboardLayout>
  );
}


