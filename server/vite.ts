import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import ReactDOMServer from "react-dom/server";
import { pathToFileURL } from "url";

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
  // Vite에서 빌드된 정적 파일들은 프로젝트 루트의 dist/public 디렉터리에 위치합니다.
  // 기존 경로가 server/public 을 가리켜 sitemap.xml 같은 파일을 찾지 못하고 index.html 로 폴백되는 문제가 있었습니다.
  // 실제 빌드 아웃풋 위치로 경로를 수정하여 정적 파일이 올바르게 서빙되도록 합니다.
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    (async () => {
      try {
        const template = await fs.promises.readFile(
          path.resolve(distPath, "index.html"),
          "utf-8",
        );

        // SSR 렌더러 동적 임포트
        const { render } = await import(
          pathToFileURL(
            path.resolve(import.meta.dirname, "..", "dist", "server", "entry-server.js"),
          ).href,
        );

        const appHtml = ReactDOMServer.renderToString(render(_req.originalUrl));
        const html = template.replace(
          '<div id="root"></div>',
          `<div id="root">${appHtml}</div>`,
        );
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        // SSR 빌드가 없거나 오류가 발생하면 CSR 폴백
        res.sendFile(path.resolve(distPath, "index.html"));
      }
    })();
  });
}
