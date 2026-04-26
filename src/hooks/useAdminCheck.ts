import { useMyAdminRole } from "@/hooks/useMyAdminRole";

export function useAdminCheck() {
  const { role, loading } = useMyAdminRole();
  const isAdmin = role === "admin" || role === "superadmin";

  return { isAdmin, loading };
}
