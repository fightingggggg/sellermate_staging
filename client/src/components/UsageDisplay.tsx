import { useUsage } from '@/contexts/UsageContext';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Sparkles } from 'lucide-react';

export function UsageDisplay() {
  const { usageInfo, isLoading } = useUsage();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 ml-3">
        <div className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-500 border border-gray-200 rounded-md">
          <Search className="h-3 w-3 animate-pulse" />
          <span className="animate-pulse">...</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-500 border border-gray-200 rounded-md">
          <Sparkles className="h-3 w-3 animate-pulse" />
          <span className="animate-pulse">...</span>
        </div>
      </div>
    );
  }

  if (!usageInfo) {
    return null;
  }

  const getKeywordAnalysisColor = () => {
    return 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100';
  };

  const getProductOptimizationColor = () => {
    return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
  };

  return (
    <div className="flex items-center gap-2 ml-3">
      {/* 키워드 분석 사용량 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${getKeywordAnalysisColor()}`}
          >
            <Search className="h-3 w-3" />
            {usageInfo.keywordAnalysis.current}/{usageInfo.keywordAnalysis.max}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <p className="font-medium">키워드 분석</p>
            <p className="text-sm text-gray-600">
              남은 횟수: {usageInfo.keywordAnalysis.remaining}회
            </p>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* 상품 최적화 사용량 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${getProductOptimizationColor()}`}
          >
            <Sparkles className="h-3 w-3" />
            {usageInfo.productOptimization.current}/{usageInfo.productOptimization.max}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <p className="font-medium">상품 최적화</p>
            <p className="text-sm text-gray-600">
              남은 횟수: {usageInfo.productOptimization.remaining}회
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
} 