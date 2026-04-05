import { useAdminCheck } from "@/hooks/useAdminCheck";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useAdminCheck();
  const toasted = useRef(false);

  useEffect(() => {
    if (!loading && !isAdmin && !toasted.current) {
      toasted.current = true;
      toast.error("You don't have admin access.");
    }
  }, [loading, isAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AdminGuard;
