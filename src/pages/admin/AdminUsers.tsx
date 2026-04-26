import { SEOHead } from "@/components/common/SEOHead";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Download, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import UserDetailSheet from "@/components/admin/UserDetailSheet";
import GrantCreditsModal from "@/components/admin/GrantCreditsModal";
import ChangeRoleDialog from "@/components/admin/ChangeRoleDialog";
import DisableAccountDialog from "@/components/admin/DisableAccountDialog";
import { sanitizeString } from "@/lib/validation";
import { useMyAdminRole } from "@/hooks/useMyAdminRole";
import { canDo, formatAdminRole } from "@/lib/adminPermissions";
import { logAdminAction } from "@/lib/adminAudit";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SortField = "full_name" | "created_at" | "credits_balance" | "updated_at";
type SortDir = "asc" | "desc";

interface UserRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  country: string | null;
  credits_balance: number;
  created_at: string;
  updated_at: string;
  has_completed_onboarding: boolean;
  role: string;
  sessions_count: number;
  referrals_count: number;
}

const PAGE_SIZE = 25;

const AdminUsers = () => {
  const queryClient = useQueryClient();
  const { role: currentRole } = useMyAdminRole();
  const canGrantCredits = canDo(currentRole, "users.grant_credits");
  const canChangeRole = canDo(currentRole, "users.change_role");
  const canDisable = canDo(currentRole, "users.disable");
  const canExportCSV = canDo(currentRole, "users.export_csv");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [grantCreditsUserId, setGrantCreditsUserId] = useState<string | null>(null);
  const [changeRoleUser, setChangeRoleUser] = useState<{ userId: string; currentRole: string } | null>(null);
  const [disableUserId, setDisableUserId] = useState<string | null>(null);

  // Fetch profiles
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, avatar_url, country, credits_balance, created_at, updated_at, has_completed_onboarding");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch roles
  const { data: roles = [] } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch session counts
  const { data: sessionCounts = [] } = useQuery({
    queryKey: ["admin-session-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_sessions")
        .select("user_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((s) => {
        counts[s.user_id] = (counts[s.user_id] || 0) + 1;
      });
      return Object.entries(counts).map(([user_id, count]) => ({ user_id, count }));
    },
  });

  // Fetch referral counts
  const { data: referralCounts = [] } = useQuery({
    queryKey: ["admin-referral-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("referrals").select("referrer_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((r) => {
        counts[r.referrer_id] = (counts[r.referrer_id] || 0) + 1;
      });
      return Object.entries(counts).map(([user_id, count]) => ({ user_id, count }));
    },
  });

  // Merge all data
  const users: UserRow[] = useMemo(() => {
    const roleMap: Record<string, string> = {};
    roles.forEach((r) => {
      // highest role wins
      const priority: Record<string, number> = { superadmin: 4, admin: 3, viewer: 2, user: 1 };
      if (!roleMap[r.user_id] || (priority[r.role] || 0) > (priority[roleMap[r.user_id]] || 0)) {
        roleMap[r.user_id] = r.role;
      }
    });
    const sessMap: Record<string, number> = {};
    sessionCounts.forEach((s) => (sessMap[s.user_id] = s.count));
    const refMap: Record<string, number> = {};
    referralCounts.forEach((r) => (refMap[r.user_id] = r.count));

    return profiles.map((p) => ({
      ...p,
      role: roleMap[p.id] || "user",
      sessions_count: sessMap[p.id] || 0,
      referrals_count: refMap[p.id] || 0,
    }));
  }, [profiles, roles, sessionCounts, referralCounts]);

  // Filter & sort
  const filtered = useMemo(() => {
    let list = users;
    const cleanSearch = sanitizeString(search, 200).toLowerCase();
    if (cleanSearch) {
      const q = cleanSearch;
      list = list.filter((u) => (u.full_name || "").toLowerCase().includes(q) || u.id.toLowerCase().includes(q));
    }
    if (roleFilter !== "all") {
      list = list.filter((u) => u.role === roleFilter);
    }
    list = [...list].sort((a, b) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      const cmp = typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [users, search, roleFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const handleExportCSV = () => {
    if (!canExportCSV) return;
    const headers = ["Name", "User ID", "Role", "Credits", "Sessions", "Referrals", "Signup Date"];
    const rows = filtered.map((u) => [
      u.full_name || "", u.id, u.role, u.credits_balance, u.sessions_count, u.referrals_count,
      format(new Date(u.created_at), "yyyy-MM-dd"),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "users.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
    void logAdminAction({
      action: "export_users_csv",
      targetType: "user",
      payload: { row_count: filtered.length, role_filter: roleFilter, search_applied: Boolean(search) },
    });
  };

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case "superadmin": return "default";
      case "admin": return "secondary";
      case "viewer": return "outline";
      default: return "outline";
    }
  };

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case "superadmin": return "bg-purple-600 text-white hover:bg-purple-700";
      case "admin": return "bg-blue-600 text-white hover:bg-blue-700";
      case "viewer": return "bg-muted text-muted-foreground";
      default: return "";
    }
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="space-y-6">
      <SEOHead title="Admin - GiftMind" description="Admin Dashboard" noIndex={true} />
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage all platform users</p>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => { setSearch(sanitizeString(e.target.value, 200)); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="superadmin">SuperAdmin</SelectItem>
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!canExportCSV}>
                <Download className="w-4 h-4 mr-1.5" /> Export CSV
              </Button>
            </span>
          </TooltipTrigger>
          {!canExportCSV && <TooltipContent>Requires Admin access</TooltipContent>}
        </Tooltip>
        <span className="text-sm text-muted-foreground ml-auto">
          Showing {filtered.length} user{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("full_name")}>
                User {sortField === "full_name" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("credits_balance")}>
                Credits {sortField === "credits_balance" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="text-right hidden md:table-cell">Sessions</TableHead>
              <TableHead className="text-right hidden lg:table-cell">Referrals</TableHead>
              <TableHead className="cursor-pointer select-none hidden sm:table-cell" onClick={() => toggleSort("created_at")}>
                Signed Up {sortField === "created_at" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer select-none hidden md:table-cell" onClick={() => toggleSort("updated_at")}>
                Last Active {sortField === "updated_at" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : paged.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <button
                    className="flex items-center gap-3 text-left hover:underline"
                    onClick={() => setSelectedUserId(u.id)}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={u.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {(u.full_name || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm truncate max-w-[160px]">
                      {u.full_name || "Unnamed"}
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  <Badge variant={roleBadgeVariant(u.role)} className={roleBadgeClass(u.role)}>
                    {formatAdminRole(u.role)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{u.credits_balance}</TableCell>
                <TableCell className="text-right hidden md:table-cell text-sm">{u.sessions_count}</TableCell>
                <TableCell className="text-right hidden lg:table-cell text-sm">{u.referrals_count}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                  {format(new Date(u.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                  {formatDistanceToNow(new Date(u.updated_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-8 h-8" aria-label="Open user actions">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setSelectedUserId(u.id)}>
                        View Details
                      </DropdownMenuItem>
                      {canGrantCredits && (
                        <DropdownMenuItem onClick={() => setGrantCreditsUserId(u.id)}>
                          Grant Credits
                        </DropdownMenuItem>
                      )}
                      {canChangeRole && (
                        <DropdownMenuItem onClick={() => setChangeRoleUser({ userId: u.id, currentRole: u.role })}>
                          Change Role
                        </DropdownMenuItem>
                      )}
                      {canDisable && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDisableUserId(u.id)}
                          >
                            Disable Account
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <UserDetailSheet
        userId={selectedUserId}
        user={selectedUser || null}
        open={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        onGrantCredits={(id) => { if (canGrantCredits) { setSelectedUserId(null); setGrantCreditsUserId(id); } }}
        onChangeRole={(id, role) => { if (canChangeRole) { setSelectedUserId(null); setChangeRoleUser({ userId: id, currentRole: role }); } }}
        onDisable={(id) => { if (canDisable) { setSelectedUserId(null); setDisableUserId(id); } }}
        canGrantCredits={canGrantCredits}
        canChangeRole={canChangeRole}
        canDisable={canDisable}
      />

      {/* Grant Credits Modal */}
      <GrantCreditsModal
        userId={grantCreditsUserId}
        open={!!grantCreditsUserId}
        onClose={() => setGrantCreditsUserId(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-users"] });
          setGrantCreditsUserId(null);
        }}
      />

      {/* Change Role Dialog */}
      <ChangeRoleDialog
        userId={changeRoleUser?.userId || null}
        currentRole={changeRoleUser?.currentRole || "user"}
        open={!!changeRoleUser}
        onClose={() => setChangeRoleUser(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
          setChangeRoleUser(null);
        }}
      />

      {/* Disable Account Dialog */}
      <DisableAccountDialog
        userId={disableUserId}
        open={!!disableUserId}
        onClose={() => setDisableUserId(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-users"] });
          setDisableUserId(null);
        }}
      />
    </div>
  );
};

export default AdminUsers;
