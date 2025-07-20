import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NaverTabActivationHandler from "@/components/NaverTabActivationHandler";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Profile from "@/pages/profile";
import { AuthProvider } from "@/contexts/AuthContext";
import { UsageProvider } from "@/contexts/UsageContext";
import { HistoryProvider } from "@/contexts/HistoryContext";
import CompleteProductOptimizerPage from "./pages/complete-product-optimizer";
import QuickProductOptimizerPage from "./pages/quick-product-optimizer";
import KeywordCompetitionAnalysisPage from "@/pages/keyword-competition-analysis";
import MembershipPage from "@/pages/membership";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/product-optimizer/complete" component={CompleteProductOptimizerPage} />
      <Route path="/product-optimizer/quick" component={QuickProductOptimizerPage} />
      <Route path="/keyword-competition-analysis" component={KeywordCompetitionAnalysisPage} />
      <Route path="/profile" component={Profile} />
      <Route path="/membership" component={MembershipPage} />
      <Route component={NotFound} />
    </Switch>
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