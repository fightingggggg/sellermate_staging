import { createRoot } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 프로덕션 환경에서는 모든 console 로그( log / warn / error )를 무시하도록 오버라이드합니다.
if (import.meta.env.PROD) {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noop = () => {};
  // eslint-disable-next-line no-console
  console.log = noop;
  // eslint-disable-next-line no-console
  console.warn = noop;
  // eslint-disable-next-line no-console
  console.error = noop;
}

const container = document.getElementById("root")!;

if (container.hasChildNodes()) {
  // SSR 마크업이 존재하면 하이드레이션
  hydrateRoot(container, <App />);
} else {
  // CSR 환경(개발 모드 등)
  createRoot(container).render(<App />);
}
