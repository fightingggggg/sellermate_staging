import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * 전역에서 PROMPT_NAVER_TAB_ACTIVATION 메시지를 수신해 모달을 띄우고
 * 사용자가 확인하면 ACTIVATE_NAVER_SHOPPING_TAB 메시지를 확장프로그램으로 전달합니다.
 */
export default function NaverTabActivationHandler() {
  const [open, setOpen] = useState(false);
  const [analysisTabId, setAnalysisTabId] = useState<number | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PROMPT_NAVER_TAB_ACTIVATION") {
        setAnalysisTabId(event.data.analysisTabId);
        setOpen(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const onConfirm = () => {
    if (analysisTabId !== null) {
      window.postMessage({
        type: "ACTIVATE_NAVER_SHOPPING_TAB",
        analysisTabId: analysisTabId,
      }, "*");
    }
    setOpen(false);
  };

  const onCancel = () => {
    if (analysisTabId !== null) {
      window.postMessage({
        type: "CANCEL_NAVER_SHOPPING_TAB",
        analysisTabId: analysisTabId,
      }, "*");
      // 진행 중 플래그 해제용
      window.postMessage({ type: "SEO_ANALYSIS_CANCELLED" }, "*");
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        onCancel();
      }
    }}>
      <DialogContent className="max-w-md text-center">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-800 text-center">
            네이버 쇼핑으로 잠시 이동해 분석 계속하기
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <p className="text-base text-gray-600 leading-relaxed text-center">
            네이버 쇼핑에서 로봇이 아닌지 간단히 확인이 필요해요. <br/>확인을 누르시면 네이버 쇼핑 탭으로 이동하고, <br/>취소하시면 분석이 종료돼요.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onCancel}
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            취소
          </Button>
          <Button 
            size="sm" 
            className="bg-blue-500 hover:bg-blue-600 text-white" 
            onClick={onConfirm}
          >
            확인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 