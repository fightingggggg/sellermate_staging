import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: ["localhost"]
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  log(`Serving static files from: ${distPath}`, "static");

  // 사이트맵과 robots.txt를 명시적으로 처리 (정적 파일 서빙보다 먼저)
  app.get('/sitemap.xml', (req, res) => {
    log(`Sitemap request received from: ${req.ip}`, "sitemap");
    log(`Request headers: ${JSON.stringify(req.headers)}`, "sitemap");
    
    const sitemapPath = path.resolve(distPath, 'sitemap.xml');
    log(`Looking for sitemap at: ${sitemapPath}`, "sitemap");
    
    if (fs.existsSync(sitemapPath)) {
      log(`Sitemap found, sending file`, "sitemap");
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(sitemapPath, (err) => {
        if (err) {
          log(`Error sending sitemap: ${err.message}`, "sitemap");
          res.status(500).send('Error serving sitemap');
        } else {
          log(`Sitemap sent successfully`, "sitemap");
        }
      });
    } else {
      log(`Sitemap not found at: ${sitemapPath}`, "sitemap");
      log(`Available files in distPath: ${fs.readdirSync(distPath).join(', ')}`, "sitemap");
      res.status(404).send('Sitemap not found');
    }
  });

  app.get('/robots.txt', (req, res) => {
    log(`Robots.txt request received from: ${req.ip}`, "robots");
    log(`Request headers: ${JSON.stringify(req.headers)}`, "robots");
    
    // 항상 동적으로 올바른 robots.txt 생성
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const robots = `User-agent: *
Allow: /

# 사이트맵 위치
Sitemap: ${baseUrl}/sitemap.xml

# 크롤링 지연 (선택사항)
Crawl-delay: 1`;

    log(`Generating robots.txt dynamically for: ${baseUrl}`, "robots");
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(robots);
    log(`Robots.txt sent successfully`, "robots");
  });

  // 정적 파일 서빙 (robots.txt와 sitemap.xml 라우트 이후)
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    log(`Fallback route accessed: ${req.originalUrl}`, "fallback");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
