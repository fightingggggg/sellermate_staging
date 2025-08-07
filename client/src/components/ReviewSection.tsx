import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ReviewSection() {
  const reviews = [
    {
      content: "스마트스토어를 이제 막 시작하거나,\n아직 파워를 못달았거나 파워 3개월 이상 유지 못한 사람들.\n키워드 어떻게 찾지? 잘 모르는 사람들..\n 상품 제목 어떻게 지어야 할지 잘 모르는 사람들..\n 이거 꼭 써.. 아** 유료, m** 다 쓰고 있는데 이게 최고야..\n 키워드 분석뿐 아니라 상품 제목 지을때 아주 유용해\n 6년째 빅파워 달고 있는 나도 요즘 이거 때문에 너무 편하다..!!"
    },
    {
      content: "안녕하세요! 돈 내고 더 사용하고 싶습니다. 언제 정액제 나오나요?"
    },
    {
      content: "나에게 정말 딱 필요한거예요!!"
    },
    {
      content: "이거 써보니 좋더라구요ㅎ굳이 아*** 이런거 안써도 되서 좋더라구요. 감사합니다"
    },
    {
      content: "저 진짜 키워드 때문에 머리 아팠는데ㅠㅠ감사합니다"
    },
    {
      content: "가장 어려운 부분을 찝어서 해결해주는 느낌!"
    }
  ];

  const getRandomColor = (index: number) => {
    const colors = [
      'bg-blue-200', 'bg-green-200', 'bg-purple-200',
      'bg-pink-200', 'bg-yellow-200', 'bg-indigo-200',
      'bg-red-200', 'bg-orange-200', 'bg-teal-200'
    ];
    return colors[index % colors.length];
  };

  const getMaskedId = (index: number) => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const randomLetter = () => letters[Math.floor(Math.random() * letters.length)];
    return `${randomLetter()}${randomLetter()}**${index}**`;
  };

  const getRandomLetter = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return letters[Math.floor(Math.random() * letters.length)];
  };

  const [currentIndex, setCurrentIndex] = useState(0);
  const reviewsPerPage = 3;
  const totalPages = Math.ceil(reviews.length / reviewsPerPage);
  const [inView, setInView] = useState(false);  // Scroll 상태

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + totalPages) % totalPages);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % totalPages);
  };

  const pagedReviews = reviews.slice(
    currentIndex * reviewsPerPage,
    currentIndex * reviewsPerPage + reviewsPerPage
  );

  // Intersection Observer로 섹션이 뷰포트에 들어왔는지 확인
  const sectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setInView(entry.isIntersecting); // 섹션이 보이기 시작하면 inView 상태 변경
      },
      { threshold: 0.2 } // 섹션이 20% 이상 보이면 애니메이션 트리거
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

  return (
    <section
      ref={sectionRef}  // Intersection Observer가 감지할 섹션
      className="py-16 bg-gradient-to-b from-white to-blue-30 overflow-hidden relative"
    >
      {/* 좌우 화살표 버튼 - section 기준 가장자리 */}
      <button
        onClick={handlePrev}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 text-gray-600 hover:text-black"
      >
        <ChevronLeft size={32} />
      </button>
      <button
        onClick={handleNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 text-gray-600 hover:text-black"
      >
        <ChevronRight size={32} />
      </button>

      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">사용자 반응</h2>
          <p className="text-lg text-slate-600">
            SNS, 피드백으로 받은 반응입니다. 아이디는 익명 처리했습니다.
          </p>
        </div>

        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <AnimatePresence>
              {pagedReviews.map((review, index) => (
                <motion.div
                  key={index}
                  className="p-6 bg-white rounded-xl shadow-sm border border-slate-200"
                  initial={{ opacity: 0, y: 50 }}  // 처음에 아래에서 나타남
                  animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 50 }}  // 스크롤 시 애니메이션
                  exit={{ opacity: 0, y: -50 }}
                  transition={{ duration: 0.5, type: "tween" }}
                >
                  <div className="flex items-center mb-4">
                    <div
                      className={`w-8 h-8 rounded-full ${getRandomColor(index)} flex items-center justify-center`}
                    >
                      <span className="text-sm font-semibold">{getRandomLetter()}</span>
                    </div>
                    <span className="ml-2 text-sm text-gray-600">
                      {getMaskedId(index)}
                    </span>
                  </div>
                  <p className="text-slate-700 whitespace-pre-line">{review.content}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
