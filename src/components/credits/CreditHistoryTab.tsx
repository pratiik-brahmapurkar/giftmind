import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { CreditTransaction } from "@/hooks/useCredits";
import { formatCreditsValue } from "@/lib/credits";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

const TYPE_CONFIG: Record<
  string,
  { label: string; emoji: string; className: string }
> = {
  purchase: {
    label: "Purchase",
    emoji: "✅",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  usage: {
    label: "Used",
    emoji: "➖",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  used: {
    label: "Used",
    emoji: "➖",
    className: "bg-red-100 text-red-700 border-red-200",
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
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  refund: {
    label: "Refund",
    emoji: "↩",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  admin_grant: {
    label: "Admin Grant",
    emoji: "🛠",
    className: "bg-violet-100 text-violet-700 border-violet-200",
  },
};

const PAGE_SIZE = 20;

interface CreditHistoryTabProps {
  transactions: CreditTransaction[];
  isLoading: boolean;
}

function getTransactionDetails(transaction: CreditTransaction) {
  if (!transaction.metadata || typeof transaction.metadata !== "object" || Array.isArray(transaction.metadata)) {
    return "—";
  }

  const metadata = transaction.metadata as Record<string, unknown>;

  if (typeof metadata.reason === "string") {
    if (metadata.reason === "signup_bonus") return "Signup bonus";
    if (metadata.reason === "referral_reward") return "1 free Signal Check earned";
    if (metadata.reason === "monthly_free_allocation") return "Monthly free credits";
    return metadata.reason.replace(/_/g, " ");
  }

  if (typeof metadata.notes === "string" && metadata.notes.trim()) {
    return metadata.notes;
  }

  if (typeof metadata.referral_code === "string") {
    return `Referral code ${metadata.referral_code}`;
  }

  if (typeof metadata.batch_expires_at === "string") {
    return `Batch expires ${format(new Date(metadata.batch_expires_at), "MMM d, yyyy")}`;
  }

  return "—";
}

const CreditHistoryTab = ({ transactions, isLoading }: CreditHistoryTabProps) => {
  const [filterType, setFilterType] = useState("all");
  const [page, setPage] = useState(0);

  const filteredTransactions = useMemo(() => {
    if (filterType === "all") return transactions;

    return transactions.filter((transaction) => {
      if (filterType === "usage") {
        return transaction.type === "usage" || transaction.type === "used";
      }

      return transaction.type === filterType;
    });
  }, [filterType, transactions]);

  const total = filteredTransactions.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rows = filteredTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
            {["purchase", "usage", "bonus", "refund", "admin_grant", "referral"].map((value) => {
              const cfg = TYPE_CONFIG[value];
              return (
              <SelectItem key={value} value={value}>
                {cfg.emoji} {cfg.label}
              </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Empty state */}
      {!isLoading && rows.length === 0 && (
        <EmptyState
          title="No transactions yet"
          description="Your credit history and usage will appear here."
          icon={<History className="w-12 h-12" strokeWidth={1.5} />}
        />
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
                  <TableHead className="hidden sm:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => {
                  const cfg = TYPE_CONFIG[tx.type] || TYPE_CONFIG.usage;
                  const isPositive = tx.amount > 0;
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(tx.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="default"
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
                        {isPositive ? "+" : "-"}
                        {formatCreditsValue(Math.abs(tx.amount))}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                        {getTransactionDetails(tx)}
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
