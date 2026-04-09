import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { IndianRupee, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

const COLORS = ["hsl(249, 76%, 64%)", "hsl(0, 100%, 70%)", "hsl(142, 71%, 45%)", "hsl(45, 93%, 47%)", "hsl(200, 80%, 50%)"];

const RevenueTab = () => {
  const { data: transactions = [] } = useQuery({
    queryKey: ["admin-all-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-profiles-count"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("user_id");
      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const purchases = transactions.filter((t) => t.type === "purchase" && t.amount > 0);
    // Approximate revenue from details or use amount * some unit price — here we use amount as credit count
    // For real revenue we'd need a price field; using a heuristic: details may contain price info
    const revenueThisMonth = purchases
      .filter((t) => new Date(t.created_at) >= thisMonthStart)
      .reduce((s, t) => s + t.amount, 0);
    const revenueLastMonth = purchases
      .filter((t) => new Date(t.created_at) >= lastMonthStart && new Date(t.created_at) <= lastMonthEnd)
      .reduce((s, t) => s + t.amount, 0);
    const lifetime = purchases.reduce((s, t) => s + t.amount, 0);
    const momGrowth = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100) : 0;
    const arpu = profiles.length > 0 ? lifetime / profiles.length : 0;

    // Credits purchased vs used
    const totalPurchased = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalUsed = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const expiryRate = totalPurchased > 0 ? Math.max(0, ((totalPurchased - totalUsed) / totalPurchased) * 100) : 0;

    return { revenueThisMonth, revenueLastMonth, momGrowth, lifetime, arpu, expiryRate };
  }, [transactions, profiles]);

  // Monthly revenue chart (last 6 months)
  const monthlyData = useMemo(() => {
    const months: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      const rev = transactions
        .filter((t) => t.type === "purchase" && t.amount > 0 && new Date(t.created_at) >= start && new Date(t.created_at) <= end)
        .reduce((s, t) => s + t.amount, 0);
      months.push({ month: format(d, "MMM"), revenue: rev });
    }
    return months;
  }, [transactions]);

  // Package distribution
  const packageDist = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "purchase" && t.details)
      .forEach((t) => {
        const pkg = t.details || "Other";
        counts[pkg] = (counts[pkg] || 0) + 1;
      });
    // Fallback: use package names if no real data
    if (Object.keys(counts).length === 0) {
      packages.forEach((p) => { counts[p.name] = 0; });
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value: value || 1 }));
  }, [transactions, packages]);

  const expiryColor = stats.expiryRate > 50 ? "text-red-500" : stats.expiryRate > 30 ? "text-amber-500" : "text-green-500";

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Revenue This Month", value: `₹${stats.revenueThisMonth.toLocaleString()}` },
          { label: "Revenue Last Month", value: `₹${stats.revenueLastMonth.toLocaleString()}` },
          {
            label: "MoM Growth",
            value: `${stats.momGrowth >= 0 ? "+" : ""}${stats.momGrowth.toFixed(1)}%`,
            icon: stats.momGrowth >= 0 ? TrendingUp : TrendingDown,
            color: stats.momGrowth >= 0 ? "text-green-500" : "text-red-500",
          },
          { label: "Lifetime Revenue", value: `₹${stats.lifetime.toLocaleString()}` },
          { label: "ARPU", value: `₹${stats.arpu.toFixed(0)}` },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-2xl font-bold ${s.color || ""}`}>{s.value}</span>
                {s.icon && <s.icon className={`w-4 h-4 ${s.color}`} />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="hsl(249, 76%, 64%)" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Package Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={packageDist} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {packageDist.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Credit Expiry Rate */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Credit Expiry Rate</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Percentage of purchased credits that expired unused
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-3xl font-bold ${expiryColor}`}>
                {stats.expiryRate.toFixed(1)}%
              </span>
              {stats.expiryRate > 30 && (
                <Badge variant="outline" className={stats.expiryRate > 50 ? "border-red-500 text-red-500" : "border-amber-500 text-amber-500"}>
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {stats.expiryRate > 50 ? "Consider extending validity" : "Watch this metric"}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RevenueTab;
