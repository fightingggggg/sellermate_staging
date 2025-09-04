import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Rocket, Download, MessageSquare } from "lucide-react";
import { CHROME_WEBSTORE_URL } from "@/lib/constants";
import { FeedbackDialog } from "@/components/ui/feedback-dialog";

interface UpgradeNoticeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UpgradeNoticeModal({ open, onOpenChange }: UpgradeNoticeModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open && dontShowAgain) {
      localStorage.setItem("upgrade-notice-dismissed", "true");
    }
    onOpenChange(open);
  };

  const handleReinstallExtension = () => {
    window.open(CHROME_WEBSTORE_URL, "_blank");
  };

  const handleSendFeedback = () => {
    setIsFeedbackOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-xl border-0">
        <DialogHeader className="text-center space-y-2">
          <div className="flex items-center justify-center mb-2">
            <Rocket className="w-8 h-8 text-blue-600" />
          </div>
          <DialogTitle className="text-xl font-bold text-gray-900 text-center">
            업그레이드로 인한 오류 안내
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
          <p className="font-medium text-center text-blue-600">
            멤버십 도입으로 확장 프로그램이 업그레이드 되었습니다
          </p>
          
          <div className="bg-blue-50 p-4 rounded-lg space-y-3 text-center">
            <p>
              확장 프로그램은 일정 시간이 지나면 자동으로 업데이트 됩니다.<br/> 다만 업그레이드 될 때까지 바로 사용이 어려울 수 있습니다.
            </p>
      
            <p>
               키워드 경쟁률 분석 또는 상품명 최적화 기능에서
              확장 프로그램이 설치되어 있음에도 <span className="font-semibold text-blue-700">"설치 필요"</span> 창이 뜨고, 바로 사용해야 한다면
            <br/>기존 <span className="font-semibold text-blue-700">확장 프로그램을 삭제한 뒤 새로 설치</span>해 주세요.
            </p>
          </div>

          <p className="text-center font-medium text-gray-800">
            많은 이용과 소중한 피드백 부탁드립니다!
          </p>
        </div>

        <div className="space-y-3 mt-6">
          <Button
            onClick={handleReinstallExtension}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            확장프로그램 재설치
          </Button>
          
          <Button
            onClick={handleSendFeedback}
            variant="outline"
            className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 rounded-lg flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            피드백 보내기
          </Button>
        </div>

        <div className="flex items-center space-x-1.5 mt-4 justify-center">
          <Checkbox 
            id="dont-show-again" 
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked as boolean)}
            className="h-3 w-3"
          />
          <label 
            htmlFor="dont-show-again" 
            className="text-xs text-gray-500 cursor-pointer"
          >
            다시 보지 않기
          </label>
        </div>
      </DialogContent>

      <FeedbackDialog 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
      />
    </Dialog>
  );
} 