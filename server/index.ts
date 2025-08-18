import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { autoPaymentScheduler } from "./scheduler";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
dotenv.config();

const app = express();
// reverse proxy(Cloudtype 등) 뒤 1단 프록시만 신뢰하여 X-Forwarded-* 헤더를 안전하게 처리
app.set("trust proxy", 1);
// 텍스트 응답 압축 (gzip/deflate)
app.use(compression());
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));

// 보안 헤더 (CSP 활성화)
const isDev = app.get("env") === "development";
const cspDirectives: Record<string, string[]> = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  scriptSrc: [
    "'self'",
    // "'unsafe-inline'", // 프로덕션 기본 제거
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://www.googleadservices.com",
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    // reCAPTCHA 로더 및 자원 허용
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.recaptcha.net",
    "https://recaptcha.google.com"
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com"
  ],
  fontSrc: [
    "'self'",
    "https://fonts.gstatic.com",
    "data:"
  ],
  imgSrc: [
    "'self'",
    "data:",
    "https:"
  ],
  connectSrc: [
    "'self'",
    "https:", // Firebase/GA/NicePay 등 HTTPS 통신 허용
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://stats.g.doubleclick.net",
    "https://www.googleadservices.com",
    "https://pagead2.googlesyndication.com",
    // reCAPTCHA 통신 허용
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.recaptcha.net",
    "https://recaptcha.google.com"
  ],
  frameSrc: [
    "'self'",
    "https://www.googletagmanager.com",
    // Google Ads 전환 추적을 위한 도메인
    "https://td.doubleclick.net",
    "https://googleads.g.doubleclick.net",
    "https://www.googleadservices.com",
    // reCAPTCHA iframe 허용
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.recaptcha.net",
    "https://recaptcha.google.com"
  ]
};
if (isDev) {
  cspDirectives.scriptSrc.push("'unsafe-eval'");
  cspDirectives.connectSrc.push("ws:");
  cspDirectives.scriptSrc.push("http://localhost:5173", "http://127.0.0.1:5173");
  cspDirectives.connectSrc.push("http://localhost:5173", "http://127.0.0.1:5173");
  // 개발 편의를 위해 인라인 스크립트 허용 (프로덕션에서는 비허용)
  cspDirectives.scriptSrc.push("'unsafe-inline'");
  // 개발에서 GA/GTM iframe 렌더 시 제한 완화
  cspDirectives.frameSrc.push("https://www.google.com", "https://www.youtube.com");
}
app.use(helmet({
  contentSecurityPolicy: { directives: cspDirectives },
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
}));

// 레이트 리밋 (민감 API 위주 경로)
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(['/api/nicepay', '/api/auth', '/api/payment', '/api/ext'], sensitiveLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      // 민감 경로는 응답 본문을 로깅하지 않음
      const isSensitivePath = path.startsWith('/api/nicepay') || path.startsWith('/api/auth');

      // 간단한 마스킹 함수
      const sanitizeObject = (obj: any): any => {
        const sensitiveKeys = new Set([
          'email', 'buyerEmail', 'authorization', 'Authorization', 'token', 'idToken',
          'cardNo', 'cardPw', 'pwd_2digit', 'birth', 'idNo', 'billingKey', 'authToken',
        ]);
        if (obj == null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(sanitizeObject);
        const sanitized: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (sensitiveKeys.has(k)) {
            sanitized[k] = '[REDACTED]';
          } else if (v && typeof v === 'object') {
            sanitized[k] = sanitizeObject(v);
          } else {
            sanitized[k] = v;
          }
        }
        return sanitized;
      };

      if (!isSensitivePath && capturedJsonResponse) {
        try {
          const safeBody = sanitizeObject(capturedJsonResponse);
          logLine += ` :: ${JSON.stringify(safeBody)}`;
        } catch {
          // ignore sanitize errors
        }
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    // throw err; // 응답 후 예외 재-throw 제거 (프로세스 안정성)
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // 프로덕션 환경에서는 환경변수에서 포트를 가져오고, 기본값은 5005
  const port = Number(process.env.PORT) || 5005;
  
  // 자동 결제 스케줄러 시작
  autoPaymentScheduler.start();
  
  server.listen(
    {
      port,
      host: "0.0.0.0",
      // reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      log(`자동 결제 스케줄러가 시작되었습니다.`);
    },
  );
})();
