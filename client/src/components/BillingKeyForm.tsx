import { useState, useEffect } from 'react';
import { useNicePay } from '@/hooks/useNicePay';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, CreditCard, AlertCircle, Calendar, User, FileText, X } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';


interface BillingKeyFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  isChangeMode?: boolean; // 결제 수단 변경 모드인지 여부
  isMembershipPage?: boolean; // 멤버십 페이지에서 사용되는지 여부
}

export default function BillingKeyForm({ onSuccess, onCancel, isChangeMode = false, isMembershipPage = false }: BillingKeyFormProps) {
  const { currentUser } = useAuth();
  const { loading, error, requestBillingKey, getBillingKeyStatus, deleteBillingKey } = useNicePay();
  const [billingKeyStatus, setBillingKeyStatus] = useState<any>(null);
  const [showForm, setShowForm] = useState(true); // 모달에서 사용되므로 기본값을 true로 설정
  // 변경 모드일 때는 항상 폼을 표시
  useEffect(() => {
    if (isChangeMode) {
      setShowForm(true);
    }
  }, [isChangeMode]);
  const [cardInfo, setCardInfo] = useState({
    cardNo: '',
    expYear: '',
    expMonth: '',
    idNo: '',
    cardPw: '',
    cardType: 'personal'
  });
  const [agreement, setAgreement] = useState(false);

  useEffect(() => {
    checkBillingKeyStatus();
  }, []);



  const checkBillingKeyStatus = async () => {
    const status = await getBillingKeyStatus();
    setBillingKeyStatus(status);
    // 변경 모드가 아닐 때만 이미 등록된 카드가 있으면 폼을 숨김
    if (status?.hasBillingKey && !isChangeMode) {
      setShowForm(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!agreement) {
      alert('구독 상품과 설명을 확인하고 정기 결제에 동의해주세요.');
      return;
    }
    
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

    // 생년월일/사업자등록번호 형식 검증
    if (cardInfo.cardType === 'corporate') {
      // 사업자등록번호 형식 검증 (10자리 숫자)
      if (!/^\d{10}$/.test(cardInfo.idNo)) {
        alert('사업자등록번호는 10자리 숫자로 입력해주세요.');
        return;
      }
    } else {
      // 생년월일 형식 검증 (6자리 숫자)
      if (!/^\d{6}$/.test(cardInfo.idNo)) {
        alert('생년월일은 YYMMDD 형식으로 입력해주세요.');
        return;
      }
    }

    // 카드 비밀번호 형식 검증 (2자리 숫자)
    if (!/^\d{2}$/.test(cardInfo.cardPw)) {
      alert('카드 비밀번호는 2자리 숫자로 입력해주세요.');
      return;
    }
    
    const result = await requestBillingKey(cardInfo);

    if (result?.success) {
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

  if (billingKeyStatus?.hasBillingKey && !isChangeMode) {
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

  if (!showForm && !isChangeMode) {
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
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-lg border border-gray-200 relative">
      {/* 닫기 버튼 - onCancel이 있을 때 표시 */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors z-10"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      )}
      
      {/* 헤더 섹션 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-t-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isChangeMode ? '결제 수단 변경' : '카드 등록'}
            </h2>
            <p className="text-sm text-gray-600">
              {isChangeMode 
                ? '새로운 카드 정보를 입력하여 결제 수단을 변경해주세요' 
                : '안전한 결제를 위해 필요한 정보를 입력해주세요'
              }
            </p>
          </div>
        </div>
      </div>

      {/* 폼 섹션 */}
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 신용카드 번호 */}
          <div className="space-y-2">
            <Label htmlFor="cardNo" className="text-sm font-medium text-gray-700">
              신용카드 번호 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cardNo"
              type="text"
              placeholder="1234 **** **** 3456"
              value={cardInfo.cardNo.replace(/(\d{4})(?=\d)/g, '$1 ').replace(/(\d{4}\s)(\d{4})(\s\d{4}\s)(\d{4})/, '$1••••••••$4')}
              onChange={(e) => setCardInfo(prev => ({ 
                ...prev, 
                cardNo: e.target.value.replace(/\s/g, '').replace(/\D/g, '').slice(0, 16) 
              }))}
              className="h-12 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          {/* 유효기간 */}
          <div className="space-y-2">
            <Label htmlFor="expDate" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              유효기간 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="expDate"
              type="text"
              placeholder="MM/YY"
              value={`${cardInfo.expMonth}${cardInfo.expMonth ? '/' : ''}${cardInfo.expYear}`}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                const month = value.slice(0, 2);
                const year = value.slice(2, 4);
                setCardInfo(prev => ({ 
                  ...prev, 
                  expMonth: month,
                  expYear: year
                }));
              }}
              className="h-12 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              maxLength={5}
              required
            />
          </div>

          {/* 카드 종류 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <User className="w-4 h-4" />
              카드 종류 <span className="text-red-500">*</span>
            </Label>
            <RadioGroup 
              value={cardInfo.cardType} 
              onValueChange={(value) => setCardInfo(prev => ({ 
                ...prev, 
                cardType: value,
                idNo: '' // 카드 종류 변경 시 입력값 초기화
              }))}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="personal" id="personal" />
                <Label htmlFor="personal" className="text-sm">개인카드</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="corporate" id="corporate" />
                <Label htmlFor="corporate" className="text-sm">법인카드</Label>
              </div>
            </RadioGroup>
          </div>

          {/* 생년월일/사업자등록번호 */}
          <div className="space-y-2">
            <Label htmlFor="idNo" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <User className="w-4 h-4" />
              {cardInfo.cardType === 'corporate' ? '사업자등록번호' : '생년월일'} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="idNo"
              type="text"
              placeholder={cardInfo.cardType === 'corporate' ? "1234567890" : "900101"}
              value={cardInfo.idNo}
              onChange={(e) => setCardInfo(prev => ({ 
                ...prev, 
                idNo: e.target.value.replace(/\D/g, '').slice(0, cardInfo.cardType === 'corporate' ? 10 : 6) 
              }))}
              className="h-12 border-blue-200 bg-blue-50 focus:border-blue-500 focus:ring-blue-500"
              maxLength={cardInfo.cardType === 'corporate' ? 10 : 6}
              required
            />
            <p className="text-xs text-gray-500">
              {cardInfo.cardType === 'corporate' 
                ? '사업자등록번호 10자리를 입력해주세요 (예: 1234567890)' 
                : '생년월일 6자리를 입력해주세요 (예: 900101)'
              }
            </p>
          </div>

          {/* 카드 비밀번호 */}
          <div className="space-y-2">
            <Label htmlFor="cardPw" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              비밀번호 앞 2자리 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cardPw"
              type="password"
              placeholder="••"
              value={cardInfo.cardPw}
              onChange={(e) => setCardInfo(prev => ({ 
                ...prev, 
                cardPw: e.target.value.replace(/\D/g, '').slice(0, 2) 
              }))}
              className="h-12 border-blue-200 bg-blue-50 focus:border-blue-500 focus:ring-blue-500"
              maxLength={2}
              required
            />
          </div>

          {/* 동의 체크박스 */}
          <div className="flex items-start space-x-3 pt-4">
            <Checkbox 
              id="agreement" 
              checked={agreement}
              onCheckedChange={(checked) => setAgreement(checked as boolean)}
              className="mt-1"
            />
            <Label htmlFor="agreement" className="text-sm text-gray-600 leading-relaxed">
              구독 상품과 설명을 확인하였으며, 30일 간격으로 정기 결제에 동의합니다.
            </Label>
          </div>

          {/* 구독 버튼 */}
          <Button 
            type="submit"
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            disabled={loading || !agreement}
          >
            {loading ? '처리중...' : (isChangeMode ? '결제 수단 변경' : (isMembershipPage ? '카드 등록하고 결제하기' : '카드 등록하기'))}
          </Button>
        </form>
      </div>
    </div>
  );
} 