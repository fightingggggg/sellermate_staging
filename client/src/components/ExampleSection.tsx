
import { TrendingUp, ShoppingCart, Search, CheckCircle } from "lucide-react";

const steps = [
  {
    number: 1,
    title: "스토어 부스터 이용 후\n상위 노출 경험",
    description: "55%",
    image: "/increase.png",
    alt: "상위 노출 경험"
  },
  {
    number: 2,
    title: "스토어 부스터 이용 후\n매출 증가 경험",
    description: "45%",
    image: "/money.png",
    alt: "매출 증가 경험"
  },
  {
    number: 3,
    title: "스토어 부스터로\n분석한 상품",
    description: "5만 개",
    image: "/goods.png",
    alt: "분석한 상품"
  }
];

const ExampleSection = () => {
  return (
    <section className="py-12 bg-white">
      <div className="flex flex-col md:flex-row gap-12 justify-center max-w-6xl mx-auto px-4">
        {steps.map((step, index) => {
          return (
            <div
              key={index}
              className="flex-1 flex flex-col items-center text-center"
            >
              <div className="mb-4 text-lg md:text-xl font-medium whitespace-pre-line text-gray-700">
                {step.title}
              </div>
              <div className="text-3xl md:text-4xl font-extrabold text-black mb-2">
                {step.description}
              </div>
              <div className="mt-6 flex items-center justify-center">
                <div className="w-40 h-40 rounded-full bg-gray-50 flex items-center justify-center shadow-sm">
                  <img src={step.image} alt={step.alt} className="w-32 h-32 object-contain" loading="lazy" width={128} height={128} decoding="async" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-center mt-12 text-sm text-gray-500 mb-12">
        * 2025년 6월 기준, 전 버전인 스마트스토어 상위노출 최적화 도구의 초기 소수의 사용자 설문과 실제 이용 데이터를 기반으로 한 참고용 통계이며, 효과는 개인차가 있으며 보장되지 않습니다.
      </div>
    </section>
  );
};

export default ExampleSection;
