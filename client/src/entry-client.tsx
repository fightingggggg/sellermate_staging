import { hydrateRoot } from "react-dom/client";
import { Router } from "wouter";
import App from "./App";
import "./index.css";

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  (
    <Router>
      <App />
    </Router>
  ),
); 