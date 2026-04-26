import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useEffect, useRef } from "react";
import { useMyAdminRole } from "@/hooks/useMyAdminRole";
import { canAccessRole, type AdminRole } from "@/lib/adminPermissions";

const AdminGuard = ({
  children,
  requiredRole = "viewer",
}: {
  children: React.ReactNode;
  requiredRole?: AdminRole;
}) => {
  const { role, loading } = useMyAdminRole();
  const toasted = useRef(false);
  const hasAccess = canAccessRole(role, requiredRole);

  useEffect(() => {
    if (!loading && !hasAccess && !toasted.current) {
      toasted.current = true;
      toast.error("You don't have permission to access this section.");
    }
  }, [loading, hasAccess]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to={role ? "/admin" : "/dashboard"} replace />;
  }

  return <>{children}</>;
};

export default AdminGuard;
