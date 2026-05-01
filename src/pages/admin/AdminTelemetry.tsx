import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
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
import { Activity, AlertTriangle, Clock, DollarSign, Gauge, RefreshCcw } from "lucide-react";
import { SEOHead } from "@/components/common/SEOHead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type TelemetryRow = {
  id: string;
  session_id: string | null;
  function_name: string;
  provider: string;
  model: string;
  attempt_number: number;
  status: "success" | "error" | "timeout" | "rate_limited";
  latency_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  estimated_cost_usd: number | null;
  error_type: string | null;
  error_message: string | null;
  created_at: string;
};
type QueryResult<T> = { data: T[] | null; error: unknown };
type TelemetryQuery = PromiseLike<QueryResult<TelemetryRow>> & {
  gte: (column: string, value: string) => TelemetryQuery;
  order: (column: string, options: { ascending: boolean }) => {
    limit: (count: number) => PromiseLike<QueryResult<TelemetryRow>>;
  };
};
type UntypedTelemetryTables = {
  from: (table: "ai_telemetry_log") => {
    select: (columns: string) => TelemetryQuery;
  };
};

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];

function StatCard({
  title,
  value,
  meta,
  icon: Icon,
}: {
  title: string;
  value: string;
  meta: string;
  icon: typeof Activity;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function pct(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

const AdminTelemetry = () => {
  const since = useMemo(() => subDays(new Date(), 30).toISOString(), []);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-ai-telemetry", since],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as UntypedTelemetryTables)
        .from("ai_telemetry_log")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return (data ?? []) as TelemetryRow[];
    },
  });

  const stats = useMemo(() => {
    const total = rows.length;
    const successes = rows.filter((row) => row.status === "success").length;
    const fallback = rows.filter((row) => row.attempt_number > 1).length;
    const latencies = rows
      .map((row) => row.latency_ms)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const avgLatency = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;
    const cost = rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);

    return {
      total,
      successRate: total ? (successes / total) * 100 : 0,
      avgLatency,
      fallbackRate: total ? (fallback / total) * 100 : 0,
      cost,
    };
  }, [rows]);

  const latencyByDay = useMemo(() => {
    const buckets: Record<string, { date: string; count: number; latency: number }> = {};
    rows.forEach((row) => {
      if (!row.latency_ms) return;
      const date = format(new Date(row.created_at), "MMM d");
      buckets[date] ??= { date, count: 0, latency: 0 };
      buckets[date].count += 1;
      buckets[date].latency += row.latency_ms;
    });
    return Object.values(buckets)
      .map((bucket) => ({ date: bucket.date, latency: Math.round(bucket.latency / bucket.count) }))
      .reverse();
  }, [rows]);

  const callsByProvider = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((row) => {
      counts[row.provider] = (counts[row.provider] ?? 0) + 1;
    });
    return Object.entries(counts).map(([provider, calls]) => ({ provider, calls }));
  }, [rows]);

  const costByFunction = useMemo(() => {
    const totals: Record<string, number> = {};
    rows.forEach((row) => {
      totals[row.function_name] = (totals[row.function_name] ?? 0) + Number(row.estimated_cost_usd ?? 0);
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value: Number(value.toFixed(6)) }));
  }, [rows]);

  const errors = useMemo(
    () => rows.filter((row) => row.status !== "success").slice(0, 50),
    [rows],
  );

  return (
    <>
      <SEOHead title="AI Telemetry" description="AI provider health and experimentation telemetry." />
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">AI Telemetry</h1>
            <p className="text-sm text-muted-foreground">Provider health, latency, fallback, and cost over the last 30 days.</p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard title="AI calls" value={stats.total.toLocaleString()} meta="Last 30 days" icon={Activity} />
          <StatCard title="Success rate" value={pct(stats.successRate)} meta="All functions" icon={Gauge} />
          <StatCard title="Avg latency" value={`${Math.round(stats.avgLatency).toLocaleString()}ms`} meta="Successful and failed calls" icon={Clock} />
          <StatCard title="Fallback rate" value={pct(stats.fallbackRate)} meta="Attempt number > 1" icon={AlertTriangle} />
          <StatCard title="Est. cost" value={`$${stats.cost.toFixed(4)}`} meta="Token estimate" icon={DollarSign} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Average Latency</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencyByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="latency" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calls by Provider</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={callsByProvider}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="provider" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="calls" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cost by Function</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={costByFunction} dataKey="value" nameKey="name" outerRadius={92} label>
                    {costByFunction.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Loading telemetry...</TableCell></TableRow>
                  ) : errors.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No errors in the current window.</TableCell></TableRow>
                  ) : (
                    errors.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(row.created_at), "MMM d, HH:mm")}</TableCell>
                        <TableCell>{row.provider}</TableCell>
                        <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                        <TableCell className="max-w-md truncate text-sm">{row.error_type ?? row.error_message ?? "Unknown"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default AdminTelemetry;
