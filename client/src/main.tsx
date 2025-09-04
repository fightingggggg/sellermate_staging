import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 프로덕션 환경에서도 로그가 보이도록 console 오버라이드 제거
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

createRoot(document.getElementById("root")!).render(<App />);
