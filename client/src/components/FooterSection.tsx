import ScrollToLink from "@/components/ui/scroll-to-link";
import { useState } from "react";
import { FeedbackDialog } from "@/components/ui/feedback-dialog";

const FooterSection = () => {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  return (
    <footer className="bg-[#333333] text-white py-6">
      <div className="container mx-auto px-4">
        <div className="text-center">
          <div className="text-gray-400 text-xs space-y-1">
            <p>상호: 셀러메이트 | 대표자: 최지혜 </p>
            <p> 사업자등록번호: 578-01-03846 | 통신판매신고번호: 2025-서울노원-0933 호</p>
            <p>주소: 서울특별시 노원구 석계로 18길 8, 월계동 2층 203호 | 개인정보보호책임자: 최지혜</p>
            <p>연락처: official.sellermate@gmail.com | 010-6850-3787</p>
           
            <div className="mt-2 space-x-4">
  <a
    href="https://chambray-midnight-e7f.notion.site/SEO-18678708053f806a9955f0f5375cdbdd?pvs=74"
    target="_blank"
    rel="noopener noreferrer"
    className="text-gray-400 hover:text-white transition-colors"
  >
    개인정보처리방침
  </a>
  <span className="text-gray-600">|</span>
  <a
    href="https://chambray-midnight-e7f.notion.site/22c78708053f80998563d392eadb9152"
    target="_blank"
    rel="noopener noreferrer"
    className="text-gray-400 hover:text-white transition-colors"
  >
    이용약관
  </a>
</div>

          </div>
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-gray-400 text-xs">
              &copy; {new Date().getFullYear()} 셀러메이트. All rights reserved.
              <p>스토어 부스터의 기능은 상위 노출 최적화를 위한 참고용이며, 상위 노출을 완전히 보장하거나 이에 대해 책임지지 않습니다.</p>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
