import React from "react";
// @ts-ignore - wouter/ssr type declarations may be missing but runtime import is valid
import { StaticRouter } from "wouter/ssr";
import App from "./App";

export function render(url: string) {
  return (
    <StaticRouter location={url}>
      <App />
    </StaticRouter>
  );
} 