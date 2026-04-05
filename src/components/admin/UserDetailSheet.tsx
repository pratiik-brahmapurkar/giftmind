import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { format, formatDistanceToNow } from "date-fns";

interface UserDetailSheetProps {
  userId: string | null;
  user: {
    user_id: string;
    full_name: string | null;
    avatar_url: string | null;
    country: string | null;
    credits: number;
    created_at: string;
    updated_at: string;
    role: string;
    sessions_count: number;
    referrals_count: number;
  } | null;
  open: boolean;
  onClose: () => void;
  onGrantCredits: (userId: string) => void;
  onChangeRole: (userId: string, role: string) => void;
  onDisable: (userId: string) => void;
}

const UserDetailSheet = ({ userId, user, open, onClose, onGrantCredits, onChangeRole, onDisable }: UserDetailSheetProps) => {
  // Fetch credit transactions for this user
  const { data: transactions = [] } = useQuery({
    queryKey: ["admin-user-transactions", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  // Fetch recent sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ["admin-user-sessions", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("gift_sessions")
        .select("id, occasion, status, created_at, recipient_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  // Fetch referrals
  const { data: referrals = [] } = useQuery({
    queryKey: ["admin-user-referrals", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  if (!user) return null;

  const totalPurchased = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalUsed = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const creditsEarned = referrals.reduce((s, r) => s + (r.credits_awarded || 0), 0);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>User Details</SheetTitle>
          <SheetDescription>Profile and activity for this user</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Profile card */}
          <div className="flex items-start gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={user.avatar_url || undefined} />
              <AvatarFallback className="text-lg">
                {(user.full_name || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading font-bold text-lg truncate">{user.full_name || "Unnamed"}</h3>
              <p className="text-sm text-muted-foreground truncate">{user.user_id}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={user.role === "superadmin" ? "default" : user.role === "admin" ? "secondary" : "outline"}
                  className={user.role === "superadmin" ? "bg-purple-600 text-white" : user.role === "admin" ? "bg-blue-600 text-white" : ""}>
                  {user.role}
                </Badge>
                {user.country && <span className="text-xs text-muted-foreground">{user.country}</span>}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>Joined {format(new Date(user.created_at), "MMM d, yyyy")}</span>
                <span>Active {formatDistanceToNow(new Date(user.updated_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Credit summary */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Credits</h4>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Balance", value: user.credits },
                { label: "Purchased", value: totalPurchased },
                { label: "Used", value: totalUsed },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border p-3 text-center">
                  <div className="text-xl font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Recent sessions */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Recent Sessions ({sessions.length})</h4>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions yet</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium">{s.occasion || "No occasion"}</span>
                      <Badge variant="outline" className="ml-2 text-xs">{s.status}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(s.created_at), "MMM d")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Referral info */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Referrals</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-xl font-bold">{referrals.length}</div>
                <div className="text-xs text-muted-foreground">Referrals Made</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-xl font-bold">{creditsEarned}</div>
                <div className="text-xs text-muted-foreground">Credits Earned</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Transaction log */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Transaction Log (last 20)</h4>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm border rounded px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={t.amount > 0 ? "text-green-600 font-mono" : "text-red-500 font-mono"}>
                        {t.amount > 0 ? "+" : ""}{t.amount}
                      </span>
                      <span className="text-muted-foreground text-xs">{t.type}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(t.created_at), "MMM d, HH:mm")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Admin actions */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onGrantCredits(user.user_id)}>Grant Credits</Button>
            <Button size="sm" variant="outline" onClick={() => onChangeRole(user.user_id, user.role)}>Change Role</Button>
            <Button size="sm" variant="destructive" onClick={() => onDisable(user.user_id)}>Disable Account</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default UserDetailSheet;
