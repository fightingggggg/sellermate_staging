
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import ScrollToLink from "@/components/ui/scroll-to-link";

const CtaSection = () => {
  return (
    <section className="py-20 bg-gradient-to-r from-[#1a73e8] to-[#115bbf] w-full">
      <div className="max-w-[2000px] mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">지금 바로 스마트스토어 노출을 늘려보세요</h2>
        <p className="text-xl text-white opacity-90 mb-8 max-w-3xl mx-auto">
          이미 800명 이상의 스마트스토어 셀러가 이 확장 프로그램으로 매출을 늘리고 있습니다.<br />
          지금 무료로 시작하세요.
        </p>
        <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
          <a href="https://chromewebstore.google.com/detail/%EC%8A%A4%EB%A7%88%ED%8A%B8%EC%8A%A4%ED%86%A0%EC%96%B4-%EC%83%81%EC%9C%84%EB%85%B8%EC%B6%9C-%EC%B5%9C%EC%A0%81%ED%99%94-%EB%8F%84%EA%B5%AC/plgdaggkagiakemkoclkpkbdiocllbbi?authuser=0&hl=ko" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="bg-white text-[#1a73e8] hover:bg-white/90 px-8 py-4 font-bold text-lg shadow-lg transform hover:scale-105 w-full sm:w-auto">
              <Download className="mr-2 h-5 w-5" /> 지금 바로 노출 늘리기
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
};

export default CtaSection;
