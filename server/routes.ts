import type { Express } from "express";
import { createServer, type Server } from "http";
import { sendVerificationEmail, sendRefundSuccessEmail, sendPaymentSuccessEmail, sendMembershipCancellationEmail } from "./email";
import crypto from "crypto";
import admin from "firebase-admin";
import { autoPaymentScheduler } from "./scheduler";
import Anthropic from '@anthropic-ai/sdk';
// ensure admin initialized via email.ts or here fallback
if (!admin.apps.length) {
  admin.initializeApp();
}
// fetch: Node 18+ 전역 지원 (node-fetch 불필요)
import cors from "cors";
import rateLimit from "express-rate-limit";

// 추가: /api/generate-name 안정성을 위한 간단한 세마포어, 캐시, 중복요청 병합 유틸
class SimpleSemaphore {
  private queue: Array<() => void> = [];
  private permits: number;
  constructor(maxPermits: number) { this.permits = Math.max(1, maxPermits); }
  async acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => resolve(() => this.release()));
    });
  }
  private release() {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.permits += 1;
    }
  }
}

const MAX_CONCURRENT_GENERATE_NAME = Number(process.env.GENERATE_NAME_CONCURRENCY || 4);
const generateNameSemaphore = new SimpleSemaphore(MAX_CONCURRENT_GENERATE_NAME);

const inFlightGenerateName = new Map<string, Promise<{ productName: string; reason: string }>>();

type GenCacheEntry = { value: { productName: string; reason: string }; expiresAt: number };
const generateNameCache = new Map<string, GenCacheEntry>();
const GENERATE_NAME_CACHE_TTL_MS = Number(process.env.GENERATE_NAME_CACHE_TTL_MS || 60_000);

const generateNameLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.GENERATE_NAME_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
});

// 카드 번호 마스킹 함수
function maskCardNumber(cardNo: string): string {
  if (!cardNo || cardNo.length !== 16) {
    return '****-****-****-****';
  }
  
  // 앞 4자리만 보이고 나머지는 마스킹
  const first4 = cardNo.slice(0, 4);
  
  return `${first4} **** ****`;
}

// 민감한 정보 마스킹 함수 추가
function maskSensitiveData(data: string): string {
  if (!data) return '***';
  if (data.length <= 2) return '**';
  return data.substring(0, 2) + '*'.repeat(data.length - 2);
}

// ===== 네이버 간편 로그인 =====
// 메모리 기반 state 저장 (재시작 시 초기화)
const naverOAuthStates: Map<string, { 
  popup?: boolean;
  merge?: boolean;
  emailUid?: string;
  email?: string;
}> = new Map();

// 공통 인증 헬퍼 (Firebase ID 토큰 검증)
async function verifyAuthUid(req: any, res: any): Promise<string | null> {
  try {
    const authHeader: string = req.headers?.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization Bearer token' });
      return null;
    }
    const token = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch (e: any) {
    console.warn('[Auth] Token verify failed:', e?.message || e);
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS 설정 추가
  const corsAllowedOrigins: string[] = [
    'https://storebooster.ai.kr'
  ];
  if (process.env.NODE_ENV !== 'production') {
    corsAllowedOrigins.push(
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    );
  }
  if (process.env.NODE_ENV === 'staging') {
    corsAllowedOrigins.push('https://storebooster.ai.kr');
  }
  const corsOptions: cors.CorsOptions = {
    origin: corsAllowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as string[],
  };
  app.use(cors(corsOptions));

  // 결제/웹훅 경로별 강화 레이트 리밋
  // 결제 청구: 5분당 10회 (IP 기준). 요청 본문에 uid가 포함되므로 서버 내부에서 중복 락도 이미 존재
  const paymentLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
  // 웹훅: 1분당 60회 (IP 기준). 나이스페이 콜백 트래픽 보호
  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  // 경로에만 한정하여 적용 (기존 전역 리밋과 병행 가능)
  app.use('/api/nicepay/payment/billing', paymentLimiter);
  app.use('/api/nicepay/webhook', webhookLimiter);

  // API Endpoint to check server status
  app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', message: 'SEO Dashboard API is running' });
  });

  // API Endpoint for Chrome extension to communicate with server
  app.post('/api/analyze-query', (req, res) => {
    const { query, email } = req.body;
    
    if (!query || !email) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'Query and email are required' 
      });
    }
    
    // In a real implementation, this would analyze the query and return results
    // For now, we'll just return a success message
    res.json({ 
      success: true, 
      message: 'Query analysis request received', 
      query, 
      email 
    });
  });

  // 피드백 전송 API
  app.post('/api/send-feedback', async (req, res) => {
    try {
      const { email, message } = req.body;
      
      if (!email || !message) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          message: 'Email and message are required' 
        });
      }

      const db = admin.firestore();
      
      // 피드백을 Firestore에 저장
      await db.collection('feedbacks').add({
        email: email,
        message: message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        userAgent: req.headers['user-agent'] || ''
      });

      console.log('피드백 저장 완료:', { email, messageLength: message.length });
      
      res.json({ 
        success: true, 
        message: '피드백이 성공적으로 전송되었습니다.' 
      });
      
    } catch (error: any) {
      console.error('피드백 전송 오류:', error);
      res.status(500).json({ 
        error: '피드백 전송에 실패했습니다.', 
        detail: error.message 
      });
    }
  });

  // 휴대폰 번호를 custom claim으로 설정하는 API
  app.post('/api/auth/set-phone-claim', async (req, res) => {
    try {
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      const { uid, phoneNumber } = req.body;
      
      if (authUid !== uid) {
        return res.status(403).json({ error: 'Forbidden', message: 'uid mismatch' });
      }
      
      if (!uid || !phoneNumber) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          message: 'UID and phone number are required' 
        });
      }

      // Firebase Admin을 사용하여 custom claim 설정
      await admin.auth().setCustomUserClaims(uid, {
        phoneNumber: phoneNumber,
        phoneVerified: true
      });

      res.json({ 
        success: true, 
        message: 'Phone number claim set successfully' 
      });
    } catch (error: any) {
      console.error('Error setting phone claim:', error);
      res.status(500).json({ 
        error: 'Failed to set phone claim', 
        message: error.message 
      });
    }
  });





  // GET /api/naver-total?q=키워드  => { total: number }
  app.get('/api/naver-total', async (req, res) => {
    const query = req.query.q as string | undefined;
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter q' });
    }

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Server not configured with NAVER API credentials' });
    }

    try {
      const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=1&start=1`;
      const resp = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });
      if (!resp.ok) {
        const text = await resp.text();
        return res.status(resp.status).json({ error: 'naver api error', detail: text });
      }
      const data = await resp.json();
      const total = data.total ?? 0;
      res.json({ total });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'failed to fetch naver api' });
    }
  });

  // POST /api/generate-name { query, keyword, keywordCount, exampleNames }
  app.post('/api/generate-name', generateNameLimiter, async (req, res) => {
    const { query, keyword, keywordCount } = req.body || {};

    if (!query || !keyword || !keywordCount || isNaN(Number(keywordCount)) || Number(keywordCount) <= 0) {
      return res.status(400).json({ error: 'Missing or invalid required fields' });
    }
    const keywordCountNum = Number(keywordCount);
    
    // 환경변수에서만 API 키 가져오기 (하드코딩된 키 제거)
    const apiKey = process.env.CLAUDE_API_KEY;
    
    if (!apiKey) {
      console.error('[generate-name] Claude API key not configured in environment variables');
      return res.status(500).json({ 
        error: 'Claude API key not configured', 
        detail: 'Please set CLAUDE_API_KEY environment variable' 
      });
    }



    // 중복요청 병합 및 캐시 키
    const reqKey = JSON.stringify({ query, keyword, keywordCountNum });

    // ===== 캐시 및 중복 병합 로직 제거 =====
    // (동일 파라미터에 대해서도 항상 새로운 결과를 생성하도록 수정)
    /*
    // 캐시 확인
    const cached = generateNameCache.get(reqKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.value);
    }

    // 진행 중 요청 병합
    const existingPromise = inFlightGenerateName.get(reqKey);
    if (existingPromise) {
      try {
        const merged = await existingPromise;
        return res.json(merged);
      } catch (e) {
        // 진행중 요청 실패 시 계속 진행하여 새 시도
      }
    }
    */

    // 클라이언트 준비
    const client = new Anthropic({ apiKey, maxRetries: 2 });

    // 재시도 로직 헬퍼
    const shouldRetryClaudeError = (error: any): boolean => {
      const status = error?.status ?? error?.statusCode;
      const type = error?.error?.error?.type || error?.error?.type;
      const message: string = error?.message || '';
      const headers = error?.headers;
      let xShouldRetry = false;
      try {
        if (headers?.get) xShouldRetry = headers.get('x-should-retry') === 'true';
        else if (typeof headers?.['x-should-retry'] !== 'undefined') xShouldRetry = headers['x-should-retry'] === 'true';
      } catch {}
      const overloaded = status === 529 || type === 'overloaded_error' || message.includes('overloaded');
      const transient = status === 408 || status === 409 || status === 425 || status === 429 || (status >= 500 && status < 600);
      return xShouldRetry || overloaded || transient;
    };

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const callClaudeWithRetry = async (): Promise<{ productName: string; reason: string }> => {
      console.log('[generate-name] AI API 호출 파라미터:', { query, keyword, keywordCount });
      
      const prompt = `
      ## 목표
      네이버 스마트스토어 상위노출 최적화 포괄적 상품명 1개 생성

      ## 입력값
        - **필수 키워드: ${query}**
        - **상위 키워드: ${keyword}**

      ## 상품명 생성 규칙 (매우 중요)
        - **입력값에 제공된 단어만 사용할 것 (새로운 단어 생성 금지)**
        - **입력값의 단어, 띄어쓰기 등 원본 그대로 사용 (어떠한 형태도 변경 금지)**
        - **$필수 키워드 단어는 반드시 모두 원본 형태 그대로 각각 단독 개별 사용 (단어 대체, 변형, 생략, 포함 금지)**
        - 정확히 ${keywordCount}개의 단어만 사용 
        - 동일 단어 반복 금지 (단, 필수 키워드와 동일 단어는 비연속 배치해서 반복 가능)
        - **동일 단어는 비연속 배치**
        - 상위 키워드 배열 순서가 중요도 순서
        - 지역은 하나만 사용
        - 상품명 구성 순서 준수

      ## 상품명 구성 순서
        * 해당 항목이 없는 경우 생략하고 상위 키워드 순서대로 키워드 선택
        1.브랜드/제조사
        2.시리즈
        3.필수 키워드
        4.모델명
        4.다양한 상품 유형
        5.색상
        6.소재 
        7.수량/용량 
        8.사이즈 
        9.성별/나이 
        10.속성
    
        ## 출력 형식:
        상품명: [상품명]
        최적화 이유: [번호 매겨 최적화 근거와 전략 자세히 설명]`;

      const request = {
        model: 'claude-3-5-haiku-20241022',
        temperature: 0.2,
        top_p: 0.2,
        max_tokens: 500,
        system: '너는 규칙을 준수하는 네이버 스마트스토어 SEO 전문가.',
        messages: [
          { role: 'user', content: [{ type: 'text', text: prompt }] },
        ] as any,
      } as const;

      const maxAttempts = Number(process.env.GENERATE_NAME_MAX_ATTEMPTS || 5);
      const baseDelay = Number(process.env.GENERATE_NAME_BASE_DELAY_MS || 300);
      const maxDelay = Number(process.env.GENERATE_NAME_MAX_DELAY_MS || 4000);

      let lastError: any = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (attempt > 1) {
            const pow = Math.min(attempt - 1, 6);
            const jitter = 0.7 + Math.random() * 0.6; // 0.7x ~ 1.3x
            const delay = Math.min(maxDelay, Math.round(baseDelay * Math.pow(2, pow) * jitter));
            await wait(delay);
          }

          const response = await client.messages.create(request as any);

          const firstContent = (response as any).content?.[0];
          const aiResponse = firstContent && firstContent.type === 'text' ? firstContent.text.trim() : '';
          
          if (!aiResponse) {
            throw new Error('Empty response from Claude');
          }

          const productNameMatch = aiResponse.match(/상품명:\s*(.+?)(?=\n|$)/);
          const reasonMatch = aiResponse.match(/(?:##?\s*)?최적화 이유:\s*([\s\S]+)$/);
          const productName = productNameMatch?.[1]?.trim() || '';
          const reasonDetails = reasonMatch?.[1]?.trim() || '';
          
          if (!productName) {
            throw new Error('Failed to parse product name');
          }

          let reason = reasonDetails + '\n\n* 네이버 상품명 SEO 규칙 준수 "브랜드/제조사-시리즈-모델명-상품 유형-색상-소재-패키지 수량-사이즈-성별 나이 표현-속성-판매옵션" 순서로 조합.';
          // 숫자. 패턴(1. 2. 등)을 기준으로 줄바꿈 삽입
          reason = reason.replace(/(\d+\.)/g, '\n$1').replace(/^\n/, '').trim();

          return { productName, reason };
        } catch (err: any) {
          lastError = err;
          if (attempt < maxAttempts && shouldRetryClaudeError(err)) {
            continue;
          }
          break;
        }
      }
      throw lastError || new Error('Claude call failed');
    };

    // 동시성 제한 내에서 실행 (세마포어)
    const release = await generateNameSemaphore.acquire();

    const taskPromise = (async () => {
      try {
        const result = await callClaudeWithRetry();
        // 캐시 저장
        generateNameCache.set(reqKey, { value: result, expiresAt: Date.now() + GENERATE_NAME_CACHE_TTL_MS });
        return result;
      } finally {
        release();
      }
    })();

    inFlightGenerateName.set(reqKey, taskPromise);

    try {
      const result = await taskPromise;
      return res.json(result);
    } catch (err) {
      console.error('[generate-name] Claude API error detail', err);
      const error: any = err as any;
      if (error?.status === 401) {
        return res.status(500).json({ 
          error: 'Claude API 인증 실패', 
          detail: 'API 키가 유효하지 않습니다. 새로운 API 키가 필요합니다.' 
        });
      } else if (error?.status === 429 || error?.status === 529 || (error?.message || '').includes('overloaded')) {
        res.set('Retry-After', '2');
        return res.status(529).json({ error: 'Claude API 과부하 상태입니다. 잠시 후 다시 시도해주세요.' });
      } else if ((error?.status ?? 0) >= 500) {
        res.set('Retry-After', '2');
        return res.status(529).json({ error: '서버 오류' });
      }
      return res.status(500).json({ 
        error: '상품명 생성 실패', 
        detail: error?.message || '알 수 없는 오류'
      });
    } finally {
      inFlightGenerateName.delete(reqKey);
    }
  });

  // 이메일 인증 메일 전송
  app.post('/api/send-verification-email', async (req, res) => {
    const { email } = req.body as { email?: string };

    if (!email) {
      return res.status(400).json({ error: 'email field is required' });
    }

    try {
      await sendVerificationEmail(email);
      res.json({ success: true });
    } catch (err: unknown) {
      console.error('[send-verification-email] error', err);
      // err를 any로 단언하여 세부 메세지 추출
      const error = err as any;
      res.status(500).json({ error: 'failed to send email', detail: error?.message || 'unknown' });
    }
  });

  // Keyword competition analysis
  app.get('/api/keyword-competition', async (req, res) => {
    console.log('=== [keyword-competition] API 호출 시작 ===');
    console.log('raw query:', req.url);
    console.log('parsed keyword:', req.query);
    {
      const { authorization, Authorization, cookie, Cookie, ...safeHeaders } = (req.headers as Record<string, any>);
      console.log('headers:', safeHeaders);
    }
    
    const keyword = (req.query.keyword as string || '').trim();
    console.log('trimmed keyword:', keyword);
    
    if (!keyword) {
      console.error('[keyword-competition] Missing keyword parameter');
      return res.status(400).json({ error: 'Missing query parameter keyword' });
    }

    const apiKey = process.env.NAVER_AD_API_KEY; // 액세스 라이선스 ID
    const apiSecret = process.env.NAVER_AD_API_SECRET; // 비밀키
    const customerId = process.env.NAVER_AD_CUSTOMER_ID; // CUSTOMER_ID

    console.log('[keyword-competition] 환경변수 확인:', {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      hasCustomerId: !!customerId,
      apiKeyLength: apiKey?.length || 0,
      apiSecretLength: apiSecret?.length || 0,
      customerIdLength: customerId?.length || 0,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 10) : 'undefined',
      apiSecretPrefix: apiSecret ? apiSecret.substring(0, 10) : 'undefined',
      customerIdPrefix: customerId ? customerId.substring(0, 10) : 'undefined',
      nodeEnv: process.env.NODE_ENV,
      allEnvVars: Object.keys(process.env).filter(key => key.includes('NAVER'))
    });

    if (!apiKey || !apiSecret || !customerId) {
      console.error('[keyword-competition] Missing Naver SearchAd API env vars');
      return res.status(500).json({ error: 'Server not configured with Naver SearchAd API credentials' });
    }

    try {
      const queryString = `hintKeywords=${encodeURIComponent(keyword)}`;
      const requestPath = `/keywordstool`; // Signature는 쿼리 스트링 제외
      const url = `https://api.searchad.naver.com${requestPath}?${queryString}`;

      const timestamp = Date.now().toString();
      const signatureBase = `${timestamp}.GET.${requestPath}`; // /keywordstool 만 포함
      const signature = crypto.createHmac('sha256', apiSecret).update(signatureBase).digest('base64');

      console.log('[keyword-competition] 네이버 API 요청 정보:', {
        url: url,
        timestamp: timestamp,
        signatureBase: signatureBase,
        signatureLength: signature.length,
        requestPath: requestPath,
        queryString: queryString
      });

      console.log('[keyword-competition] 요청 헤더:', {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-API-KEY': apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined',
        'X-Customer': customerId,
        'X-Timestamp': timestamp,
        'X-Signature': signature ? `${signature.substring(0, 10)}...` : 'undefined'
      });

      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-API-KEY': apiKey,
          'X-Customer': customerId,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
        },
      });

      console.log('[keyword-competition] 네이버 API 응답 상태:', {
        status: resp.status,
        statusText: resp.statusText,
        ok: resp.ok,
        headers: Object.fromEntries(resp.headers.entries())
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('[keyword-competition] 네이버 API 오류 응답:', {
          status: resp.status,
          statusText: resp.statusText,
          responseText: text,
          responseHeaders: Object.fromEntries(resp.headers.entries())
        });
        return res.status(resp.status).json({ error: 'naver api error', detail: text });
      }

      const data = await resp.json();
      
      // 네이버 API 응답 디버깅 로그
      console.log('[keyword-competition] 네이버 API 성공 응답:', {
        keyword: keyword,
        responseStatus: resp.status,
        keywordListLength: data?.keywordList?.length || 0,
        keywordList: data?.keywordList || [],
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        fullResponse: JSON.stringify(data, null, 2)
      });
      
      console.log('[keyword-competition] API 호출 성공 완료');
      res.json(data);
    } catch (err: any) {
      console.error('[keyword-competition] 네이버 API 호출 중 예외 발생:', {
        error: err,
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
        code: err?.code
      });
      res.status(500).json({ error: 'failed to fetch naver api', detail: err?.message || 'unknown' });
    } finally {
      console.log('=== [keyword-competition] API 호출 종료 ===');
    }
  });

  /* ---------------------------------
   * GET /api/keyword-analysis?keyword=키워드
   * 네이버 쇼핑 검색 API를 호출해 상품 타이틀를 수집하고 키워드 빈도수를 요약합니다.
   * 프론트엔드에서는 키워드 섹션만 사용하지만, 향후 확장을 위해 tags/categories 등도 전달합니다.
   * ---------------------------------*/

  app.get('/api/keyword-analysis', async (req, res) => {
    try {
      const keyword = (req.query.keyword as string | undefined)?.trim();
      if (!keyword) {
        return res.status(400).json({ error: 'Missing keyword parameter' });
      }

      const pagingIndex = 1;
      const pagingSize = 40;

      const shoppingApi = `https://search.shopping.naver.com/api/search/all?sort=rel&pagingIndex=${pagingIndex}&pagingSize=${pagingSize}&viewType=list&productSet=total&query=${encodeURIComponent(keyword)}`;

      const resp = await fetch(shoppingApi, {
        headers: {
          Accept: 'application/json',
          Referer: `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}`
        }
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error('[keyword-analysis] naver api error', resp.status, txt);
        return res.status(resp.status).json({ error: 'naver shopping api error', detail: txt });
      }

      const data = await resp.json();

      const products = data?.shoppingResult?.products ?? [];

      interface KeywordMap { [k: string]: number; }
      const keywordMap: KeywordMap = {};

      const cleanWord = (w: string) => w
        .replace(/[\/,]/g, ' ')
        .replace(/[(){}\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const addKeyword = (kw: string) => {
        if (!kw) return;
        keywordMap[kw] = (keywordMap[kw] || 0) + 1;
      };

      for (const p of products) {
        const title: string = p.productTitle || '';
        if (!title) continue;
        const rawWords = cleanWord(title).split(' ');
        rawWords.forEach((w) => {
          const word = w.toUpperCase();
          // 1글자, 특수문자만, 숫자 단독은 제외
          if (word.length < 2) return;
          if (/^[0-9]+$/.test(word)) return;
          addKeyword(word);
        });
      }

      const keywords = Object.entries(keywordMap)
        .map(([k, v]) => ({ key: k, value: v }))
        .sort((a, b) => b.value - a.value);

      res.json({
        keywords,
        tags: [], // 추후 확장용
        keywordCounts: {},
        categories: [],
        categoriesDetailed: [],
        productsCount: products.length,
        fetchedAt: Date.now()
      });
    } catch (err: any) {
      console.error('[keyword-analysis] unexpected error', err);
      res.status(500).json({ error: 'internal server error', detail: err?.message || 'unknown' });
    }
  });

  /* ------------------------------------------------------------------
   * 네이버 OAuth 2.0 로그인
   * ------------------------------------------------------------------ */

  // 1) 인가 코드 요청 (302 redirect)  
  //    * 혹시 네이버 측 redirect_uri 가 잘못 등록돼 콜백이 이 경로로 다시 오더라도
  //      query.code 가 있으면 콜백 처리로 넘긴다.
  app.get("/api/auth/naver", (req, res, next) => {
    if (req.query.code) {
      // 잘못된 redirect_uri 로 인해 /api/auth/naver 로 콜백된 경우
      console.log("[NAVER-OAUTH] Callback received on /api/auth/naver – forwarding to /api/auth/naver/callback");
      const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
      return res.redirect(`/api/auth/naver/callback${queryString}`);
    }

    const clientId = process.env.NAVER_CLIENT_ID;
    // redirectUri: 항상 /callback 으로 고정 (env 무시)
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/naver/callback`;
    
    if (!clientId || !redirectUri) {
      console.error("[NAVER-OAUTH] Missing env NAVER_CLIENT_ID");
      return res.status(500).send("naver oauth env not set");
    }

    // 계정 병합 정보 저장
    const merge = req.query.merge === 'true';
    const emailUid = req.query.emailUid as string;
    const email = req.query.email as string;
    
    const state = crypto.randomUUID();
    naverOAuthStates.set(state, { 
      merge, 
      emailUid, 
      email 
    });

    const authUrl =
      "https://nid.naver.com/oauth2.0/authorize?response_type=code" +
      `&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    console.log("[NAVER-OAUTH] Redirecting to:", authUrl);
    return res.redirect(authUrl);
  });

  // 2) 콜백 – 토큰 교환 후 프로필 조회
  app.get("/api/auth/naver/callback", async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };

    console.log("[NAVER-OAUTH] Callback query:", req.query);

    if (!code || !state || !naverOAuthStates.has(state)) {
      console.error("[NAVER-OAUTH] Invalid state or missing code");
      return res.status(400).send("invalid state or code");
    }

    // state 일회성 사용 후 제거
    const stateData = naverOAuthStates.get(state);
    naverOAuthStates.delete(state);

    try {
      const clientId = process.env.NAVER_CLIENT_ID!;
      const clientSecret = process.env.NAVER_CLIENT_SECRET!;
      // token 교환 시에도 인가 요청에 사용했던 redirect_uri 와 동일해야 함
      // 스테이징/로컬 등 멀티 도메인 환경을 고려해 고정 env 값 대신 동적으로 계산한다.
      const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/naver/callback`;

      const tokenURL =
        "https://nid.naver.com/oauth2.0/token" +
        `?grant_type=authorization_code` +
        `&client_id=${clientId}` +
        `&client_secret=${clientSecret}` +
        `&code=${code}` +
        `&state=${state}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`;

      console.log("[NAVER-OAUTH] Token URL:", tokenURL);

      const tokenRes = await fetch(tokenURL, { method: "GET" });
      console.log("[NAVER-OAUTH] Token res status:", tokenRes.status);
      const tokenJson = await tokenRes.json();
      
      if (!tokenJson.access_token) {
        return res.status(500).send("failed to get access token");
      }

      const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      console.log("[NAVER-OAUTH] Profile res status:", profileRes.status);
      const profileJson = await profileRes.json();
      
      const { id: naverId, email, nickname, name, mobile_e164, mobile, age, birthday, birthyear } = profileJson.response || {};
      const phoneFromProfile = mobile_e164 || mobile || "";
      
      // 생년월일 정보 처리
      let birthDate = "";
      if (birthday && birthyear) {
        // birthday: '06-01', birthyear: '1995' -> '950601'
        const [month, day] = birthday.split('-');
        const year = birthyear.slice(-2); // 1995 -> 95
        birthDate = `${year}${month}${day}`;
      }

      if (!naverId || !email) {
        console.error("[NAVER-OAUTH] Missing id/email from profile");
        return res.status(500).send("naver profile missing id/email");
      }

      // 최근 탈퇴한 계정(이메일/휴대폰) 재가입 제한 체크 (30일)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const deletionsRef = admin.firestore().collection("accountDeletions");
      
      // 이메일로 최근 탈퇴 확인
      let recentDeletionFound = false;
      if (email) {
        const qEmail = deletionsRef.where("email", "==", email);
        const emailSnaps = await qEmail.get();
        emailSnaps.forEach((d) => {
          const data = d.data() as any;
          const ts: any = data.timestamp;
          if (ts) {
            const deletedAt = ts.toDate ? ts.toDate() : new Date(ts);
            if (deletedAt > thirtyDaysAgo) {
              recentDeletionFound = true;
            }
          }
        });
      }

      // 휴대폰 번호로 최근 탈퇴 확인
      if (!recentDeletionFound && phoneFromProfile) {
        const qPhone = deletionsRef.where("number", "==", phoneFromProfile);
        const phoneSnaps = await qPhone.get();
        phoneSnaps.forEach((d) => {
          const data = d.data() as any;
          const ts: any = data.timestamp;
          if (ts) {
            const deletedAt = ts.toDate ? ts.toDate() : new Date(ts);
            if (deletedAt > thirtyDaysAgo) {
              recentDeletionFound = true;
            }
          }
        });
      }

      if (recentDeletionFound) {
        console.log("[NAVER-OAUTH] Recent account deletion detected for email:", email, "or phone:", phoneFromProfile);
        return res.redirect("/login?error=recent-deletion&message=최근 탈퇴한 계정은 30일 이후에 재가입할 수 있습니다.");
      }

      /* ----------------------------------------------
       * Firebase 계정은 휴대폰 본인 인증 완료 후 생성하도록 지연합니다.
       * 따라서 여기서는 사용자 레코드를 사전 생성하지 않고 Custom Token 만 발급합니다.
       * 만약 이미 존재하는 UID 라면 getUser 가 성공하겠지만, 존재하지 않더라도
       * createCustomToken 은 문제없이 동작하며 최초 signIn 시 계정이 자동으로 생성됩니다.
       * ------------------------------------------- */
      const uid = `naver_${naverId}`;

      // 이미 존재하는 사용자인지 확인하면서 phoneNumber 도 함께 가져옵니다.
      let userRecord: admin.auth.UserRecord | null = null;
      try {
        userRecord = await admin.auth().getUser(uid);
      } catch (e: any) {
        if (e?.code !== "auth/user-not-found") {
          throw e;
        }
        // user-not-found인 경우에는 계정을 미리 만들지 않는다.
      }

      const db = admin.firestore();
      let phoneVerified = !!userRecord?.phoneNumber;
      if (!phoneVerified) {
        try {
          const snap = await db.collection("usersInfo").doc(uid).get();
          phoneVerified = snap.exists && !!snap.data()?.number;
        } catch (err) {
          console.warn("[NAVER-OAUTH] Firestore read error", err);
        }
      }

      // --- Save Naver access token for future unlink ---
      try {
        await db.collection("socialTokens").doc(uid).set({
          provider: "naver",
          accessToken: tokenJson.access_token,
          refreshToken: tokenJson.refresh_token || "",
          naverId,
          savedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (tokenErr) {
        console.warn("[NAVER-OAUTH] Failed to store social token", tokenErr);
      }

      const customToken = await admin.auth().createCustomToken(uid);

      // phoneVerified 여부에 따라 skip 플래그 결정
      const params: Record<string,string> = {
        token: customToken,
        email,
        name: name || "",
        provider: "naver",
      };
      if (phoneVerified) params.skip = "1";
      if (age) params.age = age;
      if (birthDate) params.birthDate = birthDate;
      // 소셜에서 가져온 전화번호 정보 전달
      if (phoneFromProfile) params.socialPhone = phoneFromProfile;

      // 계정 병합 정보가 있으면 추가
      if (stateData?.merge && stateData?.emailUid && stateData?.email) {
        params.merge = 'true';
        params.emailUid = stateData.emailUid;
        params.email = stateData.email;
      }

      const qs = new URLSearchParams(params).toString();
      const redirectUrl = `/naver-onboarding#${qs}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("[NAVER-OAUTH] Callback error:", err);
      return res.status(500).send("naver oauth error");
    }
  });

  // ===== Kakao 간편 로그인 =====
  const kakaoOAuthStates: Map<string, {
    merge?: boolean;
    emailUid?: string;
    email?: string;
  }> = new Map();

  // Kakao auth request
  app.get("/api/auth/kakao", (req, res) => {
    if (req.query.code) {
      // redirect misuse
      return res.redirect(`/api/auth/kakao/callback${req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""}`);
    }

    const clientId = process.env.KAKAO_CLIENT_ID;
    if (!clientId) return res.status(500).send("kakao env");

    // 계정 병합 정보 저장
    const merge = req.query.merge === 'true';
    const emailUid = req.query.emailUid as string;
    const email = req.query.email as string;

    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/kakao/callback`;
    const state = crypto.randomUUID();
    kakaoOAuthStates.set(state, { merge, emailUid, email });

    const authUrl =
      `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    console.log("[KAKAO-OAUTH] Redirecting to", authUrl);
    res.redirect(authUrl);
  });

  // Kakao callback
  app.get("/api/auth/kakao/callback", async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || !kakaoOAuthStates.has(state)) return res.status(400).send("invalid");
    
    // state 일회성 사용 후 제거
    const stateData = kakaoOAuthStates.get(state);
    kakaoOAuthStates.delete(state);

    try {
      const clientId = process.env.KAKAO_CLIENT_ID!;
      const clientSecret = process.env.KAKAO_CLIENT_SECRET;
      const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/kakao/callback`;

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code: code as string,
      });
      if (clientSecret) body.append("client_secret", clientSecret);

      const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const tokenJson = await tokenRes.json();
      
      if (!tokenJson.access_token) return res.status(500).send("no access token");

      const profRes = await fetch("https://kapi.kakao.com/v2/user/me", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const prof = await profRes.json();
      
      const kakaoId = prof.id;
      const kakaoAcc = prof.kakao_account || {};
      const email = kakaoAcc.email || "";
      const nickname = kakaoAcc.profile?.nickname || "";
      const name = kakaoAcc.name || nickname;
      const phoneNumber = kakaoAcc.phone_number || "";
      const age = kakaoAcc.age_range || "";
      const birthday = kakaoAcc.birthday || "";
      const birthyear = kakaoAcc.birthyear || "";
      
      // 생년월일 정보 처리 (카카오)
      let birthDate = "";
      if (birthday && birthyear) {
        // birthday: '0601', birthyear: '1995' -> '950601'
        const month = birthday.slice(0, 2); // '06'
        const day = birthday.slice(2, 4); // '01'
        const year = birthyear.slice(-2); // 1995 -> 95
        birthDate = `${year}${month}${day}`;
      }

      if (!kakaoId) return res.status(500).send("missing id");
      const uid = `kakao_${kakaoId}`;

      // 최근 탈퇴한 계정(이메일/휴대폰) 재가입 제한 체크 (30일)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const deletionsRef = admin.firestore().collection("accountDeletions");
      
      // 이메일로 최근 탈퇴 확인
      let recentDeletionFound = false;
      if (email) {
        const qEmail = deletionsRef.where("email", "==", email);
        const emailSnaps = await qEmail.get();
        emailSnaps.forEach((d) => {
          const data = d.data() as any;
          const ts: any = data.timestamp;
          if (ts) {
            const deletedAt = ts.toDate ? ts.toDate() : new Date(ts);
            if (deletedAt > thirtyDaysAgo) {
              recentDeletionFound = true;
            }
          }
        });
      }

      // 휴대폰 번호로 최근 탈퇴 확인
      if (!recentDeletionFound && phoneNumber) {
        const qPhone = deletionsRef.where("number", "==", phoneNumber);
        const phoneSnaps = await qPhone.get();
        phoneSnaps.forEach((d) => {
          const data = d.data() as any;
          const ts: any = data.timestamp;
          if (ts) {
            const deletedAt = ts.toDate ? ts.toDate() : new Date(ts);
            if (deletedAt > thirtyDaysAgo) {
              recentDeletionFound = true;
            }
          }
        });
      }

      if (recentDeletionFound) {
        console.log("[KAKAO-OAUTH] Recent account deletion detected for email:", email, "or phone:", phoneNumber);
        return res.redirect("/login?error=recent-deletion&message=최근 탈퇴한 계정은 30일 이후에 재가입할 수 있습니다.");
      }

      // 사전 계정 생성 없이 존재 여부만 확인
      try { await admin.auth().getUser(uid);} catch(e:any){ if(e?.code!=="auth/user-not-found") throw e; }

      // phone verify 여부 확인: Auth 레코드 phoneNumber → Firestore number 순으로 검사
      const db = admin.firestore();
      let phoneVerified = false;
      try {
        const userRec = await admin.auth().getUser(uid);
        phoneVerified = !!userRec.phoneNumber;
      } catch (e:any) {
        if (e?.code !== "auth/user-not-found") console.warn("[KAKAO-OAUTH] getUser error", e);
      }
      if (!phoneVerified) {
        try {
          const snap = await db.collection("usersInfo").doc(uid).get();
          phoneVerified = snap.exists && !!snap.data()?.number;
        } catch (err) {
          console.warn("[KAKAO-OAUTH] Firestore read error", err);
        }
      }

      // --- Save Kakao token for future unlink ---
      try {
        await db.collection("socialTokens").doc(uid).set({
          provider: "kakao",
          accessToken: tokenJson.access_token,
          refreshToken: tokenJson.refresh_token || "",
          kakaoId,
          savedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (tokenErr) {
        console.warn("[KAKAO-OAUTH] Failed to store social token", tokenErr);
      }

      const cToken = await admin.auth().createCustomToken(uid);
      const params: Record<string,string> = { token: cToken, email, name, provider: "kakao" };
      if (phoneVerified) params.skip = "1";
      if (age) params.age = age;
      if (birthDate) params.birthDate = birthDate;
      // 소셜에서 가져온 전화번호 정보 전달
      if (phoneNumber) params.socialPhone = phoneNumber;
      
      // 계정 병합 정보가 있으면 추가
      if (stateData?.merge && stateData?.emailUid && stateData?.email) {
        params.merge = 'true';
        params.emailUid = stateData.emailUid;
        params.email = stateData.email;
      }
      
      const qs = new URLSearchParams(params).toString();
      res.redirect(`/naver-onboarding#${qs}`);
    } catch(err){
      console.error(err);
      res.status(500).send("kakao error");
    }
  });

  /* -------------------------- 소셜 연결 해제 -------------------------- */
  app.post("/api/auth/naver/unlink", async (req, res) => {
    try {
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      const { uid } = req.body as { uid?: string };
      if (!uid) return res.status(400).json({ error: "uid required" });
      if (authUid !== uid) return res.status(403).json({ error: 'Forbidden', message: 'uid mismatch' });
      const docSnap = await admin.firestore().doc(`socialTokens/${uid}`).get();
      if (!docSnap.exists) return res.status(404).json({ error: "not found" });
      const data = docSnap.data() as any;
      const accessToken = data?.accessToken;
      if (!accessToken) return res.status(400).json({ error: "no token" });

      const clientId = process.env.NAVER_CLIENT_ID;
      const clientSecret = process.env.NAVER_CLIENT_SECRET;
      const url = `https://nid.naver.com/oauth2.0/token?grant_type=delete&client_id=${clientId}&client_secret=${clientSecret}&access_token=${accessToken}&service_provider=NAVER`;
      const resp = await fetch(url);
      console.log("[NAVER UNLINK] status", resp.status);
      return res.json({ success: resp.ok });
    } catch (e:any) {
      console.error("[NAVER UNLINK] error", e);
      res.status(500).json({ error: "unlink error", detail: e?.message });
    }
  });

  app.post("/api/auth/kakao/unlink", async (req, res) => {
    try {
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      const { uid } = req.body as { uid?: string };
      if (!uid) return res.status(400).json({ error: "uid required" });
      if (authUid !== uid) return res.status(403).json({ error: 'Forbidden', message: 'uid mismatch' });
      const docSnap = await admin.firestore().doc(`socialTokens/${uid}`).get();
      if (!docSnap.exists) return res.status(404).json({ error: "not found" });
      const data = docSnap.data() as any;
      const kakaoId = data?.kakaoId;
      if (!kakaoId) return res.status(400).json({ error: "no kakaoId" });
      const adminKey = process.env.KAKAO_ADMIN_KEY;
      const resp = await fetch("https://kapi.kakao.com/v1/user/unlink", {
        method: "POST",
        headers: {
          Authorization: `KakaoAK ${adminKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `target_id_type=user_id&target_id=${kakaoId}`,
      });
      console.log("[KAKAO UNLINK] status", resp.status);
      return res.json({ success: resp.ok });
    } catch (e:any) {
      console.error("[KAKAO UNLINK] error", e);
      res.status(500).json({ error: "unlink error", detail: e?.message });
    }
  });

  /* -------------------- socialTokens 서버 삭제 API -------------------- */
  app.post("/api/auth/social-tokens/delete", async (req, res) => {
    try {
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      const { uid } = req.body as { uid?: string };
      if (!uid) return res.status(400).json({ error: "uid required" });
      if (uid !== authUid) return res.status(403).json({ error: "Forbidden", message: "uid mismatch" });

      const docRef = admin.firestore().doc(`socialTokens/${uid}`);
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.delete();
      }
      return res.json({ success: true });
    } catch (e: any) {
      console.error("[SOCIAL-TOKENS:DELETE] error", e);
      return res.status(500).json({ error: "failed", detail: e?.message });
    }
  });

  /* -------------------------- 나이스페이 빌키발급 -------------------------- */
  
  // 웹훅 테스트 엔드포인트 (비프로덕션 전용, 단일 경로로 통합)





  
  // 빌키 발급 요청 (나이스페이 공식 문서 준수)
  app.post("/api/nicepay/billing-key", async (req, res) => {
    try {
      console.log("=== 빌키 발급 요청 시작 ===");
      // 민감한 정보 제거하고 로깅
      const { uid, cardNo, expYear, expMonth, idNo, cardPw } = req.body;
      console.log("요청 정보:", { 
        uid, 
        cardNo: maskCardNumber(cardNo || ''),
        expYear: maskSensitiveData(expYear || ''),
        expMonth: maskSensitiveData(expMonth || ''),
        idNo: maskSensitiveData(idNo || ''),
        cardPw: '**'
      });

      // 인증 및 권한 확인
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      if (uid !== authUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'UID mismatch' });
      }
      
      // 필수 필드 검증
      if (!uid || !cardNo || !expYear || !expMonth || !idNo || !cardPw) {
        console.error("필수 필드 누락:", { 
          uid, 
          cardNo: cardNo ? "있음" : "없음", 
          expYear: expYear ? "있음" : "없음", 
          expMonth: expMonth ? "있음" : "없음", 
          idNo: idNo ? "있음" : "없음", 
          cardPw: cardPw ? "있음" : "없음" 
        });
        return res.status(400).json({ 
          error: "Missing required fields", 
          message: "uid, cardNo, expYear, expMonth, idNo, cardPw are required" 
        });
      }

      // 민감한 정보 로깅 제거
      console.log("빌키 발급 요청 - 사용자:", uid);

      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      
      if (!clientId || !secretKey) {
        console.error("NicePay 인증 정보가 설정되지 않음");
        return res.status(500).json({ error: "NicePay credentials not configured" });
      }

      const orderId = `BILL_${Date.now()}_${uid}`;
      
      // 카드 정보 암호화 (AES-128)
      const plainText = `cardNo=${cardNo}&expYear=${expYear}&expMonth=${expMonth}&idNo=${idNo}&cardPw=${cardPw}`;
      const encryptionKey = secretKey.substring(0, 16); // SecretKey 앞 16자리
      
      // 민감한 정보 최소 로깅
      console.log("암호화 정보:", {
        plainTextLength: plainText.length,
        encryptionKeyLength: encryptionKey.length
      });

      // AES-128 암호화 (AES/ECB/PKCS5padding)
      const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(encryptionKey), null);
      let encData = cipher.update(plainText, 'utf8', 'hex');
      encData += cipher.final('hex');

      console.log("암호화 완료:", {
        encDataLength: encData.length
      });

      // ediDate 생성
      const ediDate = new Date().toISOString();
      
      // signData 생성
      const signData = crypto.createHash('sha256')
        .update(orderId + ediDate + secretKey)
        .digest('hex');

      // 빌키 발급 API 요청
      const billingKeyRequestData = {
        encData: encData,
        orderId: orderId,
        ediDate: ediDate,
        signData: signData
      };

      console.log("빌키 발급 API 요청 데이터:", {
        orderId: billingKeyRequestData.orderId,
        ediDate: billingKeyRequestData.ediDate,
        signDataLength: billingKeyRequestData.signData.length,
        encDataLength: billingKeyRequestData.encData.length
      });

      const authHeader = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
      
      console.log("API 호출 시작:", 'https://api.nicepay.co.kr/v1/subscribe/regist');
      
      const response = await fetch('https://api.nicepay.co.kr/v1/subscribe/regist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify(billingKeyRequestData)
      });

      console.log("API 응답 상태:", response.status);
      const result = await response.json();
      console.log("빌키 발급 API 응답 수신");

      if (response.ok && result.resultCode === '0000') {
        // 빌키 발급 성공
        const db = admin.firestore();
        // 서버 보호용 빌키만 저장
        await db.collection("billingKeys").doc(uid).set({
          billingKey: result.bid,
          orderId: orderId,
          status: "ACTIVE",
          tid: result.tid,
          authDate: result.authDate,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 클라이언트 표시용 카드 정보는 별도 컬렉션에 저장
        await db.collection("billingCards").doc(uid).set({
          cardName: result.cardName,
          cardNo: maskCardNumber(cardNo),
          cardNoPrefix: cardNo.substring(0, 2),
          authDate: result.authDate,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log("=== 빌키 발급 완료 ===");
        res.json({
          success: true,
          message: "빌키가 성공적으로 발급되었습니다.",
        });
      } else {
        console.error("빌키 발급 실패:", result);
        const userMessage = (() => {
          switch (result.resultCode) {
            case 'F113':
              return '본인의 신용카드 확인중 오류가 발생하였습니다 올바른 정보를 입력해주세요';
            case 'F112':
              return '유효하지않은 카드번호를 입력하셨습니다 (card_bin 없음)';
            default:
              return result.resultMsg || '빌키 발급에 실패했습니다.';
          }
        })();
        res.status(400).json({
          success: false,
          error: userMessage,
          code: result.resultCode,
        });
      }

    } catch (error: any) {
      console.error("=== 빌키 발급 요청 에러 ===");
      console.error("에러:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: "빌키 발급 중 오류가 발생했습니다." 
      });
    }
  });



  // 빌키 발급 테스트 엔드포인트 (API 방식)
  app.post("/api/nicepay/billing-key/test", async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: "Access denied in production" });
    }
    try {
      console.log("=== 빌키 발급 테스트 시작 ===");
      console.log("요청 본문 수신");
      
      const { uid, cardNo, expYear, expMonth, idNo, cardPw } = req.body;
      
      // 필수 필드 검증
      if (!uid || !cardNo || !expYear || !expMonth || !idNo || !cardPw) {
        console.error("필수 필드 누락:", { uid, cardNo: cardNo ? "있음" : "없음", expYear, expMonth, idNo: idNo ? "있음" : "없음", cardPw: cardPw ? "있음" : "없음" });
        return res.status(400).json({ 
          error: "Missing required fields", 
          message: "uid, cardNo, expYear, expMonth, idNo, cardPw are required" 
        });
      }

      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      
      if (!clientId || !secretKey) {
        console.error("NicePay 인증 정보가 설정되지 않음");
        return res.status(500).json({ error: "NicePay credentials not configured" });
      }

      const orderId = `BILL_${Date.now()}_${uid}`;
      
      // 카드 정보 암호화 (AES-128)
      const plainText = `cardNo=${cardNo}&expYear=${expYear}&expMonth=${expMonth}&idNo=${idNo}&cardPw=${cardPw}`;
      const encryptionKey = secretKey.substring(0, 16); // SecretKey 앞 16자리
      
      console.log("암호화 정보:", {
        plainText: '***',
        encryptionKey: '***',
        encryptionKeyLength: encryptionKey.length
      });

      // AES-128 암호화 (AES/ECB/PKCS5padding)
      const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(encryptionKey), null);
      let encData = cipher.update(plainText, 'utf8', 'hex');
      encData += cipher.final('hex');

      console.log("암호화 완료:", {
        encDataLength: encData.length
      });

      // ediDate 생성
      const ediDate = new Date().toISOString();
      
      // signData 생성
      const signData = crypto.createHash('sha256')
        .update(orderId + ediDate + secretKey)
        .digest('hex');

      // 빌키 발급 API 요청
      const billingKeyRequestData = {
        encData: encData,
        orderId: orderId,
        ediDate: ediDate,
        signData: signData
      };

      console.log("빌키 발급 API 요청 데이터:", {
        orderId: billingKeyRequestData.orderId,
        ediDate: billingKeyRequestData.ediDate,
        signDataLength: billingKeyRequestData.signData.length,
        encDataLength: billingKeyRequestData.encData.length
      });

      const authHeader = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
      
      console.log("API 호출 시작:", 'https://api.nicepay.co.kr/v1/subscribe/regist');
      
      const response = await fetch('https://api.nicepay.co.kr/v1/subscribe/regist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify(billingKeyRequestData)
      });

      console.log("API 응답 상태:", response.status);
      const result = await response.json();
      console.log("빌키 발급 API 응답 수신");

      if (response.ok && result.resultCode === '0000') {
        // 빌키 발급 성공
        const db = admin.firestore();
        await db.collection("billingKeys").doc(uid).set({
          billingKey: result.bid,
          orderId: orderId,
          status: "ACTIVE",
          tid: result.tid,
          cardCode: result.cardCode,
          cardName: result.cardName,
          cardNo: maskCardNumber(cardNo), // 마스킹된 카드 번호 저장
          cardNoPrefix: cardNo.substring(0, 2), // 카드 번호 앞 2자리 저장
          authDate: result.authDate,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log("=== 빌키 발급 테스트 완료 ===");
        res.json({
          success: true,
          message: "빌키가 성공적으로 발급되었습니다.",
        });
      } else {
        console.error("빌키 발급 실패:", result);
        const userMessage = (() => {
          switch (result.resultCode) {
            case 'F113':
              return '본인의 신용카드 확인중 오류가 발생하였습니다 올바른 정보를 입력해주세요';
            case 'F112':
              return '유효하지않은 카드번호를 입력하셨습니다 (card_bin 없음)';
            default:
              return result.resultMsg || '빌키 발급에 실패했습니다.';
          }
        })();
        res.status(400).json({
          success: false,
          error: userMessage,
          code: result.resultCode,
        });
      }

    } catch (error: any) {
      console.error("=== 빌키 발급 테스트 에러 ===");
      console.error("에러:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // 빌키 수동 승인 처리 (테스트용)
  app.post("/api/nicepay/billing-key/:uid/approve", async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: "Access denied in production" });
    }
    try {
      const { uid } = req.params;
      console.log("=== 빌키 수동 승인 시작 ===");
      console.log("요청된 UID:", uid);
      
      const db = admin.firestore();
      const billingKeyDoc = await db.collection("billingKeys").doc(uid).get();
      
      if (!billingKeyDoc.exists) {
        return res.status(404).json({ error: "Billing key not found" });
      }

      const billingKeyData = billingKeyDoc.data();
      if (!billingKeyData) {
        return res.status(404).json({ error: "Billing key data not found" });
      }

      console.log("현재 빌키 데이터 존재");

      // authToken을 billingKey로 사용
      const authToken = billingKeyData.authToken;
      if (!authToken) {
        return res.status(400).json({ error: "Auth token not found" });
      }

      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      
      if (!clientId || !secretKey) {
        return res.status(500).json({ error: "NicePay credentials not configured" });
      }

      const authHeader = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
      const orderId = `APPROVE_${Date.now()}_${uid}`;
      
      console.log("빌키 승인 API 호출 시작");

      const approvalResponse = await fetch('https://api.nicepay.co.kr/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify({
          clientId: clientId,
          method: "BILL",
          orderId: orderId,
          amount: 500,
          goodsName: "카드 등록 (수동승인)",
          billingKey: authToken,
          useEscrow: false,
          currency: "KRW",
          taxFreeAmount: 0,
          supplyAmount: 455,
          taxAmount: 45
        })
      });

      const approvalResult = await approvalResponse.json();
      console.log("빌키 승인 API 응답 수신");

      if (approvalResponse.ok && approvalResult.resultCode === '0000') {
        console.log("빌키 승인 성공");
        
        // 승인 성공 시 빌키 정보 업데이트
        await billingKeyDoc.ref.update({
          billingKey: authToken, // authToken을 실제 billingKey로 설정
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          approvalTid: approvalResult.tid,
          approvalResultCode: approvalResult.resultCode,
          approvalOrderId: orderId
        });

        res.json({
          success: true,
          message: "빌키 승인 성공",
          billingKey: authToken,
          tid: approvalResult.tid,
          orderId: orderId
        });
      } else {
        console.error("빌키 승인 실패:", approvalResult);
        res.status(400).json({
          success: false,
          error: "빌키 승인 실패",
          detail: approvalResult
        });
      }

    } catch (error: any) {
      console.error("빌키 수동 승인 오류:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message
      });
    }
  });

  // 빌키 상태 확인
  app.get("/api/nicepay/billing-key/:uid", async (req, res) => {
    try {
      console.log("=== 빌키 상태 확인 시작 ===");
      const { uid } = req.params;
      console.log("요청된 UID:", uid);

      // 인증 및 권한 확인
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      if (uid !== authUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'UID mismatch' });
      }
      
      const db = admin.firestore();
      console.log("Firestore 연결 완료");
      
      const billingKeyDoc = await db.collection("billingKeys").doc(uid).get();
      console.log("billingKeys 존재 여부:", billingKeyDoc.exists);
      
      if (!billingKeyDoc.exists) {
        const response = { 
          hasBillingKey: false,
          status: "NOT_FOUND" 
        };
        return res.json(response);
      }

      const billingKeyData = billingKeyDoc.data();

      // 카드 표시용 정보는 billingCards에서 조회
      const billingCardDoc = await db.collection("billingCards").doc(uid).get();
      const cardData = billingCardDoc.exists ? billingCardDoc.data() : null;

      // 타임스탬프 로깅 및 정규화
      const createdAtRaw = (cardData as any)?.createdAt || (billingKeyData as any)?.createdAt;
      let createdAtISO: string | null = null;
      try {
        if (createdAtRaw?.toDate) {
          createdAtISO = createdAtRaw.toDate().toISOString();
        } else if (createdAtRaw && typeof createdAtRaw._seconds === 'number') {
          createdAtISO = new Date(createdAtRaw._seconds * 1000).toISOString();
        } else if (createdAtRaw instanceof Date) {
          createdAtISO = (createdAtRaw as Date).toISOString();
        } else if (typeof createdAtRaw === 'string') {
          const d = new Date(createdAtRaw);
          createdAtISO = isNaN(d.getTime()) ? null : d.toISOString();
        }
      } catch (e) {
        console.warn("[billing-key:status] createdAt 정규화 중 오류:", e);
      }

      console.log("[billing-key:status] 카드/빌키 타임스탬프", {
        hasCardDoc: !!cardData,
        cardCreatedAtType: typeof (cardData as any)?.createdAt,
        cardCreatedAtRaw: (() => { try { return JSON.stringify((cardData as any)?.createdAt); } catch { return String((cardData as any)?.createdAt); } })(),
        keyCreatedAtType: typeof (billingKeyData as any)?.createdAt,
        keyCreatedAtRaw: (() => { try { return JSON.stringify((billingKeyData as any)?.createdAt); } catch { return String((billingKeyData as any)?.createdAt); } })(),
        createdAtISO,
      });
      
      const response = {
        hasBillingKey: true,
        status: billingKeyData?.status || "UNKNOWN",
        cardInfo: cardData ? {
          cardName: (cardData as any).cardName,
          cardNo: (cardData as any).cardNo,
          cardNoPrefix: (cardData as any).cardNoPrefix,
          expiry: (cardData as any).expiry
        } : null,
        createdAt: createdAtISO,
        authDate: (cardData as any)?.authDate || (billingKeyData as any)?.authDate
      };
      
      return res.json(response);

    } catch (error: any) {
      console.error("=== 빌키 상태 확인 에러 ===");
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message
      });
    }
  });

  // 빌키 삭제
  app.delete("/api/nicepay/billing-key/:uid", async (req, res) => {
    try {
      const { uid } = req.params;

      // 인증 및 권한 확인
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      if (uid !== authUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'UID mismatch' });
      }
      
      const db = admin.firestore();
      const billingKeyDoc = await db.collection("billingKeys").doc(uid).get();
      
      if (!billingKeyDoc.exists) {
        return res.status(404).json({ error: "Billing key not found" });
      }

      const billingKeyData = billingKeyDoc.data();
      if (!billingKeyData) {
        return res.status(404).json({ error: "Billing key data not found" });
      }
      
      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      
      if (!clientId || !secretKey) {
        return res.status(500).json({ error: "NicePay credentials not configured" });
      }

      // Basic 인증 헤더 생성
      const authHeader = Buffer.from(`${clientId}:${secretKey}`).toString('base64');

      // 나이스페이 빌키 삭제 API 호출 (orderId/ediDate/signData 일관 생성)
      const deleteOrderIdTimestamp = Date.now();
      const deleteOrderId = `DELETE_${uid}_${deleteOrderIdTimestamp}`;
      const deleteEdiDate = new Date().toISOString();
      const deleteSignData = crypto.createHash('sha256')
        .update(deleteOrderId + String(billingKeyData.billingKey) + deleteEdiDate + secretKey)
        .digest('hex');

      const response = await fetch(`https://api.nicepay.co.kr/v1/subscribe/${billingKeyData.billingKey}/expire`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify({
          orderId: deleteOrderId,
          ediDate: deleteEdiDate,
          signData: deleteSignData,
          returnCharSet: "utf-8"
        })
      });

      if (!response.ok) {
        const result = await response.json();
        return res.status(response.status).json({ 
          error: "NicePay API error", 
          detail: result 
        });
      }

      // Firestore에서 빌키 정보 삭제
      await billingKeyDoc.ref.delete();

      // billingCards 삭제
      await db.collection("billingCards").doc(uid).delete().catch(() => {});

      // 5. 사용자 정보 업데이트 (선택사항)
      try {
        await db.collection("usersInfo").doc(uid).update({
          hasBillingKey: false,
          billingKeyDeletedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (error) {
        console.log("사용자 정보 업데이트 실패 (무시됨):", error);
      }

      res.json({ 
        success: true, 
        message: "Billing key deleted successfully" 
      });

    } catch (error: any) {
      console.error("Delete billing key error:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // 빌키로 결제 요청 (나이스페이 공식 문서 준수)
  app.post("/api/nicepay/payment/billing", async (req, res) => {
    try {
      console.log("=== 빌키 결제 요청 시작 ===");
      console.log("요청 본문 수신");
      
      const { uid, amount, goodsName } = req.body;
      
      if (!uid || !amount || !goodsName) {
        console.error("필수 필드 누락:", { uid, amount, goodsName });
        return res.status(400).json({ 
          error: "Missing required fields", 
          message: "uid, amount, goodsName are required" 
        });
      }

      // 인증 및 권한 확인
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      if (uid !== authUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'UID mismatch' });
      }

      // 화이트리스트 검증: 상품명/금액
      const PRICE_WHITELIST: Record<string, number> = {
        '부스터 플랜 구독': 9900,
      };
      const expectedAmount = PRICE_WHITELIST[goodsName];
      if (!expectedAmount || expectedAmount !== amount) {
        console.error('[PAY] 금액/상품 불일치:', { goodsName, amount, expectedAmount });
        return res.status(400).json({ error: 'Invalid product or amount' });
      }

      // 추가 형식 검증
      if (typeof amount !== 'number' || amount <= 0 || amount > 10000000) {
        return res.status(400).json({ error: 'Invalid amount' });
      }
      if (typeof goodsName !== 'string' || goodsName.length < 1 || goodsName.length > 100) {
        return res.status(400).json({ error: 'Invalid goodsName' });
      }

      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      
      if (!clientId || !secretKey) {
        console.error("NicePay 인증 정보가 설정되지 않음");
        return res.status(500).json({ error: "NicePay credentials not configured" });
      }

      // Firestore 인스턴스
      const db = admin.firestore();

      // 활성 구독 중복 결제 방지: 이미 활성이고 만료 전이면 거절
      const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
      if (subscriptionDoc.exists) {
        const sub = subscriptionDoc.data() as any;
        if (sub?.status === 'ACTIVE' && sub?.endDate?.toDate) {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const endDate: Date = sub.endDate.toDate();
          const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          if (endDateOnly >= today) {
            return res.status(409).json({ error: 'Subscription already active', message: '이미 활성 구독이 있습니다.' });
          }
        }
      }

      // 결제 중복 방지용 분산 락 (TTL 5분)
      const lockRef = db.collection('paymentLocks').doc(uid);
      let acquiredLock = false;
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(lockRef);
          const nowTs = admin.firestore.Timestamp.now();
          const ttlThreshold = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000));
          if (snap.exists) {
            const createdAt = (snap.data() as any)?.createdAt as admin.firestore.Timestamp | undefined;
            if (createdAt && createdAt.toMillis() > ttlThreshold.toMillis()) {
              throw Object.assign(new Error('PAYMENT_IN_PROGRESS'), { code: 'PAYMENT_IN_PROGRESS' });
            }
          }
          tx.set(lockRef, { createdAt: nowTs, goodsName, amount });
          acquiredLock = true;
        });
      } catch (e: any) {
        if (e?.code === 'PAYMENT_IN_PROGRESS') {
          return res.status(409).json({ error: 'Payment already in progress', message: '결제가 진행 중입니다. 잠시 후 다시 시도해주세요.' });
        }
        throw e;
      }

      // Firestore에서 빌키 정보 조회 (서버에서만 접근)
      const billingKeyDoc = await db.collection("billingKeys").doc(uid).get();
      if (!billingKeyDoc.exists) {
        console.error("빌키 정보를 찾을 수 없음:", uid);
        return res.status(404).json({ 
          error: "Billing key not found", 
          message: "등록된 카드 정보가 없습니다." 
        });
      }
      const billingKeyData = billingKeyDoc.data() as any;
      if (!billingKeyData || !billingKeyData.billingKey) {
        console.error("유효한 빌키가 없음:", uid);
        return res.status(400).json({ 
          error: "Invalid billing key", 
          message: "유효하지 않은 카드 정보입니다." 
        });
      }
      if (billingKeyData.status && billingKeyData.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'Billing key not active', message: '결제 수단이 비활성 상태입니다.' });
      }
      const billingKey = billingKeyData.billingKey;

      // 서버에서 안전한 orderId 생성
      const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      const orderId = `SUB_${randomNum}_${uid}`;

      console.log("결제 정보 준비 완료");

      // ediDate 생성
      const ediDate = new Date().toISOString();
      
      // signData 생성 (hex(sha256(orderId + bid + ediDate + SecretKey)))
      const signData = crypto.createHash('sha256')
        .update(orderId + billingKey + ediDate + secretKey)
        .digest('hex');

      // 서버 검증된 값으로 결제 요청 데이터 구성
      const validatedAmount = expectedAmount; // 서버 화이트리스트 금액
      const validatedGoodsName = goodsName;  // 화이트리스트에 존재하는 상품명
      const paymentRequestData = {
        orderId: orderId,
        amount: validatedAmount,
        goodsName: validatedGoodsName,
        cardQuota: 0,
        useShopInterest: false,
        ediDate: ediDate,
        signData: signData
      };

      console.log("결제 요청 데이터 구성 완료");

      const authHeader = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
      
      console.log("API 호출 시작:", `https://api.nicepay.co.kr/v1/subscribe/${billingKey}/payments`);
      
      const response = await fetch(`https://api.nicepay.co.kr/v1/subscribe/${billingKey}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify(paymentRequestData)
      });

      console.log("결제 API 응답 상태:", response.status);
      const result = await response.json();
      console.log("결제 API 응답 본문 수신");

      if (response.ok && result.resultCode === '0000') {
        // 결제 성공 (서버 검증 금액/상품명으로 저장)
        await db.collection("payments").doc(orderId).set({
          uid: uid,
          orderId: orderId,
          amount: validatedAmount,
          goodsName: validatedGoodsName,
          status: "SUCCESS",
          tid: result.tid,
          // billingKey는 payments에 저장하지 않음
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 구독 생성 및 자동결제 스케줄 시작 (검증 금액 반영)
        try {
          await autoPaymentScheduler.createSubscriptionAndStartSchedule(uid, orderId, validatedAmount);
          console.log("=== 구독 생성 및 자동결제 스케줄 시작 완료 ===");
        } catch (error) {
          console.error("구독 생성 중 오류:", error);
          // 구독 생성 실패해도 결제는 성공으로 처리
        }

        console.log("=== 빌키 결제 완료 ===");
        res.json({
          success: true,
          orderId: orderId,
          tid: result.tid,
          message: "결제가 성공적으로 완료되었습니다. 구독이 시작되었습니다.",
        });
      } else {
        console.error("결제 실패:", result);
        
        // 결제 실패 기록 (검증 금액 반영)
        await db.collection("payments").doc(orderId).set({
          uid: uid,
          orderId: orderId,
          amount: validatedAmount,
          goodsName: validatedGoodsName,
          status: "FAILED",
          // billingKey는 payments에 저장하지 않음
          errorMessage: result.resultMsg,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          failedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(400).json({
          success: false,
          error: result.resultMsg || "결제에 실패했습니다.",
        });
      }

      // ... existing code ...
    } catch (error: any) {
      console.error("=== 빌키 결제 요청 에러 ===");
      console.error("에러:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    } finally {
      // 결제 락 해제 (존재하는 경우에만)
      try {
        const db = admin.firestore();
        const { uid } = req.body || {};
        if (uid) {
          await db.collection('paymentLocks').doc(uid).delete();
        }
      } catch {}
    }
  });

  // 테스트용 빌키 발급 엔드포인트
  app.post("/api/nicepay/billing-key/test", async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: "Access denied in production" });
    }
    try {
      console.log("=== 테스트 빌키 발급 요청 시작 ===");
      console.log("요청 본문 수신");
      
      const { uid, cardNo, expYear, expMonth, idNo, cardPw } = req.body;
      
      // 필수 필드 검증
      if (!uid || !cardNo || !expYear || !expMonth || !idNo || !cardPw) {
        console.error("필수 필드 누락:", { uid, cardNo: cardNo ? "있음" : "없음", expYear, expMonth, idNo: idNo ? "있음" : "없음", cardPw: cardPw ? "있음" : "없음" });
        return res.status(400).json({ 
          error: "Missing required fields", 
          message: "uid, cardNo, expYear, expMonth, idNo, cardPw are required" 
        });
      }

      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      
      if (!clientId || !secretKey) {
        console.error("NicePay 인증 정보가 설정되지 않음");
        return res.status(500).json({ error: "NicePay credentials not configured" });
      }

      const orderId = `TEST_BILL_${Date.now()}_${uid}`;
      
      // 카드 정보 암호화 (AES-128)
      const plainText = `cardNo=${cardNo}&expYear=${expYear}&expMonth=${expMonth}&idNo=${idNo}&cardPw=${cardPw}`;
      const encryptionKey = secretKey.substring(0, 16); // SecretKey 앞 16자리
      
      console.log("암호화 준비 완료");

      // AES-128 암호화 (AES/ECB/PKCS5padding)
      const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(encryptionKey), null);
      let encData = cipher.update(plainText, 'utf8', 'hex');
      encData += cipher.final('hex');

      console.log("암호화 완료:", {
        encDataLength: encData.length
      });

      // ediDate 생성
      const ediDate = new Date().toISOString();
      
      // signData 생성
      const signData = crypto.createHash('sha256')
        .update(orderId + ediDate + secretKey)
        .digest('hex');

      // 빌키 발급 API 요청
      const billingKeyRequestData = {
        encData: encData,
        orderId: orderId,
        ediDate: ediDate,
        signData: signData
      };

      console.log("빌키 발급 API 요청 데이터 준비 완료");

      const authHeader = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
      
      console.log("API 호출 시작:", 'https://api.nicepay.co.kr/v1/subscribe/regist');
      
      const response = await fetch('https://api.nicepay.co.kr/v1/subscribe/regist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify(billingKeyRequestData)
      });

      console.log("API 응답 상태:", response.status);
      const result = await response.json();
      console.log("빌키 발급 API 응답 수신");

      if (response.ok && result.resultCode === '0000') {
        // 빌키 발급 성공
        const db = admin.firestore();
        await db.collection("billingKeys").doc(uid).set({
          billingKey: result.bid,
          orderId: orderId,
          status: "ACTIVE",
          tid: result.tid,
          cardCode: result.cardCode,
          cardName: result.cardName,
          cardNo: maskCardNumber(cardNo), // 마스킹된 카드 번호 저장
          cardNoPrefix: cardNo.substring(0, 2), // 카드 번호 앞 2자리 저장
          authDate: result.authDate,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log("=== 테스트 빌키 발급 완료 ===");
        res.json({
          success: true,
          billingKey: result.bid,
          message: "테스트 빌키가 성공적으로 발급되었습니다.",
          result: result
        });
      } else {
        console.error("테스트 빌키 발급 실패:", result);
        res.status(400).json({
          success: false,
          error: result.resultMsg || "테스트 빌키 발급에 실패했습니다.",
          result: result
        });
      }

    } catch (error: any) {
      console.error("=== 테스트 빌키 발급 요청 에러 ===");
      console.error("에러:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // 웹훅 콜백 처리 (결제 완료 알림) - 나이스페이먼츠 공식 문서 준수
  app.post("/api/nicepay/webhook", async (req, res) => {
    try {
      console.log("=== 나이스페이먼츠 웹훅 수신 시작 ===");

      // Content-Type 검증: JSON이 아닐 경우 무시 (200 OK)
      const contentType = req.headers['content-type'] || '';
      if (typeof contentType === 'string' && !contentType.toLowerCase().includes('application/json')) {
        console.warn('[Webhook] Unsupported Content-Type, ignoring:', contentType);
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        return res.status(200).send("OK");
      }

      // IP 화이트리스트 검증 (Express trust proxy 기반 주소만 신뢰)
      // req.ip: trust proxy=1 기준으로 가장 가까운 클라이언트 IP
      // req.ips: X-Forwarded-For 파싱 결과 배열(Express가 처리한 값), 첫 요소가 실제 클라이언트
      const candidateIps: string[] = Array.isArray((req as any).ips) && (req as any).ips.length > 0
        ? (req as any).ips
        : [req.ip].filter(Boolean);

      const requestIp = (candidateIps[0] || req.ip || '') as string; // 최우선 후보

      // 환경변수에서 허용 IP 확장 (콤마 구분). 공백 제거
      const envAllowed = (process.env.NICEPAY_ALLOWED_IPS || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      const allowedIPs = [
        // 운영 시 최신 나이스페이 IP로 유지/확장 필요. CIDR 허용 불가 시 목록으로 관리.
        '203.238.37.15',
        '203.238.37.16',
        '203.238.37.25',
        '127.0.0.1',
        '::1',
        ...envAllowed,
      ];

      console.log("웹훅 요청 IP 정보:", {
        requestIp,
        candidateIps,
      });

      if (!allowedIPs.includes(requestIp)) {
        console.error("허용되지 않은 IP에서 웹훅 요청:", requestIp);
        // 나이스페이 요구사항: HTTP 200 + "OK" 응답
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        return res.status(200).send("OK");
      }

      // 나이스페이먼츠 웹훅 데이터 파싱
      const { 
        resultCode, 
        resultMsg, 
        tid, 
        cancelledTid,
        orderId, 
        ediDate,
        signature,
        status,
        paidAt,
        failedAt,
        cancelledAt,
        payMethod,
        amount,
        balanceAmt,
        goodsName,
        mallReserved,
        useEscrow,
        currency,
        channel,
        approveNo,
        buyerName,
        buyerTel,
        buyerEmail,
        issuedCashReceipt,
        receiptUrl,
        mallUserId,
        coupon,
        card,
        cashReceipts,
        bank,
        vbank,
        cancels
      } = req.body;

      console.log("웹훅 데이터 수신 요약:", { 
        orderId, 
        resultCode, 
        status, 
        payMethod,
        amount,
        tid: tid?.substring(0, 10) + '...'
      });

      // 필수 필드 검증
      if (!resultCode || !orderId || !status) {
        console.error("웹훅 필수 필드 누락:", { resultCode, orderId, status });
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        return res.status(200).send("OK");
      }

      // 서명 검증 강화 (나이스페이먼츠 공식 문서에 따른 검증)
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      if (!signature || !secretKey || !tid || !amount || !ediDate) {
        console.error("웹훅 서명 검증 실패: 필수 필드 누락");
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        return res.status(200).send("OK");
      }

      // 나이스페이먼츠 공식 서명 검증: hex(sha256(tid + amount + ediDate + SecretKey))
      const expectedSignature = crypto.createHash('sha256')
        .update(String(tid) + String(amount) + String(ediDate) + String(secretKey))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error("웹훅 서명 검증 실패");
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        return res.status(200).send("OK");
      }
      console.log("웹훅 서명 검증 성공");

      const db = admin.firestore();

      // 결제 상태에 따른 처리
      switch (status) {
        case 'paid':
          // 결제 완료 처리
          console.log("결제 완료 처리 시작:", orderId);
          
          const paymentDoc = await db.collection("payments").doc(orderId).get();
          
          if (paymentDoc.exists) {
            const paymentData = paymentDoc.data();
            await paymentDoc.ref.update({
              status: "SUCCESS",
              tid: tid,
              resultCode: resultCode,
              resultMsg: resultMsg,
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
              paidAt: paidAt,
              payMethod: payMethod,
              currency: currency,
              channel: channel,
              buyerName: buyerName,
              buyerTel: buyerTel,
              buyerEmail: buyerEmail ? buyerEmail.replace(/^(.{2}).+(@.*)$/, '$1****$2') : null,
              receiptUrl: receiptUrl,
              // 카드 정보 저장 (있는 경우) - 민감 정보 마스킹 처리
              cardInfo: card ? {
                cardCode: card.cardCode,
                cardName: card.cardName,
                cardNum: card.cardNum ? `****${String(card.cardNum).slice(-4)}` : null,
                cardQuota: card.cardQuota,
                isInterestFree: card.isInterestFree,
                cardType: card.cardType,
                canPartCancel: card.canPartCancel,
                acquCardCode: card.acquCardCode,
                acquCardName: card.acquCardName
              } : null,
              // 현금영수증 정보 저장 (있는 경우)
              cashReceipts: cashReceipts || null,
              // 할인 정보 저장 (있는 경우)
              coupon: coupon || null
            });
            
            console.log("결제 상태 업데이트 완료: SUCCESS");

            // 구독이 아직 없는 경우에만 생성
            if (paymentData?.uid) {
              const subscriptionDoc = await db.collection("subscriptions").doc(paymentData.uid).get();
              if (!subscriptionDoc.exists) {
                try {
                  await autoPaymentScheduler.createSubscriptionAndStartSchedule(
                    paymentData.uid, 
                    orderId, 
                    amount || paymentData.amount
                  );
                  console.log("=== 웹훅에서 구독 생성 및 자동결제 스케줄 시작 완료 ===");
                } catch (error) {
                  console.error("웹훅에서 구독 생성 중 오류:", error);
                }
              }
            }
          } else {
            console.warn("결제 문서를 찾을 수 없음:", orderId);
          }
          break;

        case 'failed':
          // 결제 실패 처리
          console.log("결제 실패 처리:", orderId);
          
          const failedPaymentDoc = await db.collection("payments").doc(orderId).get();
          if (failedPaymentDoc.exists) {
            await failedPaymentDoc.ref.update({
              status: "FAILED",
              resultCode: resultCode,
              resultMsg: resultMsg,
              failedAt: failedAt || admin.firestore.FieldValue.serverTimestamp(),
              errorMessage: resultMsg
            });
            console.log("결제 상태 업데이트 완료: FAILED");
          }
          break;

        case 'cancelled':
        case 'partialCancelled':
          // 결제 취소 처리
          console.log("결제 취소 처리:", orderId, status);
          
          const cancelledPaymentDoc = await db.collection("payments").doc(orderId).get();
          if (cancelledPaymentDoc.exists) {
            await cancelledPaymentDoc.ref.update({
              status: "CANCELLED",
              resultCode: resultCode,
              resultMsg: resultMsg,
              cancelledAt: cancelledAt || admin.firestore.FieldValue.serverTimestamp(),
              cancelledTid: cancelledTid,
              balanceAmt: balanceAmt,
              // 취소 내역 저장
              cancels: cancels || []
            });
            console.log("결제 상태 업데이트 완료: CANCELLED");
          }
          break;

        case 'ready':
          // 결제 준비 상태 (가상계좌 등)
          console.log("결제 준비 상태:", orderId);
          break;

        case 'expired':
          // 결제 만료
          console.log("결제 만료:", orderId);
          break;

        default:
          console.log("알 수 없는 결제 상태:", status, orderId);
          break;
      }

      // 웹훅 처리 완료 로그
      console.log("=== 나이스페이먼츠 웹훅 처리 완료 ===");

      // 나이스페이먼츠 요구사항: HTTP 200 + "OK" 응답 (Content-Type: text/html)
      res.setHeader('Content-Type', 'text/html;charset=utf-8');
      res.status(200).send("OK");

    } catch (error: any) {
      console.error("웹훅 처리 중 오류:", error);
      
      // 오류 발생 시에도 나이스페이먼츠 요구사항에 따라 "OK" 응답
      res.setHeader('Content-Type', 'text/html;charset=utf-8');
      res.status(200).send("OK");
    }
  });

  // 멤버십 해지 API
  app.post("/api/subscription/cancel", async (req, res) => {
    try {
      const { uid } = req.body;
      
      if (!uid) {
        return res.status(400).json({ 
          error: "Missing required fields", 
          message: "uid is required" 
        });
      }

      // 인증 및 권한 확인
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      if (uid !== authUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'uid mismatch' });
      }

      console.log(`=== 멤버십 해지 요청: ${uid} ===`);
      
      const db = admin.firestore();
      
      // 구독 정보 조회
      const subscriptionDoc = await db.collection("subscriptions").doc(uid).get();
      
      if (!subscriptionDoc.exists) {
        return res.status(404).json({ 
          error: "Subscription not found", 
          message: "구독 정보를 찾을 수 없습니다." 
        });
      }

      const subscriptionData = subscriptionDoc.data();
      
      if (subscriptionData?.status !== 'ACTIVE') {
        return res.status(400).json({ 
          error: "Invalid subscription status", 
          message: "활성 구독이 아닙니다." 
        });
      }

      // 구독 상태를 CANCELLED로 변경 (다음 결제일까지 서비스 유지)
      await subscriptionDoc.ref.update({
        status: 'CANCELLED',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: uid,
        // 기존 endDate는 유지 (다음 결제일까지 서비스 제공)
      });

      // 멤버십 해지 이력 저장
      const membershipCancelData = {
        uid: uid,
        subscriptionId: subscriptionDoc.id,
        cancelType: "MEMBERSHIP_CANCELLATION", // 멤버십 해지
        cancelReason: "사용자 요청",
        subscriptionData: {
          plan: subscriptionData.plan,
          startDate: subscriptionData.startDate,
          endDate: subscriptionData.endDate,
          lastPaymentAmount: subscriptionData.lastPaymentAmount,
          lastPaymentOrderId: subscriptionData.lastPaymentOrderId
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: uid,
        // 해지 조건 정보
        cancelConditions: {
          daysSincePayment: 0, // 멤버십 해지는 날짜 제한 없음
          totalUsage: 0, // 사용량 제한 없음
          userRequested: true
        }
      };

      // subscriptionCancellations 컬렉션에 저장 (문서 ID = uid)
      await db.collection("subscriptionCancellations").doc(uid).set(membershipCancelData);

      console.log(`멤버십 해지 완료: ${uid}, 만료일: ${subscriptionData.endDate?.toDate?.()?.toISOString()}, 해지 이력 저장됨`);

      // 멤버십 해지 이메일 알림 전송
      try {
        const userInfoDoc = await db.collection('usersInfo').doc(uid).get();
        if (userInfoDoc.exists) {
          const userData = userInfoDoc.data();
          const userEmail = userData?.email;
          if (userEmail) {
            await sendMembershipCancellationEmail(userEmail, {
              plan: subscriptionData.plan || 'BOOSTER',
              cancelledDate: new Date(),
              endDate: subscriptionData.endDate?.toDate?.() || new Date(),
              reactivationUrl: `${process.env.CLIENT_ORIGIN || 'https://storebooster.ai.kr'}/subscription`
            });
            console.log(`멤버십 해지 이메일 전송 완료: ${userEmail}`);
          }
        }
      } catch (emailError) {
        console.error(`멤버십 해지 이메일 전송 실패: ${uid}`, emailError);
      }

      res.json({ 
        success: true, 
        message: "멤버십이 성공적으로 해지되었습니다.",
        data: {
          uid: uid,
          status: 'CANCELLED',
          endDate: subscriptionData.endDate,
          cancelledAt: new Date(),
          cancelHistoryId: membershipCancelData.createdAt // 참조용
        }
      });

    } catch (error: any) {
      console.error("멤버십 해지 중 오류:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // 멤버십 재활성화 API
  app.post("/api/subscription/reactivate", async (req, res) => {
    try {
      const { uid } = req.body;
      
      if (!uid) {
        return res.status(400).json({ 
          error: "Missing required fields", 
          message: "uid is required" 
        });
      }

      // 인증 및 권한 확인
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      if (uid !== authUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'uid mismatch' });
      }

      console.log(`=== 멤버십 재활성화 요청: ${uid} ===`);
      
      const db = admin.firestore();
      
      // 구독 정보 조회
      const subscriptionDoc = await db.collection("subscriptions").doc(uid).get();
      
      if (!subscriptionDoc.exists) {
        return res.status(404).json({ 
          error: "Subscription not found", 
          message: "구독 정보를 찾을 수 없습니다." 
        });
      }

      const subscriptionData = subscriptionDoc.data();
      
      if (subscriptionData?.status !== 'CANCELLED') {
        return res.status(400).json({ 
          error: "Invalid subscription status", 
          message: "해지된 구독이 아닙니다." 
        });
      }

      // 현재 시간이 endDate보다 늦은지 확인
      const now = new Date();
      const endDate = subscriptionData.endDate?.toDate() || new Date();
      
      if (now > endDate) {
        return res.status(400).json({ 
          error: "Subscription expired", 
          message: "구독이 이미 만료되었습니다. 새로운 구독을 시작해주세요." 
        });
      }

      // 구독 상태를 ACTIVE로 변경 (재활성화)
      await subscriptionDoc.ref.update({
        status: 'ACTIVE',
        reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        reactivatedBy: uid,
        // cancelledAt 필드는 유지 (이력 보존)
      });

      console.log(`멤버십 재활성화 완료: ${uid}, 만료일: ${subscriptionData.endDate?.toDate?.()?.toISOString()}`);

      res.json({ 
        success: true, 
        message: "멤버십이 성공적으로 재활성화되었습니다.",
        data: {
          uid: uid,
          status: 'ACTIVE',
          endDate: subscriptionData.endDate,
          reactivatedAt: new Date()
        }
      });

    } catch (error: any) {
      console.error("멤버십 재활성화 중 오류:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // 결제수단 삭제 API (레거시 경로 - 나이스페이 경로 사용 권장)
  app.delete("/api/billing-key/:uid", async (req, res) => {
    try {
      const { uid } = req.params;
      
      if (!uid) {
        return res.status(400).json({ 
          error: "Missing required fields", 
          message: "uid is required" 
        });
      }

      console.log(`=== 결제수단 삭제 요청: ${uid} ===`);
      
      // 인증 및 권한 확인
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      if (uid !== authUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'UID mismatch' });
      }
      
      const db = admin.firestore();
      
      // 1. 활성 구독이 있는지 확인
      const subscriptionDoc = await db.collection("subscriptions").doc(uid).get();
      
      if (subscriptionDoc.exists) {
        const subscriptionData = subscriptionDoc.data();
        
        // ACTIVE 또는 CANCELLED 상태의 구독이 있으면 삭제 불가
        if (subscriptionData?.status === 'ACTIVE' || subscriptionData?.status === 'CANCELLED') {
          const endDate = subscriptionData.endDate?.toDate();
          const endDateStr = endDate ? endDate.toLocaleDateString() : '정보 없음';
          
          return res.status(400).json({ 
            error: "Active subscription exists", 
            message: `활성 구독이 있어서 결제수단을 삭제할 수 없습니다. 구독 만료일: ${endDateStr}`,
            data: {
              subscriptionStatus: subscriptionData.status,
              endDate: endDateStr
            }
          });
        }
      }

      // 2. 빌링키 정보 조회
      const billingKeyDoc = await db.collection("billingKeys").doc(uid).get();
      
      if (!billingKeyDoc.exists) {
        return res.status(404).json({ 
          error: "Billing key not found", 
          message: "등록된 결제수단이 없습니다." 
        });
      }

      const billingKeyData = billingKeyDoc.data();
      
      if (billingKeyData?.status !== 'ACTIVE') {
        return res.status(400).json({ 
          error: "Invalid billing key status", 
          message: "활성 상태의 결제수단이 아닙니다." 
        });
      }

      // 3. 나이스페이 API로 빌링키 삭제 요청
      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      
      if (!clientId || !secretKey) {
        console.error("NicePay 인증 정보가 설정되지 않음");
        return res.status(500).json({ error: "NicePay credentials not configured" });
      }

      const orderId = `DELETE_${uid}_${Date.now()}`;
      const ediDate = new Date().toISOString();
      const bid = billingKeyData.billingKey;
      
      // signData 생성: hex(sha256(orderId + bid + ediDate + SecretKey))
      const signData = crypto
        .createHash('sha256')
        .update(`${orderId}${bid}${ediDate}${secretKey}`)
        .digest('hex');

      const deleteRequest = {
        orderId: orderId,
        ediDate: ediDate,
        signData: signData,
        returnCharSet: "utf-8"
      };

      // Basic Authentication 헤더 생성
      const credentials = Buffer.from(`${clientId}:${secretKey}`).toString('base64');

      console.log("나이스페이 빌링키 삭제 요청 전송");

      const response = await fetch(`https://api.nicepay.co.kr/v1/subscribe/${bid}/expire`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        },
        body: JSON.stringify(deleteRequest)
      });

      if (!response.ok) {
        const result = await response.json();
        console.error("나이스페이 빌링키 삭제 실패:", result);
        return res.status(response.status).json({ 
          error: "NicePay API error", 
          detail: result 
        });
      }

      // 4. Firestore에서 빌키 정보 삭제
      await billingKeyDoc.ref.delete();

      // billingCards 삭제
      await db.collection("billingCards").doc(uid).delete().catch(() => {});

      // 5. 사용자 정보 업데이트 (선택사항)
      try {
        await db.collection("usersInfo").doc(uid).update({
          hasBillingKey: false,
          billingKeyDeletedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (error) {
        console.log("사용자 정보 업데이트 실패 (무시됨):", error);
      }

      console.log(`결제수단 삭제 완료: ${uid}`);

      res.json({ 
        success: true, 
        message: "결제수단이 성공적으로 삭제되었습니다.",
        data: {
          uid: uid,
          deletedAt: new Date()
        }
      });

    } catch (error: any) {
      console.error("결제수단 삭제 중 오류:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // 결제 취소 API (7일 이내, 사용량 0인 경우)
  app.post("/api/payment/cancel", async (req, res) => {
    try {
      const { uid, reason } = req.body;
      
      if (!uid) {
        return res.status(400).json({ 
          error: "Missing required fields", 
          message: "uid is required" 
        });
      }

      // 인증 및 권한 확인
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      if (uid !== authUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'UID mismatch' });
      }

      // 취소 사유 검증 (10자 이상)
      const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
      if (trimmedReason.length < 10) {
        return res.status(400).json({
          error: "Invalid reason",
          message: "취소 사유는 10자 이상 입력해주세요."
        });
      }

      console.log(`=== 결제 취소 요청: ${uid} ===`);
      
      const db = admin.firestore();
      
      // 1. 구독 정보 조회
      const subscriptionDoc = await db.collection("subscriptions").doc(uid).get();
      
      if (!subscriptionDoc.exists) {
        return res.status(404).json({ 
          error: "Subscription not found", 
          message: "구독 정보를 찾을 수 없습니다." 
        });
      }

      const subscriptionData = subscriptionDoc.data();
      
      if (subscriptionData?.status !== 'ACTIVE' && subscriptionData?.status !== 'CANCELLED') {
        return res.status(400).json({ 
          error: "Invalid subscription status", 
          message: "활성 구독 또는 취소된 구독이 아닙니다." 
        });
      }

      // 2. 최근 결제일(정기결제 포함) 기준 7일 이내인지 확인
      const latestPaymentDate = subscriptionData.lastPaymentDate?.toDate?.() 
        || subscriptionData.createdAt?.toDate?.() 
        || new Date();
      const now = new Date();
      const daysSincePayment = Math.floor((now.getTime() - latestPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSincePayment > 7) {
        return res.status(400).json({ 
          error: "Payment too old", 
          message: "최근 결제일로부터 7일이 지나서 취소할 수 없습니다." 
        });
      }

      // 3. 사용량 확인 (키워드 분석 + 상품 최적화)
      // 최근 결제일 이후 ~ 오늘까지의 일별 사용량 합산 (이메일 경로 + UID 경로 모두 확인)
      const toDateKey = (d: Date) => d.toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
      const startKey = toDateKey(latestPaymentDate);
      const endKey = toDateKey(now);

      // usersInfo에서 이메일 조회 후 safeEmail 생성
      let safeEmail: string | null = null;
      try {
        const userInfoDoc = await db.collection('usersInfo').doc(uid).get();
        const email = userInfoDoc.exists ? (userInfoDoc.data()?.email || null) : null;
        if (email) {
          safeEmail = email
            .replace(/\./g, '_dot_')
            .replace(/@/g, '_at_')
            .replace(/-/g, '_dash_')
            .replace(/\+/g, '_plus_');
        }
      } catch (e) {
        console.warn('[Refund] usersInfo 조회 실패, email 경로 스킵:', e);
      }

      const uidSanitized = uid.replace(/[^a-zA-Z0-9]/g, '_');
      const fieldPath = admin.firestore.FieldPath.documentId();

      async function sumUsageForPath(userDocId: string): Promise<{ keyword: number; product: number }> {
        const colRef = db.collection('users').doc(userDocId).collection('usage');
        const snap = await colRef
          .orderBy(fieldPath)
          .startAt(startKey)
          .endAt(endKey)
          .get();
        let keywordSum = 0;
        let productSum = 0;
        snap.forEach(docSnap => {
          const data = docSnap.data() || {};
          const keyword = Number(data.keywordAnalysis || 0);
          const product = Number(data.productOptimization || 0);
          keywordSum += isNaN(keyword) ? 0 : keyword;
          productSum += isNaN(product) ? 0 : product;
        });
        return { keyword: keywordSum, product: productSum };
      }

      let keywordUsageSum = 0;
      let productUsageSum = 0;
      if (safeEmail) {
        const sums = await sumUsageForPath(safeEmail);
        keywordUsageSum += sums.keyword;
        productUsageSum += sums.product;
      }
      // uid 기반 경로도 합산 (중복이 있어도 >0인지 여부만 판단)
      const sumsByUid = await sumUsageForPath(uidSanitized);
      keywordUsageSum += sumsByUid.keyword;
      productUsageSum += sumsByUid.product;
      const totalUsage = keywordUsageSum + productUsageSum;

      if (totalUsage > 0) {
        return res.status(400).json({ 
          error: 'Usage exists', 
          message: '키워드 경쟁률 분석 및 상품명 최적화 서비스를 이미 사용하셨습니다.' 
        });
      }

      // 4. 최근 결제 내역 조회 (tid 필요)
      const paymentsQuery = await db.collection("payments")
        .where("uid", "==", uid)
        .where("status", "==", "SUCCESS")
        .orderBy("completedAt", "desc")
        .limit(1)
        .get();

      if (paymentsQuery.empty) {
        return res.status(404).json({ 
          error: "Payment not found", 
          message: "결제 내역을 찾을 수 없습니다." 
        });
      }

      const paymentDoc = paymentsQuery.docs[0];
      const paymentData = paymentDoc.data();
      
      if (!paymentData.tid) {
        return res.status(400).json({ 
          error: "TID not found", 
          message: "결제 거래 ID를 찾을 수 없습니다." 
        });
      }

      // 5. 나이스페이 API로 결제 취소 요청
      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      
      if (!clientId || !secretKey) {
        console.error("NicePay 인증 정보가 설정되지 않음");
        return res.status(500).json({ error: "NicePay credentials not configured" });
      }

      const orderId = paymentData.orderId;
      const ediDate = new Date().toISOString();
      
      // signData 생성: hex(sha256(tid + ediDate + SecretKey))
      const signData = crypto
        .createHash('sha256')
        .update(`${paymentData.tid}${ediDate}${secretKey}`)
        .digest('hex');

      const cancelRequest = {
        reason: trimmedReason,
        orderId: orderId,
        ediDate: ediDate,
        signData: signData,
        returnCharSet: "utf-8"
      };

      // Basic Authentication 헤더 생성
      const credentials = Buffer.from(`${clientId}:${secretKey}`).toString('base64');

      console.log("나이스페이 결제 취소 요청 전송");

      const response = await fetch(`https://api.nicepay.co.kr/v1/payments/${paymentData.tid}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        },
        body: JSON.stringify(cancelRequest)
      });

      if (!response.ok) {
        const result = await response.json();
        console.error("나이스페이 결제 취소 실패:", result);
        return res.status(response.status).json({ 
          error: "NicePay API error", 
          detail: result 
        });
      }

      const cancelResult = await response.json();

      // NICEPAY 사업자 응답 코드 확인 (성공: '0000')
      if (!cancelResult || cancelResult.resultCode !== '0000') {
        console.error("나이스페이 결제 취소 실패 코드:", cancelResult);
        return res.status(400).json({
          error: 'NicePay cancel failed',
          message: cancelResult?.resultMsg || '결제 취소가 실패했습니다.',
          detail: cancelResult
        });
      }

      console.log("나이스페이 결제 취소 성공 응답 수신");

      // 6. 구독 상태를 EXPIRED로 변경 (즉시 서비스 중단)
      const originalStatus = subscriptionData.status;
      await subscriptionDoc.ref.update({
        status: 'EXPIRED',
        plan: 'basic',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: uid,
        cancelReason: trimmedReason,
        expiredAt: admin.firestore.FieldValue.serverTimestamp(), // 즉시 만료 처리
        originalStatus: originalStatus // 원래 상태 보존
      });

      // 7. 결제 내역 업데이트
      await paymentDoc.ref.update({
        status: "CANCELLED",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelReason: trimmedReason
      });

      // 8. 결제 취소 이력 별도 저장
      const cancelHistoryData = {
        uid: uid,
        orderId: paymentData.orderId,
        tid: paymentData.tid,
        cancelledTid: cancelResult.cancelledTid || null,
        amount: paymentData.amount,
        refundAmount: paymentData.amount,
        cancelReason: trimmedReason,
        cancelType: "FULL_REFUND", // 전체 환불
        subscriptionId: subscriptionDoc.id,
        paymentId: paymentDoc.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: uid,
        // 나이스페이 응답 데이터 저장
        nicepayResult: {
          resultCode: cancelResult.resultCode,
          resultMsg: cancelResult.resultMsg,
          status: cancelResult.status,
          cancelledAt: cancelResult.cancelledAt,
          balanceAmt: cancelResult.balanceAmt
        },
        // 취소 조건 정보
        cancelConditions: {
          daysSincePayment: daysSincePayment,
          totalUsage: totalUsage,
          keywordUsage: keywordUsageSum,
          productUsage: productUsageSum,
          originalSubscriptionStatus: originalStatus // 원래 구독 상태 추가
        }
      };

      // paymentCancellations 컬렉션에 저장 (문서 ID = uid)
      await db.collection("paymentCancellations").doc(uid).set(cancelHistoryData);

      console.log(`결제 취소 완료: ${uid}, TID: ${paymentData.tid}, 원래 상태: ${originalStatus}, 취소 이력 저장됨`);

      // 환불 완료 이메일 알림 전송
      try {
        const userInfoDoc = await db.collection('usersInfo').doc(uid).get();
        if (userInfoDoc.exists) {
          const userData = userInfoDoc.data();
          const userEmail = userData?.email;
          if (userEmail) {
            await sendRefundSuccessEmail(userEmail, {
              orderId: paymentData.orderId,
              refundOrderId: `REFUND_${Date.now()}_${uid}`,
              amount: paymentData.amount,
              goodsName: paymentData.goodsName || "스토어부스터 부스터 플랜",
              refundDate: new Date(),
              refundReason: "7일 이내 미사용으로 인한 전체 취소"
            });
            console.log(`환불 완료 이메일 전송 완료: ${userEmail}`);
          }
        }
      } catch (emailError) {
        console.error(`환불 완료 이메일 전송 실패: ${uid}`, emailError);
      }

      res.json({ 
        success: true, 
        message: "결제가 성공적으로 취소되었습니다.",
        data: {
          uid: uid,
          tid: paymentData.tid,
          cancelledAt: new Date(),
          refundAmount: paymentData.amount,
          originalSubscriptionStatus: originalStatus,
          cancelHistoryId: cancelHistoryData.createdAt // 참조용
        }
      });

    } catch (error: any) {
      console.error("결제 취소 중 오류:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // POST /api/refund - 일반 환불 처리
  app.post('/api/refund', async (req, res) => {
    const { uid, orderId, refundReason, refundAmount } = req.body;

    if (!uid || !orderId || !refundReason) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'uid, orderId, refundReason are required' 
      });
    }

    // 인증 및 권한 확인
    const authUid = await verifyAuthUid(req, res);
    if (!authUid) return;
    if (uid !== authUid) {
      return res.status(403).json({ error: 'Forbidden', message: 'UID mismatch' });
    }

    const db = admin.firestore();

    try {
      // 1. 결제 정보 조회
      const paymentDoc = await db.collection('payments').doc(orderId).get();
      if (!paymentDoc.exists) {
        return res.status(404).json({ 
          error: 'Payment not found', 
          message: '해당 주문번호의 결제 정보를 찾을 수 없습니다.' 
        });
      }

      const paymentData = paymentDoc.data();
      if (!paymentData) {
        return res.status(404).json({ 
          error: 'Payment data not found', 
          message: '결제 데이터를 찾을 수 없습니다.' 
        });
      }

      // 2. 이미 환불된 결제인지 확인
      if (paymentData.status === 'REFUNDED' || paymentData.status === 'CANCELLED') {
        return res.status(400).json({ 
          error: 'Already refunded', 
          message: '이미 환불된 결제입니다.' 
        });
      }

      // 3. 나이스페이 환불 API 호출
      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;

      if (!clientId || !secretKey) {
        return res.status(500).json({ 
          error: 'Server configuration error', 
          message: '결제 서비스 설정이 완료되지 않았습니다.' 
        });
      }

      const actualRefundAmount = refundAmount || paymentData.amount;
      const refundOrderId = `REFUND_${Date.now()}_${uid}`;
      const ediDate = new Date().toISOString();
      const signData = crypto.createHash('sha256')
        .update(refundOrderId + paymentData.tid + actualRefundAmount + ediDate + secretKey)
        .digest('hex');

      const refundRequest = {
        orderId: refundOrderId,
        tid: paymentData.tid,
        amount: actualRefundAmount,
        reason: refundReason,
        ediDate: ediDate,
        signData: signData
      };

      const credentials = Buffer.from(`${clientId}:${secretKey}`).toString('base64');

      const response = await fetch('https://api.nicepay.co.kr/v1/payments/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        },
        body: JSON.stringify(refundRequest)
      });

      if (!response.ok) {
        const result = await response.json();
        console.error("나이스페이 환불 실패:", result);
        return res.status(response.status).json({ 
          error: "NicePay API error", 
          detail: result 
        });
      }

      const refundResult = await response.json();
      console.log("나이스페이 환불 성공 응답 수신");

      // 4. 결제 상태 업데이트
      await paymentDoc.ref.update({
        status: 'REFUNDED',
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundAmount: actualRefundAmount,
        refundReason: refundReason,
        refundOrderId: refundOrderId
      });

      // 5. 환불 이력 저장
      const refundHistoryData = {
        uid: uid,
        orderId: orderId,
        refundOrderId: refundOrderId,
        tid: paymentData.tid,
        amount: paymentData.amount,
        refundAmount: actualRefundAmount,
        refundReason: refundReason,
        refundType: actualRefundAmount >= paymentData.amount ? 'FULL_REFUND' : 'PARTIAL_REFUND',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundedBy: uid,
        nicepayResult: {
          resultCode: refundResult.resultCode,
          resultMsg: refundResult.resultMsg,
          status: refundResult.status,
          refundedAt: refundResult.refundedAt,
          balanceAmt: refundResult.balanceAmt
        }
      };

      await db.collection("refunds").add(refundHistoryData);

      // 6. 환불 완료 이메일 알림 전송
      try {
        const userInfoDoc = await db.collection('usersInfo').doc(uid).get();
        if (userInfoDoc.exists) {
          const userData = userInfoDoc.data();
          const userEmail = userData?.email;
          if (userEmail) {
            await sendRefundSuccessEmail(userEmail, {
              orderId: orderId,
              refundOrderId: refundOrderId,
              amount: actualRefundAmount,
              goodsName: paymentData.goodsName || "스토어부스터 부스터 플랜",
              refundDate: new Date(),
              refundReason: refundReason
            });
            console.log(`환불 완료 이메일 전송 완료: ${userEmail}`);
          }
        }
      } catch (emailError) {
        console.error(`환불 완료 이메일 전송 실패: ${uid}`, emailError);
      }

      console.log(`환불 처리 완료: ${uid}, TID: ${paymentData.tid}, 환불 이력 저장됨`);

      res.json({ 
        success: true, 
        message: "환불이 성공적으로 처리되었습니다.",
        data: {
          uid: uid,
          tid: paymentData.tid,
          refundedAt: new Date(),
          refundAmount: actualRefundAmount,
          refundOrderId: refundOrderId
        }
      });

    } catch (error: any) {
      console.error("환불 처리 중 오류:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // POST /api/resend-payment-email - 결제 성공 이메일 재발송
  app.post('/api/resend-payment-email', async (req, res) => {
    const { uid, orderId, amount, goodsName } = req.body;

    if (!uid || !orderId) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'uid, orderId are required' 
      });
    }

    // 인증 및 권한 확인
    const authUid = await verifyAuthUid(req, res);
    if (!authUid) return;
    if (uid !== authUid) {
      return res.status(403).json({ error: 'Forbidden', message: 'UID mismatch' });
    }

    const db = admin.firestore();

    try {
      // 사용자 이메일 조회
      const userInfoDoc = await db.collection('usersInfo').doc(uid).get();
      if (!userInfoDoc.exists) {
        return res.status(404).json({ 
          error: 'User not found', 
          message: '사용자 정보를 찾을 수 없습니다.' 
        });
      }

      const userData = userInfoDoc.data();
      const userEmail = userData?.email;
      
      if (!userEmail) {
        return res.status(400).json({ 
          error: 'Email not found', 
          message: '사용자 이메일 정보가 없습니다.' 
        });
      }

      // 결제 성공 이메일 재발송
      await sendPaymentSuccessEmail(userEmail, {
        orderId: orderId,
        amount: amount || 9900,
        goodsName: goodsName || "스토어부스터 부스터 플랜",
        paymentDate: new Date(),
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30일 후
      });

      console.log(`결제 성공 이메일 재발송 완료: ${userEmail}`);

      res.json({ 
        success: true, 
        message: "결제 성공 이메일이 재발송되었습니다.",
        data: {
          email: userEmail,
          orderId: orderId
        }
      });

    } catch (error: any) {
      console.error("이메일 재발송 중 오류:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // GET /api/membership/type - 사용자의 멤버십 타입 확인
  app.get('/api/membership/type/:uid', async (req, res) => {
    try {
      const { uid } = req.params;
      
      if (!uid) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          message: 'uid is required' 
        });
      }

      // 인증 및 권한 확인
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      if (uid !== authUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'uid mismatch' });
      }

      const db = admin.firestore();
      
      // 구독 정보 조회 (활성 또는 취소된 구독)
      const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
      
      let membershipType = 'basic';
      let subscriptionInfo = null;
      
      if (subscriptionDoc.exists) {
        const subscriptionData = subscriptionDoc.data();
        
        // plan이 BOOSTER이고 아직 해지 예정일이 지나지 않았으면 booster
        if (subscriptionData?.plan === 'BOOSTER') {
          const endDate = subscriptionData.endDate?.toDate?.() || new Date();
          const now = new Date();
          
          // 해지 예정일까지는 부스터 멤버십 사용 가능
          if (endDate > now) {
            membershipType = 'booster';
            subscriptionInfo = {
              status: subscriptionData.status,
              plan: subscriptionData.plan,
              endDate: subscriptionData.endDate?.toDate?.()?.toISOString(),
              isExpired: false
            };
          } else {
            subscriptionInfo = {
              status: subscriptionData.status,
              plan: subscriptionData.plan,
              endDate: subscriptionData.endDate?.toDate?.()?.toISOString(),
              isExpired: true
            };
          }
        } else {
          subscriptionInfo = {
            status: subscriptionData?.status,
            plan: subscriptionData?.plan,
            endDate: subscriptionData?.endDate?.toDate?.()?.toISOString(),
            isExpired: false
          };
        }
      }

      res.json({ 
        success: true, 
        data: {
          uid: uid,
          membershipType: membershipType,
          subscriptionInfo: subscriptionInfo
        }
      });

    } catch (error: any) {
      console.error("멤버십 타입 확인 중 오류:", error);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    }
  });

  // ===== 계정 병합 API =====
  app.post('/api/auth/merge-account', async (req, res) => {
    try {
      const { emailAccountUid, socialProvider, socialUid, email, password, phoneNumber, birthDate, socialName, socialEmail } = req.body;
      
      if (!emailAccountUid || !socialProvider || !socialUid || !email) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          message: 'emailAccountUid, socialProvider, socialUid, email are required' 
        });
      }

      const db = admin.firestore();
      
      // 1. 이메일 계정의 자격 증명으로 재인증
      let emailUser;
      try {
        emailUser = await admin.auth().getUser(emailAccountUid);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          return res.status(404).json({ error: 'Email account not found' });
        }
        throw error;
      }

      // 2. 소셜 계정 정보 가져오기
      let socialUser;
      try {
        socialUser = await admin.auth().getUser(socialUid);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          return res.status(404).json({ error: 'Social account not found' });
        }
        throw error;
      }

      // 3. 이메일 계정의 Firestore 데이터 가져오기
      const emailUserInfoRef = db.collection('usersInfo').doc(emailAccountUid);
      const emailUserInfoSnap = await emailUserInfoRef.get();
      
      if (!emailUserInfoSnap.exists) {
        return res.status(404).json({ error: 'Email user info not found' });
      }
      
      const emailUserInfo = emailUserInfoSnap.data();
      
      if (!emailUserInfo) {
        return res.status(404).json({ error: 'Email user info data is null' });
      }

      // 4. 소셜 계정의 Firestore 데이터 가져오기 (없으면 생성)
      const socialUserInfoRef = db.collection('usersInfo').doc(socialUid);
      const socialUserInfoSnap = await socialUserInfoRef.get();
      
      let socialUserInfo: any = {};
      
      if (socialUserInfoSnap.exists) {
        const data = socialUserInfoSnap.data();
        if (data) {
          socialUserInfo = data;
        }
      }
      
      // 소셜 계정 정보가 없으면 기본 정보로 초기화 (간편 회원가입과 동일한 형식)
      if (!socialUserInfo.email) {
        socialUserInfo = {
          email: socialUser.email || '',
          name: socialUser.displayName || '',
          provider: socialProvider,
          emailVerified: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          // 휴대폰 번호는 나중에 계정 병합 시 설정
          ...socialUserInfo
        };
      }

      // 5. 데이터 병합 (소셜 계정 정보 우선, 이메일 계정에서 필요한 정보만 추가)
      const mergedUserInfo: any = {
        ...socialUserInfo,
        // 간편 회원가입 정보 (소셜에서 받아온 정보 우선 사용)
        email: socialEmail || socialUserInfo.email || socialUser.email,
        name: socialName || socialUserInfo.name || socialUser.displayName,
        provider: socialUserInfo.provider || socialProvider,
        emailVerified: true, // 불리언으로 저장
        createdAt: emailUserInfo.createdAt || socialUserInfo.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // 휴대폰 번호 (계정 병합 시 인증된 휴대폰 번호 우선 사용)
        number: phoneNumber || socialUserInfo.number,
        // 생년월일 정보 (계정 병합 시 전달받은 정보 우선 사용)
        birthDate: birthDate || socialUserInfo.birthDate,
        // 이메일 계정에서 추가할 정보들
        businessName: emailUserInfo.businessName || socialUserInfo.businessName,
        businessLink: emailUserInfo.businessLink || socialUserInfo.businessLink,
        // 계정 병합 관련 정보
        mergedFromEmailAccount: true,
        mergedAt: admin.firestore.FieldValue.serverTimestamp(),
        originalEmail: emailUserInfo.email,
        originalUid: emailUserInfo.uid,
      };

      // undefined 값 제거
      Object.keys(mergedUserInfo).forEach(key => {
        if (mergedUserInfo[key] === undefined) {
          delete mergedUserInfo[key];
        }
      });

      // 6. Usage 데이터 병합 (실제 경로에 맞게 수정)
      // 이메일 계정의 경우 이메일 주소를 안전한 형태로 변환
      const getSafeEmail = (email: string) => {
        return email
          .replace(/\./g, '_dot_')
          .replace(/@/g, '_at_')
          .replace(/-/g, '_dash_')
          .replace(/\+/g, '_plus_');
      };
      
      const emailDocPath = emailUserInfo.email ? getSafeEmail(emailUserInfo.email) : emailAccountUid.replace(/[^a-zA-Z0-9]/g, '_');
      const emailUsageRef = db.collection('users').doc(emailDocPath).collection('usage');
      const socialUsageRef = db.collection('users').doc(socialUid.replace(/[^a-zA-Z0-9]/g, '_')).collection('usage');
      
      console.log(`[MERGE] Usage 병합 - 이메일 경로: ${emailDocPath}, 소셜 경로: ${socialUid.replace(/[^a-zA-Z0-9]/g, '_')}`);
      
      const emailUsageSnap = await emailUsageRef.get();
      console.log(`[MERGE] 이메일 Usage 문서 개수: ${emailUsageSnap.size}`);
      
      if (!emailUsageSnap.empty) {
        const batch = db.batch();
        emailUsageSnap.docs.forEach(doc => {
          const usageData = doc.data();
          const socialUsageDocRef = socialUsageRef.doc(doc.id);
          batch.set(socialUsageDocRef, usageData, { merge: true });
          console.log(`[MERGE] Usage 문서 병합: ${doc.id}`);
        });
        await batch.commit();
        console.log(`[MERGE] Usage 병합 완료`);
      }

      // 7. History 데이터 병합
      const emailHistoryRef = db.collection('users').doc(emailDocPath).collection('history');
      const socialHistoryRef = db.collection('users').doc(socialUid.replace(/[^a-zA-Z0-9]/g, '_')).collection('history');
      
      console.log(`[MERGE] History 병합 - 이메일 경로: ${emailDocPath}, 소셜 경로: ${socialUid.replace(/[^a-zA-Z0-9]/g, '_')}`);
      
      const emailHistorySnap = await emailHistoryRef.get();
      console.log(`[MERGE] 이메일 History 문서 개수: ${emailHistorySnap.size}`);
      
      if (!emailHistorySnap.empty) {
        const batch = db.batch();
        emailHistorySnap.docs.forEach(doc => {
          const historyData = doc.data();
          const socialHistoryDocRef = socialHistoryRef.doc(doc.id);
          batch.set(socialHistoryDocRef, historyData, { merge: true });
          console.log(`[MERGE] History 문서 병합: ${doc.id}`);
        });
        await batch.commit();
        console.log(`[MERGE] History 병합 완료`);
      }

      // 8. 구독 정보 병합
      const subscriptionsRef = db.collection('subscriptions');
      const emailSubscriptionsQuery = subscriptionsRef.where('uid', '==', emailAccountUid);
      const emailSubscriptionsSnap = await emailSubscriptionsQuery.get();
      
      if (!emailSubscriptionsSnap.empty) {
        const batch = db.batch();
        emailSubscriptionsSnap.docs.forEach(doc => {
          const subscriptionData = doc.data();
          subscriptionData.uid = socialUid; // 소셜 계정 UID로 변경
          subscriptionData.mergedFromEmailAccount = true;
          subscriptionData.mergedAt = admin.firestore.FieldValue.serverTimestamp();
          
          const newSubscriptionRef = subscriptionsRef.doc();
          batch.set(newSubscriptionRef, subscriptionData);
          batch.delete(doc.ref); // 기존 구독 정보 삭제
        });
        await batch.commit();
      }

      // 9. 결제 수단 정보 병합
      const emailBillingKeyRef = db.collection('billingKeys').doc(emailAccountUid);
      const socialBillingKeyRef = db.collection('billingKeys').doc(socialUid);
      
      const emailBillingKeySnap = await emailBillingKeyRef.get();
      if (emailBillingKeySnap.exists) {
        const billingKeyData = emailBillingKeySnap.data();
        if (billingKeyData) {
          billingKeyData.mergedFromEmailAccount = true;
          billingKeyData.mergedAt = admin.firestore.FieldValue.serverTimestamp();
          
          await socialBillingKeyRef.set(billingKeyData, { merge: true });
          await emailBillingKeyRef.delete();
        }
      }

      // 10. Firebase Auth에 휴대폰 번호 설정 (소셜 계정에 직접 설정)
      try {
        // 휴대폰 번호를 E.164 형식으로 변환
        const e164PhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
        
        await admin.auth().updateUser(socialUid, {
          phoneNumber: e164PhoneNumber,
          displayName: socialName || socialUser.displayName || '',
          email: socialEmail || socialUser.email || ''
        });
        console.log(`[MERGE] 휴대폰 번호 설정 완료: ${e164PhoneNumber} -> ${socialUid}`);
      } catch (phoneError: any) {
        console.error('[MERGE] 휴대폰 번호 설정 실패:', phoneError);
        // 휴대폰 번호 설정 실패 시에도 계속 진행 (Firestore 데이터는 병합)
      }

      // 11. 소셜 계정의 사용자 정보 업데이트 (병합된 데이터로 완전히 교체)
      await socialUserInfoRef.set(mergedUserInfo);

      // 11. 이메일 계정의 사용자 정보 삭제
      await emailUserInfoRef.delete();

      // 12. 이메일 계정의 Usage 컬렉션 삭제
      const emailUsageSnapForDelete = await emailUsageRef.get();
      if (!emailUsageSnapForDelete.empty) {
        const batch = db.batch();
        emailUsageSnapForDelete.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }

      // 13. 이메일 계정의 History 컬렉션 삭제
      const emailHistorySnapForDelete = await emailHistoryRef.get();
      if (!emailHistorySnapForDelete.empty) {
        const batch = db.batch();
        emailHistorySnapForDelete.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }

      // 14. 이메일 계정 삭제
      await admin.auth().deleteUser(emailAccountUid);

      // 15. 소셜 계정용 커스텀 토큰 생성
      const customToken = await admin.auth().createCustomToken(socialUid);

      res.json({
        success: true,
        message: 'Account merged successfully',
        customToken,
        socialUid,
        mergedData: {
          email: mergedUserInfo.email || mergedUserInfo.originalEmail,
          name: mergedUserInfo.name || mergedUserInfo.originalName,
          provider: socialProvider
        }
      });

    } catch (error: any) {
      console.error('Account merge error:', error);
      res.status(500).json({
        error: 'Account merge failed',
        message: error.message || 'Internal server error'
      });
    }
  });

  // ===== 휴대폰 번호 업데이트 API =====
  app.post('/api/auth/update-phone', async (req, res) => {
    try {
      const authUid = await verifyAuthUid(req, res);
      if (!authUid) return;
      const { uid, phoneNumber } = req.body;
      
      if (authUid !== uid) {
        return res.status(403).json({ error: 'Forbidden', message: 'uid mismatch' });
      }
      
      if (!uid || !phoneNumber) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          message: 'uid and phoneNumber are required' 
        });
      }

      // 휴대폰 번호를 E.164 형식으로 변환
      const e164PhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      
      // Firebase Auth에 휴대폰 번호 설정
      await admin.auth().updateUser(uid, {
        phoneNumber: e164PhoneNumber
      });

      console.log(`[UPDATE-PHONE] 휴대폰 번호 설정 완료: ${e164PhoneNumber} -> ${uid}`);

      res.json({
        success: true,
        message: 'Phone number updated successfully',
        phoneNumber
      });

    } catch (error: any) {
      console.error('[UPDATE-PHONE] 휴대폰 번호 업데이트 실패:', error);
      res.status(500).json({
        error: 'Phone number update failed',
        message: error.message || 'Internal server error'
      });
    }
  });




  // POST /api/extension-usage/consume - 확장 직접 사용 시 월간 사용량 1회 소비 (Basic 20회 제한)
  app.post('/api/extension-usage/consume', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token) {
        // console.warn('[UsageDebug][Server] consume 요청: 토큰 없음');
        return res.status(401).json({ allowed: false, message: 'Missing Authorization Bearer token' });
      }
      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;
      const db = admin.firestore();
      // console.log('[UsageDebug][Server] consume 요청 수신 ←', { uid, now: new Date().toISOString() });
      console.log('[UsageDebug][Server] consume 요청 수신 ←', { uid, now: new Date().toISOString() });

      // 멤버십 타입 확인 (기존 로직 재사용)
      let membershipType = 'basic';
      const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
      if (subscriptionDoc.exists) {
        const subscriptionData = subscriptionDoc.data();
        if (subscriptionData?.plan === 'BOOSTER') {
          const endDate = subscriptionData.endDate?.toDate?.() || new Date();
          const now = new Date();
          if (endDate > now) {
            membershipType = 'booster';
          }
        }
      }
      console.log('[UsageDebug][Server] consume 멤버십 판정 →', { uid, membershipType });

      if (membershipType === 'booster') {
        // 부스터는 소모 없이 허용
        console.log('[UsageDebug][Server] consume 부스터 → 카운트 소모 없이 허용');
        return res.json({ allowed: true, membershipType, currentCount: 0, limit: Number.MAX_SAFE_INTEGER });
      }

      const limit = 20;
      const now = new Date();
      const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`; // YYYYMM
      const docId = `${uid}_${monthKey}`;
      const ref = db.collection('extensionUsage').doc(docId);

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? (snap.data()?.count || 0) : 0;
        console.log('[UsageDebug][Server] consume 현재 카운트 →', { uid, monthKey, current, limit });
        if (current >= limit) {
          return { allowed: false, currentCount: current, limit, membershipType };
        }
        const next = current + 1;
        if (snap.exists) {
          tx.update(ref, { count: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } else {
          tx.set(ref, { count: next, month: monthKey, uid, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        return { allowed: true, currentCount: next, limit, membershipType };
      });

      console.log('[UsageDebug][Server] consume 결과 →', { uid, result });
      if (!result.allowed) {
        return res.status(429).json(result);
      }
      return res.json(result);
    } catch (error) {
      console.error('extension-usage/consume error:', error);
      return res.status(500).json({ allowed: false, message: 'Internal server error' });
    }
  });

  // GET /api/extension-usage/status - 현재 월 사용량/제한 조회 (소비 없이 조회)
  app.get('/api/extension-usage/status', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token) {
        // console.warn('[UsageDebug][Server] status 요청: 토큰 없음');
        return res.status(401).json({ message: 'Missing Authorization Bearer token' });
      }
      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;
      const db = admin.firestore();
      // console.log('[UsageDebug][Server] status 요청 수신 ←', { uid, origin: req.headers.origin, ua: req.headers['user-agent'] });
      // console.log('[UsageDebug][Server] status 요청 수신 ←', { uid, origin: req.headers.origin, ua: req.headers['user-agent'] });

      // 멤버십 타입 확인
      let membershipType = 'basic';
      const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
      if (subscriptionDoc.exists) {
        const subscriptionData = subscriptionDoc.data();
        if (subscriptionData?.plan === 'BOOSTER') {
          const endDate = subscriptionData.endDate?.toDate?.() || new Date();
          const now = new Date();
          if (endDate > now) {
            membershipType = 'booster';
          }
        }
      }
      // console.log('[UsageDebug][Server] status 멤버십 판정 →', { uid, membershipType });

      const limit = membershipType === 'basic' ? 20 : Number.MAX_SAFE_INTEGER;
      const now = new Date();
      const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`; // YYYYMM
      const docId = `${uid}_${monthKey}`;
      const ref = db.collection('extensionUsage').doc(docId);
      const snap = await ref.get();
      const current = snap.exists ? (snap.data()?.count || 0) : 0;
      // console.log('[UsageDebug][Server] status 현재 카운트 →', { uid, monthKey, exists: snap.exists, current, limit });

      const payload = {
        success: true,
        data: {
          membershipType,
          month: monthKey,
          currentCount: current,
          limit
        }
      };
      // console.log('[UsageDebug][Server] status 응답 →', payload);
      return res.json(payload);
    } catch (error) {
      console.error('extension-usage/status error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ============= 확장프로그램용 사용량 API (토큰 없이 식별자로 요청) =============
  
  // 식별자(이메일/폰/UID)로 Firebase UID 찾기 헬퍼 함수
  async function findUidByIdentifier(identifier: string): Promise<string | null> {
    try {
      const db = admin.firestore();
      
      // 1. 이메일로 찾기
      if (identifier.includes('@')) {
        try {
          const userRecord = await admin.auth().getUserByEmail(identifier);
          return userRecord.uid;
        } catch (e) {
          // 이메일로 찾지 못함, 다른 방법 시도
        }
      }
      
      // 2. 폰번호로 찾기
      if (identifier.startsWith('+') || /^\d+$/.test(identifier)) {
        try {
          const phoneNumber = identifier.startsWith('+') ? identifier : `+82${identifier}`;
          const userRecord = await admin.auth().getUserByPhoneNumber(phoneNumber);
          return userRecord.uid;
        } catch (e) {
          // 폰번호로 찾지 못함, 다른 방법 시도
        }
      }
      
      // 3. UID로 직접 확인
      try {
        await admin.auth().getUser(identifier);
        return identifier; // 유효한 UID
      } catch (e) {
        // UID도 아님
      }
      
      // 4. Firestore users 컬렉션에서 커스텀 필드로 검색
      const usersRef = db.collection('users');
      
      // 이메일 필드로 검색
      if (identifier.includes('@')) {
        const emailQuery = await usersRef.where('email', '==', identifier).limit(1).get();
        if (!emailQuery.empty) {
          return emailQuery.docs[0].id;
        }
      }
      
      // 폰번호 필드로 검색  
      const phoneQuery = await usersRef.where('phoneNumber', '==', identifier).limit(1).get();
      if (!phoneQuery.empty) {
        return phoneQuery.docs[0].id;
      }
      
      return null;
    } catch (error) {
      console.error('findUidByIdentifier error:', error);
      return null;
    }
  }

  // POST /api/usage/consume - 확장프로그램용 사용량 소비 (식별자 기반)
  app.post('/api/usage/consume', async (req, res) => {
    try {
      const { identifier, action, timestamp } = req.body;
      
      if (!identifier) {
        return res.status(400).json({ 
          allowed: false, 
          message: 'identifier is required' 
        });
      }

      console.log('[UsageDebug][Server][Extension] consume 요청 수신 ←', { 
        identifier: identifier.slice(0, 10) + '***', // 로그용 마스킹
        action, 
        timestamp,
        now: new Date().toISOString() 
      });

      // 식별자로 UID 찾기
      const uid = await findUidByIdentifier(identifier);
      if (!uid) {
        console.log('[UsageDebug][Server][Extension] consume UID 찾기 실패 →', { identifier: identifier.slice(0, 10) + '***' });
        return res.status(404).json({ 
          allowed: false, 
          message: 'User not found' 
        });
      }

      const db = admin.firestore();
      console.log('[UsageDebug][Server][Extension] consume UID 찾기 성공 →', { uid });

      // 멤버십 타입 확인
      let membershipType = 'basic';
      const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
      if (subscriptionDoc.exists) {
        const subscriptionData = subscriptionDoc.data();
        if (subscriptionData?.plan === 'BOOSTER') {
          const endDate = subscriptionData.endDate?.toDate?.() || new Date();
          const now = new Date();
          if (endDate > now) {
            membershipType = 'booster';
          }
        }
      }
      console.log('[UsageDebug][Server][Extension] consume 멤버십 판정 →', { uid, membershipType });

      if (membershipType === 'booster') {
        console.log('[UsageDebug][Server][Extension] consume 부스터 → 카운트 소모 없이 허용');
        return res.json({ 
          allowed: true, 
          membershipType, 
          currentCount: 0, 
          limit: Number.MAX_SAFE_INTEGER 
        });
      }

      const limit = 20;
      const now = new Date();
      const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`; // YYYYMM
      const docId = `${uid}_${monthKey}`;
      const ref = db.collection('extensionUsage').doc(docId);

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? (snap.data()?.count || 0) : 0;
        console.log('[UsageDebug][Server][Extension] consume 현재 카운트 →', { uid, monthKey, current, limit });
        
        if (current >= limit) {
          return { allowed: false, currentCount: current, limit, membershipType };
        }
        
        const next = current + 1;
        if (snap.exists) {
          tx.update(ref, { 
            count: next, 
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastAction: action || 'seo_analysis'
          });
        } else {
          tx.set(ref, { 
            count: next, 
            month: monthKey, 
            uid,
            lastAction: action || 'seo_analysis',
            createdAt: admin.firestore.FieldValue.serverTimestamp(), 
            updatedAt: admin.firestore.FieldValue.serverTimestamp() 
          });
        }
        return { allowed: true, currentCount: next, limit, membershipType };
      });

      console.log('[UsageDebug][Server][Extension] consume 결과 →', { uid, result });
      
      if (!result.allowed) {
        return res.status(429).json(result);
      }
      return res.json(result);
      
    } catch (error) {
      console.error('[Extension] usage/consume error:', error);
      return res.status(500).json({ 
        allowed: false, 
        message: 'Internal server error' 
      });
    }
  });

  // POST /api/usage/check - 확장프로그램용 사용량 조회 (식별자 기반)
  app.post('/api/usage/check', async (req, res) => {
    try {
      const { identifier, timestamp } = req.body;
      
      if (!identifier) {
        return res.status(400).json({ 
          allowed: false, 
          message: 'identifier is required' 
        });
      }

      console.log('[UsageDebug][Server][Extension] check 요청 수신 ←', { 
        identifier: identifier.slice(0, 10) + '***', // 로그용 마스킹
        timestamp,
        now: new Date().toISOString() 
      });

      // 식별자로 UID 찾기
      const uid = await findUidByIdentifier(identifier);
      if (!uid) {
        console.log('[UsageDebug][Server][Extension] check UID 찾기 실패 →', { identifier: identifier.slice(0, 10) + '***' });
        return res.status(404).json({ 
          allowed: false, 
          message: 'User not found' 
        });
      }

      const db = admin.firestore();
      console.log('[UsageDebug][Server][Extension] check UID 찾기 성공 →', { uid });

      // 멤버십 타입 확인
      let membershipType = 'basic';
      const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
      if (subscriptionDoc.exists) {
        const subscriptionData = subscriptionDoc.data();
        if (subscriptionData?.plan === 'BOOSTER') {
          const endDate = subscriptionData.endDate?.toDate?.() || new Date();
          const now = new Date();
          if (endDate > now) {
            membershipType = 'booster';
          }
        }
      }
      console.log('[UsageDebug][Server][Extension] check 멤버십 판정 →', { uid, membershipType });

      const limit = membershipType === 'basic' ? 20 : Number.MAX_SAFE_INTEGER;
      const now = new Date();
      const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`; // YYYYMM
      const docId = `${uid}_${monthKey}`;
      const ref = db.collection('extensionUsage').doc(docId);
      const snap = await ref.get();
      const current = snap.exists ? (snap.data()?.count || 0) : 0;
      const allowed = current < limit;

      console.log('[UsageDebug][Server][Extension] check 현재 카운트 →', { 
        uid, 
        monthKey, 
        exists: snap.exists, 
        current, 
        limit, 
        allowed 
      });

      const result = {
        allowed,
        membershipType,
        currentCount: current,
        limit
      };

      console.log('[UsageDebug][Server][Extension] check 응답 →', result);
      return res.json(result);
      
    } catch (error) {
      console.error('[Extension] usage/check error:', error);
      return res.status(500).json({ 
        allowed: false, 
        message: 'Internal server error' 
      });
    }
  });

  // POST /api/optimize-original-name { productName }
  app.post('/api/optimize-original-name', generateNameLimiter, async (req, res) => {
    const { productName } = req.body || {};
    if (!productName || typeof productName !== 'string' || !productName.trim()) {
      return res.status(400).json({ error: 'Missing productName' });
    }

    const apiKey = process.env.CLAUDE_OPTIMIZE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const reqKey = `original:${productName}`;
    // cache
    const cached = generateNameCache.get(reqKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.value);
    }

    // in-flight merge
    const existing = inFlightGenerateName.get(reqKey);
    if (existing) {
      try {
        const merged = await existing;
        return res.json(merged);
      } catch {}
    }

    const client = new Anthropic({ apiKey, maxRetries: 2 });

    const prompt = `## 목표
기존 상품명의 단어를 단어 배치 규칙 순서대로 재배열한 상품명 생성

## 기존 상품명: ${productName}

## 단어 배치 규칙 (반드시 번호 순서대로만 배치할 것)
1. 브랜드/제조사
2. 시리즈  
3. 모델명
4. 상품 유형
5. 색상
6. 소재
7. 패키지 내용물 수량
8. 사이즈
9. 성별,나이 표현
10. 속성

## 중요 규칙
- 반드시 1번부터 10번 순서대로 단어를 배치해 상품명을 생성할 것
- 같은 카테고리에 속하는 단어들은 반드시 연속해서 묶어 배치
- 기존 상품명의 모든 단어를 사용할 것 
- 중복 단어도 모두 사용할 것
- 단어 생략 금지 

## 작업 과정
1. 먼저 각 단어를 1-10번 카테고리로 분류
2. 분류된 카테고리 번호 순서대로 단어들을 배치
3. 반드시 번호 순서대로 단어들을 배치해 최종 상품명 생성

## 응답 출력 형식 (정확히 이 형식을 따를 것):
단어 카테고리 분류 : [단어 카테고리 분류]
최적화 이유: [상품명 배치 이유, 각 단어가 몇 번 카테고리에 해당하는지 설명]
상품명: [1번부터 10번 순서대로 재배열한 상품명]`;

    

    const call = async () => {
      const response = await (client as any).messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 500,
        temperature: 0.1,
        top_p: 0.1,
        system: '순서 규칙 절대 준수',
        messages: [
          { role: 'user', content: prompt }
        ],
      });
      let textRaw: any = (response as any).content ?? (response as any).choices?.[0]?.message?.content;
      if (Array.isArray(textRaw)) {
        textRaw = textRaw.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('');
      }
      const text = typeof textRaw === 'string' ? textRaw : String(textRaw || '');
      

        
        return text.trim();
    };

    const promise = (async () => {
      const release = await generateNameSemaphore.acquire();
      try {
        const raw = await call();
        
        // 단순 파싱: 마지막 "상품명:" 에서 상품명 추출
        const nameMatch = raw.match(/상품명:\s*(.+?)(?:\n|$)/g);
        const productNameRes = nameMatch ? nameMatch[nameMatch.length - 1].replace('상품명:', '').trim() : '';
        
        // 1) 단어 분류 섹션 추출 (다양한 패턴 지원)
        let classificationSection = '';
        try {
          // "단어 카테고리 분류:" 패턴 (콜론 포함)
          let clsMatch = raw.match(/단어 카테고리 분류:\s*([\s\S]*?)(?=\n상품명:|상품명:|최적화 이유:|$)/);
          if (clsMatch && clsMatch[1]) {
            classificationSection = clsMatch[1].trim();
          }
          
          // ### 단어 카테고리 분류 패턴
          if (!classificationSection) {
            clsMatch = raw.match(/### 단어 카테고리 분류\s*([\s\S]*?)(?=\n###|\n##|상품명:|최적화 이유:|$)/);
            if (clsMatch && clsMatch[1]) {
              classificationSection = clsMatch[1].trim();
            }
          }
          
          // ## 단어 분류 및 재배열 패턴
          if (!classificationSection) {
            clsMatch = raw.match(/## 단어 분류 및 재배열\s*([\s\S]*?)(?=\n###|\n##|상품명:|최적화 이유:|$)/);
            if (clsMatch && clsMatch[1]) {
              classificationSection = clsMatch[1].trim();
            }
          }
          
          // ### 단어 분류 패턴  
          if (!classificationSection) {
            clsMatch = raw.match(/### 단어 분류\s*([\s\S]*?)(?=\n###|\n##|상품명:|최적화 이유:|$)/);
            if (clsMatch && clsMatch[1]) {
              classificationSection = clsMatch[1].trim();
            }
          }
        } catch {}
        
        // 2) "### 최적화 이유" 섹션 추출
        let reasonSection = '';
        try {
          const reasonMatch = raw.match(/### 최적화 이유\s*([\s\S]*?)(?=\n###|\n##|$)/);
          if (reasonMatch && reasonMatch[1]) {
            reasonSection = reasonMatch[1].trim();
          }
        } catch {}
        
        // 3) "최적화 이유:" (콜론 포함) 이후 섹션도 확인
        if (!reasonSection) {
          const reasonMatch2 = raw.match(/최적화 이유:\s*([\s\S]+)$/);
          if (reasonMatch2) {
            reasonSection = reasonMatch2[1].replace(/\n상품명:.*$/, '').trim();
          }
        }
        
        // 분류 섹션과 이유 섹션을 합쳐서 포맷팅
        let formattedReason = '';
        
        if (classificationSection) {
          formattedReason += `단어 카테고리 분류\n${classificationSection}`;
        }
        
        if (reasonSection) {
          if (formattedReason) formattedReason += '\n\n';
          formattedReason += `최적화 이유\n${reasonSection}`;
        }
        
        // 분류나 이유가 둘 다 없으면 전체 응답에서 분류 정보를 찾아서 사용
        if (!formattedReason && raw.includes('브랜드/제조사:')) {
          // 1. 브랜드/제조사:부터 시작하는 분류 리스트 찾기
          const fallbackMatch = raw.match(/(1\.\s*브랜드\/제조사:[\s\S]*?)(?=상품명:|최적화 이유:|### |## |$)/);
          if (fallbackMatch) {
            formattedReason = `단어 카테고리 분류\n${fallbackMatch[1].trim()}`;
          }
          
          // 분류만 있고 이유가 없으면 최적화 이유도 찾아서 추가
          if (formattedReason && reasonSection) {
            formattedReason += `\n\n최적화 이유\n${reasonSection}`;
          }
        }
        
        const value = { productName: productNameRes, reason: formattedReason };
        
        generateNameCache.set(reqKey, { value, expiresAt: Date.now()+GENERATE_NAME_CACHE_TTL_MS});
        return value;
      } finally { release(); }
    })();

    inFlightGenerateName.set(reqKey, promise);
    try {
      const result = await promise;
      res.json(result);
    } catch (e:any) {
      console.error('[optimize-original-name] error', e);
      res.status(500).json({ error:'failed to generate' });
    } finally {
      inFlightGenerateName.delete(reqKey);
    }
  });

  const port = Number(process.env.PORT) || 5005;
  const httpServer = createServer(app);

  return httpServer;
}