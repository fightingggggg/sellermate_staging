import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    // 오류 오버레이 임시 비활성화
    // runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
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
    // 번들 크기 최적화
    rollupOptions: {
      output: {
        manualChunks: {
          // 큰 라이브러리들을 별도 청크로 분리
          vendor: ['react', 'react-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs'],
          charts: ['recharts', 'd3', 'react-wordcloud'],
          utils: ['date-fns', 'clsx', 'tailwind-merge']
        }
      }
    },
    // 청크 크기 경고 임계값 조정
    chunkSizeWarningLimit: 1000
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
