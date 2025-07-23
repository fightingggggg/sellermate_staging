import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, log } from "./vite";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

const app = express();
// reverse proxy (Cloudtype 등) 뒤에서 실행 시 X-Forwarded-Proto 헤더를 신뢰하도록 설정
app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

  // --- sitemap.xml route (always before catch-all) ---
  const sitemapDev = path.resolve(import.meta.dirname, "..", "client", "public", "sitemap.xml");
  const sitemapProd = path.resolve(import.meta.dirname, "public", "sitemap.xml");
  app.get("/sitemap.xml", (req, res, next) => {
    const target = fs.existsSync(sitemapProd) ? sitemapProd : sitemapDev;
    res.sendFile(target, (err) => {
      if (err) next(err);
    });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    const distClient = path.resolve(import.meta.dirname, "public");
    const distServer = path.resolve(import.meta.dirname, "server");

    // 정적 자산 제공
    app.use(express.static(distClient, { maxAge: "1y", index: false }));

    app.get("*", async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.join(distClient, "index.html"), "utf-8");
        const manifestPath = path.join(distClient, "manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

        const { render } = await import(path.join(distServer, "entry-server.js"));
        const { html } = render(req.originalUrl);

        const entryInfo = manifest["src/entry-client.tsx"];
        const entry = entryInfo.file;
        const cssLinks = (entryInfo.css || [])
          .map((href: string) => `<link rel=\"stylesheet\" href=\"/${href}\"/>`)
          .join("");

        const page = template
          .replace("<div id=\"root\"></div>", `<div id=\"root\">${html}</div>`)
          .replace("</head>", `${cssLinks}</head>`)
          .replace("</body>", `<script type=\"module\" src=\"/${entry}\"></script></body>`);

        res.status(200).set({ "Content-Type": "text/html" }).end(page);
      } catch (e) {
        next(e);
      }
    });
  }

  // 프로덕션 환경에서는 환경변수에서 포트를 가져오고, 기본값은 5005
  const port = Number(process.env.PORT) || 5005;
  server.listen(
    {
      port,
      host: "0.0.0.0",
      // reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
