import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LoginPage from "./LoginPage";

interface PrivateRouteProps {
  children: React.ReactNode;
}

export default function PrivateRoute({ children }: PrivateRouteProps) {
  const { currentUser, loading } = useAuth();
  const [location, navigate] = useLocation();
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    if (!loading && !currentUser) {
      setShowLoginModal(true);
    }
  }, [currentUser, loading, navigate]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {children}
      
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="max-w-md p-0 border-none bg-transparent shadow-none">
          <LoginPage isModal={true} onLoginSuccess={() => setShowLoginModal(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}