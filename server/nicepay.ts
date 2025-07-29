import crypto from "crypto";

interface BillingRequest {
  cardNumber: string;      // 숫자만 16자리
  cardExpiry: string;      // YYMM
  idNumber: string;        // 생년월일 6자리 또는 사업자번호 10자리
  cardPassword: string;    // 앞 2자리
  orderId: string;         // 고유 주문번호
  amount: number;          // 첫 결제 금액 (원)
  goodsName: string;       // 상품 이름
  buyerName?: string;
  buyerEmail?: string;
}

export interface BillingResult {
  success: boolean;
  billingKey?: string;
  tid?: string;
  resultCode?: string;
  resultMsg?: string;
  raw?: any;
}

const NICEPAY_API_BASE = process.env.NODE_ENV === "production"
  ? "https://api.nicepay.co.kr/v1"
  : "https://sandbox-api.nicepay.co.kr/v1";

const CLIENT_ID = process.env.NICEPAY_CLIENT_ID || "";
const SECRET_KEY = process.env.NICEPAY_SECRET_KEY || "";

function basicAuth(): string {
  if (!CLIENT_ID || !SECRET_KEY) throw new Error("NICEPAY env not set");
  const creds = `${CLIENT_ID}:${SECRET_KEY}`;
  return Buffer.from(creds).toString("base64");
}

/**
 * 카드 정보를 이용해 Billing Key 를 발급하고, 첫 결제를 승인한다.
 * @returns BillingResult
 */
export async function billingSubscribe(req: BillingRequest): Promise<BillingResult> {
  try {
    // 1) Billing key 발급 (subscribe) – 카드 정보 포함
    const billingKeyResult = await requestBillingKey(req);
    if (!billingKeyResult.success || !billingKeyResult.billingKey) {
      return billingKeyResult;
    }

    // 2) 응답의 billingKey 로 승인 API 호출 (amount > 0)
    const approveResult = await approveBilling(req.orderId, billingKeyResult.billingKey, req.amount, req.goodsName);
    
    return {
      success: approveResult.success,
      billingKey: billingKeyResult.billingKey,
      tid: approveResult.tid,
      resultCode: approveResult.resultCode,
      resultMsg: approveResult.resultMsg,
      raw: approveResult.raw,
    };
  } catch (err: any) {
    return {
      success: false,
      resultCode: err?.code || "ERR",
      resultMsg: err?.message || "billingSubscribe error",
      raw: err,
    };
  }
}

/**
 * Billing Key 발급 요청
 */
async function requestBillingKey(req: BillingRequest): Promise<BillingResult> {
  const url = `${NICEPAY_API_BASE}/payments/subscribe`;
  
  const payload = {
    method: "card",
    orderId: req.orderId,
    amount: req.amount,
    goodsName: req.goodsName,
    cardNo: req.cardNumber,
    cardExpiry: req.cardExpiry,
    cardPwd: req.cardPassword,
    idNo: req.idNumber,
    buyerName: req.buyerName || "",
    buyerEmail: req.buyerEmail || "",
    returnUrl: process.env.NICEPAY_CALLBACK_URL || "https://storebooster.ai.kr/api/nicepay/return",
  };

  console.log('[nicepay] Billing Key 요청 URL:', url);
  console.log('[nicepay] Billing Key 요청 페이로드:', { ...payload, cardNo: '***', cardPwd: '**', idNo: '***' });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${basicAuth()}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('[nicepay] Billing Key 응답 상태:', response.status, response.statusText);
    
    const responseText = await response.text();
    console.log('[nicepay] Billing Key 응답 텍스트:', responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[nicepay] JSON 파싱 실패:', parseErr);
      return {
        success: false,
        resultCode: "PARSE_ERR",
        resultMsg: `Response parsing failed: ${responseText.substring(0, 100)}`,
        raw: responseText,
      };
    }
    
    console.log('[nicepay] Billing Key 응답 데이터:', data);
    
    if (data.resultCode === "0000") {
      return {
        success: true,
        billingKey: data.billingKey,
        resultCode: data.resultCode,
        resultMsg: data.resultMsg,
        raw: data,
      };
    } else {
      return {
        success: false,
        resultCode: data.resultCode,
        resultMsg: data.resultMsg,
        raw: data,
      };
    }
  } catch (err: any) {
    console.error('[nicepay] Billing Key 요청 실패:', err);
    return {
      success: false,
      resultCode: "ERR",
      resultMsg: err?.message || "Billing key request failed",
      raw: err,
    };
  }
}

/**
 * Billing Key로 결제 승인
 */
async function approveBilling(orderId: string, billingKey: string, amount: number, goodsName: string): Promise<BillingResult> {
  const url = `${NICEPAY_API_BASE}/payments/${billingKey}/approve`;
  
  const payload = {
    orderId: orderId,
    amount: amount,
    goodsName: goodsName,
  };

  console.log('[nicepay] 결제 승인 요청 URL:', url);
  console.log('[nicepay] 결제 승인 페이로드:', payload);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${basicAuth()}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('[nicepay] 결제 승인 응답 상태:', response.status, response.statusText);
    
    const responseText = await response.text();
    console.log('[nicepay] 결제 승인 응답 텍스트:', responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[nicepay] JSON 파싱 실패:', parseErr);
      return {
        success: false,
        resultCode: "PARSE_ERR",
        resultMsg: `Response parsing failed: ${responseText.substring(0, 100)}`,
        raw: responseText,
      };
    }
    
    console.log('[nicepay] 결제 승인 응답 데이터:', data);
    
    if (data.resultCode === "0000") {
      return {
        success: true,
        tid: data.tid,
        resultCode: data.resultCode,
        resultMsg: data.resultMsg,
        raw: data,
      };
    } else {
      return {
        success: false,
        resultCode: data.resultCode,
        resultMsg: data.resultMsg,
        raw: data,
      };
    }
  } catch (err: any) {
    console.error('[nicepay] 결제 승인 요청 실패:', err);
    return {
      success: false,
      resultCode: "ERR",
      resultMsg: err?.message || "Billing approval failed",
      raw: err,
    };
  }
} 

export function verifyWebhookSignature(params: Record<string,string>, receivedSignature: string): boolean {
  // NICEPAY 웹훅은 모든 파라미터 정렬 후 & 로 연결 + SecretKey 에 대한 SHA-256 해시 (문서 참고)
  if (!SECRET_KEY) return false;
  const sortedKeys = Object.keys(params).sort();
  const baseString = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + SECRET_KEY;
  const hash = crypto.createHash('sha256').update(baseString, 'utf8').digest('hex');
  return hash === receivedSignature;
} 