import { SEOHead } from "@/components/common/SEOHead";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, TrendingUp, Activity,
  Target, Clock, MessageSquare, BarChart3,
} from "lucide-react";
import { format, subWeeks, startOfWeek, endOfWeek, differenceInMinutes } from "date-fns";

const COLORS = [
  "hsl(249, 76%, 64%)", "hsl(0, 100%, 70%)", "hsl(142, 71%, 45%)",
  "hsl(45, 93%, 47%)", "hsl(200, 80%, 50%)", "hsl(280, 60%, 55%)",
  "hsl(20, 90%, 55%)", "hsl(170, 60%, 45%)", "hsl(330, 70%, 55%)",
  "hsl(60, 80%, 45%)",
];

const PAGE_SIZE = 25;

const BUDGET_RANGES = [
  { label: "Under ₹500", min: 0, max: 500 },
  { label: "₹500–1.5K", min: 500, max: 1500 },
  { label: "₹1.5K–3K", min: 1500, max: 3000 },
  { label: "₹3K–5K", min: 3000, max: 5000 },
  { label: "₹5K–10K", min: 5000, max: 10000 },
  { label: "₹10K+", min: 10000, max: Infinity },
];

const RELATIONSHIP_LABELS: Record<string, string> = {
  partner: "Partner", parent: "Parent", sibling: "Sibling",
  close_friend: "Close Friend", friend: "Friend", colleague: "Colleague",
  boss: "Boss", acquaintance: "Acquaintance", in_law: "In-Law",
  child: "Child", mentor: "Mentor", new_relationship: "New Relationship",
};

const AdminGiftAnalytics = () => {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"created_at" | "budget_min">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Fetch all sessions
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["admin-gift-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_sessions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch recipients for names
  const { data: recipients = [] } = useQuery({
    queryKey: ["admin-recipients-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("id, name, relationship_type");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch profiles for user names
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-profiles-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
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

  const recipientMap = useMemo(() => {
    const m: Record<string, { name: string; relationship_type: string }> = {};
    recipients.forEach((r) => { m[r.id] = { name: r.name, relationship_type: r.relationship_type }; });
    return m;
  }, [recipients]);

  // === STATS ===
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const total = sessions.length;
    const thisMonth = sessions.filter((s) => new Date(s.created_at) >= thisMonthStart).length;
    const completed = sessions.filter((s) => s.status === "completed");
    const completionRate = total > 0 ? (completed.length / total) * 100 : 0;

    // Confidence scores from results
    const confidenceScores: number[] = [];
    sessions.forEach((s) => {
      if (s.results && typeof s.results === "object") {
        const r = s.results as any;
        if (r.confidence_score) confidenceScores.push(Number(r.confidence_score));
        if (r.confidence) confidenceScores.push(Number(r.confidence));
      }
    });
    const avgConfidence = confidenceScores.length > 0
      ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
      : 0;

    // Avg session duration (completed sessions only)
    const durations = completed
      .map((s) => differenceInMinutes(new Date(s.updated_at), new Date(s.created_at)))
      .filter((d) => d > 0 && d < 1440); // filter outliers > 24h
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // Feedback rate
    const withFeedback = sessions.filter((s) => s.feedback_rating).length;
    const feedbackRate = completed.length > 0 ? (withFeedback / completed.length) * 100 : 0;

    return { total, thisMonth, avgConfidence, completionRate, avgDuration, feedbackRate };
  }, [sessions]);

  // === CHARTS DATA ===

  // Weekly confidence over 12 weeks
  const weeklyConfidence = useMemo(() => {
    const weeks: { week: string; score: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = startOfWeek(subWeeks(new Date(), i));
      const end = endOfWeek(subWeeks(new Date(), i));
      const scores: number[] = [];
      sessions.forEach((s) => {
        const d = new Date(s.created_at);
        if (d >= start && d <= end && s.results) {
          const r = s.results as any;
          const sc = r.confidence_score || r.confidence;
          if (sc) scores.push(Number(sc));
        }
      });
      weeks.push({
        week: format(start, "MMM d"),
        score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      });
    }
    return weeks;
  }, [sessions]);

  // Occasions distribution
  const occasionsDist = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach((s) => {
      const occ = s.occasion || "Other";
      counts[occ] = (counts[occ] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [sessions]);

  // Relationship types
  const relationshipDist = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach((s) => {
      if (s.recipient_id && recipientMap[s.recipient_id]) {
        const rt = recipientMap[s.recipient_id].relationship_type;
        const label = RELATIONSHIP_LABELS[rt] || rt;
        counts[label] = (counts[label] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [sessions, recipientMap]);

  // Budget distribution
  const budgetDist = useMemo(() => {
    return BUDGET_RANGES.map((r) => ({
      name: r.label,
      count: sessions.filter((s) => {
        const avg = ((s.budget_min || 0) + (s.budget_max || 0)) / 2;
        return avg >= r.min && avg < r.max;
      }).length,
    }));
  }, [sessions]);

  // Feedback summary
  const feedbackDist = useMemo(() => {
    const counts: Record<string, number> = { "Loved it": 0, "Liked it": 0, Neutral: 0, "Didn't like": 0 };
    sessions.forEach((s) => {
      if (s.feedback_rating) {
        const r = s.feedback_rating.toLowerCase();
        if (r.includes("love") || r === "5" || r === "excellent") counts["Loved it"]++;
        else if (r.includes("like") || r === "4" || r === "good") counts["Liked it"]++;
        else if (r.includes("neutral") || r === "3" || r === "ok") counts["Neutral"]++;
        else counts["Didn't like"]++;
      }
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [sessions]);

  // Gift categories from AI results
  const giftCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach((s) => {
      if (s.results && typeof s.results === "object") {
        const r = s.results as any;
        const gifts = r.gifts || r.recommendations || [];
        if (Array.isArray(gifts)) {
          gifts.forEach((g: any) => {
            const cat = g.category || g.type || "Other";
            counts[cat] = (counts[cat] || 0) + 1;
          });
        }
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [sessions]);

  // Product clicks inferred from selected gift + results
  const productClicks = useMemo(() => {
    const storeCounts: Record<string, number> = {};
    const products: { title: string; store: string; clicks: number }[] = [];
    sessions.forEach((s) => {
      if (s.results && typeof s.results === "object") {
        const recommendations = ((s.results as any).recommendations || []) as any[];
        const selectedGift =
          typeof s.selected_gift_index === "number" ? recommendations[s.selected_gift_index] : null;
        if (selectedGift) {
          const store = selectedGift.store || selectedGift.marketplace || "Unknown";
          storeCounts[store] = (storeCounts[store] || 0) + 1;
          products.push({ title: selectedGift.title || selectedGift.name || "Unnamed", store, clicks: 1 });
        }
      }
    });
    const storeData = Object.entries(storeCounts)
      .map(([name, clicks]) => ({ name, clicks }))
      .sort((a, b) => b.clicks - a.clicks);

    // Aggregate products
    const prodMap: Record<string, { title: string; store: string; clicks: number }> = {};
    products.forEach((p) => {
      const key = `${p.title}-${p.store}`;
      if (prodMap[key]) prodMap[key].clicks++;
      else prodMap[key] = { ...p };
    });
    const topProducts = Object.values(prodMap).sort((a, b) => b.clicks - a.clicks).slice(0, 10);

    const totalClicks = Object.values(storeCounts).reduce((a, b) => a + b, 0);
    const estimatedRevenue = totalClicks * 0.05 * 1500 * 0.06; // 5% conv × ₹1500 AOV × 6% commission

    return { storeData, topProducts, totalClicks, estimatedRevenue };
  }, [sessions]);

  // === SESSION LOG ===
  const filtered = useMemo(() => {
    let list = sessions;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        (profileMap[s.user_id] || "").toLowerCase().includes(q) ||
        (s.occasion || "").toLowerCase().includes(q) ||
        (s.recipient_id && recipientMap[s.recipient_id]?.name.toLowerCase().includes(q))
      );
    }
    list = [...list].sort((a, b) => {
      if (sortField === "budget_min") {
        return sortDir === "asc" ? (a.budget_min || 0) - (b.budget_min || 0) : (b.budget_min || 0) - (a.budget_min || 0);
      }
      return sortDir === "asc"
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [sessions, search, sortField, sortDir, profileMap, recipientMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: "created_at" | "budget_min") => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const confidenceColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <div className="space-y-6">
      <SEOHead title="Admin - GiftMind" description="Admin Dashboard" noIndex={true} />
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Gift Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Insights into gift sessions, recommendations, and user behaviour</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Sessions", value: stats.total, icon: BarChart3 },
          { label: "This Month", value: stats.thisMonth, icon: TrendingUp },
          { label: "Avg Confidence", value: `${stats.avgConfidence.toFixed(0)}%`, icon: Target, color: confidenceColor(stats.avgConfidence) },
          { label: "Completion Rate", value: `${stats.completionRate.toFixed(1)}%`, icon: Activity },
          { label: "Avg Duration", value: `${stats.avgDuration.toFixed(0)} min`, icon: Clock },
          { label: "Feedback Rate", value: `${stats.feedbackRate.toFixed(1)}%`, icon: MessageSquare },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <s.icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <span className={`text-xl font-bold ${s.color || ""}`}>{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Avg Confidence Score (Weekly, 12 Weeks)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={weeklyConfidence}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="hsl(249, 76%, 64%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Occasions Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={occasionsDist} cx="50%" cy="50%" outerRadius={95} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {occasionsDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Top Gift Categories</CardTitle></CardHeader>
          <CardContent>
            {giftCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No category data yet — will populate when AI generates gift recommendations</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={giftCategories}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={10} stroke="hsl(var(--muted-foreground))" angle={-30} textAnchor="end" height={60} />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(249, 76%, 64%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Relationship Types</CardTitle></CardHeader>
          <CardContent>
            {relationshipDist.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={relationshipDist} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(0, 100%, 70%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Budget Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={budgetDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Feedback Summary</CardTitle></CardHeader>
          <CardContent>
            {feedbackDist.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No feedback data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={feedbackDist} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {feedbackDist.map((_, i) => (
                      <Cell key={i} fill={["hsl(142, 71%, 45%)", "hsl(200, 80%, 50%)", "hsl(45, 93%, 47%)", "hsl(0, 100%, 70%)"][i] || COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Click Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Clicks by Store</CardTitle></CardHeader>
          <CardContent>
            {productClicks.storeData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No product click data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={productClicks.storeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="clicks" fill="hsl(280, 60%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Estimated Affiliate Revenue</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold">₹{productClicks.estimatedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Total product clicks: <strong>{productClicks.totalClicks}</strong></p>
              <p>Est. conversion rate: 5% · Avg order value: ₹1,500 · Avg commission: 6%</p>
              <p className="italic mt-2">This is an estimate based on industry averages.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Clicked Products Table */}
      {productClicks.topProducts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top Clicked Products</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productClicks.topProducts.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm truncate max-w-[200px]">{p.title}</TableCell>
                    <TableCell><Badge variant="outline">{p.store}</Badge></TableCell>
                    <TableCell className="text-right">{p.clicks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Session Log */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <CardTitle className="text-base">Session Log</CardTitle>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search user, occasion, recipient..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("created_at")}>
                    Date {sortField === "created_at" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden sm:table-cell">Recipient</TableHead>
                  <TableHead className="hidden md:table-cell">Occasion</TableHead>
                  <TableHead className="cursor-pointer select-none hidden lg:table-cell" onClick={() => toggleSort("budget_min")}>
                    Budget {sortField === "budget_min" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Feedback</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No sessions found</TableCell>
                  </TableRow>
                ) : paged.map((s) => (
                  <Collapsible key={s.id} asChild open={expandedRow === s.id} onOpenChange={(o) => setExpandedRow(o ? s.id : null)}>
                    <>
                      <TableRow className="cursor-pointer" onClick={() => setExpandedRow(expandedRow === s.id ? null : s.id)}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(s.created_at), "MMM d, HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm font-medium truncate max-w-[120px]">
                          {profileMap[s.user_id] || "Unknown"}
                        </TableCell>
                        <TableCell className="text-sm hidden sm:table-cell">
                          {s.recipient_id && recipientMap[s.recipient_id]?.name || "—"}
                        </TableCell>
                        <TableCell className="text-sm hidden md:table-cell">{s.occasion || "—"}</TableCell>
                        <TableCell className="text-sm hidden lg:table-cell">
                          {s.budget_min && s.budget_max ? `₹${s.budget_min}–${s.budget_max}` : "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant={s.status === "completed" ? "default" : "outline"}
                            className={s.status === "completed" ? "bg-green-600 text-white" : ""}>
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {s.feedback_rating ? (
                            <Badge variant="outline">{s.feedback_rating}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-6 h-6" aria-label="Toggle row details">
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedRow === s.id ? "rotate-180" : ""}`} />
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <tr>
                          <td colSpan={8} className="bg-muted/30 px-6 py-4">
                            <div className="space-y-2 text-sm">
                              {s.special_context && <p><strong>Notes:</strong> {s.special_context}</p>}
                              {s.context_tags && (s.context_tags as string[]).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <strong className="mr-1">Tags:</strong>
                                  {(s.context_tags as string[]).map((t, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                                  ))}
                                </div>
                              )}
                              {s.feedback_notes && <p><strong>Feedback:</strong> {s.feedback_notes}</p>}
                              {s.results && (
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-xs text-primary hover:underline">View full AI response</summary>
                                  <pre className="mt-2 text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-60">
                                    {JSON.stringify(s.results, null, 2)}
                                  </pre>
                                </details>
                              )}
                              {typeof s.selected_gift_index === "number" && s.results && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-xs text-primary hover:underline">View chosen gift</summary>
                                  <pre className="mt-2 text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-40">
                                    {JSON.stringify(((s.results as any).recommendations || [])[s.selected_gift_index], null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </td>
                        </tr>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
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
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminGiftAnalytics;
