export type AdminRole = "viewer" | "admin" | "superadmin";
export type NullableAdminRole = AdminRole | null;

export type AdminPermission =
  | "admin.access"
  | "users.grant_credits"
  | "users.change_role"
  | "users.disable"
  | "users.export_csv"
  | "blog.write"
  | "blog.delete"
  | "marketplaces.write"
  | "settings.write"
  | "maintenance.run"
  | "packages.write"
  | "audit_log.view";

export const ROLE_HIERARCHY: Record<AdminRole, number> = {
  viewer: 1,
  admin: 2,
  superadmin: 3,
};

export const PERMISSIONS: Record<AdminPermission, AdminRole[]> = {
  "admin.access": ["viewer", "admin", "superadmin"],
  "users.grant_credits": ["admin", "superadmin"],
  "users.change_role": ["superadmin"],
  "users.disable": ["admin", "superadmin"],
  "users.export_csv": ["admin", "superadmin"],
  "blog.write": ["admin", "superadmin"],
  "blog.delete": ["superadmin"],
  "marketplaces.write": ["admin", "superadmin"],
  "settings.write": ["superadmin"],
  "maintenance.run": ["superadmin"],
  "packages.write": ["superadmin"],
  "audit_log.view": ["viewer", "admin", "superadmin"],
};

export function canAccessRole(role: NullableAdminRole, requiredRole: AdminRole = "viewer") {
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[requiredRole];
}

export function canDo(role: NullableAdminRole, permission: AdminPermission) {
  if (!role) return false;
  return PERMISSIONS[permission]?.includes(role) ?? false;
}

export function formatAdminRole(role: unknown) {
  if (role === "superadmin") return "SuperAdmin";
  if (role === "admin") return "Admin";
  if (role === "viewer") return "Viewer";
  return "User";
}
