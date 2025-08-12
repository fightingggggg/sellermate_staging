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

  const getIdTokenSafely = async (): Promise<string | null> => {
    try {
      const firebaseUser = auth.currentUser as any;
      if (firebaseUser && typeof firebaseUser.getIdToken === 'function') {
        return await firebaseUser.getIdToken();
      }
      return null;
    } catch {
      return null;
    }
  };

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

      // 카드 정보가 제공되면 API 방식으로 처리
      if (cardInfo) {
        Object.assign(requestData, cardInfo);
      }

      const idToken = await getIdTokenSafely();

      const response = await fetch('/api/nicepay/billing-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '빌키 발급 요청에 실패했습니다.');
      }

      // API 방식으로 성공한 경우
      if (data.success && data.billingKey) {
        console.log('빌키 발급 성공:', data.billingKey);
        return data;
      }

      // 결제창 방식으로 처리해야 하는 경우 (카드 정보가 없는 경우)
      if (data.success && data.clientId) {
        // 나이스페이 JS SDK가 로드되어 있는지 확인
        if (typeof (window as any).AUTHNICE === 'undefined') {
          // SDK 로드
          const script = document.createElement('script');
          script.src = 'https://pay.nicepay.co.kr/v1/js/';
          script.onload = () => {
            callNicePayBillingKey(data);
          };
          document.head.appendChild(script);
        } else {
          callNicePayBillingKey(data);
        }
      }

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
      const idToken = await getIdTokenSafely();
      if (!idToken) {
        // 토큰이 아직 준비되지 않은 경우 호출 스킵
        return null;
      }
      const response = await fetch(`/api/nicepay/billing-key/${currentUser.uid}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
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
      const idToken = await getIdTokenSafely();
      const response = await fetch(`/api/nicepay/billing-key/${currentUser.uid}`, {
        method: 'DELETE',
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
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
  const requestPayment = async (paymentInfo: Omit<PaymentRequest, 'uid'>): Promise<any> => {
    if (!currentUser?.uid) {
      setError('로그인이 필요합니다.');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const idToken = await getIdTokenSafely();
      const response = await fetch('/api/nicepay/payment/billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          uid: currentUser.uid,
          ...paymentInfo
        }),
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

  return {
    loading,
    error,
    requestBillingKey,
    getBillingKeyStatus,
    deleteBillingKey,
    requestPayment,
  };
}; 