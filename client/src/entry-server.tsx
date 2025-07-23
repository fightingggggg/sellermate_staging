import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
// @ts-ignore – type declarations for wouter/server are not available
import { staticLocationHook } from "wouter/server";
import App from "./App";

export function render(url: string) {
  const html = renderToString(
    <Router hook={staticLocationHook(url)}>
      <App />
    </Router>,
  );

  return { html };
} 