import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Coins,
  Gift,
  IndianRupee,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  formatDistanceToNow,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { SEOHead } from "@/components/common/SEOHead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type UserRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "full_name" | "email" | "created_at" | "has_completed_onboarding" | "last_active_at" | "credits_balance"
>;
type SessionRow = Pick<
  Database["public"]["Tables"]["gift_sessions"]["Row"],
  "id" | "user_id" | "occasion" | "status" | "created_at"
>;
type CreditBatchRow = Pick<
  Database["public"]["Tables"]["credit_batches"]["Row"],
  "id" | "user_id" | "package_name" | "price_paid" | "currency" | "purchased_at" | "created_at"
>;
type ProductClickRow = Pick<
  Database["public"]["Tables"]["product_clicks"]["Row"],
  "id" | "user_id" | "store" | "product_title" | "gift_concept_name" | "clicked_at"
>;

type ActivityType = "purchase" | "gift" | "signup" | "click";

type RecentActivityItem = {
  at: Date;
  user: string;
  action: string;
  type: ActivityType;
};

const OCCASION_COLORS = [
  "#D4A04A",
  "#C25450",
  "#3E8E7E",
  "#E4C663",
  "#9D7ED3",
  "#7F7668",
];

const typeBadgeMap: Record<ActivityType, { label: string; className: string }> = {
  purchase: { label: "Purchase", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  gift: { label: "Gift", className: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  signup: { label: "Signup", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  click: { label: "Click", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

function asDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isBetween(date: Date | null, start: Date, end: Date) {
  return Boolean(date && date >= start && date <= end);
}

function formatLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCurrencyAmount(amount: number) {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatCurrencySummary(totals: Record<string, number>) {
  const total = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
  return formatCurrencyAmount(total);
}

function buildCurrencyTotals(rows: CreditBatchRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const amount = Number(row.price_paid || 0);
    if (amount <= 0) return acc;
    acc.USD = (acc.USD || 0) + amount;
    return acc;
  }, {});
}

function getPercentChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function getUserLabel(user: UserRow | undefined) {
  if (!user) return "Unknown user";
  if (user.full_name?.trim()) return user.full_name.trim();
  const emailPrefix = user.email?.split("@")[0]?.trim();
  return emailPrefix || "Unknown user";
}

const AdminOverview = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview-live"],
    queryFn: async () => {
      const [usersRes, sessionsRes, batchesRes, clicksRes] = await Promise.all([
        supabase
          .from("users")
          .select("id, full_name, email, created_at, has_completed_onboarding, last_active_at, credits_balance"),
        supabase
          .from("gift_sessions")
          .select("id, user_id, occasion, status, created_at"),
        supabase
          .from("credit_batches")
          .select("id, user_id, package_name, price_paid, currency, purchased_at, created_at"),
        supabase
          .from("product_clicks")
          .select("id, user_id, store, product_title, gift_concept_name, clicked_at"),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (batchesRes.error) throw batchesRes.error;
      if (clicksRes.error) throw clicksRes.error;

      return {
        users: (usersRes.data || []) as UserRow[],
        sessions: (sessionsRes.data || []) as SessionRow[],
        creditBatches: (batchesRes.data || []) as CreditBatchRow[],
        productClicks: (clicksRes.data || []) as ProductClickRow[],
      };
    },
  });

  const overview = useMemo(() => {
    const users = data?.users || [];
    const sessions = data?.sessions || [];
    const creditBatches = data?.creditBatches || [];
    const productClicks = data?.productClicks || [];
    const paidBatches = creditBatches.filter((batch) => Number(batch.price_paid || 0) > 0);

    const usersById = users.reduce<Record<string, UserRow>>((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});

    const now = new Date();
    const todayStart = startOfDay(now);
    const current30Start = startOfDay(subDays(now, 29));
    const previous30Start = startOfDay(subDays(current30Start, 30));
    const previous30End = endOfDay(subDays(current30Start, 1));
    const current7Start = startOfDay(subDays(now, 6));
    const previous7Start = startOfDay(subDays(current7Start, 7));
    const previous7End = endOfDay(subDays(current7Start, 1));
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const activityByDay = new Map<string, Set<string>>();
    const addActivity = (userId: string | null | undefined, value: string | null | undefined) => {
      if (!userId) return;
      const date = asDate(value);
      if (!date || date < current30Start || date > now) return;
      const key = format(date, "yyyy-MM-dd");
      if (!activityByDay.has(key)) activityByDay.set(key, new Set());
      activityByDay.get(key)?.add(userId);
    };

    users.forEach((user) => {
      addActivity(user.id, user.created_at);
      addActivity(user.id, user.last_active_at);
    });
    sessions.forEach((session) => addActivity(session.user_id, session.created_at));
    paidBatches.forEach((batch) => addActivity(batch.user_id, batch.purchased_at || batch.created_at));
    productClicks.forEach((click) => addActivity(click.user_id, click.clicked_at));

    const activeUsersByDay = eachDayOfInterval({ start: current30Start, end: now }).map((day) => {
      const key = format(day, "yyyy-MM-dd");
      return {
        day: format(day, "MMM d"),
        users: activityByDay.get(key)?.size || 0,
      };
    });

    const getActiveUsersInRange = (start: Date, end: Date) => {
      const ids = new Set<string>();

      users.forEach((user) => {
        if (isBetween(asDate(user.last_active_at), start, end) || isBetween(asDate(user.created_at), start, end)) {
          ids.add(user.id);
        }
      });
      sessions.forEach((session) => {
        if (isBetween(asDate(session.created_at), start, end)) ids.add(session.user_id);
      });
      paidBatches.forEach((batch) => {
        if (isBetween(asDate(batch.purchased_at || batch.created_at), start, end)) ids.add(batch.user_id);
      });
      productClicks.forEach((click) => {
        if (click.user_id && isBetween(asDate(click.clicked_at), start, end)) ids.add(click.user_id);
      });

      return ids.size;
    };

    const signupsToday = users.filter((user) => isBetween(asDate(user.created_at), todayStart, now)).length;
    const newUsersCurrent30 = users.filter((user) => isBetween(asDate(user.created_at), current30Start, now)).length;
    const newUsersPrevious30 = users.filter((user) => isBetween(asDate(user.created_at), previous30Start, previous30End)).length;
    const activeUsersCurrent7 = getActiveUsersInRange(current7Start, now);
    const activeUsersPrevious7 = getActiveUsersInRange(previous7Start, previous7End);
    const sessionsCurrent30 = sessions.filter((session) => isBetween(asDate(session.created_at), current30Start, now)).length;
    const sessionsPrevious30 = sessions.filter((session) => isBetween(asDate(session.created_at), previous30Start, previous30End)).length;
    const storeClicksCurrent30 = productClicks.filter((click) => isBetween(asDate(click.clicked_at), current30Start, now)).length;
    const storeClicksPrevious30 = productClicks.filter((click) => isBetween(asDate(click.clicked_at), previous30Start, previous30End)).length;
    const currentMonthBatches = paidBatches.filter((batch) => isBetween(asDate(batch.purchased_at || batch.created_at), thisMonthStart, now));
    const lastMonthBatches = paidBatches.filter((batch) => isBetween(asDate(batch.purchased_at || batch.created_at), lastMonthStart, lastMonthEnd));

    const currentMonthRevenueTotals = buildCurrencyTotals(currentMonthBatches);
    const lastMonthRevenueTotals = buildCurrencyTotals(lastMonthBatches);
    const totalCredits = users.reduce((sum, user) => sum + (user.credits_balance || 0), 0);
    const usersWithCredits = users.filter((user) => (user.credits_balance || 0) > 0).length;

    const funnelData = [
      { stage: "Signup", count: users.length },
      { stage: "Onboarding", count: users.filter((user) => user.has_completed_onboarding).length },
      { stage: "First Gift", count: new Set(sessions.map((session) => session.user_id)).size },
      { stage: "Purchase", count: new Set(paidBatches.map((batch) => batch.user_id)).size },
    ];

    const rawOccasions = sessions.reduce<Record<string, number>>((acc, session) => {
      const key = formatLabel(session.occasion, "Other");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const sortedOccasions = Object.entries(rawOccasions)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const topOccasions =
      sortedOccasions.length <= 5
        ? sortedOccasions
        : [
            ...sortedOccasions.slice(0, 5),
            {
              name: "Other",
              value: sortedOccasions.slice(5).reduce((sum, item) => sum + item.value, 0),
            },
          ];

    const storeClicksData = Object.entries(
      productClicks.reduce<Record<string, number>>((acc, click) => {
        const key = formatLabel(click.store, "Unknown");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    )
      .map(([name, clicks]) => ({ name, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8);

    const revenueByPackage = Object.entries(
      paidBatches.reduce<Record<string, { purchases: number; totals: Record<string, number> }>>((acc, batch) => {
        const key = formatLabel(batch.package_name, "Unknown");
        const amount = Number(batch.price_paid || 0);
        if (!acc[key]) {
          acc[key] = { purchases: 0, totals: {} };
        }
        acc[key].purchases += 1;
        acc[key].totals.USD = (acc[key].totals.USD || 0) + amount;
        return acc;
      }, {}),
    )
      .map(([name, value]) => ({
        name,
        purchases: value.purchases,
        revenue: formatCurrencySummary(value.totals),
      }))
      .sort((a, b) => b.purchases - a.purchases);

    const recentActivity: RecentActivityItem[] = [
      ...users
        .map((user) => {
          const at = asDate(user.created_at);
          if (!at) return null;
          return {
            at,
            user: getUserLabel(user),
            action: "Signed up",
            type: "signup" as const,
          };
        })
        .filter(Boolean) as RecentActivityItem[],
      ...sessions
        .map((session) => {
          const at = asDate(session.created_at);
          if (!at || session.status !== "completed") return null;
          return {
            at,
            user: getUserLabel(usersById[session.user_id]),
            action: `Completed gift session for ${formatLabel(session.occasion, "Other")}`,
            type: "gift" as const,
          };
        })
        .filter(Boolean) as RecentActivityItem[],
      ...paidBatches
        .map((batch) => {
          const at = asDate(batch.purchased_at || batch.created_at);
          if (!at) return null;
          return {
            at,
            user: getUserLabel(usersById[batch.user_id]),
            action: `Purchased ${formatLabel(batch.package_name, "plan")}`,
            type: "purchase" as const,
          };
        })
        .filter(Boolean) as RecentActivityItem[],
      ...productClicks
        .map((click) => {
          const at = asDate(click.clicked_at);
          if (!at || !click.user_id) return null;
          const target = click.product_title || click.gift_concept_name || "store result";
          return {
            at,
            user: getUserLabel(usersById[click.user_id]),
            action: `Clicked ${formatLabel(click.store, "store")} for ${target}`,
            type: "click" as const,
          };
        })
        .filter(Boolean) as RecentActivityItem[],
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 12);

    return {
      metricCards: [
        {
          label: "Total Users",
          value: users.length.toLocaleString(),
          icon: Users,
          change: getPercentChange(newUsersCurrent30, newUsersPrevious30),
          meta: `${newUsersCurrent30.toLocaleString()} new in the last 30 days`,
          pill: signupsToday > 0 ? `+${signupsToday} today` : null,
        },
        {
          label: "Active Users (7d)",
          value: activeUsersCurrent7.toLocaleString(),
          icon: Activity,
          change: getPercentChange(activeUsersCurrent7, activeUsersPrevious7),
          meta: "Unique users with sessions, clicks, purchases, or recent activity",
          pill: null,
        },
        {
          label: "Gift Sessions",
          value: sessions.length.toLocaleString(),
          icon: Gift,
          change: getPercentChange(sessionsCurrent30, sessionsPrevious30),
          meta: `${sessionsCurrent30.toLocaleString()} sessions in the last 30 days`,
          pill: null,
        },
        {
          label: "Revenue This Month",
          value: formatCurrencySummary(currentMonthRevenueTotals),
          icon: IndianRupee,
          change: null,
          meta: `${currentMonthBatches.length.toLocaleString()} paid purchases · last month ${formatCurrencySummary(lastMonthRevenueTotals)}`,
          pill: null,
        },
        {
          label: "Credits in Circulation",
          value: totalCredits.toLocaleString(),
          icon: Coins,
          change: null,
          meta: `${usersWithCredits.toLocaleString()} users currently hold credits`,
          pill: null,
        },
        {
          label: "Store Clicks (30d)",
          value: storeClicksCurrent30.toLocaleString(),
          icon: Store,
          change: getPercentChange(storeClicksCurrent30, storeClicksPrevious30),
          meta: `${productClicks.length.toLocaleString()} total outbound store clicks`,
          pill: null,
        },
      ],
      activeUsersByDay,
      funnelData,
      topOccasions,
      storeClicksData,
      revenueByPackage,
      recentActivity,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <SEOHead title="Admin - GiftMind" description="Admin Dashboard" noIndex={true} />
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live admin metrics across users, conversion, revenue, gift demand, and marketplace engagement.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Failed to load overview metrics. Refresh the page and verify admin access to analytics tables.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {overview?.metricCards.map((metric) => {
          const Icon = metric.icon;
          const hasTrend = typeof metric.change === "number";
          const trendUp = (metric.change || 0) >= 0;

          return (
            <Card key={metric.label} className="relative overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{metric.label}</p>
                    <p className="mt-1 text-2xl font-bold text-foreground break-words">{metric.value}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {hasTrend ? (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium ${
                            trendUp ? "text-emerald-500" : "text-red-500"
                          }`}
                        >
                          {trendUp ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {Math.abs(metric.change || 0).toFixed(1)}% vs previous period
                        </span>
                      ) : null}
                      {metric.pill ? (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {metric.pill}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.meta}</p>
                  </div>
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground/50" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Active Users (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview?.activeUsersByDay || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview?.funnelData || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <YAxis dataKey="stage" type="category" tick={{ fontSize: 11 }} width={88} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Occasions</CardTitle>
          </CardHeader>
          <CardContent>
            {(overview?.topOccasions.length || 0) === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No gift session data yet.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={overview?.topOccasions || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      style={{ fontSize: "10px" }}
                    >
                      {(overview?.topOccasions || []).map((_, index) => (
                        <Cell key={index} fill={OCCASION_COLORS[index % OCCASION_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Store Clicks by Store</CardTitle>
          </CardHeader>
          <CardContent>
            {(overview?.storeClicksData.length || 0) === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No outbound store clicks yet.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview?.storeClicksData || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="clicks" fill="hsl(168 100% 36%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue by Package</CardTitle>
          </CardHeader>
          <CardContent>
            {(overview?.revenueByPackage.length || 0) === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No paid purchases yet.</p>
            ) : (
              <div className="space-y-3">
                {(overview?.revenueByPackage || []).map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.purchases.toLocaleString()} purchases</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground text-right">{item.revenue}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      Loading live activity...
                    </TableCell>
                  </TableRow>
                ) : (overview?.recentActivity.length || 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      No recent admin activity yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (overview?.recentActivity || []).map((item, index) => {
                    const badge = typeBadgeMap[item.type];
                    return (
                      <TableRow key={`${item.type}-${item.at.toISOString()}-${index}`}>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(item.at, { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{item.user}</TableCell>
                        <TableCell className="text-sm">{item.action}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badge.className}>
                            {badge.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminOverview;
