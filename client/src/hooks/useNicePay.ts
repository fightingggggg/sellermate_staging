import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';

interface BillingKeyRequest {
  uid: string;
  cardNo?: string;
  expYear?: string;
  expMonth?: string;
  idNo?: string;
  cardPw?: string;
}

interface PaymentRequest {
  uid: string;
  amount: number;
  goodsName: string;
  orderId: string;
}

interface BillingKeyResponse {
  success: boolean;
  orderId: string;
  redirectUrl?: string;
}

interface BillingKeyStatus {
  hasBillingKey: boolean;
  status: string;
  cardInfo?: {
    cardName?: string;
    cardNo?: string;
    expiry?: string;
  };
  createdAt?: any;
}

export const useNicePay = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 빌키 발급 요청 (API 방식)
  const requestBillingKey = async (cardInfo?: {
    cardNo: string;
    expYear: string;
    expMonth: string;
    idNo: string;
    cardPw: string;
  }): Promise<BillingKeyResponse | null> => {
    if (!currentUser?.uid) {
      setError('로그인이 필요합니다.');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const requestData: BillingKeyRequest = {
        uid: currentUser.uid
      };

      if (cardInfo) {
        Object.assign(requestData, cardInfo);
      }

      const user = auth.currentUser;
      if (!user) {
        // 초기화 중인 상태: 오류 노출 없이 종료
        return null;
      }
      const idToken = await user.getIdToken();
      if (!idToken) {
        throw new Error('인증 토큰을 가져올 수 없습니다. 다시 로그인 해주세요.');
      }

      const response = await fetch('/api/nicepay/billing-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '빌키 발급 요청에 실패했습니다.');
      }

      // 서버는 빌키를 응답하지 않음. 성공 여부만 사용
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 나이스페이 결제창 호출
  const callNicePayBillingKey = (data: any) => {
    try {
      console.log('나이스페이 결제창 호출 데이터:', data);
      
      (window as any).AUTHNICE.requestPay({
        clientId: data.clientId,
        method: data.method,
        orderId: data.orderId,
        amount: data.amount,
        goodsName: data.goodsName,
        returnUrl: data.returnUrl,
        useEscrow: data.useEscrow,
        currency: data.currency,
        taxFreeAmount: data.taxFreeAmount,
        supplyAmount: data.supplyAmount,
        taxAmount: data.taxAmount,
        fnError: function (result: any) {
          console.error('나이스페이 결제창 에러:', result);
          setError('결제창 호출 중 오류가 발생했습니다: ' + result.errorMsg);
        }
      });
    } catch (error: any) {
      console.error('결제창 호출 에러:', error);
      setError('결제창을 호출할 수 없습니다.');
    }
  };

  // 빌키 상태 확인
  const getBillingKeyStatus = async (): Promise<BillingKeyStatus | null> => {
    if (!currentUser?.uid) {
      setError('로그인이 필요합니다.');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        return null;
      }
      const idToken = await user.getIdToken();
      if (!idToken) {
        throw new Error('인증 토큰을 가져올 수 없습니다. 다시 로그인 해주세요.');
      }
      const response = await fetch(`/api/nicepay/billing-key/${currentUser.uid}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '빌키 상태 확인에 실패했습니다.');
      }

      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 빌키 삭제
  const deleteBillingKey = async (): Promise<boolean> => {
    if (!currentUser?.uid) {
      setError('로그인이 필요합니다.');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        return false;
      }
      const idToken = await user.getIdToken();
      if (!idToken) {
        throw new Error('인증 토큰을 가져올 수 없습니다. 다시 로그인 해주세요.');
      }
      const response = await fetch(`/api/nicepay/billing-key/${currentUser.uid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '빌키 삭제에 실패했습니다.');
      }

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 빌키로 결제 요청
  const requestPayment = async (_paymentInfo: Omit<PaymentRequest, 'uid'>): Promise<any> => {
    if (!currentUser?.uid) {
      setError('로그인이 필요합니다.');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        return null;
      }
      const idToken = await user.getIdToken();
      if (!idToken) {
        throw new Error('인증 토큰을 가져올 수 없습니다. 다시 로그인 해주세요.');
      }
      // 금액/상품명/주문번호는 서버가 결정하므로 바디는 비워도 됨
      const response = await fetch('/api/nicepay/payment/billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '결제 요청에 실패했습니다.');
      }

      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 테스트 결제 요청 (디버그용)
  const testBillingPayment = async (): Promise<any> => {
    if (!currentUser?.uid) {
      setError('로그인이 필요합니다.');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/debug/test-billing-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: currentUser.uid
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '테스트 결제 요청에 실패했습니다.');
      }

      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 구독 정보 확인 (디버그용)
  const getSubscriptionInfo = async (): Promise<any> => {
    if (!currentUser?.uid) {
      setError('로그인이 필요합니다.');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/debug/subscription/${currentUser.uid}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '구독 정보 조회에 실패했습니다.');
      }

      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 수동 자동 결제 실행 (디버그용)
  const runAutoPayment = async (): Promise<any> => {
    if (!currentUser?.uid) {
      setError('로그인이 필요합니다.');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/debug/run-auto-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: currentUser.uid
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '자동 결제 실행에 실패했습니다.');
      }

      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    requestBillingKey,
    getBillingKeyStatus,
    deleteBillingKey,
    requestPayment,
    testBillingPayment,
    getSubscriptionInfo,
    runAutoPayment,
  };
}; 