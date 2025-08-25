import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Medal, Sprout } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ReviewSection() {
  const reviews = [
    {
      content: "스마트스토어를 이제 막 시작하거나,\n아직 파워를 못달았거나 파워 3개월 이상 유지 못한 사람들.\n키워드 어떻게 찾지? 잘 모르는 사람들..\n 상품 제목 어떻게 지어야 할지 잘 모르는 사람들..\n 이거 꼭 쓰세요.. 아** 유료, m** 다 쓰고 있는데 이게 최고에요..\n 키워드 분석뿐 아니라 상품 제목 지을때 아주 유용해요\n 6년째 빅파워 달고 있는 나도 요즘 이거 때문에 너무 편해요..!!"
    },
    {
      content: "진짜 상품명만으로 순위가 오르더라구요. \n묶음상품이 많을때는 완전 상위 노출까지는 어렵긴 해요. \n그래도 상품명만 바꿔도 확실히 순위가 올라요.\n 주요 상품 아닌 상품까지 광고 돌리기 부담스러워서 그냥 이것만 사용해서 상품명, 태그, 카테고리만 최적화 해줬는데 순위가 올라서 새로운 판매들이 많이 일어났어요."
    },
    {
      content: "안녕하세요! 돈 내고 더 사용하고 싶습니다. 언제 정액제 나오나요?"
    },
    {
      content: "이거 써보니 좋더라구요ㅎ굳이 아*** 이런거 안써도 되서 좋더라구요.\n이런걸 무료로 이용해도 될지 정말 감사합니다"
    },
    {
      content: "저 진짜 키워드 때문에 머리 아팠는데ㅠㅠ감사합니다"
    },
    {
      content: "가장 어려운 부분을 찝어서 해결해주는 느낌이였어요!"
    }
  ];

  const getUserGrade = (index: number) => {
    const grades = ['빅파워', '빅파워', '파워', '새싹', '새싹', '새싹'];
    return grades[index] || '새싹';
  };

  const getGradeIcon = (index: number) => {
    const grade = getUserGrade(index);
    switch (grade) {
      case '빅파워':
        return {
          icon: Medal,
          bgColor: 'bg-gray-200',
          iconColor: 'text-gray-600'
        };
      case '파워':
        return {
          icon: Medal,
          bgColor: 'bg-amber-100',
          iconColor: 'text-amber-600'
        };
      case '새싹':
        return {
          icon: Sprout,
          bgColor: 'bg-green-100',
          iconColor: 'text-green-600'
        };
      default:
        return {
          icon: Sprout,
          bgColor: 'bg-green-100',
          iconColor: 'text-green-600'
        };
    }
  };

  const [currentIndex, setCurrentIndex] = useState(0);
  const [inView, setInView] = useState(false);
  const [direction, setDirection] = useState(0);

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + reviews.length) % reviews.length);
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % reviews.length);
  };

  const goToSlide = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  // Intersection Observer로 섹션이 뷰포트에 들어왔는지 확인
  const sectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setInView(entry.isIntersecting);
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  // 자동 슬라이드 기능 (옵션)
  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1);
      setCurrentIndex((prev) => (prev + 1) % reviews.length);
    }, 9000); // 8초마다 자동 슬라이드

    return () => clearInterval(timer);
  }, [reviews.length]);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  return (
    <section
      ref={sectionRef}
      className="py-16 bg-gradient-to-b from-white to-blue-50 overflow-hidden relative"
    >
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <p className="text-lg text-slate-600 mb-2"><span className="font-bold">빅파워, 파워, 새싹</span> 등급 판매자가 말하는</p>
          <h2 className="text-3xl font-bold mb-4">
            <span className="block md:inline">실제 판매에 도움된</span>
            <span className="block md:inline"> 스토어 부스터</span>
          </h2>
        </div>

        {/* 캐러셀 컨테이너 */}
        <div className="relative">
          {/* 좌우 화살표 버튼 - 데스크톱에서만 표시 */}
          <button
            onClick={handlePrev}
            className="hidden md:block absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg transition-all duration-200 hover:scale-110"
          >
            <ChevronLeft size={24} className="text-gray-700" />
          </button>
          <button
            onClick={handleNext}
            className="hidden md:block absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg transition-all duration-200 hover:scale-110"
          >
            <ChevronRight size={24} className="text-gray-700" />
          </button>

          {/* 슬라이드 컨테이너 */}
          <div className="relative min-h-[28rem] md:min-h-96 overflow-hidden rounded-2xl">
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={1}
                onDragEnd={(e, { offset, velocity }) => {
                  const swipe = swipePower(offset.x, velocity.x);

                  if (swipe < -swipeConfidenceThreshold) {
                    handleNext();
                  } else if (swipe > swipeConfidenceThreshold) {
                    handlePrev();
                  }
                }}
                className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
              >
                <div className="h-full w-full flex items-center justify-center p-4 md:p-8">
                  <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 w-full max-w-2xl border border-slate-200 my-auto">
                    <div className="flex items-center mb-3 md:mb-4">
                      {(() => {
                        const gradeInfo = getGradeIcon(currentIndex);
                        const IconComponent = gradeInfo.icon;
                        return (
                          <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full ${gradeInfo.bgColor} flex items-center justify-center`}>
                            <IconComponent className={`w-5 h-5 md:w-6 md:h-6 ${gradeInfo.iconColor}`} />
                          </div>
                        );
                      })()}
                      <span className="ml-3 md:ml-4 text-base md:text-lg text-gray-600 font-medium">
                        {getUserGrade(currentIndex)}
                      </span>
                    </div>
                    <p className="text-slate-700 whitespace-pre-line text-base md:text-lg leading-relaxed overflow-y-auto max-h-80 md:max-h-96">
                      {reviews[currentIndex].content}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 인디케이터 */}
          <div className="flex justify-center mt-8 space-x-2">
            {reviews.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? "bg-blue-600 w-8"
                    : "bg-gray-300 hover:bg-gray-400"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
