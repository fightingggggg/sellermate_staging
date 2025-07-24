import type { Express } from "express";
import { createServer, type Server } from "http";
import { sendVerificationEmail } from "./email";
import crypto from "crypto";
import admin from "firebase-admin";
// ensure admin initialized via email.ts or here fallback
if (!admin.apps.length) {
  admin.initializeApp();
}
// fetch: Node 18+ 전역 지원 (node-fetch 불필요)
import cors from "cors";

// ===== 네이버 간편 로그인 =====
// 메모리 기반 state 저장 (재시작 시 초기화)
const naverOAuthStates: Map<string, { popup?: boolean }> = new Map();

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS 설정 추가
  const corsOptions = {
    origin: [
      'https://storebooster.ai.kr',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  };
  
  app.use(cors(corsOptions));

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
  app.post('/api/generate-name', async (req, res) => {
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

    console.log('[generate-name] params', { query, keyword, keywordCountNum });

    // 응답 파싱 함수
    const parseResponse = (response: string) => {
      const productNameMatch = response.match(/상품명:\s*(.+?)(?=\s*최적화 이유:|$)/);
      const reasonMatch = response.match(/최적화 이유:\s*([\s\S]+)$/);
      
      return {
        productName: productNameMatch?.[1]?.trim() || '',
        reasonDetails: reasonMatch?.[1]?.trim() || ''
      };
    };

    try {
      // 타입 안전한 import
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey, maxRetries: 0 });
      
      const prompt = `
      ## 목표
      네이버 스마트스토어 상위노출 최적화 상품명 1개 생성

      ## 입력값
        - **필수 키워드: ${query}**
        - **상위 키워드: ${keyword}**

      ## 상품명 생성 규칙 (매우 중요)
        - **입력값에 제공된 단어만 사용할 것 (새로운 단어 생성 금지)**
        - **${query}는 모두 원본 형태 그대로 반드시 개별 단독 사용 필수**
        - 필수 키워드가 2개 이상인 경우 떨어져서 배치
        - 정확히 ${keywordCount}개의 단어만 사용 
        - **입력값의 단어, 띄어쓰기 등 원본 그대로 사용(변경 금지)**
        - 동일 단어 반복 금지 (단,필수 키워드와 동일 상위 키워드는 떨어져서 배치하면 반복 가능)
        - 상위 키워드 순서가 중요도 순서

      ## 상품명 구성 순서
        * 해당 항목이 없는 경우 생략하고 상위 키워드 순서대로 배치 
        1.브랜드/제조사
        2.시리즈
        3.모델명
        4.다양한 상품유형
        5.필수 키워드
        5.색상
        6.소재 
        7.수량/용량 
        8.사이즈 
        9.성별/나이 
        10.속성
    
        ## 출력 형식:
        상품명: [상품명]
        최적화 이유: [번호 매겨 근거 자세히 설명]`;

      console.log('[generate-name] calling Claude once (no retry)');

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        temperature: 0.2,
        top_p: 0.2,
        max_tokens: 500,
        system: '너는 네이버 스마트스토어 SEO 전문가.',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: prompt }],
          },
        ],
      });

      // 타입 안전한 텍스트 추출
      const firstContent = response.content?.[0];
      const aiResponse = 
        firstContent && firstContent.type === 'text' 
          ? firstContent.text.trim() 
          : '';

      console.log('[generate-name] Claude API response received');
          
      if (!aiResponse) {
        return res.status(500).json({ error: 'Claude API에서 응답을 받지 못했습니다' });
      }

      // 개선된 응답 파싱
      const { productName, reasonDetails } = parseResponse(aiResponse);

      if (!productName) {
        return res.status(500).json({ error: '상품명을 파싱할 수 없습니다' });
      }

      const reason = `(판매 상품에 맞는 브랜드, 용량, 수량, 시리즈 등을 검색하거나 변경해 활용하세요)\n` +
        `* 네이버 상품명 SEO 규칙 준수 \"브랜드/제조사-시리즈-모델명-상품 유형-색상-소재-패키지 수량-사이즈-성별 나이 표현-속성-판매옵션\" 순서로 조합.\n` +
        reasonDetails;

      res.json({ productName, reason });

    } catch (err: unknown) {
      console.error('[generate-name] Claude API error detail', err);
      
      // err를 any로 타입 단언하여 속성 접근
      const error = err as any;
      
      // 더 구체적인 에러 처리
      if (error.status === 401) {
        return res.status(500).json({ 
          error: 'Claude API 인증 실패', 
          detail: 'API 키가 유효하지 않습니다. 새로운 API 키가 필요합니다.' 
        });
      } else if (error.status === 429) {
        return res.status(529).json({ error: 'Claude API 과부하 상태입니다. 잠시 후 다시 시도해주세요.' });
      } else if (error.status >= 500 || error.message?.includes('overloaded')) {
        return res.status(529).json({ error: '서버 오류' });
      }
      
      res.status(500).json({ 
        error: '상품명 생성 실패', 
        detail: error?.message || '알 수 없는 오류'
      });
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
    console.log('headers:', req.headers);
    
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
   * 네이버 쇼핑 검색 API를 호출해 상품 타이틀을 수집하고 키워드 빈도수를 요약합니다.
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

    const state = crypto.randomUUID();
    naverOAuthStates.set(state, {});

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
      console.log("[NAVER-OAUTH] Token JSON:", tokenJson);

      if (!tokenJson.access_token) {
        return res.status(500).send("failed to get access token");
      }

      const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      console.log("[NAVER-OAUTH] Profile res status:", profileRes.status);
      const profileJson = await profileRes.json();
      console.log("[NAVER-OAUTH] Profile JSON:", profileJson);

      const { id: naverId, email, nickname, name, mobile_e164, mobile, age } = profileJson.response || {};
      const phoneFromProfile = mobile_e164 || mobile || "";

      if (!naverId || !email) {
        console.error("[NAVER-OAUTH] Missing id/email from profile");
        return res.status(500).send("naver profile missing id/email");
      }

      /* ----------------------------------------------
       * Firebase 계정은 휴대폰 본인 인증 완료 후 생성하도록 지연합니다.
       * 따라서 여기서는 사용자 레코드를 사전 생성하지 않고 Custom Token 만 발급합니다.
       * 만약 이미 존재하는 UID 라면 getUser 가 성공하겠지만, 존재하지 않더라도
       * createCustomToken 은 문제없이 동작하며 최초 signIn 시 계정이 자동으로 생성됩니다.
       * ------------------------------------------- */
      const uid = `naver_${naverId}`;

      // 이미 존재하는 사용자인지만 확인 (없어도 무시)
      try {
        await admin.auth().getUser(uid);
      } catch (e: any) {
        if (e?.code !== "auth/user-not-found") {
          throw e;
        }
        // user-not-found인 경우에는 계정을 미리 만들지 않는다.
      }

      const db = admin.firestore();
      let phoneVerified = false;
      try {
        const snap = await db.collection("usersInfo").doc(uid).get();
        phoneVerified = snap.exists && !!snap.data()?.number;
      } catch (err) {
        console.warn("[NAVER-OAUTH] Firestore read error", err);
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

      const qs = new URLSearchParams(params).toString();
      const redirectUrl = `/naver-onboarding?${qs}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("[NAVER-OAUTH] Callback error:", err);
      return res.status(500).send("naver oauth error");
    }
  });

  // ===== Kakao 간편 로그인 =====
  const kakaoOAuthStates: Map<string, true> = new Map();

  // Kakao auth request
  app.get("/api/auth/kakao", (req, res) => {
    if (req.query.code) {
      // redirect misuse
      return res.redirect(`/api/auth/kakao/callback${req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""}`);
    }

    const clientId = process.env.KAKAO_CLIENT_ID;
    if (!clientId) return res.status(500).send("kakao env");

    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/kakao/callback`;
    const state = crypto.randomUUID();
    kakaoOAuthStates.set(state, true);

    const authUrl =
      `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    console.log("[KAKAO-OAUTH] Redirecting to", authUrl);
    res.redirect(authUrl);
  });

  // Kakao callback
  app.get("/api/auth/kakao/callback", async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || !kakaoOAuthStates.has(state)) return res.status(400).send("invalid");
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
      console.log("[KAKAO-OAUTH] token", tokenJson);
      if (!tokenJson.access_token) return res.status(500).send("no access token");

      const profRes = await fetch("https://kapi.kakao.com/v2/user/me", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const prof = await profRes.json();
      console.log("[KAKAO-OAUTH] profile", prof);

      const kakaoId = prof.id;
      const kakaoAcc = prof.kakao_account || {};
      const email = kakaoAcc.email || "";
      const nickname = kakaoAcc.profile?.nickname || "";
      const name = kakaoAcc.name || nickname;
      const phoneNumber = kakaoAcc.phone_number || "";
      const age = kakaoAcc.age_range || "";

      if (!kakaoId) return res.status(500).send("missing id");
      const uid = `kakao_${kakaoId}`;

      // 사전 계정 생성 없이 존재 여부만 확인
      try { await admin.auth().getUser(uid);} catch(e:any){ if(e?.code!=="auth/user-not-found") throw e; }

      // phone verify 여부 확인
      const db = admin.firestore();
      let phoneVerified = false;
      try {
        const snap = await db.collection("usersInfo").doc(uid).get();
        phoneVerified = snap.exists && !!snap.data()?.number;
      } catch (err) {
        console.warn("[KAKAO-OAUTH] Firestore read error", err);
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
      if (age) params.age = age;
      const qs = new URLSearchParams(params).toString();
      res.redirect(`/naver-onboarding?${qs}`);
    } catch(err){
      console.error(err);
      res.status(500).send("kakao error");
    }
  });

  /* -------------------------- 소셜 연결 해제 -------------------------- */
  app.post("/api/auth/naver/unlink", async (req, res) => {
    try {
      const { uid } = req.body as { uid?: string };
      if (!uid) return res.status(400).json({ error: "uid required" });
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
      const { uid } = req.body as { uid?: string };
      if (!uid) return res.status(400).json({ error: "uid required" });
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

  const port = Number(process.env.PORT) || 5005;
  const httpServer = createServer(app);

  return httpServer;
}
