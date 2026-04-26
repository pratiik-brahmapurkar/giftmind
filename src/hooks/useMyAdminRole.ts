import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { NullableAdminRole } from "@/lib/adminPermissions";

type RoleQueryBuilder = {
  select: (columns: string) => {
    eq: (column: string, value: string | undefined) => Promise<{
      data: { role: string }[] | null;
      error: Error | null;
    }>;
  };
};

function normalizeRole(role: unknown): NullableAdminRole {
  return role === "viewer" || role === "admin" || role === "superadmin" ? role : null;
}

export function useMyAdminRole(): { role: NullableAdminRole; loading: boolean } {
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["my-admin-role", user?.id],
    queryFn: async () => {
      const { data: rpcRole, error } = await supabase.rpc("get_my_role" as never);

      if (!error) {
        return normalizeRole(rpcRole);
      }

      const userRoles = supabase.from("user_roles" as never) as unknown as RoleQueryBuilder;
      const { data: roleRows, error: rolesError } = await userRoles
        .select("role")
        .eq("user_id", user?.id);

      if (rolesError) throw rolesError;

      const priority: Record<string, number> = { superadmin: 3, admin: 2, viewer: 1 };
      const role = (roleRows || [])
        .map((row: { role: string }) => row.role)
        .sort((a: string, b: string) => (priority[b] || 0) - (priority[a] || 0))[0];

      return normalizeRole(role);
    },
    enabled: !!user && !authLoading,
    staleTime: 60_000,
    retry: 1,
  });

  return { role: data ?? null, loading: authLoading || isLoading };
}
