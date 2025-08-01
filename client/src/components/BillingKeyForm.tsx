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
  const [cardNo, setCardNo] = useState('');
  const [expiry, setExpiry] = useState('');
  const [birth, setBirth] = useState('');
  const [pwd_2digit, setPwd_2digit] = useState('');
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
    
    const result = await requestBillingKey({
      cardNo,
      expiry,
      birth,
      pwd_2digit
    });

    if (result?.success) {
      // 빌키 발급 성공 시 상태 다시 확인
      await checkBillingKeyStatus();
      onSuccess?.();
    }
  };

  const handleDeleteBillingKey = async () => {
    const success = await deleteBillingKey();
    if (success) {
      await checkBillingKeyStatus();
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
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
        <CardTitle>카드 정보 입력</CardTitle>
        <CardDescription>
          자동 결제를 위해 카드 정보를 입력해주세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="cardNo">카드번호</Label>
            <Input
              id="cardNo"
              type="text"
              placeholder="1234 5678 9012 3456"
              value={cardNo}
              onChange={(e) => setCardNo(formatCardNumber(e.target.value))}
              maxLength={19}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiry">유효기간</Label>
              <Input
                id="expiry"
                type="text"
                placeholder="MM/YY"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                maxLength={5}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birth">생년월일</Label>
              <Input
                id="birth"
                type="text"
                placeholder="YYMMDD"
                value={birth}
                onChange={(e) => setBirth(e.target.value.replace(/[^0-9]/g, ''))}
                maxLength={6}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pwd_2digit">카드 비밀번호 앞 2자리</Label>
            <Input
              id="pwd_2digit"
              type="password"
              placeholder="**"
              value={pwd_2digit}
              onChange={(e) => setPwd_2digit(e.target.value.replace(/[^0-9]/g, ''))}
              maxLength={2}
              required
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
              className="flex-1"
            >
              취소
            </Button>
            <Button 
              type="submit" 
              className="flex-1"
              disabled={loading}
            >
              {loading ? '처리중...' : '카드 등록'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
} 