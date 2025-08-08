import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, RefreshCw, Settings, List, Plus, Minus } from 'lucide-react';

interface SimulationResult {
  action: string;
  month: string;
  currentCount: number;
  limit: number;
  membershipType: string;
  exists?: boolean;
  monthlyUsage?: Array<{
    month: string;
    count: number;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
}

export default function ExtensionUsageSimulationPage() {
  const { currentUser } = useAuth();
  const [targetMonth, setTargetMonth] = useState('');
  const [targetCount, setTargetCount] = useState(0);
  const [action, setAction] = useState<'set' | 'get' | 'consume' | 'list'>('get');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 현재 월을 기본값으로 설정
  useEffect(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    setTargetMonth(currentMonth);
  }, []);

  const handleSimulate = async () => {
    if (!currentUser) {
      setError('로그인이 필요합니다.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await (currentUser as any).getIdToken();
      
      const response = await fetch('/api/extension-usage/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetMonth,
          targetCount: action === 'set' ? targetCount : undefined,
          action
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || '시뮬레이션 실패');
      }

      setResult(data.data);
    } catch (err: any) {
      setError(err.message || '시뮬레이션 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getMonthDisplayName = (monthKey: string) => {
    const year = monthKey.substring(0, 4);
    const month = monthKey.substring(4, 6);
    return `${year}년 ${month}월`;
  };

  const getStatusColor = (current: number, limit: number) => {
    if (limit === Number.MAX_SAFE_INTEGER) return 'bg-green-100 text-green-800';
    if (current >= limit) return 'bg-red-100 text-red-800';
    if (current >= limit * 0.8) return 'bg-yellow-100 text-yellow-800';
    return 'bg-blue-100 text-blue-800';
  };

  const getStatusText = (current: number, limit: number) => {
    if (limit === Number.MAX_SAFE_INTEGER) return '무제한';
    if (current >= limit) return '사용량 초과';
    if (current >= limit * 0.8) return '거의 소진';
    return '사용 가능';
  };

  if (!currentUser) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertDescription>이 페이지를 사용하려면 로그인이 필요합니다.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">확장프로그램 사용량 시뮬레이션</h1>
        <p className="text-gray-600">
          월별 사용량 제한 시스템을 테스트하고 시뮬레이션할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 시뮬레이션 컨트롤 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              시뮬레이션 설정
            </CardTitle>
            <CardDescription>
              월별 사용량을 설정하고 테스트해보세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">대상 월</label>
              <Input
                type="text"
                placeholder="YYYYMM (예: 202412)"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">액션</label>
              <Select value={action} onValueChange={(value: any) => setAction(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="get">조회 (get)</SelectItem>
                  <SelectItem value="set">설정 (set)</SelectItem>
                  <SelectItem value="consume">소비 (consume)</SelectItem>
                  <SelectItem value="list">전체 목록 (list)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {action === 'set' && (
              <div>
                <label className="block text-sm font-medium mb-2">설정할 사용량</label>
                <Input
                  type="number"
                  min="0"
                  value={targetCount}
                  onChange={(e) => setTargetCount(parseInt(e.target.value) || 0)}
                />
              </div>
            )}

            <Button 
              onClick={handleSimulate} 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  처리 중...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  시뮬레이션 실행
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 결과 표시 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              시뮬레이션 결과
            </CardTitle>
            <CardDescription>
              실행 결과를 확인하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert className="mb-4">
                <AlertDescription className="text-red-600">{error}</AlertDescription>
              </Alert>
            )}

            {result && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">액션:</span>
                  <Badge variant="outline">{result.action}</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">대상 월:</span>
                  <span className="font-mono">{getMonthDisplayName(result.month)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">멤버십:</span>
                  <Badge variant={result.membershipType === 'booster' ? 'default' : 'secondary'}>
                    {result.membershipType === 'booster' ? 'Booster' : 'Basic'}
                  </Badge>
                </div>

                {result.currentCount !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">현재 사용량:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{result.currentCount}</span>
                      {result.limit !== Number.MAX_SAFE_INTEGER && (
                        <>
                          <span>/</span>
                          <span className="font-mono">{result.limit}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {result.currentCount !== undefined && result.limit !== Number.MAX_SAFE_INTEGER && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">상태:</span>
                    <Badge className={getStatusColor(result.currentCount, result.limit)}>
                      {getStatusText(result.currentCount, result.limit)}
                    </Badge>
                  </div>
                )}

                {result.exists !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">데이터 존재:</span>
                    <Badge variant={result.exists ? 'default' : 'secondary'}>
                      {result.exists ? '있음' : '없음'}
                    </Badge>
                  </div>
                )}

                {result.monthlyUsage && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">전체 월별 사용량:</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {result.monthlyUsage.map((usage, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm">{getMonthDisplayName(usage.month)}</span>
                          <span className="font-mono text-sm">{usage.count}회</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 사용 예시 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>사용 예시</CardTitle>
          <CardDescription>
            한달이 지난 후의 동작을 시뮬레이션하는 방법
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">1. 이번 달 사용량 설정</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>• 액션: 설정 (set)</p>
                <p>• 대상 월: 202412 (현재 월)</p>
                <p>• 설정할 사용량: 20 (제한에 도달)</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">2. 다음 달 사용량 확인</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>• 액션: 조회 (get)</p>
                <p>• 대상 월: 202501 (다음 달)</p>
                <p>• 결과: 0회 (새로운 달이므로 초기화)</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">💡 핵심 포인트</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• 월별로 독립적인 사용량 카운터가 생성됩니다</li>
              <li>• 새로운 달이 되면 자동으로 0부터 시작합니다</li>
              <li>• Basic 멤버십은 월 20회, Booster는 무제한입니다</li>
                             <li>• 문서 ID는 `사용자ID_YYYYMM` 형식으로 저장됩니다</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 