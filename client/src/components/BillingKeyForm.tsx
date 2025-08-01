import { useState, useEffect } from 'react';
import { useNicePay } from '@/hooks/useNicePay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, CreditCard, AlertCircle } from 'lucide-react';

interface BillingKeyFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function BillingKeyForm({ onSuccess, onCancel }: BillingKeyFormProps) {
  const { loading, error, requestBillingKey, getBillingKeyStatus, deleteBillingKey } = useNicePay();
  const [billingKeyStatus, setBillingKeyStatus] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    checkBillingKeyStatus();
  }, []);

  const checkBillingKeyStatus = async () => {
    const status = await getBillingKeyStatus();
    setBillingKeyStatus(status);
    if (status?.hasBillingKey) {
      setShowForm(false);
    } else {
      setShowForm(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = await requestBillingKey();

    if (result?.success) {
      // 결제창이 호출되므로 여기서는 아무것도 하지 않음
      // 콜백에서 처리됨
    }
  };

  const handleDeleteBillingKey = async () => {
    const success = await deleteBillingKey();
    if (success) {
      await checkBillingKeyStatus();
    }
  };



  if (billingKeyStatus?.hasBillingKey) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            등록된 카드
          </CardTitle>
          <CardDescription>
            자동 결제를 위해 등록된 카드 정보입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <CreditCard className="w-5 h-5 text-gray-600" />
            <div>
              <p className="font-medium">{billingKeyStatus.cardInfo?.cardName || '카드'}</p>
              <p className="text-sm text-gray-600">
                {billingKeyStatus.cardInfo?.cardNo || '****-****-****-****'}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={handleDeleteBillingKey}
              variant="outline"
              className="flex-1"
              disabled={loading}
            >
              카드 삭제
            </Button>
            <Button 
              onClick={() => setShowForm(true)}
              variant="outline"
              className="flex-1"
            >
              카드 변경
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!showForm) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>카드 등록</CardTitle>
          <CardDescription>
            자동 결제를 위해 카드를 등록해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => setShowForm(true)}
            className="w-full"
          >
            카드 등록하기
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>카드 등록</CardTitle>
        <CardDescription>
          자동 결제를 위해 카드를 등록해주세요. 나이스페이 결제창이 열립니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="text-center space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                카드 등록을 위해 나이스페이 결제창이 열립니다.
                <br />
                결제창에서 카드 정보를 입력해주세요.
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onCancel}
                className="flex-1"
              >
                취소
              </Button>
              <Button 
                onClick={handleSubmit}
                className="flex-1"
                disabled={loading}
              >
                {loading ? '처리중...' : '카드 등록하기'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 