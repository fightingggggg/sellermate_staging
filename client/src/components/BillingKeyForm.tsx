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
  const [cardInfo, setCardInfo] = useState({
    cardNo: '',
    expYear: '',
    expMonth: '',
    idNo: '',
    cardPw: ''
  });

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
    
    // 카드 정보 검증
    if (!cardInfo.cardNo || !cardInfo.expYear || !cardInfo.expMonth || !cardInfo.idNo || !cardInfo.cardPw) {
      alert('모든 카드 정보를 입력해주세요.');
      return;
    }

    // 카드번호 형식 검증 (16자리 숫자)
    if (!/^\d{16}$/.test(cardInfo.cardNo)) {
      alert('카드번호는 16자리 숫자로 입력해주세요.');
      return;
    }

    // 유효기간 형식 검증
    if (!/^\d{2}$/.test(cardInfo.expYear) || !/^\d{2}$/.test(cardInfo.expMonth)) {
      alert('유효기간은 YY/MM 형식으로 입력해주세요.');
      return;
    }

    // 생년월일 형식 검증 (6자리 숫자)
    if (!/^\d{6}$/.test(cardInfo.idNo)) {
      alert('생년월일은 YYMMDD 형식으로 입력해주세요.');
      return;
    }

    // 카드 비밀번호 형식 검증 (2자리 숫자)
    if (!/^\d{2}$/.test(cardInfo.cardPw)) {
      alert('카드 비밀번호는 2자리 숫자로 입력해주세요.');
      return;
    }
    
    const result = await requestBillingKey(cardInfo);

    if (result?.success) {
      alert('카드가 성공적으로 등록되었습니다!');
      await checkBillingKeyStatus();
      if (onSuccess) onSuccess();
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

          <div className="space-y-4">
            {/* 카드번호 */}
            <div className="space-y-2">
              <Label htmlFor="cardNo">카드번호</Label>
              <Input
                id="cardNo"
                type="text"
                placeholder="1234567890123456"
                value={cardInfo.cardNo}
                onChange={(e) => setCardInfo(prev => ({ ...prev, cardNo: e.target.value.replace(/\D/g, '').slice(0, 16) }))}
                maxLength={16}
                required
              />
            </div>

            {/* 유효기간 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expYear">년도 (YY)</Label>
                <Input
                  id="expYear"
                  type="text"
                  placeholder="25"
                  value={cardInfo.expYear}
                  onChange={(e) => setCardInfo(prev => ({ ...prev, expYear: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  maxLength={2}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expMonth">월 (MM)</Label>
                <Input
                  id="expMonth"
                  type="text"
                  placeholder="12"
                  value={cardInfo.expMonth}
                  onChange={(e) => setCardInfo(prev => ({ ...prev, expMonth: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  maxLength={2}
                  required
                />
              </div>
            </div>

            {/* 생년월일 */}
            <div className="space-y-2">
              <Label htmlFor="idNo">생년월일 (YYMMDD)</Label>
              <Input
                id="idNo"
                type="text"
                placeholder="800101"
                value={cardInfo.idNo}
                onChange={(e) => setCardInfo(prev => ({ ...prev, idNo: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                maxLength={6}
                required
              />
            </div>

            {/* 카드 비밀번호 */}
            <div className="space-y-2">
              <Label htmlFor="cardPw">카드 비밀번호 앞 2자리</Label>
              <Input
                id="cardPw"
                type="password"
                placeholder="••"
                value={cardInfo.cardPw}
                onChange={(e) => setCardInfo(prev => ({ ...prev, cardPw: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
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
                {loading ? '처리중...' : '카드 등록하기'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
} 