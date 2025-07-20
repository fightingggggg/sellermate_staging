import React, { useState, useEffect } from 'react';
import { Clock, Trash2, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HistoryService } from '@/lib/historyService';
import { KeywordHistory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useHistory } from '@/contexts/HistoryContext';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { HistoryLimitAlert } from './HistoryLimitAlert';

interface KeywordHistoryProps {
  type: KeywordHistory['type'];
  onKeywordSelect: (keyword: string, data: any, aiResult?: KeywordHistory['aiResult'], historyItem?: KeywordHistory) => void;
  className?: string;
}

const typeLabels = {
  'keyword-analysis': '키워드 경쟁률 분석',
  'complete-optimizer': '완벽한 상품 최적화',
  'quick-optimizer': '빠른 상품 최적화'
};

const typeColors = {
  'keyword-analysis': 'bg-green-100 text-green-800 border-green-200',
  'complete-optimizer': 'bg-blue-100 text-blue-800 border-blue-200',
  'quick-optimizer': 'bg-sky-100 text-sky-800 border-sky-200'
};

export default function KeywordHistoryComponent({ type, onKeywordSelect, className = "" }: KeywordHistoryProps) {
  const [showAll, setShowAll] = useState(false);
  const { currentUser } = useAuth();
  const { getHistory, isLoading, refreshHistory } = useHistory();

  // Context에서 히스토리 데이터 가져오기
  const history = getHistory(type) || [];
  const loading = isLoading(type);

  const handleKeywordClick = (item: KeywordHistory) => {
    onKeywordSelect(item.keyword, item.data, item.aiResult, item);
  };

  const handleDeleteHistory = async (historyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser?.email) return;
    
    try {
      await HistoryService.deleteHistory(historyId, currentUser.email, type);
      await refreshHistory(type); // 목록 새로고침
    } catch (error) {
      console.error('Error deleting history:', error);
    }
  };

  const displayedHistory = showAll ? history : history.slice(0, 5);
  const hasMore = history.length > 5;

  if (!currentUser) {
    return null;
  }

  if (loading) {
    return (
      <Card className={`border border-gray-200 bg-white/60 backdrop-blur-sm ${className}`}>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            최근 검색 키워드
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // 히스토리가 없으면 아무것도 렌더링하지 않음
  if (history.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 히스토리 제한 알림 */}
      <HistoryLimitAlert />
      
      <Card className="border border-gray-200 bg-white/60 backdrop-blur-sm">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          최근 검색 키워드
          <Badge variant="secondary" className="text-xs">
            {history.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 space-y-2">
        {displayedHistory.map((item) => (
          <div
            key={item.id}
            onClick={() => handleKeywordClick(item)}
            className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-gray-300 hover:bg-gray-50/80 cursor-pointer transition-all duration-200 bg-white/50"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate flex items-center gap-2">
                  {item.keyword}
                  {item.pageIndex && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600">
                      {item.pageIndex}페이지
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                  <span>
                    {formatDistanceToNow(item.timestamp, { 
                      addSuffix: true, 
                      locale: ko 
                    })}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs px-2 py-0.5 ${typeColors[item.type]}`}
                  >
                    {typeLabels[item.type]}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => handleDeleteHistory(item.id, e)}
                className="h-8 w-8 p-0 hover:bg-red-100"
              >
                <Trash2 className="h-3 w-3 text-gray-400 hover:text-red-500" />
              </Button>
            </div>
          </div>
        ))}

        {hasMore && (
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(!showAll)}
              className="w-full text-xs text-gray-600 hover:text-gray-800"
            >
              {showAll ? '접기' : `${history.length - 5}개 더 보기`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
} 