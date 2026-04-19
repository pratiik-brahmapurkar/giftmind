import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isOnboardingRoute = location.pathname === "/onboarding";

  const { data: onboardingStatus, isLoading: onboardingLoading } = useQuery({
    queryKey: ["auth-guard-onboarding", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("users")
        .select("has_completed_onboarding")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user && !isOnboardingRoute,
  });

  if (loading || onboardingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isOnboardingRoute && onboardingStatus && !onboardingStatus.has_completed_onboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;
