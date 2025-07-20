
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Button } from "./button";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface FeedbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackDialog({ isOpen, onClose }: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser?.email) {
      setEmail(currentUser.email);
    }
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("https://port-0-naverseo-m7nih0ld83b58082.sel4.cloudtype.app/api/send-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email || "anonymous",
          message: message.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert("피드백이 전송되었습니다. 감사합니다!");
        setMessage("");
        onClose();
      } else {
        alert(data.error || "피드백 전송에 실패했습니다.");
      }
    } catch (error) {
      console.error("피드백 전송 오류:", error);
      alert("오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">문의 및 피드백</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">이메일</label>
            <Input
              type="email"
              placeholder="답변 받을 이메일을 입력해주세요"
              value={email}  // 상태로 관리되는 email 사용
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">메시지</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="문의 사항이나 피드백을 입력하세요"
              required
              className="min-h-[120px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              취소
            </Button>
            <Button type="submit" disabled={isLoading || !message.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  전송 중...
                </>
              ) : (
                "보내기"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
