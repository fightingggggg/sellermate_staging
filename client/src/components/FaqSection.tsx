import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger 
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "정말 상위 노출에 효과가 있나요?",
    answer: "네. 스토어 부스터는 네이버 공식 문서와 200명 이상의 셀러 경험을 바탕으로, 키워드 최적화와 상위 노출 가능성을 높이기 위해 개발된 서비스입니다. 실제로 초기 사용자 대상 설문에서 55%가 효과를 체감했다고 응답했습니다. 다만 네이버의 노출 기준에는 인기도, 적합도, 신뢰도가 포함되며, 본 서비스는 적합도와 신뢰도 개선에 중점을 둡니다. 인기도나 경쟁 상황 등 외부 요인에 따라 노출 효과는 달라질 수 있으며, 이를 보장하지는 않습니다."
  },
  {
    question: "확장 프로그램을 꼭 설치해야 하나요?",
    answer: "네, 네이버 쇼핑 데이터를 가져오기 위해서 필수로 확장 프로그램을 설치해야 합니다."
  },
  {
    question: "네이버 정책에 위반되지 않나요?",
    answer: "아니요, 본 서비스는 네이버 스마트스토어 정책을 준수합니다. 검색 알고리즘을 해킹하거나 조작하지 않고, 네이버 SEO 가이드에 따른 최적화만을 지원합니다."
  },
  {
    question: "개인정보는 어떻게 보호되나요?",
    answer: "수집된 개인정보는 Google의 보안 서버에 암호화되어 저장됩니다. 최소한의 정보만 사용하며, 모든 정보는 사용자 동의를 바탕으로 안전하게 처리됩니다."
  },
  {
    question: "기술 지원은 어떻게 받을 수 있나요?",
    answer: "official.sellermate@gmail.com으로 문의하시거나, 확장 프로그램 내 '문의 및 피드백 보내기' 메뉴를 통해 문의를 보내실 수 있습니다."
  },
  {
    question: "PC에서만 사용 가능한가요?",
    answer: "네, 키워드 경쟁률 분석, 상품명 최적화는 확장 프로그램 이용이 필요하기 때문에 PC에서만 사용 하실 수 있습니다."
  }
];

const FaqSection = () => {
  return (
    <section id="faq" className="py-24 bg-white">
      <div className="w-full px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">자주 묻는 질문</h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            셀러메이트에 대한 자주 묻는 질문들을 모았습니다.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="bg-[#F8F9FA] rounded-xl overflow-hidden mb-4 border-none">
                <AccordionTrigger className="px-5 py-4 font-bold text-lg hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5 text-gray-600">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FaqSection;
