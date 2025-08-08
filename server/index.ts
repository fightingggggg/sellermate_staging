import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { autoPaymentScheduler } from "./scheduler";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
dotenv.config();

const app = express();
// reverse proxy (Cloudtype 등) 뒤에서 실행 시 X-Forwarded-Proto 헤더를 신뢰하도록 설정
app.set("trust proxy", true);

// 보안 헤더 적용 (콘텐츠 정책은 필요에 따라 별도 설정 가능)
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

// 민감 API 레이트리밋 (IP 기준)
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 30, // 분당 30회
  standardHeaders: true,
  legacyHeaders: false,
});

// JSON 파서
app.use(express.json());

// 민감 경로에 제한 적용
app.use([
  "/api/nicepay",
  "/api/payment",
  "/api/refund",
  "/api/subscription",
], sensitiveLimiter);

// HTTPS 강제 (프록시 환경에서만 동작, 개발환경은 스킵)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    const proto = (req.headers['x-forwarded-proto'] || '').toString();
    if (proto && proto !== 'https') {
      const host = req.headers.host;
      return res.redirect(301, `https://${host}${req.url}`);
    }
  }
  next();
});

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
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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
    throw err;
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
      log(`자동 결제 스케줄러가 시작되었습니다. (5분마다 실행)`);
    },
  );
})();
