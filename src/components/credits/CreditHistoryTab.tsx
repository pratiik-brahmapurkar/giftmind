import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<
  string,
  { label: string; emoji: string; className: string }
> = {
  purchase: {
    label: "Purchase",
    emoji: "✅",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  used: {
    label: "Used",
    emoji: "🎁",
    className: "bg-purple-100 text-purple-700 border-purple-200",
  },
  bonus: {
    label: "Bonus",
    emoji: "🎉",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  expired: {
    label: "Expired",
    emoji: "⏰",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  referral: {
    label: "Referral",
    emoji: "🔗",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
};

const PAGE_SIZE = 20;

const CreditHistoryTab = () => {
  const { user } = useAuth();
  const [filterType, setFilterType] = useState("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["credit-transactions", filterType, page],
    queryFn: async () => {
      let query = supabase
        .from("credit_transactions")
        .select("*", { count: "exact" })
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterType !== "all") {
        query = query.eq("type", filterType);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], total: count || 0 };
    },
    enabled: !!user,
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(0); }}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TYPE_CONFIG).map(([value, cfg]) => (
              <SelectItem key={value} value={value}>
                {cfg.emoji} {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Empty state */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((idx) => (
            <Skeleton key={idx} className="h-11 w-full rounded-md" />
          ))}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <History className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">No transactions yet.</p>
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="hidden sm:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => {
                  const cfg = TYPE_CONFIG[tx.type] || TYPE_CONFIG.used;
                  const isPositive = tx.amount > 0;
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(tx.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", cfg.className)}
                        >
                          {cfg.emoji} {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-sm font-medium",
                          isPositive ? "text-emerald-600" : "text-destructive"
                        )}
                      >
                        {isPositive ? "+" : ""}
                        {tx.amount}
                      </TableCell>
                      <TableCell className="text-right text-sm text-foreground">
                        {tx.balance_after}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                        {tx.details || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Previous page"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Next page"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CreditHistoryTab;
