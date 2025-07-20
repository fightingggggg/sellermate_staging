import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, X } from "lucide-react";

interface RobotVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function RobotVerificationDialog({ 
  open, 
  onOpenChange, 
  onConfirm 
}: RobotVerificationDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">닫기</span>
        </button>
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold text-gray-800 mb-2">로봇이 아닌지 확인이 필요합니다</DialogTitle>
        </DialogHeader>
        <div className="text-center space-y-4 p-4">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-orange-600" />
          </div>
          <div className="space-y-2">
            <p className="text-gray-700 text-sm leading-relaxed">
              네이버가 자동 접근을 막기 위해 추가 인증을 요청하고 있습니다.
            </p>
            <p className="text-gray-700 text-sm leading-relaxed">
              아래 버튼을 눌러 페이지로 이동한 후, 간단한 숫자나 문자를 입력해 로봇이 아님을 인증해 주세요.
            </p>
            <p className="text-gray-700 text-sm leading-relaxed font-medium">
              인증을 완료하면 자동으로 실행됩니다.
            </p>
          </div>
          <Button
            onClick={handleConfirm}
            className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold py-3"
          >
            확인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 