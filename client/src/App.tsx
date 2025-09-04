import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NaverTabActivationHandler from "@/components/NaverTabActivationHandler";
import Home from "@/pages/home";
import { AuthProvider } from "@/contexts/AuthContext";
import { UsageProvider } from "@/contexts/UsageContext";
import { HistoryProvider } from "@/contexts/HistoryContext";

import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Profile from "@/pages/profile";
import CompleteProductOptimizerPage from "./pages/complete-product-optimizer";
import QuickProductOptimizerPage from "./pages/quick-product-optimizer";
import KeywordCompetitionAnalysisPage from "@/pages/keyword-competition-analysis";
import MembershipPage from "@/pages/membership";
import SubscriptionPage from "@/pages/subscription";
import PaymentSuccessPage from "@/pages/payment-success";
import SubscriptionCompletePage from "@/pages/subscription-complete";
import NaverOnboarding from "@/pages/naver-onboarding";
import { useEffect, useRef } from "react";
import { initAnalytics, trackPageView, trackTimeSpent } from "@/lib/analytics";
import { useLocation } from "wouter";
import OriginalProductOptimizerPage from "@/pages/original-product-optimizer";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/product-optimizer/complete" component={CompleteProductOptimizerPage} />
      <Route path="/product-optimizer/quick" component={QuickProductOptimizerPage} />
      <Route path="/product-optimizer/original" component={OriginalProductOptimizerPage} />
      <Route path="/keyword-competition-analysis" component={KeywordCompetitionAnalysisPage} />
      <Route path="/profile" component={Profile} />
      <Route path="/naver-onboarding" component={NaverOnboarding} />
      <Route path="/membership" component={MembershipPage} />
      <Route path="/subscription" component={SubscriptionPage} />
      <Route path="/subscription-complete" component={SubscriptionCompletePage} />
      <Route path="/payment-success" component={PaymentSuccessPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function computePageTitle(pathname: string, search: string): string {
  const base = "스토어 부스터";
  if (pathname === "/") return base;
  if (pathname.startsWith("/login")) return `로그인 - ${base}`;
  if (pathname.startsWith("/profile")) return `내 프로필 - ${base}`;
  if (pathname.startsWith("/membership")) return `멤버십 - ${base}`;
  if (pathname.startsWith("/subscription")) return `구독 - ${base}`;
  if (pathname.startsWith("/subscription-complete")) return `구독 완료 - ${base}`;
  if (pathname.startsWith("/payment-success")) return `결제 성공 - ${base}`;
  if (pathname.startsWith("/naver-onboarding")) return `네이버 온보딩 - ${base}`;
  if (pathname.startsWith("/product-optimizer/complete")) return `완벽한 상품명 최적화 - ${base}`;
  if (pathname.startsWith("/product-optimizer/quick")) return `빠른 상품명 최적화 - ${base}`;
  if (pathname.startsWith("/product-optimizer/original")) return `상품명 그대로 최적화 - ${base}`;
  if (pathname.startsWith("/keyword-competition-analysis")) {
    try {
      const params = new URLSearchParams(search || "");
      const kw = params.get("keyword");
      if (kw && kw.trim()) return `키워드 경쟁률 분석: ${kw.trim()} - ${base}`;
    } catch {}
    return `키워드 경쟁률 분석 - ${base}`;
  }
  return base;
}

function GAListener() {
  const [location] = useLocation();
  const cleanupRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    initAnalytics();
    const search = (typeof window !== 'undefined' ? window.location.search : '');
    const title = computePageTitle(location, search);
    if (typeof document !== 'undefined') {
      document.title = title;
    }
    // 이전 페이지 섹션 타임 정리
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    // 새로운 페이지 섹션 타임 시작 (섹션명: 'Page') – 비활성화됨
    // cleanupRef.current = trackTimeSpent('Page', {
    //   page_title: title,
    //   page_path: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
    // });

    // page_view 전송
    trackPageView();

    // 언마운트 시 정리(새 라우트 전환 외의 케이스 대비)
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [location]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UsageProvider>
          <HistoryProvider>
            <TooltipProvider>
              <Toaster />
              <NaverTabActivationHandler />
              <GAListener />
              <Router />
            </TooltipProvider>
          </HistoryProvider>
        </UsageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;