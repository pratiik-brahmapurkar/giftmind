import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart3,
  Users,
  CreditCard,
  Gift,
  FileText,
  PenSquare,
  FolderOpen,
  Image,
  TrendingUp,
  Store,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyAdminRole } from "@/hooks/useMyAdminRole";
import { canAccessRole, formatAdminRole, type AdminRole } from "@/lib/adminPermissions";
import { Badge } from "@/components/ui/badge";

const navSections = [
  {
    items: [
      { label: "Overview", path: "/admin", icon: BarChart3, requiredRole: "viewer" },
      { label: "Users", path: "/admin/users", icon: Users, requiredRole: "viewer" },
      { label: "Credits & Revenue", path: "/admin/credits", icon: CreditCard, requiredRole: "viewer" },
      { label: "Gift Analytics", path: "/admin/gifts", icon: Gift, requiredRole: "viewer" },
    ],
  },
  {
    title: "Blog",
    items: [
      { label: "All Posts", path: "/admin/blog", icon: FileText, requiredRole: "admin" },
      { label: "New Post", path: "/admin/blog/new", icon: PenSquare, requiredRole: "admin" },
      { label: "Categories", path: "/admin/blog/categories", icon: FolderOpen, requiredRole: "admin" },
      { label: "Media Library", path: "/admin/media", icon: Image, requiredRole: "admin" },
      { label: "Blog Analytics", path: "/admin/blog/analytics", icon: TrendingUp, requiredRole: "viewer" },
    ],
  },
  {
    title: "Security",
    items: [
      { label: "Audit Log", path: "/admin/audit-log", icon: ShieldCheck, requiredRole: "viewer" },
    ],
  },
  {
    title: "Config",
    items: [
      { label: "Marketplaces", path: "/admin/marketplaces", icon: Store, requiredRole: "admin" },
      { label: "Settings", path: "/admin/settings", icon: Settings, requiredRole: "superadmin" },
    ],
  },
] satisfies {
  title?: string;
  items: { label: string; path: string; icon: typeof BarChart3; requiredRole: AdminRole }[];
}[];

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const { user } = useAuth();
  const { role } = useMyAdminRole();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const name = user?.user_metadata?.full_name || "Admin";
  const isActive = (path: string) => location.pathname === path;
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessRole(role, item.requiredRole)),
    }))
    .filter((section) => section.items.length > 0);

  const roleBadgeClass =
    role === "superadmin"
      ? "bg-purple-600 text-white hover:bg-purple-700"
      : role === "admin"
        ? "bg-blue-600 text-white hover:bg-blue-700"
        : "bg-muted text-muted-foreground";

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-white/10 flex items-center gap-2 h-14">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
          <Gift className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="text-sm font-heading font-bold text-white truncate">
            GiftMind Admin
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-4">
        {visibleSections.map((section, si) => (
          <div key={si}>
            {section.title && !collapsed && (
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                {section.title}
              </div>
            )}
            {section.title && collapsed && (
              <div className="mx-auto my-1 w-6 border-t border-white/20" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive(item.path)
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white/90"
                  )}
                >
                  <item.icon className="w-4.5 h-4.5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex items-center justify-center w-full py-3 border-t border-white/10 text-white/40 hover:text-white/80 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col transition-all duration-300",
          collapsed ? "w-16" : "w-56"
        )}
        style={{ backgroundColor: "#1A1A2E" }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="relative w-56 flex flex-col"
            style={{ backgroundColor: "#1A1A2E" }}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-muted-foreground"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <span className="text-sm text-muted-foreground">
              Hi, <span className="font-medium text-foreground">{name}</span>
            </span>
            <Badge variant="secondary" className={cn("h-6", roleBadgeClass)}>
              {formatAdminRole(role)}
            </Badge>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            View site <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
