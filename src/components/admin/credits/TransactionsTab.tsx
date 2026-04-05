import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const PAGE_SIZE = 50;

const TransactionsTab = () => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["admin-all-transactions-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch profiles for user names
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-users-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => { m[p.user_id] = p.full_name || "Unnamed"; });
    return m;
  }, [profiles]);

  const types = useMemo(() => {
    const s = new Set(transactions.map((t) => t.type));
    return Array.from(s).sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    let list = transactions;
    if (typeFilter !== "all") list = list.filter((t) => t.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (profileMap[t.user_id] || "").toLowerCase().includes(q) ||
        t.user_id.toLowerCase().includes(q) ||
        (t.details || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, typeFilter, search, profileMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleExport = () => {
    const headers = ["Date", "User", "Type", "Amount", "Balance After", "Payment ID", "Provider", "Details"];
    const rows = filtered.map((t) => [
      format(new Date(t.created_at), "yyyy-MM-dd HH:mm"),
      profileMap[t.user_id] || t.user_id,
      t.type, t.amount, t.balance_after,
      (t as any).payment_id || "", (t as any).provider || "", t.details || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "transactions.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const typeBadgeClass = (type: string) => {
    switch (type) {
      case "purchase": return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
      case "usage": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
      case "admin_grant": return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
      case "referral": return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
      default: return "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by user or details..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1.5" /> Export CSV
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Balance After</TableHead>
              <TableHead className="hidden lg:table-cell">Payment ID</TableHead>
              <TableHead className="hidden md:table-cell">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No transactions found</TableCell>
              </TableRow>
            ) : paged.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {format(new Date(t.created_at), "MMM d, HH:mm")}
                </TableCell>
                <TableCell className="text-sm font-medium truncate max-w-[140px]">
                  {profileMap[t.user_id] || "Unknown"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={typeBadgeClass(t.type)}>{t.type}</Badge>
                </TableCell>
                <TableCell className={`text-right font-mono text-sm ${t.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                  {t.amount > 0 ? "+" : ""}{t.amount}
                </TableCell>
                <TableCell className="text-right text-sm hidden sm:table-cell">{t.balance_after}</TableCell>
                <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                  {(t as any).payment_id || "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground hidden md:table-cell truncate max-w-[200px]">
                  {t.details || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
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
    </div>
  );
};

export default TransactionsTab;
