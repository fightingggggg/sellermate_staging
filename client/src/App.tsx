import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NaverTabActivationHandler from "@/components/NaverTabActivationHandler";
import { lazy, Suspense } from "react";
const NotFound = lazy(() => import("@/pages/not-found"));
const Home = lazy(() => import("@/pages/home"));
const Login = lazy(() => import("@/pages/login"));
const Profile = lazy(() => import("@/pages/profile"));
import { AuthProvider } from "@/contexts/AuthContext";
import { UsageProvider } from "@/contexts/UsageContext";
import { HistoryProvider } from "@/contexts/HistoryContext";
const CompleteProductOptimizerPage = lazy(() => import("./pages/complete-product-optimizer"));
const QuickProductOptimizerPage = lazy(() => import("./pages/quick-product-optimizer"));
const KeywordCompetitionAnalysisPage = lazy(() => import("@/pages/keyword-competition-analysis"));
const MembershipPage = lazy(() => import("@/pages/membership"));
const SubscriptionPage = lazy(() => import("@/pages/subscription"));
const PaymentSuccessPage = lazy(() => import("@/pages/payment-success"));
const SubscriptionCompletePage = lazy(() => import("@/pages/subscription-complete"));
const NaverOnboarding = lazy(() => import("@/pages/naver-onboarding"));

function Router() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/product-optimizer/complete" component={CompleteProductOptimizerPage} />
        <Route path="/product-optimizer/quick" component={QuickProductOptimizerPage} />
        <Route path="/keyword-competition-analysis" component={KeywordCompetitionAnalysisPage} />
        <Route path="/profile" component={Profile} />
        <Route path="/naver-onboarding" component={NaverOnboarding} />
        <Route path="/membership" component={MembershipPage} />
        <Route path="/subscription" component={SubscriptionPage} />
        <Route path="/subscription-complete" component={SubscriptionCompletePage} />
        <Route path="/payment-success" component={PaymentSuccessPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
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
              <Router />
            </TooltipProvider>
          </HistoryProvider>
        </UsageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;