import type { Express } from "express";
import { createServer, type Server } from "http";
import { sendVerificationEmail } from "./email";
import crypto from "crypto";
import cors from "cors";



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

  const port = Number(process.env.PORT) || 5005;
  const httpServer = createServer(app);

  return httpServer;
}
