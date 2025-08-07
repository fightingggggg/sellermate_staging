import { Alert, AlertDescription } from "@/components/ui/alert";
import { useHistoryLimit } from "@/hooks/useHistoryLimit";
import { AlertTriangle, Info } from "lucide-react";
import { Link } from "wouter";

export function HistoryLimitAlert() {
  const { currentCount, maxCount, membershipType, canSave, isLoading } = useHistoryLimit();

  if (isLoading) {
    return null;
  }

  if (canSave) {
    // 여유가 있는 경우
    if (currentCount >= maxCount * 0.8) {
          // 80% 이상 사용된 경우 경고
    return (
      <Alert className="border-gray-200 bg-gray-50">
        <AlertTriangle className="h-4 w-4 text-gray-500" />
        <AlertDescription className="text-gray-600">
          <div className="flex items-center justify-between">
            <span className="text-sm">히스토리 저장 공간이 거의 가득 찼습니다. ({currentCount}/{maxCount})</span>
            {membershipType === 'basic' && (
              <Link 
                href="/membership" 
                className="inline-flex items-center px-2 py-1 text-xs font-normal text-gray-600 hover:text-blue-600 border border-gray-300 hover:border-blue-300 rounded transition-all duration-200 ml-2"
              >
                부스터멤버십은 30개까지 가능!
              </Link>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
    }
    return null;
  }

  // 제한에 도달한 경우
  return (
    <Alert className="border-orange-200 bg-orange-50">
      <AlertTriangle className="h-4 w-4 text-orange-500" />
      <AlertDescription className="text-orange-700">
        <div className="flex items-center justify-between">
          <span className="text-sm">히스토리 저장 제한에 도달했습니다. ({currentCount}/{maxCount})</span>
          {membershipType === 'basic' && (
            <Link 
              href="/membership" 
              className="inline-flex items-center px-2 py-1 text-xs font-normal text-orange-600 hover:text-blue-600 border border-orange-300 hover:border-blue-300 rounded transition-all duration-200 ml-2"
            >
              부스터멤버십은 30개까지 가능!
            </Link>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
} 