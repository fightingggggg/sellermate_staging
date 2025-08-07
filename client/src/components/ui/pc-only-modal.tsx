import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Monitor } from "lucide-react";

interface PcOnlyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PcOnlyModal({ open, onOpenChange }: PcOnlyModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Monitor className="h-8 w-8 text-blue-600" />
          </div>
          <DialogTitle className="text-xl font-semibold text-gray-800">
            이 기능은 PC 전용이에요!
          </DialogTitle>
        </DialogHeader>
        <div className="text-center space-y-4">
          <p className="text-gray-600 text-base leading-relaxed">
            PC에서 이용하시면 더 좋은 경험을 하실 수 있어요.
          </p>
          <Button 
            onClick={() => onOpenChange(false)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5"
          >
            확인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 