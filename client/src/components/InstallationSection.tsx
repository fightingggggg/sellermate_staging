import { Puzzle } from "lucide-react";
import { Button } from "./ui/button";

const installationSteps = [
  "Chrome 웹 브라우저를 실행합니다.",
  "Chrome 웹 스토어 링크를 클릭하거나 스토어에서 '셀러메이트'를 검색합니다.",
  "'Chrome에 추가' 버튼을 클릭합니다.",
  "확장 프로그램 권한을 확인하고 '추가' 버튼을 클릭합니다.",
  "설치가 완료되면 브라우저 상단에 퍼즐 아이콘을 클릭하면 확장 프로그램 아이콘이 표시됩니다."
];

const InstallationSection = () => {
  return (
    <section id="installation" className="py-24 bg-[#F8F9FA]">
      <div className="w-full px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">설치 방법</h2>
        </div>

        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md overflow-hidden">
          <div className="md:flex">
            <div className="md:flex-shrink-0 bg-[#1A73E8] flex items-center justify-center p-6">
              <img
                src="/Google_Chrome_icon.png"
                alt="Chrome 아이콘"
                className="w-24 h-24 object-contain"
              />
            </div>
            <div className="p-8">
              <h3 className="text-2xl font-bold mb-4">Chrome 웹 스토어에서 설치하기</h3>
              <ol className="list-decimal pl-5 mb-6 space-y-3">
                {installationSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              <a href="https://chromewebstore.google.com/detail/%EC%8A%A4%EB%A7%88%ED%8A%B8%EC%8A%A4%ED%86%A0%EC%96%B4-%EC%83%81%EC%9C%84%EB%85%B8%EC%B6%9C-%EC%B5%9C%EC%A0%81%ED%99%94-%EB%8F%84%EA%B5%AC/plgdaggkagiakemkoclkpkbdiocllbbi?authuser=0&hl=ko" target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-[#1A73E8] hover:bg-[#1A73E8]/90 text-white">
                  <Puzzle className="mr-2 h-5 w-5" /> Chrome 웹 스토어에서 설치하기
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default InstallationSection;
