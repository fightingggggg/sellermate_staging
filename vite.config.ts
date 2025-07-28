import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    allowedHosts: ['storebooster.ai.kr', 'localhost', '127.0.0.1'], // 프로덕션 도메인 추가
    proxy: {
      '/api': {
        target: 'http://localhost:5005', // 웹 개발 서버로 프록시
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
