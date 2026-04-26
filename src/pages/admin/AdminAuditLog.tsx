import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import { SEOHead } from "@/components/common/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAdminRole } from "@/lib/adminPermissions";

const PAGE_SIZE = 50;

type AuditLogRow = {
  id: string;
  created_at: string;
  actor_id: string;
  actor_email: string;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  payload: unknown;
  ip_address: string | null;
  user_agent: string | null;
};

type AuditLogQuery<T> = PromiseLike<{
  data: T[] | null;
  count: number | null;
  error: Error | null;
}> & {
  order: (column: string, options?: { ascending?: boolean }) => AuditLogQuery<T>;
  range: (from: number, to: number) => AuditLogQuery<T>;
  limit: (count: number) => AuditLogQuery<T>;
  eq: (column: string, value: string) => AuditLogQuery<T>;
  gte: (column: string, value: string) => AuditLogQuery<T>;
  lte: (column: string, value: string) => AuditLogQuery<T>;
  ilike: (column: string, value: string) => AuditLogQuery<T>;
};

type AuditLogTable = {
  select: <T>(columns: string, options?: { count?: "exact" }) => AuditLogQuery<T>;
};

function actionLabel(action: string) {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function roleBadgeClass(role: string) {
  if (role === "superadmin") return "bg-purple-600 text-white hover:bg-purple-700";
  if (role === "admin") return "bg-blue-600 text-white hover:bg-blue-700";
  return "bg-muted text-muted-foreground";
}

export default function AdminAuditLog() {
  const [page, setPage] = useState(0);
  const [actor, setActor] = useState("all");
  const [action, setAction] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [targetSearch, setTargetSearch] = useState("");

  const queryKey = ["admin-audit-log", page, actor, action, fromDate, toDate, targetSearch];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const auditLog = supabase.from("admin_audit_log" as never) as unknown as AuditLogTable;
      let query = auditLog
        .select<AuditLogRow>("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (actor !== "all") query = query.eq("actor_id", actor);
      if (action !== "all") query = query.eq("action", action);
      if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00`);
      if (toDate) query = query.lte("created_at", `${toDate}T23:59:59`);
      if (targetSearch.trim()) query = query.ilike("target_label", `%${targetSearch.trim()}%`);

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: (rows || []) as AuditLogRow[], count: count || 0 };
    },
  });

  const { data: filterRows = [] } = useQuery({
    queryKey: ["admin-audit-log-filter-values"],
    queryFn: async () => {
      const auditLog = supabase.from("admin_audit_log" as never) as unknown as AuditLogTable;
      const { data: rows, error } = await auditLog
        .select<Pick<AuditLogRow, "actor_id" | "actor_email" | "action">>("actor_id, actor_email, action")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return rows as Pick<AuditLogRow, "actor_id" | "actor_email" | "action">[];
    },
  });

  const actors = useMemo(() => {
    const seen = new Map<string, string>();
    filterRows.forEach((row) => seen.set(row.actor_id, row.actor_email));
    return Array.from(seen.entries());
  }, [filterRows]);

  const actions = useMemo(
    () => Array.from(new Set(filterRows.map((row) => row.action))).sort(),
    [filterRows],
  );

  const rows = data?.rows || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <SEOHead title="Admin Audit Log - GiftMind" description="Admin audit log" noIndex />

      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-heading font-bold text-foreground">Audit Log</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Privileged admin activity across GiftMind.</p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(0); }} className="lg:w-40" />
        <Input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(0); }} className="lg:w-40" />
        <Select value={actor} onValueChange={(value) => { setActor(value); setPage(0); }}>
          <SelectTrigger className="lg:w-64"><SelectValue placeholder="Actor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            {actors.map(([id, email]) => <SelectItem key={id} value={id}>{email}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={(value) => { setAction(value); setPage(0); }}>
          <SelectTrigger className="lg:w-56"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map((item) => <SelectItem key={item} value={item}>{actionLabel(item)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={targetSearch}
            onChange={(event) => { setTargetSearch(event.target.value); setPage(0); }}
            placeholder="Search target..."
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">Loading audit log...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No audit events found</TableCell></TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="min-w-44 text-sm" title={format(new Date(row.created_at), "PPpp")}>
                  {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{row.actor_email}</div>
                    <Badge variant="secondary" className={roleBadgeClass(row.actor_role)}>
                      {formatAdminRole(row.actor_role)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{actionLabel(row.action)}</Badge></TableCell>
                <TableCell className="text-sm">
                  <div className="font-medium">{row.target_label || row.target_id || "Platform"}</div>
                  {row.target_type && <div className="text-xs text-muted-foreground">{row.target_type}</div>}
                </TableCell>
                <TableCell className="max-w-md">
                  {row.payload ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-primary">View payload</summary>
                      <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3">
                        {JSON.stringify(row.payload, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {page + 1} of {totalPages} ({totalCount} events)
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
