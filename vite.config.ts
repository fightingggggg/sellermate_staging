import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(async (env) => {
  const { ssrBuild } = env as any;

  const plugins: any[] = [
    react(),
    // 오류 오버레이 임시 비활성화
    // runtimeErrorOverlay(),
  ];

  if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
    const { cartographer } = await import("@replit/vite-plugin-cartographer");
    plugins.push(cartographer());
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: ssrBuild
        ? path.resolve(import.meta.dirname, "dist/server")
        : path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: !ssrBuild,
      manifest: !ssrBuild,
    },
    server: {
      allowedHosts: ["storebooster.ai.kr", "localhost", "127.0.0.1"], // 프로덕션 도메인 추가
      proxy: {
        "/api": {
          target: "http://localhost:5005", // 웹 개발 서버로 프록시
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
