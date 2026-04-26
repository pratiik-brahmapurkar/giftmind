import { canDo, type AdminPermission } from "@/lib/adminPermissions";
import { useMyAdminRole } from "@/hooks/useMyAdminRole";

export function useCanDo(permission: AdminPermission): boolean {
  const { role } = useMyAdminRole();
  return canDo(role, permission);
}
