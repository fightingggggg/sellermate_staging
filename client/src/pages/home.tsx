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
import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PcOnlyModal } from "@/components/ui/pc-only-modal";
import ClientOnly from "@/components/ClientOnly";

export default function Home() {
  const { currentUser, loading } = useAuth();
  const [, navigate] = useLocation();
  const [keyword, setKeyword] = useState("");

  // 모바일 체크 및 PC 전용 모달
  const isMobile = useIsMobile();
  const [showPcOnlyModal, setShowPcOnlyModal] = useState(false);

  const handleAnalyzeClick = () => {
    // 모바일 체크 - PC 전용 기능
    if (isMobile) {
      setShowPcOnlyModal(true);
      return;
    }

    if (!currentUser) {
      // 비로그인 사용자는 로그인 페이지로 이동
      trackEvent('Home', 'click', 'keywordSearch', { 
        user_status: 'not_logged_in',
        keyword: keyword.trim() || 'empty'
      });
      navigate("/login");
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

  useEffect(() => {
    const cleanupHome = trackTimeSpent('Home');
  

    return () => {
      cleanupHome();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen flex flex-col">
      <section id="hero" className="pt-16 pb-20 bg-gradient-to-br from-sky-50 to-blue-50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="max-w-4xl mb-8">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <div className="mb-3 md:mb-4">네이버 스마트스토어</div>
                <div className="mb-3 md:mb-4"><span className="text-[#1a73e8]">상위노출 최적화</span><span className="text-black">를 위한</span></div>
                {/* 모바일: 줄바꿈, PC: 한 줄 */}
                <div className="mb-3 md:mb-4">
                                      <span className="block md:inline">완벽한 솔루션, </span>
                    <span className="block md:inline">
                      <img src="/logo.png" alt="스토어부스터" className="mobile-logo-home" style={{ height: '1.5em', margin: 0, display: 'inline-block', verticalAlign: 'top', marginTop: '-0.4em' }} />
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
                <div className="relative">
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
                    className="w-full px-6 py-4 text-base md:text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-[#1a73e8] transition-all duration-200 text-left md:text-center placeholder:text-left md:placeholder:text-center"
                  />
                  <Button 
                    size="sm"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-[#1a73e8] hover:bg-[#1a73e8]/90 text-white px-3 py-1 rounded-lg font-semibold transition-all duration-200 hover:scale-105 h-[56px] text-base"
                    onClick={handleAnalyzeClick}
                  >
                    <Search className="w-4 h-4 mr-0.5" />
                    <span className="pr-1">분석</span>
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-center mt-8">
              <div className="flex -space-x-2">
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
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">이미 <span className="font-bold text-[#1a73e8]">1천+</span>명의 셀러가 사용 중</p>
              </div>
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
            <a href="/keyword-competition-analysis" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow text-sm md:text-base">
              키워드 경쟁률 분석 바로가기 <ArrowRight className="inline-block ml-2 w-4 h-4" />
            </a>
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
            <a href="/product-optimizer/quick" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow text-sm md:text-base">
              빠른 상품명 최적화 바로가기 <ArrowRight className="inline-block ml-2 w-4 h-4" />
            </a>
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
            <a href="/product-optimizer/complete" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow text-sm md:text-base">
              완벽한 상품명 최적화 바로가기 <ArrowRight className="inline-block ml-2 w-4 h-4" />
            </a>
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
      <ClientOnly>
        <PcOnlyModal 
          open={showPcOnlyModal} 
          onOpenChange={setShowPcOnlyModal} 
        />
      </ClientOnly>
      </div>
    </DashboardLayout>
  );
}


